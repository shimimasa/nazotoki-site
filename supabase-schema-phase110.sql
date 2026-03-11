-- Phase 110: テナント管理強化 — DB変更
-- 実行順: Phase 109 → 110

-- 1. school_groups テーブル（教育委員会・法人等の上位概念）
CREATE TABLE IF NOT EXISTS school_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE school_groups ENABLE ROW LEVEL SECURITY;

-- 2. schools に group_id 追加（RLSより先に列を作る）
ALTER TABLE schools ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES school_groups(id);

-- 3. teachers に group_role 追加（RLSより先に列を作る）
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS group_role TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teachers_group_role_check'
  ) THEN
    ALTER TABLE teachers ADD CONSTRAINT teachers_group_role_check
      CHECK (group_role IN ('group_admin') OR group_role IS NULL);
  END IF;
END $$;

-- 4. RLS: group_admin が自分のグループを閲覧可能（列が存在した状態で作成）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Group admins can view own group' AND tablename = 'school_groups'
  ) THEN
    CREATE POLICY "Group admins can view own group"
      ON school_groups FOR SELECT
      USING (
        id IN (
          SELECT sg.id FROM school_groups sg
          JOIN schools s ON s.group_id = sg.id
          JOIN teachers t ON t.school_id = s.id
          WHERE t.auth_user_id = auth.uid() AND t.group_role = 'group_admin'
        )
      );
  END IF;
END $$;

-- 5. schools.group_id のインデックス
CREATE INDEX IF NOT EXISTS idx_schools_group_id
  ON schools (group_id) WHERE group_id IS NOT NULL;
