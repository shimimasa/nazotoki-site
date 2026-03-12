-- Phase 131: Solo perspective mode — new columns + RPC update
-- Run this AFTER supabase-schema-phase121.sql

-- 1) Add new columns (all nullable for backwards compatibility)
ALTER TABLE solo_sessions ADD COLUMN IF NOT EXISTS solo_mode text DEFAULT 'classic';
ALTER TABLE solo_sessions ADD COLUMN IF NOT EXISTS played_character text;
ALTER TABLE solo_sessions ADD COLUMN IF NOT EXISTS interrogated_characters text[];
ALTER TABLE solo_sessions ADD COLUMN IF NOT EXISTS hypothesis text;

-- 2) Drop existing RPC (12-param version from Phase 121)
DROP FUNCTION IF EXISTS rpc_save_solo_session(uuid, text, text, timestamptz, integer, text, text, integer[], jsonb, integer, integer, boolean);

-- 3) Recreate with 16 parameters (4 new, all with DEFAULT)
CREATE OR REPLACE FUNCTION rpc_save_solo_session(
  p_student_id uuid,
  p_student_token text,
  p_scenario_slug text,
  p_started_at timestamptz,
  p_duration_seconds integer,
  p_vote text DEFAULT NULL,
  p_vote_reason text DEFAULT NULL,
  p_evidence_read_order integer[] DEFAULT '{}',
  p_time_per_step jsonb DEFAULT '{}',
  p_rp_earned integer DEFAULT 0,
  p_hints_used integer DEFAULT 0,
  p_is_correct boolean DEFAULT NULL,
  -- Phase 131: New perspective mode params
  p_solo_mode text DEFAULT 'classic',
  p_played_character text DEFAULT NULL,
  p_interrogated_characters text[] DEFAULT NULL,
  p_hypothesis text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student students%ROWTYPE;
  v_session_id uuid;
BEGIN
  -- Authenticate student
  SELECT * INTO v_student
  FROM students
  WHERE id = p_student_id AND token = p_student_token;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'invalid_credentials');
  END IF;

  -- Insert solo session
  INSERT INTO solo_sessions (
    student_id, scenario_slug, started_at, duration_seconds,
    vote, vote_reason, evidence_read_order, time_per_step,
    rp_earned, hints_used, is_correct,
    solo_mode, played_character, interrogated_characters, hypothesis
  ) VALUES (
    p_student_id, p_scenario_slug, p_started_at, p_duration_seconds,
    p_vote, p_vote_reason, p_evidence_read_order, p_time_per_step,
    p_rp_earned, p_hints_used, p_is_correct,
    p_solo_mode, p_played_character, p_interrogated_characters, p_hypothesis
  )
  RETURNING id INTO v_session_id;

  -- Update student total RP
  UPDATE students
  SET total_rp = total_rp + p_rp_earned,
      last_played_at = now()
  WHERE id = p_student_id;

  RETURN json_build_object(
    'session_id', v_session_id,
    'rp_earned', p_rp_earned
  );
END;
$$;

-- 4) Security: same grants as original
REVOKE ALL ON FUNCTION rpc_save_solo_session(uuid, text, text, timestamptz, integer, text, text, integer[], jsonb, integer, integer, boolean, text, text, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_save_solo_session(uuid, text, text, timestamptz, integer, text, text, integer[], jsonb, integer, integer, boolean, text, text, text[], text) TO anon;
