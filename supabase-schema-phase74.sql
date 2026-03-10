-- ==========================================================================
-- Phase 74: Student Login (PIN-based authentication)
--
-- Changes:
--   1. Enable pgcrypto extension (for PIN hashing)
--   2. ALTER students: add login_id, pin_hash, student_token, token_expires_at
--   3. CREATE UNIQUE INDEX on login_id
--   4. RPC: rpc_student_login (anon, SECURITY DEFINER)
--   5. RPC: rpc_verify_student_token (anon, SECURITY DEFINER)
--   6. RPC: rpc_generate_student_credentials (authenticated, SECURITY DEFINER)
--   7. RPC: rpc_reset_student_pin (authenticated, SECURITY DEFINER)
--
-- Run order: After phase 72 migration
-- ==========================================================================

-- 0. Enable pgcrypto for crypt() and gen_salt()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Add columns to students table
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS login_id text,
  ADD COLUMN IF NOT EXISTS pin_hash text,
  ADD COLUMN IF NOT EXISTS student_token text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;

-- Unique index on login_id (NULL values are excluded)
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_login_id_unique
  ON public.students(login_id) WHERE login_id IS NOT NULL;


-- ==========================================================================
-- 2. RPC: rpc_student_login
--    Called by anon (student) to authenticate with login_id + PIN.
--    Returns student profile + token on success.
-- ==========================================================================
CREATE OR REPLACE FUNCTION rpc_student_login(p_login_id text, p_pin text)
RETURNS jsonb AS $$
DECLARE
  v_student record;
  v_token text;
  v_expires timestamptz;
BEGIN
  -- Validate input
  IF p_login_id IS NULL OR length(trim(p_login_id)) = 0 THEN
    RETURN jsonb_build_object('error', 'IDを入力してください');
  END IF;
  IF p_pin IS NULL OR length(p_pin) != 4 THEN
    RETURN jsonb_build_object('error', 'PINは4桁の数字です');
  END IF;

  -- Find student by login_id (case-insensitive)
  SELECT * INTO v_student
  FROM public.students
  WHERE lower(login_id) = lower(trim(p_login_id));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'IDが見つかりません');
  END IF;

  -- Check PIN is set
  IF v_student.pin_hash IS NULL THEN
    RETURN jsonb_build_object('error', 'ログインIDが未発行です。先生に連絡してください');
  END IF;

  -- Verify PIN
  IF crypt(p_pin, v_student.pin_hash) != v_student.pin_hash THEN
    RETURN jsonb_build_object('error', 'PINが正しくありません');
  END IF;

  -- Generate token (7-day expiry)
  v_token := gen_random_uuid()::text;
  v_expires := now() + interval '7 days';

  UPDATE public.students
  SET student_token = v_token, token_expires_at = v_expires
  WHERE id = v_student.id;

  -- Return student profile with token
  RETURN jsonb_build_object(
    'student_id', v_student.id,
    'student_name', v_student.student_name,
    'class_id', v_student.class_id,
    'login_id', v_student.login_id,
    'student_token', v_token,
    'token_expires_at', v_expires
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==========================================================================
-- 3. RPC: rpc_verify_student_token
--    Called by anon to verify a saved student token (for auto-login).
-- ==========================================================================
CREATE OR REPLACE FUNCTION rpc_verify_student_token(p_student_id uuid, p_token text)
RETURNS jsonb AS $$
DECLARE
  v_student record;
BEGIN
  SELECT * INTO v_student
  FROM public.students
  WHERE id = p_student_id AND student_token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_token');
  END IF;

  IF v_student.token_expires_at < now() THEN
    -- Clear expired token
    UPDATE public.students
    SET student_token = NULL, token_expires_at = NULL
    WHERE id = v_student.id;
    RETURN jsonb_build_object('error', 'token_expired');
  END IF;

  RETURN jsonb_build_object(
    'student_id', v_student.id,
    'student_name', v_student.student_name,
    'class_id', v_student.class_id,
    'login_id', v_student.login_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==========================================================================
-- 4. RPC: rpc_generate_student_credentials
--    Called by authenticated teacher to generate login_id + PIN for all
--    students in a class. Returns plain-text PINs (one-time display only).
-- ==========================================================================
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

    -- Generate 4-digit PIN
    v_pin := lpad((floor(random() * 10000))::int::text, 4, '0');

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
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==========================================================================
-- 5. RPC: rpc_reset_student_pin
--    Called by authenticated teacher to reset a student's PIN.
--    Returns the new plain-text PIN (one-time display).
-- ==========================================================================
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

  -- Generate new PIN and invalidate existing token
  v_pin := lpad((floor(random() * 10000))::int::text, 4, '0');

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
$$ LANGUAGE plpgsql SECURITY DEFINER;
