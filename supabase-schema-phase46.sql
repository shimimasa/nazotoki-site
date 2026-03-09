-- ==========================================================================
-- Phase 46: Admin RLS Foundation
--
-- Purpose: Enable admin users to SELECT data across their school (school_id)
-- at the database level. Teacher users remain restricted to their own data.
--
-- Prerequisites:
--   - Phase 45 applied (teachers.role column exists)
--   - my_teacher_id() function exists
--
-- Safe to run multiple times (CREATE OR REPLACE / IF NOT EXISTS guards).
-- ==========================================================================


-- ============================================================
-- 1. SQL Helper Functions
-- ============================================================

-- 1a. my_teacher_role() — returns the current user's role ('teacher' or 'admin')
--     Returns 'teacher' if not logged in or teacher record not found (safe default).
CREATE OR REPLACE FUNCTION my_teacher_role() RETURNS text AS $$
  SELECT COALESCE(
    (SELECT role FROM public.teachers WHERE auth_user_id = auth.uid() LIMIT 1),
    'teacher'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 1b. my_school_id() — returns the current user's school_id
--     Returns NULL if not logged in, teacher not found, or no school assigned.
CREATE OR REPLACE FUNCTION my_school_id() RETURNS uuid AS $$
  SELECT school_id FROM public.teachers WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 1c. is_school_admin() — returns true if current user is admin AND has a school_id
--     Both conditions must be true for school-scoped admin access.
CREATE OR REPLACE FUNCTION is_school_admin() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teachers
    WHERE auth_user_id = auth.uid()
      AND role = 'admin'
      AND school_id IS NOT NULL
    LIMIT 1
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ============================================================
-- 2. Admin SELECT Policies
--
-- Strategy:
--   PostgreSQL RLS uses OR logic across multiple policies.
--   Existing policies allow teacher to see own data.
--   New policies ADDITIONALLY allow admin to see same-school data.
--   Result: teacher sees own data; admin sees own data + school data.
--
--   INSERT/UPDATE/DELETE policies are NOT changed.
--   Admin write access is a future phase concern.
-- ============================================================

-- 2a. classes — admin can SELECT classes in their school
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='classes' AND policyname='admin_classes_select') THEN
    CREATE POLICY "admin_classes_select" ON classes FOR SELECT TO authenticated
      USING (
        is_school_admin()
        AND school_id IS NOT NULL
        AND school_id = my_school_id()
      );
  END IF;
END $$;

-- 2b. session_logs — admin can SELECT logs for classes in their school
--     Join path: session_logs.class_id → classes.school_id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_logs' AND policyname='admin_session_logs_select') THEN
    CREATE POLICY "admin_session_logs_select" ON session_logs FOR SELECT TO authenticated
      USING (
        is_school_admin()
        AND class_id IN (
          SELECT id FROM classes
          WHERE school_id IS NOT NULL
            AND school_id = my_school_id()
        )
      );
  END IF;
END $$;

-- 2c. students — admin can SELECT students in classes of their school
--     Join path: students.class_id → classes.school_id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='students' AND policyname='admin_students_select') THEN
    CREATE POLICY "admin_students_select" ON students FOR SELECT TO authenticated
      USING (
        is_school_admin()
        AND class_id IN (
          SELECT id FROM classes
          WHERE school_id IS NOT NULL
            AND school_id = my_school_id()
        )
      );
  END IF;
END $$;

-- 2d. student_session_logs — admin can SELECT student logs for sessions in their school
--     Join path: student_session_logs.session_log_id → session_logs.class_id → classes.school_id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='student_session_logs' AND policyname='admin_student_session_logs_select') THEN
    CREATE POLICY "admin_student_session_logs_select" ON student_session_logs FOR SELECT TO authenticated
      USING (
        is_school_admin()
        AND session_log_id IN (
          SELECT sl.id FROM session_logs sl
          JOIN classes c ON sl.class_id = c.id
          WHERE c.school_id IS NOT NULL
            AND c.school_id = my_school_id()
        )
      );
  END IF;
END $$;

-- 2e. teachers — admin can SELECT other teachers in their school
--     This allows admin dashboard to potentially list school staff.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teachers' AND policyname='admin_teachers_select') THEN
    CREATE POLICY "admin_teachers_select" ON teachers FOR SELECT TO authenticated
      USING (
        is_school_admin()
        AND school_id IS NOT NULL
        AND school_id = my_school_id()
      );
  END IF;
END $$;


-- ============================================================
-- 3. Verification queries (run after migration to confirm)
-- ============================================================

-- Check helper functions exist:
-- SELECT my_teacher_role();
-- SELECT my_school_id();
-- SELECT is_school_admin();

-- Check policies created:
-- SELECT tablename, policyname FROM pg_policies WHERE policyname LIKE 'admin_%' ORDER BY tablename;

-- Expected output (5 policies):
--   classes               | admin_classes_select
--   session_logs          | admin_session_logs_select
--   student_session_logs  | admin_student_session_logs_select
--   students              | admin_students_select
--   teachers              | admin_teachers_select
