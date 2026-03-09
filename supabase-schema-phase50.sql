-- ==========================================================================
-- Phase 50: Role Change Audit Log
--
-- Purpose: Record who changed whose role, when, and from/to what.
-- Enables accountability and troubleshooting for admin role management.
--
-- Prerequisites:
--   - Phase 45-49 applied
--   - is_school_admin() function exists
--   - my_school_id() function exists
--
-- Strategy:
--   - New table: role_change_logs (INSERT-only, no UPDATE/DELETE)
--   - RLS: admin SELECT only (same school_id)
--   - No INSERT policy needed — SECURITY DEFINER RPC handles writes
--   - Modify update_teacher_role RPC to INSERT audit log on success
--
-- Safe to run multiple times (IF NOT EXISTS guards, CREATE OR REPLACE).
-- ==========================================================================


-- ============================================================
-- 1. role_change_logs table
-- ============================================================

CREATE TABLE IF NOT EXISTS role_change_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id),
  actor_teacher_id uuid NOT NULL REFERENCES teachers(id),
  target_teacher_id uuid NOT NULL REFERENCES teachers(id),
  action text NOT NULL DEFAULT 'role_change',
  before_role text NOT NULL,
  after_role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_role_change_logs_school
  ON role_change_logs(school_id, created_at DESC);

ALTER TABLE role_change_logs ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 2. RLS: admin SELECT only (same school)
--
-- No INSERT/UPDATE/DELETE policies.
-- INSERT is done inside SECURITY DEFINER RPC (bypasses RLS).
-- This means clients CANNOT insert audit logs directly.
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='role_change_logs' AND policyname='admin_role_change_logs_select') THEN
    CREATE POLICY "admin_role_change_logs_select" ON role_change_logs FOR SELECT TO authenticated
      USING (
        is_school_admin()
        AND school_id = my_school_id()
      );
  END IF;
END $$;


-- ============================================================
-- 3. Updated update_teacher_role RPC
--
-- Change: After successful UPDATE, INSERT into role_change_logs.
-- Only logs when an actual role change occurs.
-- Same transaction guarantees atomicity.
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
  SELECT id, role, school_id INTO caller_id, caller_role, caller_school
  FROM public.teachers WHERE auth_user_id = auth.uid() LIMIT 1;

  IF caller_id IS NULL THEN RETURN 'error:not_authenticated'; END IF;
  IF caller_role != 'admin' THEN RETURN 'error:not_admin'; END IF;
  IF caller_school IS NULL THEN RETURN 'error:no_school'; END IF;
  IF new_role NOT IN ('teacher', 'admin') THEN RETURN 'error:invalid_role'; END IF;
  IF target_teacher_id = caller_id THEN RETURN 'error:self_change'; END IF;

  SELECT role, school_id INTO target_current_role, target_school
  FROM public.teachers WHERE id = target_teacher_id;

  IF target_current_role IS NULL THEN RETURN 'error:teacher_not_found'; END IF;
  IF target_school IS NULL OR target_school != caller_school THEN RETURN 'error:different_school'; END IF;
  IF target_current_role = new_role THEN RETURN 'ok'; END IF;

  IF target_current_role = 'admin' AND new_role = 'teacher' THEN
    SELECT count(*) INTO admin_count
    FROM public.teachers WHERE school_id = caller_school AND role = 'admin';
    IF admin_count <= 1 THEN RETURN 'error:last_admin'; END IF;
  END IF;

  UPDATE public.teachers SET role = new_role WHERE id = target_teacher_id;

  -- Audit log: record the successful role change
  INSERT INTO public.role_change_logs (school_id, actor_teacher_id, target_teacher_id, action, before_role, after_role)
  VALUES (caller_school, caller_id, target_teacher_id, 'role_change', target_current_role, new_role);

  RETURN 'ok';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
