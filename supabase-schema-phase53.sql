-- ============================================================
-- Phase 53: School Profile Extension
-- 学校プロフィール項目の追加
-- ============================================================
-- 実行方法: Supabase SQL Editor にコピペして実行
-- 安全性: 全て ALTER TABLE ADD COLUMN IF NOT EXISTS なので再実行可能
-- 既存データへの影響: なし（全て NULL 許容）

-- 1. 学校種別
ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_type text;

-- school_type の CHECK 制約（既にある場合はスキップ）
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'schools_school_type_check' AND conrelid = 'schools'::regclass
  ) THEN
    ALTER TABLE schools ADD CONSTRAINT schools_school_type_check
      CHECK (school_type IS NULL OR school_type IN ('elementary', 'junior_high', 'high', 'combined', 'special_needs', 'other'));
  END IF;
END $$;

-- 2. 住所
ALTER TABLE schools ADD COLUMN IF NOT EXISTS address text;

-- 3. 校長名
ALTER TABLE schools ADD COLUMN IF NOT EXISTS principal_name text;

-- 4. 電話番号
ALTER TABLE schools ADD COLUMN IF NOT EXISTS phone_number text;

-- 5. ウェブサイトURL
ALTER TABLE schools ADD COLUMN IF NOT EXISTS website_url text;

-- 6. 連絡先メールアドレス
ALTER TABLE schools ADD COLUMN IF NOT EXISTS contact_email text;

-- ============================================================
-- RLS: 既存の auth_schools_update で自校のみ更新可能（role不問）
-- → MVPではUIでadmin限定とし、DB側のadmin限定強化は後続Phaseで検討
-- ============================================================

COMMENT ON COLUMN schools.school_type IS '学校種別: elementary, junior_high, high, combined, special_needs, other';
COMMENT ON COLUMN schools.address IS '学校住所';
COMMENT ON COLUMN schools.principal_name IS '校長名';
COMMENT ON COLUMN schools.phone_number IS '電話番号';
COMMENT ON COLUMN schools.website_url IS 'ウェブサイトURL';
COMMENT ON COLUMN schools.contact_email IS '連絡先メールアドレス';
