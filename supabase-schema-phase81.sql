-- ==========================================================================
-- Phase 81: Critical Security Fix
--
-- Codex Review Findings: B1-C1, B1-C2, B1-C3
--
-- C1: rpc_create_session_run accepts p_teacher_id from client (privilege escalation)
-- C2: anon_session_runs_select exposes all active sessions (enumeration)
-- C3: auth_solo_sessions_all gives all authenticated users full access
--
-- Also: REVOKE EXECUTE FROM PUBLIC on all existing RPCs
--
-- Run order: After phase 78 migration
-- ==========================================================================

-- ============================================================
-- 0. REVOKE default PUBLIC EXECUTE on all existing RPCs
--    PostgreSQL grants EXECUTE to PUBLIC by default.
--    We explicitly revoke and re-grant to proper roles only.
-- ============================================================

-- Phase 71 RPCs
REVOKE EXECUTE ON FUNCTION rpc_join_session(text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rpc_reconnect_session(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rpc_submit_vote(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rpc_get_my_participant(uuid, text) FROM PUBLIC;

-- Phase 72 RPC (old signature — will be dropped below)
REVOKE EXECUTE ON FUNCTION rpc_create_session_run(text, text, uuid, uuid, integer, jsonb, jsonb) FROM PUBLIC;

-- Phase 74 RPCs (had no explicit GRANT, relied on PUBLIC default)
REVOKE EXECUTE ON FUNCTION rpc_student_login(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rpc_verify_student_token(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rpc_generate_student_credentials(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rpc_reset_student_pin(uuid) FROM PUBLIC;

-- Phase 75 RPCs
REVOKE EXECUTE ON FUNCTION rpc_save_solo_session(uuid, text, text, timestamptz, int, text, text, int[], jsonb, int, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rpc_fetch_solo_history(uuid, text) FROM PUBLIC;

-- Phase 78 RPC
REVOKE EXECUTE ON FUNCTION rpc_fetch_student_assignments(uuid, text) FROM PUBLIC;


-- ============================================================
-- 1. C1: Fix rpc_create_session_run privilege escalation
--    Remove p_teacher_id parameter, use auth.uid() internally.
-- ============================================================

-- Drop old function (different signature: 7 params)
DROP FUNCTION IF EXISTS rpc_create_session_run(text, text, uuid, uuid, integer, jsonb, jsonb);

-- Create new function (6 params, no p_teacher_id)
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

  -- Generate unique join code with retry loop
  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > 5 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'join_code_generation_failed');
    END IF;

    v_code := '';
    FOR v_i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, floor(random() * 32)::int + 1, 1);
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
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 2. C2: Restrict session_runs anon SELECT + add RPC lookup
--
--    Problem: anon_session_runs_select allows enumerating all
--    active sessions (join_codes, teacher_ids, class_ids).
--
--    Fix: Create rpc_find_session_by_code for code lookup.
--    Keep anon SELECT for Supabase Realtime compatibility
--    (postgres_changes requires RLS-passing SELECT).
--
--    NOTE: Full mitigation requires migrating to Supabase
--    Broadcast channels. This is a known limitation.
-- ============================================================

-- New RPC: find session by join code (returns data excluding sensitive fields)
CREATE OR REPLACE FUNCTION rpc_find_session_by_code(p_join_code text)
RETURNS jsonb AS $$
DECLARE
  v_run record;
BEGIN
  IF p_join_code IS NULL OR length(trim(p_join_code)) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  SELECT * INTO v_run
  FROM public.session_runs
  WHERE join_code = upper(trim(p_join_code))
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;

  -- Return session data excluding teacher_id and class_id
  RETURN jsonb_build_object(
    'ok', true,
    'run', jsonb_build_object(
      'id', v_run.id,
      'scenario_slug', v_run.scenario_slug,
      'scenario_title', v_run.scenario_title,
      'join_code', v_run.join_code,
      'current_phase', v_run.current_phase,
      'timer_seconds', v_run.timer_seconds,
      'timer_running', v_run.timer_running,
      'discovered_evidence', v_run.discovered_evidence,
      'twist_revealed', v_run.twist_revealed,
      'votes', v_run.votes,
      'vote_reasons', v_run.vote_reasons,
      'character_names', v_run.character_names,
      'evidence_titles', v_run.evidence_titles,
      'player_count', v_run.player_count,
      'is_active', v_run.is_active,
      'started_at', v_run.started_at,
      'updated_at', v_run.updated_at,
      'created_at', v_run.created_at
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 3. C3: Fix solo_sessions RLS (was USING(true) for all auth)
--
--    Problem: Any authenticated user can read/write ALL solo
--    sessions. Teachers can see/modify other teachers' students.
--
--    Fix: SELECT restricted to teacher's own students only.
--    INSERT/UPDATE/DELETE blocked (all via SECURITY DEFINER RPCs).
-- ============================================================

DROP POLICY IF EXISTS "auth_solo_sessions_all" ON solo_sessions;

-- Teacher can SELECT solo sessions for students in their classes only
CREATE POLICY "auth_solo_sessions_select_own" ON solo_sessions
  FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.classes c ON s.class_id = c.id
      WHERE c.teacher_id = (
        SELECT id FROM public.teachers WHERE auth_user_id = auth.uid()
      )
    )
  );


-- ============================================================
-- 4. Re-GRANT all RPCs to proper roles
-- ============================================================

-- Phase 71: anon (student session operations)
GRANT EXECUTE ON FUNCTION rpc_join_session(text, text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION rpc_reconnect_session(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION rpc_submit_vote(uuid, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION rpc_get_my_participant(uuid, text) TO anon;

-- Phase 81 C1: authenticated (teacher creates session)
GRANT EXECUTE ON FUNCTION rpc_create_session_run(text, text, uuid, integer, jsonb, jsonb) TO authenticated;

-- Phase 81 C2: anon (student finds session by code)
GRANT EXECUTE ON FUNCTION rpc_find_session_by_code(text) TO anon;

-- Phase 74: anon (student login/token)
GRANT EXECUTE ON FUNCTION rpc_student_login(text, text) TO anon;
GRANT EXECUTE ON FUNCTION rpc_verify_student_token(uuid, text) TO anon;

-- Phase 74: authenticated (teacher manages credentials)
GRANT EXECUTE ON FUNCTION rpc_generate_student_credentials(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_reset_student_pin(uuid) TO authenticated;

-- Phase 75: anon (student solo sessions)
GRANT EXECUTE ON FUNCTION rpc_save_solo_session(uuid, text, text, timestamptz, int, text, text, int[], jsonb, int, int) TO anon;
GRANT EXECUTE ON FUNCTION rpc_fetch_solo_history(uuid, text) TO anon;

-- Phase 78: anon (student assignments)
GRANT EXECUTE ON FUNCTION rpc_fetch_student_assignments(uuid, text) TO anon;
