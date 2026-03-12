-- ==========================================================================
-- Phase 121: Codex Review Fixes
--
-- Changes:
--   1. DROP old 11-arg rpc_save_solo_session overload
--   2. Re-create 12-arg version with SET search_path = public + REVOKE/GRANT
--
-- Run order: After Phase 118
-- ==========================================================================

-- 1. Drop old 11-argument overload (Phase 83 version)
DROP FUNCTION IF EXISTS rpc_save_solo_session(
  uuid, text, text, timestamptz, int, text, text, int[], jsonb, int, int
);

-- 2. Drop and re-create 12-argument version with proper security settings
DROP FUNCTION IF EXISTS rpc_save_solo_session(
  uuid, text, text, timestamptz, int, text, text, int[], jsonb, int, int, boolean
);

CREATE FUNCTION rpc_save_solo_session(
  p_student_id uuid,
  p_student_token text,
  p_scenario_slug text,
  p_started_at timestamptz,
  p_duration_seconds int,
  p_vote text,
  p_vote_reason text,
  p_evidence_read_order int[],
  p_time_per_step jsonb,
  p_rp_earned int,
  p_hints_used int,
  p_is_correct boolean DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_student record;
  v_session_id uuid;
BEGIN
  -- Validate student token
  SELECT * INTO v_student
  FROM public.students
  WHERE id = p_student_id AND student_token = p_student_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_token');
  END IF;

  IF v_student.token_expires_at < now() THEN
    RETURN jsonb_build_object('error', 'token_expired');
  END IF;

  -- Insert solo session record
  INSERT INTO public.solo_sessions (
    student_id, scenario_slug, started_at, completed_at,
    duration_seconds, vote, vote_reason, evidence_read_order,
    time_per_step, rp_earned, hints_used, is_correct
  ) VALUES (
    p_student_id, p_scenario_slug, p_started_at, now(),
    p_duration_seconds, p_vote, p_vote_reason, p_evidence_read_order,
    p_time_per_step, p_rp_earned, p_hints_used, p_is_correct
  )
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'rp_earned', p_rp_earned
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Restrict execution: revoke from public, grant to anon (student token auth)
REVOKE EXECUTE ON FUNCTION rpc_save_solo_session(
  uuid, text, text, timestamptz, int, text, text, int[], jsonb, int, int, boolean
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION rpc_save_solo_session(
  uuid, text, text, timestamptz, int, text, text, int[], jsonb, int, int, boolean
) TO anon;
