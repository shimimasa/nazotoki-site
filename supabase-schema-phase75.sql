-- ==========================================================================
-- Phase 75: Solo Mode Foundation
--
-- Changes:
--   1. CREATE TABLE solo_sessions (solo play records)
--   2. RPC: rpc_save_solo_session (anon, SECURITY DEFINER — student token auth)
--   3. RPC: rpc_fetch_solo_history (anon, SECURITY DEFINER — student token auth)
--
-- Run order: After phase 74 migration
-- ==========================================================================

-- 1. Solo sessions table
CREATE TABLE IF NOT EXISTS public.solo_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  scenario_slug text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_seconds int,
  vote text,
  vote_reason text,
  evidence_read_order int[] DEFAULT '{}',
  time_per_step jsonb DEFAULT '{}',
  rp_earned int DEFAULT 0,
  hints_used int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solo_sessions_student ON solo_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_solo_sessions_slug ON solo_sessions(scenario_slug);

ALTER TABLE solo_sessions ENABLE ROW LEVEL SECURITY;

-- No direct anon/auth access — all via RPCs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='solo_sessions' AND policyname='auth_solo_sessions_all') THEN
    CREATE POLICY "auth_solo_sessions_all" ON solo_sessions FOR ALL TO authenticated
      USING (true);
  END IF;
END $$;


-- ==========================================================================
-- 2. RPC: rpc_save_solo_session
--    Called by anon (student) to save a completed solo session.
--    Authenticates via student_token.
-- ==========================================================================
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

  -- Insert solo session record
  INSERT INTO public.solo_sessions (
    student_id, scenario_slug, started_at, completed_at,
    duration_seconds, vote, vote_reason, evidence_read_order,
    time_per_step, rp_earned, hints_used
  ) VALUES (
    p_student_id, p_scenario_slug, p_started_at, now(),
    p_duration_seconds, p_vote, p_vote_reason, p_evidence_read_order,
    p_time_per_step, p_rp_earned, p_hints_used
  )
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'rp_earned', p_rp_earned
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==========================================================================
-- 3. RPC: rpc_fetch_solo_history
--    Fetch a student's solo play history (for my-page).
-- ==========================================================================
CREATE OR REPLACE FUNCTION rpc_fetch_solo_history(
  p_student_id uuid,
  p_student_token text
)
RETURNS jsonb AS $$
DECLARE
  v_student record;
BEGIN
  SELECT * INTO v_student
  FROM public.students
  WHERE id = p_student_id AND student_token = p_student_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_token');
  END IF;

  IF v_student.token_expires_at < now() THEN
    RETURN jsonb_build_object('error', 'token_expired');
  END IF;

  RETURN jsonb_build_object(
    'sessions', (
      SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.created_at DESC), '[]'::jsonb)
      FROM public.solo_sessions s
      WHERE s.student_id = p_student_id
    ),
    'total_rp', (
      SELECT COALESCE(SUM(rp_earned), 0)
      FROM public.solo_sessions
      WHERE student_id = p_student_id
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
