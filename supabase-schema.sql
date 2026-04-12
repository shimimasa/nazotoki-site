-- Teacher: can UPDATE participants in own session_runs (character assignment)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_participants' AND policyname='auth_session_participants_update') THEN
    CREATE POLICY "auth_session_participants_update" ON session_participants FOR UPDATE TO authenticated
      USING (session_run_id IN (SELECT id FROM session_runs WHERE teacher_id = my_teacher_id()));
  END IF;
END $$;

-- Phase 71: Anon has NO direct access to session_participants.
-- All student operations go through SECURITY DEFINER RPCs:
--   rpc_join_session, rpc_reconnect_session, rpc_submit_vote, rpc_get_my_participant
-- See supabase-schema-phase71.sql for RPC definitions.


-- ============================================================
-- 13. Solo Sessions (Phase 75: solo play records)
-- ============================================================

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

-- Teacher access (authenticated)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='solo_sessions' AND policyname='auth_solo_sessions_all') THEN
    CREATE POLICY "auth_solo_sessions_all" ON solo_sessions FOR ALL TO authenticated
      USING (true);
  END IF;
END $$;

-- Anon has NO direct access. All via SECURITY DEFINER RPCs:
--   rpc_save_solo_session, rpc_fetch_solo_history
-- See supabase-schema-phase75.sql for RPC definitions.
