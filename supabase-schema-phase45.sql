-- ============================================================
-- Phase 45: Admin Role Introduction
-- ============================================================
-- Purpose: Add role column to teachers table to distinguish
--          teacher vs admin access to school-wide management.
-- ============================================================

-- 1. Add role column with safe default
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'teacher';

-- 2. Add CHECK constraint (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_teachers_role'
  ) THEN
    ALTER TABLE teachers ADD CONSTRAINT chk_teachers_role
      CHECK (role IN ('teacher', 'admin'));
  END IF;
END$$;

-- 3. Backfill: ensure all existing teachers have role='teacher'
--    (redundant if DEFAULT worked, but safe)
UPDATE teachers SET role = 'teacher' WHERE role IS NULL;

-- 4. To promote a teacher to admin, run:
--    UPDATE teachers SET role = 'admin' WHERE id = '<teacher-uuid>';
