-- Phase 55 Fix: Restrict schools UPDATE to admin only
-- Codex review finding: auth_schools_update allows any teacher to update school profile
-- Fix: Replace with admin-only policy using is_school_admin()

-- Drop the old permissive policy
DROP POLICY IF EXISTS "auth_schools_update" ON schools;

-- Create admin-only update policy
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='schools' AND policyname='admin_schools_update') THEN
    CREATE POLICY "admin_schools_update" ON schools FOR UPDATE TO authenticated
      USING (is_school_admin() AND id = my_school_id());
  END IF;
END $$;
