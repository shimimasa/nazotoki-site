-- Phase 61: キャラクター割当
-- session_participants に assigned_character カラムを追加
-- GMが参加者にキャラクターを割り当てるために使用

ALTER TABLE session_participants
  ADD COLUMN IF NOT EXISTS assigned_character text;

-- Teacher: can UPDATE participants in own session_runs (for character assignment)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_participants' AND policyname='auth_session_participants_update') THEN
    CREATE POLICY "auth_session_participants_update" ON session_participants FOR UPDATE TO authenticated
      USING (session_run_id IN (SELECT id FROM session_runs WHERE teacher_id = my_teacher_id()));
  END IF;
END $$;
