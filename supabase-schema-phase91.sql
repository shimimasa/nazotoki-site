-- Phase 91: Session Feedback
-- Prerequisites: session_runs, session_participants tables exist

-- Feedback table
CREATE TABLE IF NOT EXISTS session_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_run_id UUID NOT NULL REFERENCES session_runs(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES session_participants(id) ON DELETE CASCADE,
  fun_rating INT NOT NULL CHECK (fun_rating BETWEEN 1 AND 5),
  difficulty_rating INT NOT NULL CHECK (difficulty_rating BETWEEN 1 AND 5),
  comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_run_id, participant_id)
);

-- Enable RLS
ALTER TABLE session_feedback ENABLE ROW LEVEL SECURITY;

-- RLS: Teachers can read feedback for their sessions
CREATE POLICY session_feedback_teacher_select ON session_feedback
  FOR SELECT TO authenticated
  USING (
    session_run_id IN (
      SELECT sr.id FROM session_runs sr
      JOIN teachers t ON sr.teacher_id = t.id
      WHERE t.auth_user_id = auth.uid()
    )
  );

-- Index
CREATE INDEX IF NOT EXISTS idx_session_feedback_run ON session_feedback(session_run_id);

-- RPC: Submit feedback (student, token-authenticated)
CREATE OR REPLACE FUNCTION rpc_submit_feedback(
  p_participant_id UUID,
  p_session_token TEXT,
  p_fun INT,
  p_difficulty INT,
  p_comment TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant RECORD;
BEGIN
  -- Token auth (check expiry per Phase 71 pattern)
  SELECT id, session_run_id
  INTO v_participant
  FROM session_participants
  WHERE id = p_participant_id
    AND session_token = p_session_token
    AND (token_expires_at IS NULL OR token_expires_at > now());

  IF v_participant IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  -- Validate ratings
  IF p_fun < 1 OR p_fun > 5 OR p_difficulty < 1 OR p_difficulty > 5 THEN
    RETURN jsonb_build_object('error', 'invalid_rating');
  END IF;

  -- Truncate comment (50 chars, matching client-side limit)
  INSERT INTO session_feedback (session_run_id, participant_id, fun_rating, difficulty_rating, comment)
  VALUES (v_participant.session_run_id, p_participant_id, p_fun, p_difficulty, left(COALESCE(p_comment, ''), 50))
  ON CONFLICT (session_run_id, participant_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION rpc_submit_feedback(UUID, TEXT, INT, INT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION rpc_submit_feedback(UUID, TEXT, INT, INT, TEXT) TO authenticated;
