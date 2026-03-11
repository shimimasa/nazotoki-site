-- ==========================================================================
-- Phase 84: Performance + Refactor
--
-- Codex Review Findings: B1-M2, B2-M5, B1-L1
--
-- M2: Advisory lock for credential generation (race condition prevention)
-- M5: Solo progress summary RPC (replaces N+1 client query)
-- L1: CSPRNG for join codes and PINs (gen_random_bytes replaces random())
--
-- Run order: After phase 83 migration
-- ==========================================================================

-- ============================================================
-- 1. M2: Advisory lock for credential generation
--    Prevents duplicate login_id generation under concurrent calls.
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_generate_student_credentials(p_class_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_teacher_id uuid;
  v_class record;
  v_student record;
  v_prefix text;
  v_idx int := 0;
  v_login_id text;
  v_pin text;
  v_results jsonb := '[]'::jsonb;
BEGIN
  -- Auth check: caller must be teacher who owns this class
  SELECT id INTO v_teacher_id
  FROM public.teachers WHERE auth_user_id = auth.uid() LIMIT 1;

  IF v_teacher_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT * INTO v_class
  FROM public.classes
  WHERE id = p_class_id AND teacher_id = v_teacher_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'class_not_found');
  END IF;

  -- Phase 84: Advisory lock to prevent concurrent credential generation
  PERFORM pg_advisory_xact_lock(hashtext(p_class_id::text));

  -- Build prefix from grade_label (e.g., "3a") or fallback to "c" + short id
  v_prefix := COALESCE(
    NULLIF(lower(regexp_replace(COALESCE(v_class.grade_label, ''), '[^a-zA-Z0-9]', '', 'g')), ''),
    'c' || left(v_class.id::text, 4)
  );

  -- Iterate all students in the class
  FOR v_student IN
    SELECT * FROM public.students
    WHERE class_id = p_class_id
    ORDER BY created_at
  LOOP
    v_idx := v_idx + 1;

    -- Skip if already has credentials
    IF v_student.login_id IS NOT NULL THEN
      v_results := v_results || jsonb_build_object(
        'student_id', v_student.id,
        'student_name', v_student.student_name,
        'login_id', v_student.login_id,
        'pin', NULL,
        'already_exists', true
      );
      CONTINUE;
    END IF;

    -- Generate login_id: prefix-01, prefix-02, ...
    v_login_id := v_prefix || '-' || lpad(v_idx::text, 2, '0');

    -- Ensure uniqueness
    WHILE EXISTS (SELECT 1 FROM public.students WHERE login_id = v_login_id) LOOP
      v_idx := v_idx + 1;
      v_login_id := v_prefix || '-' || lpad(v_idx::text, 2, '0');
    END LOOP;

    -- Phase 84 L1: CSPRNG for PIN generation
    v_pin := lpad(((get_byte(gen_random_bytes(2), 0) * 256 + get_byte(gen_random_bytes(2), 1)) % 10000)::text, 4, '0');

    -- Update student record
    UPDATE public.students
    SET login_id = v_login_id,
        pin_hash = crypt(v_pin, gen_salt('bf'))
    WHERE id = v_student.id;

    v_results := v_results || jsonb_build_object(
      'student_id', v_student.id,
      'student_name', v_student.student_name,
      'login_id', v_login_id,
      'pin', v_pin,
      'already_exists', false
    );
  END LOOP;

  RETURN jsonb_build_object('credentials', v_results);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;


-- ============================================================
-- 2. M5: Solo progress summary RPC
--    Replaces client-side N+1 query (fetchSoloSessionsForStudents)
--    with a single aggregated server query.
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_fetch_solo_progress_summary(p_class_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_teacher_id uuid;
BEGIN
  SELECT id INTO v_teacher_id
  FROM public.teachers WHERE auth_user_id = auth.uid();

  IF v_teacher_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.classes
    WHERE id = p_class_id AND teacher_id = v_teacher_id
  ) THEN
    RETURN jsonb_build_object('error', 'class_not_found');
  END IF;

  RETURN jsonb_build_object(
    'summaries', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'student_id', sub.student_id,
          'total_rp', sub.total_rp,
          'play_count', sub.play_count,
          'unique_scenarios', sub.unique_scenarios,
          'last_played_at', sub.last_played_at
        ) ORDER BY sub.total_rp DESC
      ), '[]'::jsonb)
      FROM (
        SELECT
          s.id AS student_id,
          COALESCE(SUM(ss.rp_earned), 0)::int AS total_rp,
          COUNT(ss.id)::int AS play_count,
          COUNT(DISTINCT ss.scenario_slug)::int AS unique_scenarios,
          MAX(ss.completed_at) AS last_played_at
        FROM public.students s
        LEFT JOIN public.solo_sessions ss ON ss.student_id = s.id
        WHERE s.class_id = p_class_id
        GROUP BY s.id
      ) sub
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- Grant and revoke
REVOKE EXECUTE ON FUNCTION rpc_fetch_solo_progress_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_fetch_solo_progress_summary(uuid) TO authenticated;


