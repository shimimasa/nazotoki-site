-- ============================================================
-- Phase 72: Session Exclusivity + Error Handling
-- Fixes H1 (active session race condition) from Codex review
--
-- H1: createSessionRun の deactivate→insert がクライアント2クエリで
--     競合に弱い。部分ユニーク制約もない。
--
-- Strategy:
--   - rpc_create_session_run で deactivate+insert を1トランザクション化
--   - 部分ユニーク制約で同一teacherの複数active sessionを防止
--   - join_code生成をサーバー側に移行（リトライループ付き）
-- ============================================================

-- 1. Partial unique index: one active session per teacher
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_runs_teacher_active_unique
  ON session_runs(teacher_id) WHERE is_active = true;

-- 2. RPC: rpc_create_session_run
--    Atomically deactivates existing active runs and creates a new one.
--    Join code generation with retry (up to 5 attempts).
CREATE OR REPLACE FUNCTION rpc_create_session_run(
  p_scenario_slug text,
  p_scenario_title text,
  p_teacher_id uuid,
  p_class_id uuid DEFAULT NULL,
  p_player_count integer DEFAULT 4,
  p_character_names jsonb DEFAULT '[]'::jsonb,
  p_evidence_titles jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb AS $$
DECLARE
  v_join_code text;
  v_run record;
  v_attempt integer := 0;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_i integer;
BEGIN
  -- Validate
  IF p_teacher_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'teacher_id_required');
  END IF;

  -- Atomically deactivate all existing active runs for this teacher
  UPDATE session_runs
  SET is_active = false, updated_at = now()
  WHERE teacher_id = p_teacher_id AND is_active = true;

  -- Generate unique join code with retry loop
  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > 5 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'join_code_generation_failed');
    END IF;

    -- Generate 6-char code from 32-char alphabet
    v_code := '';
    FOR v_i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, floor(random() * 32)::int + 1, 1);
    END LOOP;

    -- Check uniqueness (active sessions only — expired codes can be reused)
    IF NOT EXISTS (
      SELECT 1 FROM session_runs WHERE join_code = v_code AND is_active = true
    ) THEN
      v_join_code := v_code;
      EXIT;
    END IF;
  END LOOP;

  -- Insert new session run
  INSERT INTO session_runs (
    scenario_slug, scenario_title, teacher_id, class_id,
    join_code, player_count, character_names, evidence_titles,
    current_phase, is_active
  ) VALUES (
    p_scenario_slug, p_scenario_title, p_teacher_id, p_class_id,
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

-- Grant to authenticated (teachers only)
GRANT EXECUTE ON FUNCTION rpc_create_session_run(text, text, uuid, uuid, integer, jsonb, jsonb) TO authenticated;
