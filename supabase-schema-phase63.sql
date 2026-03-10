-- Phase 63: 証拠タイトル配信
-- session_runs に evidence_titles カラムを追加
-- 生徒が議論/投票フェーズで発見済み証拠のタイトルを参照するために使用

ALTER TABLE session_runs
  ADD COLUMN IF NOT EXISTS evidence_titles jsonb NOT NULL DEFAULT '[]'::jsonb;
