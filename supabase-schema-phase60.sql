-- ==========================================================================
-- Phase 60: character_names をsession_runsに追加
-- 生徒がドロップダウンで投票できるようキャラクター名を配信
-- ==========================================================================

ALTER TABLE session_runs
  ADD COLUMN IF NOT EXISTS character_names jsonb NOT NULL DEFAULT '[]'::jsonb;
