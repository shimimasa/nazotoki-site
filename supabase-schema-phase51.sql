-- ==========================================================================
-- Phase 51: Teacher Invitation Workflow
--
-- Purpose: Enable admin to invite teachers to their school via secure
-- invitation links. Invited teachers get school_id auto-assigned.
--
-- Prerequisites:
--   - Phase 45-50 applied
--   - is_school_admin(), my_school_id() functions exist
--
-- Strategy:
--   - New table: teacher_invitations (token-based, one-time use, expiring)
--   - RLS: admin SELECT only (same school). No INSERT/UPDATE/DELETE policies.
--   - 3 SECURITY DEFINER RPCs:
--     1. create_teacher_invitation — admin creates invite
--     2. preview_teacher_invitation — anyone can preview (minimal info)
--     3. consume_teacher_invitation — authenticated user accepts invite
--   - All mutations via SECURITY DEFINER → client cannot tamper directly.
--
-- Safe to run multiple times (IF NOT EXISTS guards, CREATE OR REPLACE).
-- ==========================================================================


-- ============================================================
-- 1. teacher_invitations table
-- ============================================================

CREATE TABLE IF NOT EXISTS teacher_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id),
  invited_by_teacher_id uuid NOT NULL REFERENCES teachers(id),
  invite_email text,
  token text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'teacher',
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by_teacher_id uuid REFERENCES teachers(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teacher_invitations_school
  ON teacher_invitations(school_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_teacher_invitations_token
  ON teacher_invitations(token);

ALTER TABLE teacher_invitations ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 2. RLS: admin SELECT only (same school)
--
-- No INSERT/UPDATE/DELETE policies.
-- All mutations through SECURITY DEFINER RPCs.
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teacher_invitations' AND policyname='admin_teacher_invitations_select') THEN
    CREATE POLICY "admin_teacher_invitations_select" ON teacher_invitations FOR SELECT TO authenticated
      USING (
        is_school_admin()
        AND school_id = my_school_id()
      );
  END IF;
END $$;


-- ============================================================
-- 3. RPC: create_teacher_invitation
--
-- Admin creates an invitation for their school.
-- Returns JSON: { ok, token, expires_at, id } or { error }
-- ============================================================

CREATE OR REPLACE FUNCTION create_teacher_invitation(
  invite_email text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  caller_id uuid;
  caller_role text;
  caller_school uuid;
  new_token text;
  new_expires timestamptz;
  new_id uuid;
BEGIN
  SELECT id, role, school_id INTO caller_id, caller_role, caller_school
  FROM public.teachers WHERE auth_user_id = auth.uid() LIMIT 1;

  IF caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;
  IF caller_role != 'admin' THEN
    RETURN jsonb_build_object('error', 'not_admin');
  END IF;
  IF caller_school IS NULL THEN
    RETURN jsonb_build_object('error', 'no_school');
  END IF;

  new_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  new_expires := now() + interval '7 days';

  INSERT INTO public.teacher_invitations
    (school_id, invited_by_teacher_id, invite_email, token, expires_at)
  VALUES
    (caller_school, caller_id, invite_email, new_token, new_expires)
  RETURNING id INTO new_id;

  RETURN jsonb_build_object(
    'ok', true,
    'token', new_token,
    'expires_at', new_expires,
    'id', new_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 4. RPC: preview_teacher_invitation
--
-- Returns minimal info about an invitation (school name, validity).
-- Does NOT require admin — any authenticated user (or even anon)
-- can call this to see the invitation preview.
-- ============================================================

CREATE OR REPLACE FUNCTION preview_teacher_invitation(
  invite_token text
) RETURNS jsonb AS $$
DECLARE
  inv_school_id uuid;
  inv_expires_at timestamptz;
  inv_used_at timestamptz;
  school_name text;
BEGIN
  SELECT ti.school_id, ti.expires_at, ti.used_at, s.name
  INTO inv_school_id, inv_expires_at, inv_used_at, school_name
  FROM public.teacher_invitations ti
  JOIN public.schools s ON s.id = ti.school_id
  WHERE ti.token = invite_token
  LIMIT 1;

  IF inv_school_id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'not_found');
  END IF;

  IF inv_used_at IS NOT NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'already_used', 'school_name', school_name);
  END IF;

  IF inv_expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'expired', 'school_name', school_name);
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'school_name', school_name,
    'expires_at', inv_expires_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 5. RPC: consume_teacher_invitation
--
-- Authenticated user accepts an invitation.
-- Sets school_id on their teacher record.
-- Marks invitation as used (one-time only).
--
-- Safety checks:
--   - Token exists
--   - Not expired
--   - Not used
--   - Caller has teacher record
--   - Caller has no school_id (or same school = already_member)
--   - Different school → reject
-- ============================================================

CREATE OR REPLACE FUNCTION consume_teacher_invitation(
  invite_token text
) RETURNS jsonb AS $$
DECLARE
  inv record;
  teacher_rec record;
BEGIN
  -- Find invitation
  SELECT * INTO inv
  FROM public.teacher_invitations
  WHERE token = invite_token
  LIMIT 1;

  IF inv IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF inv.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_used');
  END IF;

  IF inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  -- Find teacher for current auth user
  SELECT * INTO teacher_rec
  FROM public.teachers
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF teacher_rec IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_teacher_profile');
  END IF;

  -- Check school_id compatibility
  IF teacher_rec.school_id IS NOT NULL THEN
    IF teacher_rec.school_id = inv.school_id THEN
      -- Already in same school — mark used but don't change teacher
      UPDATE public.teacher_invitations
      SET used_at = now(), used_by_teacher_id = teacher_rec.id
      WHERE id = inv.id;
      RETURN jsonb_build_object('ok', true, 'status', 'already_member');
    ELSE
      -- Different school — reject
      RETURN jsonb_build_object('ok', false, 'error', 'different_school');
    END IF;
  END IF;

  -- Set school_id and role on teacher
  UPDATE public.teachers
  SET school_id = inv.school_id, role = inv.role
  WHERE id = teacher_rec.id;

  -- Mark invitation as used
  UPDATE public.teacher_invitations
  SET used_at = now(), used_by_teacher_id = teacher_rec.id
  WHERE id = inv.id;

  RETURN jsonb_build_object('ok', true, 'status', 'joined');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
