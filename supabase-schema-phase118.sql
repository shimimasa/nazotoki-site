-- ==========================================================================
-- Phase 118: Security & Bug Fixes
--
-- Changes:
--   1. ADD COLUMN solo_sessions.is_correct (boolean)
--   2. UPDATE rpc_save_solo_session to accept p_is_correct
--   3. REPLACE solo_sessions RLS: USING(true) → teacher owns student's class
--   4. RESTRICT session_logs anon INSERT to teacher_id IS NULL
--
-- Run order: After Phase 117
-- ==========================================================================

-- 1. Add is_correct column to solo_sessions
ALTER TABLE solo_sessions ADD COLUMN IF NOT EXISTS is_correct boolean;

-- 2. Update rpc_save_solo_session to accept and store is_correct
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Replace solo_sessions RLS policy
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "auth_solo_sessions_all" ON solo_sessions;

-- Teachers can SELECT solo sessions for students in their classes
CREATE POLICY "auth_solo_sessions_select" ON solo_sessions FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT s.id FROM students s
      JOIN classes c ON s.class_id = c.id
      WHERE c.teacher_id = my_teacher_id()
    )
  );

-- No direct INSERT/UPDATE/DELETE for authenticated — all via SECURITY DEFINER RPCs

-- 4. Restrict session_logs anon INSERT to teacher_id IS NULL
DROP POLICY IF EXISTS "anon_session_logs_insert" ON session_logs;

CREATE POLICY "anon_session_logs_insert" ON session_logs FOR INSERT TO anon
  WITH CHECK (teacher_id IS NULL);
