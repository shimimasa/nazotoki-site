-- ==========================================================================
-- Phase 48: Admin Write Access for classes / session_logs
--
-- Purpose: Enable admin users to INSERT/UPDATE classes and UPDATE
-- session_logs within their school (same school_id).
--
-- Prerequisites:
--   - Phase 46 applied (is_school_admin(), my_school_id())
--   - Phase 47 applied (update_teacher_role RPC)
--
-- Strategy:
--   - Add new RLS policies (admin_*) alongside existing teacher policies.
--   - PostgreSQL RLS OR-combines multiple policies: if ANY policy passes,
--     the operation is allowed.
--   - Existing teacher policies remain untouched.
--   - DELETE is NOT expanded for admin (out of scope).
--
-- Safe to run multiple times (IF NOT EXISTS guards).
-- ==========================================================================


-- ============================================================
-- 1. classes — admin INSERT
--
-- Admin can create classes in their school.
-- The class must have school_id matching admin's school_id.
-- teacher_id must be set (NOT NULL constraint on table).
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='classes' AND policyname='admin_classes_insert') THEN
    CREATE POLICY "admin_classes_insert" ON classes FOR INSERT TO authenticated
      WITH CHECK (
        is_school_admin()
        AND school_id IS NOT NULL
        AND school_id = my_school_id()
      );
  END IF;
END $$;


-- ============================================================
-- 2. classes — admin UPDATE
--
-- Admin can update classes in their school.
-- Prevents updating classes outside their school.
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='classes' AND policyname='admin_classes_update') THEN
    CREATE POLICY "admin_classes_update" ON classes FOR UPDATE TO authenticated
      USING (
        is_school_admin()
        AND school_id IS NOT NULL
        AND school_id = my_school_id()
      )
      WITH CHECK (
        is_school_admin()
        AND school_id IS NOT NULL
        AND school_id = my_school_id()
      );
  END IF;
END $$;


-- ============================================================
-- 3. session_logs — admin INSERT
--
-- Existing policy auth_session_logs_insert already allows
-- WITH CHECK (true) for all authenticated users.
-- No additional policy needed for admin INSERT.
-- ============================================================

-- (No change needed — existing policy is permissive)


-- ============================================================
-- 4. session_logs — admin UPDATE
--
-- Admin can update session_logs for classes in their school.
-- Join path: session_logs.class_id → classes.school_id
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_logs' AND policyname='admin_session_logs_update') THEN
    CREATE POLICY "admin_session_logs_update" ON session_logs FOR UPDATE TO authenticated
      USING (
        is_school_admin()
        AND class_id IN (
          SELECT id FROM classes
          WHERE school_id IS NOT NULL
            AND school_id = my_school_id()
        )
      )
      WITH CHECK (
        is_school_admin()
        AND class_id IN (
          SELECT id FROM classes
          WHERE school_id IS NOT NULL
            AND school_id = my_school_id()
        )
      );
  END IF;
END $$;


-- ============================================================
-- 5. Verification
-- ============================================================

-- Check policies created:
-- SELECT tablename, policyname FROM pg_policies
-- WHERE policyname LIKE 'admin_%'
-- ORDER BY tablename, policyname;

-- Expected (Phase 46 + 48):
--   classes               | admin_classes_insert
--   classes               | admin_classes_select
--   classes               | admin_classes_update
--   session_logs          | admin_session_logs_select
--   session_logs          | admin_session_logs_update
--   student_session_logs  | admin_student_session_logs_select
--   students              | admin_students_select
--   teachers              | admin_teachers_select
