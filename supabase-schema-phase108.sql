-- Phase 108: 保護者ポータル — DB変更
-- 実行順: Phase 97 → 99 → 108

-- 1. studentsテーブルに保護者リンク列追加
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_link_code TEXT UNIQUE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_link_expires_at TIMESTAMPTZ;

-- 2. parent_link_code にインデックス（コード検索高速化）
CREATE INDEX IF NOT EXISTS idx_students_parent_link_code
  ON students (parent_link_code) WHERE parent_link_code IS NOT NULL;
