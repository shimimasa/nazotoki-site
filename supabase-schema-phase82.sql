-- ==========================================================================
-- Phase 82: High Security Fix
--
-- Codex Review Findings: B1-H1, B1-H2, B2-H2
--
-- H1: PIN brute force protection (failed_attempts + lockout)
-- H2: SET search_path on all SECURITY DEFINER functions
-- B2-H2: student_token expiry 7d → 24h
--
-- Run order: After phase 81 migration
-- ==========================================================================

-- ============================================================
-- 1. H1: PIN brute force protection
-- ============================================================

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS failed_attempts int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

-- Recreate rpc_student_login with brute force protection + 24h token
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
    -- Generic error to prevent user enumeration
    RETURN jsonb_build_object('error', 'IDまたはPINが正しくありません');
  END IF;

  -- Check lockout (5 failures = 15 min lock)
  IF v_student.locked_until IS NOT NULL AND v_student.locked_until > now() THEN
    RETURN jsonb_build_object('error', 'ログインがロックされています。しばらくしてからもう一度お試しください');
  END IF;

  -- Check PIN is set
  IF v_student.pin_hash IS NULL THEN
    RETURN jsonb_build_object('error', 'ログインIDが未発行です。先生に連絡してください');
  END IF;

  -- Verify PIN
  IF crypt(p_pin, v_student.pin_hash) != v_student.pin_hash THEN
    -- Increment failed attempts, lock after 5
    UPDATE public.students
    SET failed_attempts = COALESCE(failed_attempts, 0) + 1,
        locked_until = CASE
          WHEN COALESCE(failed_attempts, 0) + 1 >= 5
          THEN now() + interval '15 minutes'
          ELSE NULL
        END
    WHERE id = v_student.id;

    RETURN jsonb_build_object('error', 'IDまたはPINが正しくありません');
  END IF;

  -- Success: reset failed attempts, generate token (24h expiry — B2-H2)
  v_token := gen_random_uuid()::text;
  v_expires := now() + interval '24 hours';

  UPDATE public.students
  SET student_token = v_token,
      token_expires_at = v_expires,
      failed_attempts = 0,
      locked_until = NULL
  WHERE id = v_student.id;

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


-- ============================================================
-- 2. H2: SET search_path on ALL SECURITY DEFINER functions
--    Prevents search_path manipulation attacks.
-- ============================================================

-- Helper function
ALTER FUNCTION my_teacher_id() SET search_path = public, pg_catalog;

-- Phase 71 RPCs
ALTER FUNCTION rpc_join_session(text, text, uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION rpc_reconnect_session(uuid, text) SET search_path = public, pg_catalog;
ALTER FUNCTION rpc_submit_vote(uuid, text, text, text) SET search_path = public, pg_catalog;
ALTER FUNCTION rpc_get_my_participant(uuid, text) SET search_path = public, pg_catalog;

-- Phase 81 RPCs (new signature)
ALTER FUNCTION rpc_create_session_run(text, text, uuid, integer, jsonb, jsonb) SET search_path = public, pg_catalog;
ALTER FUNCTION rpc_find_session_by_code(text) SET search_path = public, pg_catalog;

-- Phase 74 RPCs
ALTER FUNCTION rpc_student_login(text, text) SET search_path = public, pg_catalog;
ALTER FUNCTION rpc_verify_student_token(uuid, text) SET search_path = public, pg_catalog;
ALTER FUNCTION rpc_generate_student_credentials(uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION rpc_reset_student_pin(uuid) SET search_path = public, pg_catalog;

-- Phase 75 RPCs
ALTER FUNCTION rpc_save_solo_session(uuid, text, text, timestamptz, int, text, text, int[], jsonb, int, int) SET search_path = public, pg_catalog;
ALTER FUNCTION rpc_fetch_solo_history(uuid, text) SET search_path = public, pg_catalog;

-- Phase 78 RPC
ALTER FUNCTION rpc_fetch_student_assignments(uuid, text) SET search_path = public, pg_catalog;
