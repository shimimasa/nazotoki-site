-- Phase 107-111 Codex Review Fix — DB変更
-- Stripe webhook idempotency support

-- 1. teachers に stripe_last_event_at 追加（webhook順序制御用）
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS stripe_last_event_at TIMESTAMPTZ;
