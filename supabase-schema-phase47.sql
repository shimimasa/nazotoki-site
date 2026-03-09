-- ==========================================================================
-- Phase 47: Admin Role Management — RPC + UI foundation
--
-- Purpose: Enable admin users to change teacher roles within their school
-- via a safe, server-validated RPC function.
--
-- Prerequisites:
--   - Phase 45 applied (teachers.role column exists)
--   - Phase 46 applied (is_school_admin(), my_school_id(), admin_teachers_select)
--
-- Safe to run multiple times (CREATE OR REPLACE).
-- ==========================================================================


-- ============================================================
-- 1. RPC: update_teacher_role
--
-- A SECURITY DEFINER function that validates ALL conditions
-- before updating. This is the ONLY way to change another
-- teacher's role — RLS UPDATE policies are NOT broadened.
--
-- Checks performed:
--   1. Caller must be admin
--   2. Caller must have a school_id
--   3. Target teacher must exist
--   4. Target teacher must be in same school
--   5. Cannot change own role (self-protection)
--   6. New role must be valid ('teacher' or 'admin')
--   7. Cannot demote if target is the last admin in the school
--
-- Returns: text — 'ok' on success, error message on failure.
-- ============================================================

CREATE OR REPLACE FUNCTION update_teacher_role(
  target_teacher_id uuid,
  new_role text
) RETURNS text AS $$
DECLARE
  caller_id uuid;
  caller_role text;
  caller_school uuid;
  target_school uuid;
  target_current_role text;
  admin_count integer;
BEGIN
  -- 1. Get caller info
  SELECT id, role, school_id INTO caller_id, caller_role, caller_school
  FROM public.teachers
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF caller_id IS NULL THEN
    RETURN 'error:not_authenticated';
  END IF;

  -- 2. Caller must be admin
  IF caller_role != 'admin' THEN
    RETURN 'error:not_admin';
  END IF;

  -- 3. Caller must have a school
  IF caller_school IS NULL THEN
    RETURN 'error:no_school';
  END IF;

  -- 4. Validate new_role
  IF new_role NOT IN ('teacher', 'admin') THEN
    RETURN 'error:invalid_role';
  END IF;

  -- 5. Cannot change own role
  IF target_teacher_id = caller_id THEN
    RETURN 'error:self_change';
  END IF;

  -- 6. Get target teacher info
  SELECT role, school_id INTO target_current_role, target_school
  FROM public.teachers
  WHERE id = target_teacher_id;

  IF target_current_role IS NULL THEN
    RETURN 'error:teacher_not_found';
  END IF;

  -- 7. Target must be in same school
  IF target_school IS NULL OR target_school != caller_school THEN
    RETURN 'error:different_school';
  END IF;

  -- 8. No-op if already the target role
  IF target_current_role = new_role THEN
    RETURN 'ok';
  END IF;

  -- 9. If demoting an admin, ensure at least one admin remains
  IF target_current_role = 'admin' AND new_role = 'teacher' THEN
    SELECT count(*) INTO admin_count
    FROM public.teachers
    WHERE school_id = caller_school AND role = 'admin';

    IF admin_count <= 1 THEN
      RETURN 'error:last_admin';
    END IF;
  END IF;

  -- 10. Execute update
  UPDATE public.teachers
  SET role = new_role
  WHERE id = target_teacher_id;

  RETURN 'ok';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 2. Verification
-- ============================================================

-- Test the function exists:
-- SELECT update_teacher_role('00000000-0000-0000-0000-000000000000'::uuid, 'admin');
-- Expected: 'error:not_authenticated' (when not logged in)

-- Check from admin user:
-- SELECT update_teacher_role('<target-teacher-id>'::uuid, 'admin');