-- ============================================================
-- 3. L1: CSPRNG for join code generation
--    Replace random() with gen_random_bytes() in rpc_create_session_run
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_create_session_run(
  p_scenario_slug text,
  p_scenario_title text,
  p_class_id uuid DEFAULT NULL,
  p_player_count integer DEFAULT 4,
  p_character_names jsonb DEFAULT '[]'::jsonb,
  p_evidence_titles jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb AS $$
DECLARE
  v_teacher_id uuid;
  v_join_code text;
  v_run record;
  v_attempt integer := 0;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_i integer;
BEGIN
  -- Resolve teacher_id from JWT (auth.uid())
  SELECT id INTO v_teacher_id
  FROM public.teachers
  WHERE auth_user_id = auth.uid();

  IF v_teacher_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Validate class ownership if specified
  IF p_class_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.classes
      WHERE id = p_class_id AND teacher_id = v_teacher_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'class_not_found');
    END IF;
  END IF;

  -- Atomically deactivate all existing active runs for this teacher
  UPDATE public.session_runs
  SET is_active = false, updated_at = now()
  WHERE teacher_id = v_teacher_id AND is_active = true;

  -- Generate unique join code with CSPRNG
  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > 5 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'join_code_generation_failed');
    END IF;

    v_code := '';
    FOR v_i IN 1..6 LOOP
      -- Use gen_random_bytes for cryptographic randomness
      v_code := v_code || substr(v_chars, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1);
    END LOOP;

    IF NOT EXISTS (
      SELECT 1 FROM public.session_runs WHERE join_code = v_code AND is_active = true
    ) THEN
      v_join_code := v_code;
      EXIT;
    END IF;
  END LOOP;

  -- Insert new session run
  INSERT INTO public.session_runs (
    scenario_slug, scenario_title, teacher_id, class_id,
    join_code, player_count, character_names, evidence_titles,
    current_phase, is_active
  ) VALUES (
    p_scenario_slug, p_scenario_title, v_teacher_id, p_class_id,
    v_join_code, p_player_count, p_character_names, p_evidence_titles,
    'prep', true
  )
  RETURNING * INTO v_run;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_run.id,
    'join_code', v_run.join_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;


-- ============================================================
-- 4. L1: CSPRNG for PIN reset
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_reset_student_pin(p_student_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_teacher_id uuid;
  v_student record;
  v_pin text;
BEGIN
  SELECT id INTO v_teacher_id
  FROM public.teachers WHERE auth_user_id = auth.uid() LIMIT 1;

  IF v_teacher_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Verify student belongs to teacher's class
  SELECT s.* INTO v_student
  FROM public.students s
  JOIN public.classes c ON s.class_id = c.id
  WHERE s.id = p_student_id AND c.teacher_id = v_teacher_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'student_not_found');
  END IF;

  IF v_student.login_id IS NULL THEN
    RETURN jsonb_build_object('error', 'credentials_not_generated');
  END IF;

  -- CSPRNG PIN generation
  v_pin := lpad(((get_byte(gen_random_bytes(2), 0) * 256 + get_byte(gen_random_bytes(2), 1)) % 10000)::text, 4, '0');

  UPDATE public.students
  SET pin_hash = crypt(v_pin, gen_salt('bf')),
      student_token = NULL,
      token_expires_at = NULL
  WHERE id = p_student_id;

  RETURN jsonb_build_object(
    'student_id', v_student.id,
    'student_name', v_student.student_name,
    'login_id', v_student.login_id,
    'pin', v_pin
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;
