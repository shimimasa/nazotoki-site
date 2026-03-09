-- ==========================================================================
-- Phase 40: Introduce school_id — schools table + school_id on teachers/classes
--
-- Run this in Supabase SQL Editor in order.
-- Safe to run multiple times (IF NOT EXISTS / IF NOT NULL checks).
-- ==========================================================================


-- ============================================================
-- Step 1: Create schools table (no RLS policies yet)
-- ============================================================

CREATE TABLE IF NOT EXISTS schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- Step 2: Add school_id columns BEFORE RLS policies that reference them
-- ============================================================

-- 2a. Add school_id to teachers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teachers' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE teachers ADD COLUMN school_id uuid REFERENCES schools(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_teachers_school ON teachers(school_id);

-- 2b. Add school_id to classes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classes' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE classes ADD COLUMN school_id uuid REFERENCES schools(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_classes_school ON classes(school_id);


-- ============================================================
-- Step 3: Now add RLS policies on schools (teachers.school_id exists)
-- ============================================================

-- Teachers can read their own school
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'schools' AND policyname = 'auth_schools_select'
  ) THEN
    CREATE POLICY "auth_schools_select"
      ON schools FOR SELECT TO authenticated
      USING (
        id IN (SELECT school_id FROM teachers WHERE id = my_teacher_id() AND school_id IS NOT NULL)
      );
  END IF;
END $$;

-- Teachers can update their own school name
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'schools' AND policyname = 'auth_schools_update'
  ) THEN
    CREATE POLICY "auth_schools_update"
      ON schools FOR UPDATE TO authenticated
      USING (
        id IN (SELECT school_id FROM teachers WHERE id = my_teacher_id() AND school_id IS NOT NULL)
      );
  END IF;
END $$;

-- Teachers can create a school (for initial setup)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'schools' AND policyname = 'auth_schools_insert'
  ) THEN
    CREATE POLICY "auth_schools_insert"
      ON schools FOR INSERT TO authenticated
      WITH CHECK (true);
  END IF;
END $$;


-- ============================================================
-- Step 4: Backfill — Create a school for each teacher, link their classes
-- ============================================================

-- 4a. For each teacher without a school, create one and assign it
DO $$
DECLARE
  t RECORD;
  new_school_id uuid;
BEGIN
  FOR t IN
    SELECT id, display_name FROM teachers WHERE school_id IS NULL
  LOOP
    INSERT INTO schools (name)
    VALUES (t.display_name || 'の学校')
    RETURNING id INTO new_school_id;

    UPDATE teachers SET school_id = new_school_id WHERE id = t.id;
  END LOOP;
END $$;

-- 4b. Backfill classes: set school_id from their teacher's school_id
UPDATE classes c
SET school_id = t.school_id
FROM teachers t
WHERE c.teacher_id = t.id
  AND c.school_id IS NULL
  AND t.school_id IS NOT NULL;


-- ============================================================
-- Step 5: Verification queries (run to confirm)
-- ============================================================

-- Check: All teachers should have school_id
-- SELECT count(*) AS teachers_without_school FROM teachers WHERE school_id IS NULL;

-- Check: All classes should have school_id
-- SELECT count(*) AS classes_without_school FROM classes WHERE school_id IS NULL;

-- Check: Schools created
-- SELECT id, name, created_at FROM schools ORDER BY created_at;


-- ============================================================
-- Notes for future phases:
-- ============================================================
-- TODO Phase 41+: Add school_id-based RLS policies for cross-teacher school access
-- TODO Phase 41+: Consider NOT NULL constraint on teachers.school_id after full migration
-- TODO Phase 41+: Consider NOT NULL constraint on classes.school_id after full migration
-- TODO Phase 41+: Add admin role for school-level access management
-- TODO Phase 41+: Add school_id to session_logs for direct query performance (optional)
