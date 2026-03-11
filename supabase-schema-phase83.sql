-- ==========================================================================
-- Phase 83: Medium UX / Data Integrity
--
-- Codex Review Findings: B1-M1, B1-M3
--
-- M1: solo_session duplicate save prevention
-- M3: rpc_join_session student_id token validation
--
-- Run order: After phase 82 migration
-- ==========================================================================

-- ============================================================
-- 1. M1: solo_session duplicate save prevention
-- ============================================================

-- Unique constraint to prevent double-saves
CREATE UNIQUE INDEX IF NOT EXISTS idx_solo_sessions_unique_play
  ON public.solo_sessions(student_id, scenario_slug, started_at);

-- Recreate rpc_save_solo_session with ON CONFLICT DO NOTHING
CREATE OR REPLACE FUNCTION rpc_save_solo_session(
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
  p_hints_used int
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

  -- Insert with duplicate prevention
  INSERT INTO public.solo_sessions (
    student_id, scenario_slug, started_at, completed_at,
    duration_seconds, vote, vote_reason, evidence_read_order,
    time_per_step, rp_earned, hints_used
  ) VALUES (
    p_student_id, p_scenario_slug, p_started_at, now(),
    p_duration_seconds, p_vote, p_vote_reason, p_evidence_read_order,
    p_time_per_step, p_rp_earned, p_hints_used
  )
  ON CONFLICT (student_id, scenario_slug, started_at) DO NOTHING
  RETURNING id INTO v_session_id;

  -- If duplicate, return success anyway (idempotent)
  IF v_session_id IS NULL THEN
    RETURN jsonb_build_object(
      'session_id', NULL,
      'rp_earned', p_rp_earned,
      'duplicate', true
    );
  END IF;

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'rp_earned', p_rp_earned
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;


-- ============================================================
-- 2. M3: rpc_join_session student_id token validation
--    - Anonymous: p_student_id forced to NULL
--    - Logged-in: validate (student_id, student_token) pair
-- ============================================================

-- Drop old signature (3 params) and create new (4 params)
DROP FUNCTION IF EXISTS rpc_join_session(text, text, uuid);

CREATE OR REPLACE FUNCTION rpc_join_session(
  p_join_code text,
  p_participant_name text,
  p_student_id uuid DEFAULT NULL,
  p_student_token text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_run_id uuid;
  v_token text;
  v_participant record;
  v_validated_student_id uuid := NULL;
BEGIN
  -- Validate input
  IF p_participant_name IS NULL OR trim(p_participant_name) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_required');
  END IF;

  -- Validate student identity if provided
  IF p_student_id IS NOT NULL THEN
    IF p_student_token IS NULL THEN
      -- No token = force anonymous (ignore student_id)
      v_validated_student_id := NULL;
    ELSE
      -- Verify student_id + token pair
      IF EXISTS (
        SELECT 1 FROM public.students
        WHERE id = p_student_id
          AND student_token = p_student_token
          AND (token_expires_at IS NULL OR token_expires_at > now())
      ) THEN
        v_validated_student_id := p_student_id;
      ELSE
        -- Invalid token — proceed as anonymous
        v_validated_student_id := NULL;
      END IF;
    END IF;
  END IF;

  -- Find active session by join code
  SELECT id INTO v_run_id
  FROM public.session_runs
  WHERE join_code = upper(trim(p_join_code))
    AND is_active = true;

  IF v_run_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;

  -- Generate session participation token with 24h expiry
  v_token := gen_random_uuid()::text;

  -- Insert participant
  INSERT INTO public.session_participants (
    session_run_id, participant_name, student_id,
    session_token, token_expires_at
  ) VALUES (
    v_run_id, trim(p_participant_name), v_validated_student_id,
    v_token, now() + interval '24 hours'
  )
  RETURNING * INTO v_participant;

  RETURN jsonb_build_object(
    'ok', true,
    'participant', jsonb_build_object(
      'id', v_participant.id,
      'session_run_id', v_participant.session_run_id,
      'participant_name', v_participant.participant_name,
      'student_id', v_participant.student_id,
      'session_token', v_participant.session_token,
      'assigned_character', v_participant.assigned_character,
      'voted_for', v_participant.voted_for,
      'vote_reason', v_participant.vote_reason,
      'voted_at', v_participant.voted_at,
      'joined_at', v_participant.joined_at
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- Fix grants for new signature
REVOKE EXECUTE ON FUNCTION rpc_join_session(text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_join_session(text, text, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION rpc_join_session(text, text, uuid, text) TO authenticated;
