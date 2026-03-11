-- Phase 109: Stripe課金基盤 — DB変更
-- 実行順: Phase 108 → 109

-- 1. teachersテーブルに課金関連列追加
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- 2. subscription_plan バリデーション
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teachers_subscription_plan_check'
  ) THEN
    ALTER TABLE teachers ADD CONSTRAINT teachers_subscription_plan_check
      CHECK (subscription_plan IN ('free', 'standard', 'school'));
  END IF;
END $$;

-- 3. subscription_status バリデーション
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teachers_subscription_status_check'
  ) THEN
    ALTER TABLE teachers ADD CONSTRAINT teachers_subscription_status_check
      CHECK (subscription_status IN ('active', 'past_due', 'canceled'));
  END IF;
END $$;
