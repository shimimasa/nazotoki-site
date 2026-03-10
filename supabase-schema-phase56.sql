-- ==========================================================================
-- Phase 56: session_runs + session_participants + Realtime基盤
--
-- session_runs: セッション進行中のライブ状態（先生→生徒にブロードキャスト）
-- session_participants: 参加コードで参加した生徒（認証不要）
--
-- Supabase Realtimeの前提:
--   1. Supabase Dashboard > Database > Replication で session_runs を有効化
--   2. RLSポリシーでanon SELECTを許可（参加コード照合）
-- ==========================================================================

-- ============================================================
-- 11. Session Runs (live session state for Realtime broadcast)
-- ============================================================

CREATE TABLE IF NOT EXISTS session_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_slug text NOT NULL,
  scenario_title text,
  teacher_id uuid REFERENCES teachers(id),
  class_id uuid REFERENCES classes(id),
  join_code text NOT NULL UNIQUE,
  current_phase text NOT NULL DEFAULT 'prep',
  timer_seconds integer NOT NULL DEFAULT 0,
  timer_running boolean NOT NULL DEFAULT false,
  discovered_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  twist_revealed boolean NOT NULL DEFAULT false,
  votes jsonb NOT NULL DEFAULT '{}'::jsonb,
  vote_reasons jsonb NOT NULL DEFAULT '{}'::jsonb,
  player_count integer NOT NULL DEFAULT 4,
  is_active boolean NOT NULL DEFAULT true,
  started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_runs_join_code ON session_runs(join_code);
CREATE INDEX IF NOT EXISTS idx_session_runs_teacher ON session_runs(teacher_id);
CREATE INDEX IF NOT EXISTS idx_session_runs_active ON session_runs(is_active) WHERE is_active = true;

ALTER TABLE session_runs ENABLE ROW LEVEL SECURITY;

-- Teacher: full access to own session_runs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_runs' AND policyname='auth_session_runs_all') THEN
    CREATE POLICY "auth_session_runs_all" ON session_runs FOR ALL TO authenticated
      USING (teacher_id = my_teacher_id())
      WITH CHECK (teacher_id = my_teacher_id());
  END IF;
END $$;

-- Anon (students): can SELECT active session_runs by join_code
-- This enables Supabase Realtime subscriptions for students
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_runs' AND policyname='anon_session_runs_select') THEN
    CREATE POLICY "anon_session_runs_select" ON session_runs FOR SELECT TO anon
      USING (is_active = true);
  END IF;
END $$;

-- Authenticated users (non-owner): can also SELECT active session_runs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_runs' AND policyname='auth_session_runs_select_active') THEN
    CREATE POLICY "auth_session_runs_select_active" ON session_runs FOR SELECT TO authenticated
      USING (is_active = true);
  END IF;
END $$;


-- ============================================================
-- 12. Session Participants (students joining via code)
-- ============================================================

CREATE TABLE IF NOT EXISTS session_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_run_id uuid NOT NULL REFERENCES session_runs(id) ON DELETE CASCADE,
  participant_name text NOT NULL,
  student_id uuid REFERENCES students(id),
  session_token text NOT NULL UNIQUE,
  voted_for text,
  vote_reason text,
  voted_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_participants_run ON session_participants(session_run_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_token ON session_participants(session_token);

ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;

-- Teacher: can see participants in own session_runs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_participants' AND policyname='auth_session_participants_select') THEN
    CREATE POLICY "auth_session_participants_select" ON session_participants FOR SELECT TO authenticated
      USING (session_run_id IN (SELECT id FROM session_runs WHERE teacher_id = my_teacher_id()));
  END IF;
END $$;

-- Anon (students): can INSERT themselves into active sessions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_participants' AND policyname='anon_session_participants_insert') THEN
    CREATE POLICY "anon_session_participants_insert" ON session_participants FOR INSERT TO anon
      WITH CHECK (
        session_run_id IN (SELECT id FROM session_runs WHERE is_active = true)
      );
  END IF;
END $$;

-- Anon (students): can SELECT own participant record by session_token
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_participants' AND policyname='anon_session_participants_select') THEN
    CREATE POLICY "anon_session_participants_select" ON session_participants FOR SELECT TO anon
      USING (
        session_run_id IN (SELECT id FROM session_runs WHERE is_active = true)
      );
  END IF;
END $$;

-- Anon (students): can UPDATE own participant record (vote)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_participants' AND policyname='anon_session_participants_update') THEN
    CREATE POLICY "anon_session_participants_update" ON session_participants FOR UPDATE TO anon
      USING (
        session_run_id IN (SELECT id FROM session_runs WHERE is_active = true)
      );
  END IF;
END $$;


-- ============================================================
-- IMPORTANT: Supabase Realtime Setup
-- ============================================================
-- After running this SQL, go to Supabase Dashboard:
-- 1. Database > Replication > Tables
-- 2. Enable replication for "session_runs" table
-- 3. Enable replication for "session_participants" table
-- This allows clients to subscribe to INSERT/UPDATE events.
