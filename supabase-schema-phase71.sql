-- ============================================================
-- Phase 71: RLS Security Hardening
-- Fixes Critical findings C1, C2 and High H2 from Codex review
--
-- C1: anon RLS on session_participants too broad (all active sessions readable)
-- C2: anon UPDATE without identity check (vote/token tampering)
-- H2: session_token has no expiry
--
-- Strategy:
--   - Remove all anon direct access to session_participants
--   - Create SECURITY DEFINER RPCs for student operations
--   - Add token_expires_at for session token expiry
--   - Keep anon SELECT on session_runs (needed for Realtime)
-- ============================================================

-- 1. Add token_expires_at column
ALTER TABLE session_participants
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;

-- 2. Drop all dangerous anon policies on session_participants
DROP POLICY IF EXISTS "anon_session_participants_select" ON session_participants;
DROP POLICY IF EXISTS "anon_session_participants_update" ON session_participants;
DROP POLICY IF EXISTS "anon_session_participants_insert" ON session_participants;

-- ============================================================
-- 3. RPC: rpc_join_session
--    Student joins a session by join code. Validates code,
--    generates token with 24h expiry, inserts participant.
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_join_session(
  p_join_code text,
  p_participant_name text,
  p_student_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_run_id uuid;
  v_token text;
  v_participant record;
BEGIN
  -- Validate input
  IF p_participant_name IS NULL OR trim(p_participant_name) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_required');
  END IF;

  -- Find active session by join code
  SELECT id INTO v_run_id
  FROM session_runs
  WHERE join_code = upper(trim(p_join_code))
    AND is_active = true;

  IF v_run_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;

  -- Generate token with 24h expiry
  v_token := gen_random_uuid()::text;

  -- Insert participant
  INSERT INTO session_participants (
    session_run_id, participant_name, student_id,
    session_token, token_expires_at
  ) VALUES (
    v_run_id, trim(p_participant_name), p_student_id,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. RPC: rpc_reconnect_session
--    Student reconnects using saved token. Validates token
--    and expiry, returns participant + session run data.
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_reconnect_session(
  p_session_run_id uuid,
  p_session_token text
) RETURNS jsonb AS $$
DECLARE
  v_participant record;
  v_run record;
BEGIN
  -- Find participant by token (check expiry)
  SELECT * INTO v_participant
  FROM session_participants
  WHERE session_run_id = p_session_run_id
    AND session_token = p_session_token
    AND (token_expires_at IS NULL OR token_expires_at > now());

  IF v_participant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  -- Fetch session run
  SELECT * INTO v_run
  FROM session_runs
  WHERE id = p_session_run_id;

  IF v_run IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;

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
    ),
    'run', jsonb_build_object(
      'id', v_run.id,
      'scenario_slug', v_run.scenario_slug,
      'scenario_title', v_run.scenario_title,
      'teacher_id', v_run.teacher_id,
      'class_id', v_run.class_id,
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
-- 5. RPC: rpc_submit_vote
--    Student submits a vote. Validates token ownership,
--    only updates vote columns (not character/token/name).
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_submit_vote(
  p_participant_id uuid,
  p_session_token text,
  p_voted_for text,
  p_vote_reason text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_count integer;
BEGIN
  -- Validate
  IF p_voted_for IS NULL OR trim(p_voted_for) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'voted_for_required');
  END IF;

  -- Update only if token matches this participant (prevents vote tampering)
  UPDATE session_participants
  SET voted_for = trim(p_voted_for),
      vote_reason = CASE
        WHEN p_vote_reason IS NOT NULL AND trim(p_vote_reason) <> ''
        THEN trim(p_vote_reason)
        ELSE NULL
      END,
      voted_at = now()
  WHERE id = p_participant_id
    AND session_token = p_session_token
    AND (token_expires_at IS NULL OR token_expires_at > now());

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. RPC: rpc_get_my_participant
--    Student fetches own participant record by token.
--    Replaces direct anon SELECT (used for character assignment).
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_get_my_participant(
  p_participant_id uuid,
  p_session_token text
) RETURNS jsonb AS $$
DECLARE
  v_participant record;
BEGIN
  SELECT * INTO v_participant
  FROM session_participants
  WHERE id = p_participant_id
    AND session_token = p_session_token
    AND (token_expires_at IS NULL OR token_expires_at > now());

  IF v_participant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. Grant RPC access to anon role
-- ============================================================
GRANT EXECUTE ON FUNCTION rpc_join_session(text, text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION rpc_reconnect_session(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION rpc_submit_vote(uuid, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION rpc_get_my_participant(uuid, text) TO anon;
