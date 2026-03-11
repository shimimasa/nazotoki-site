-- Phase 86: GM Connection Monitor + Heartbeat
-- 実行順序: Phase 84の後に実行

-- 1. last_seen_at カラム追加
ALTER TABLE session_participants
ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now();

-- 2. Heartbeat RPC（生徒が30秒ごとに呼ぶ）
CREATE OR REPLACE FUNCTION rpc_heartbeat(
  p_participant_id UUID,
  p_session_token TEXT
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE session_participants
  SET last_seen_at = now()
  WHERE id = p_participant_id
    AND session_token = p_session_token
    AND EXISTS (
      SELECT 1 FROM session_runs
      WHERE id = session_participants.session_run_id
        AND is_active = true
    );

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_token_or_session');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

-- 3. GRANTs
GRANT EXECUTE ON FUNCTION rpc_heartbeat(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION rpc_heartbeat(UUID, TEXT) TO authenticated;
