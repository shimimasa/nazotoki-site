-- ==========================================================================
-- Supabase schema for nazotoki-site session platform
-- Current state: Phase 74 (student login with PIN auth)
--
-- This file represents the CANONICAL schema — the single source of truth.
-- For migration history, see supabase-schema-phase{12,12-1,12-2,13,14,15,20,40,45,46,47,48,50,51,53,55-fix,56,71,72,74}.sql
--
-- Tables (12):
--   schools, gm_memos, session_logs, teachers, classes, students,
--   student_session_logs, monthly_reports, role_change_logs, teacher_invitations,
--   session_runs, session_participants
--
-- Helper functions:
--   my_teacher_id()   — returns current auth user's teacher UUID
--   my_teacher_role() — returns current auth user's role ('teacher'|'admin')
--   my_school_id()    — returns current auth user's school_id
--   is_school_admin() — true if role='admin' AND school_id IS NOT NULL
--
-- RPC functions:
--   update_teacher_role(target_teacher_id, new_role) — admin role management
--   create_teacher_invitation(invite_email) — admin creates invitation
--   preview_teacher_invitation(invite_token) — preview invitation info
--   consume_teacher_invitation(invite_token) — accept invitation
--   rpc_student_login(login_id, pin) — student PIN auth (anon, SECURITY DEFINER)
--   rpc_verify_student_token(student_id, token) — validate saved token (anon)
--   rpc_generate_student_credentials(class_id) — bulk generate login_id+PIN (teacher)
--   rpc_reset_student_pin(student_id) — reset student PIN (teacher)
--
-- IMPORTANT: All CREATE POLICY statements are wrapped in DO$$ blocks
-- with pg_policies checks for idempotent execution.
-- ==========================================================================


-- ============================================================
-- 0. Helper functions
-- ============================================================

CREATE OR REPLACE FUNCTION my_teacher_id() RETURNS uuid AS $$
  SELECT id FROM public.teachers WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION my_teacher_role() RETURNS text AS $$
  SELECT COALESCE(
    (SELECT role FROM public.teachers WHERE auth_user_id = auth.uid() LIMIT 1),
    'teacher'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION my_school_id() RETURNS uuid AS $$
  SELECT school_id FROM public.teachers WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

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
-- 0b. RPC: update_teacher_role (admin role management)
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


-- ============================================================
-- 1. Schools (organizational unit)
-- ============================================================

create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  school_type text,
  address text,
  principal_name text,
  phone_number text,
  website_url text,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Phase 53: school_type CHECK constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'schools_school_type_check' AND conrelid = 'schools'::regclass
  ) THEN
    ALTER TABLE schools ADD CONSTRAINT schools_school_type_check
      CHECK (school_type IS NULL OR school_type IN ('elementary', 'junior_high', 'high', 'combined', 'special_needs', 'other'));
  END IF;
END $$;

alter table schools enable row level security;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='schools' AND policyname='auth_schools_select') THEN
    CREATE POLICY "auth_schools_select" ON schools FOR SELECT TO authenticated
      USING (id IN (SELECT school_id FROM teachers WHERE id = my_teacher_id() AND school_id IS NOT NULL));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='schools' AND policyname='admin_schools_update') THEN
    CREATE POLICY "admin_schools_update" ON schools FOR UPDATE TO authenticated
      USING (is_school_admin() AND id = my_school_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='schools' AND policyname='auth_schools_insert') THEN
    CREATE POLICY "auth_schools_insert" ON schools FOR INSERT TO authenticated
      WITH CHECK (true);
  END IF;
END $$;


-- ============================================================
-- 2. Teachers (linked to Supabase Auth)
-- ============================================================

create table if not exists teachers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  display_name text not null,
  school_id uuid references schools(id),
  role text not null default 'teacher',
  created_at timestamptz not null default now(),
  constraint chk_teachers_role check (role in ('teacher', 'admin'))
);

create index if not exists idx_teachers_auth on teachers(auth_user_id);
create index if not exists idx_teachers_school on teachers(school_id);

alter table teachers enable row level security;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teachers' AND policyname='auth_teachers_select') THEN
    CREATE POLICY "auth_teachers_select" ON teachers FOR SELECT TO authenticated
      USING (auth.uid() = auth_user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teachers' AND policyname='auth_teachers_insert') THEN
    CREATE POLICY "auth_teachers_insert" ON teachers FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = auth_user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teachers' AND policyname='auth_teachers_update') THEN
    CREATE POLICY "auth_teachers_update" ON teachers FOR UPDATE TO authenticated
      USING (auth.uid() = auth_user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teachers' AND policyname='anon_teachers_insert') THEN
    CREATE POLICY "anon_teachers_insert" ON teachers FOR INSERT TO anon
      WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teachers' AND policyname='anon_teachers_select') THEN
    CREATE POLICY "anon_teachers_select" ON teachers FOR SELECT TO anon
      USING (true);
  END IF;
END $$;

-- Admin: can see other teachers in same school
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
-- 3. Classes
-- ============================================================

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  school_id uuid references schools(id),
  class_name text not null,
  grade_label text,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_classes_teacher on classes(teacher_id);
create index if not exists idx_classes_school on classes(school_id);

alter table classes enable row level security;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='classes' AND policyname='auth_classes_all') THEN
    CREATE POLICY "auth_classes_all" ON classes FOR ALL TO authenticated
      USING (teacher_id = my_teacher_id())
      WITH CHECK (teacher_id = my_teacher_id());
  END IF;
END $$;

-- Admin: can see all classes in same school
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

-- Admin: can create classes in same school
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

-- Admin: can update classes in same school
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
-- 4. Students
-- ============================================================

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_name text not null,
  login_id text,
  pin_hash text,
  student_token text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_students_class on students(class_id);
create unique index if not exists idx_students_login_id_unique
  on students(login_id) where login_id is not null;

alter table students enable row level security;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='students' AND policyname='auth_students_all') THEN
    CREATE POLICY "auth_students_all" ON students FOR ALL TO authenticated
      USING (class_id IN (SELECT id FROM classes WHERE teacher_id = my_teacher_id()))
      WITH CHECK (class_id IN (SELECT id FROM classes WHERE teacher_id = my_teacher_id()));
  END IF;
END $$;

-- Admin: can see students in classes of same school
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


-- ============================================================
-- 5. GM Memos (one memo per scenario per teacher)
-- ============================================================

create table if not exists gm_memos (
  id uuid primary key default gen_random_uuid(),
  scenario_slug text not null,
  memo_text text not null default '',
  teacher_id uuid references teachers(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gm_memos_slug on gm_memos(scenario_slug);

-- Unique per teacher+slug (for logged-in teachers)
create unique index if not exists idx_gm_memos_teacher_slug
  on gm_memos (scenario_slug, teacher_id) where teacher_id is not null;

-- Unique per slug when no teacher (legacy data)
create unique index if not exists idx_gm_memos_slug_null_teacher
  on gm_memos (scenario_slug) where teacher_id is null;

alter table gm_memos enable row level security;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gm_memos' AND policyname='auth_gm_memos_select') THEN
    CREATE POLICY "auth_gm_memos_select" ON gm_memos FOR SELECT TO authenticated
      USING (teacher_id = my_teacher_id() OR teacher_id IS NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gm_memos' AND policyname='auth_gm_memos_insert') THEN
    CREATE POLICY "auth_gm_memos_insert" ON gm_memos FOR INSERT TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gm_memos' AND policyname='auth_gm_memos_update') THEN
    CREATE POLICY "auth_gm_memos_update" ON gm_memos FOR UPDATE TO authenticated
      USING (teacher_id = my_teacher_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gm_memos' AND policyname='anon_gm_memos_select') THEN
    CREATE POLICY "anon_gm_memos_select" ON gm_memos FOR SELECT TO anon
      USING (teacher_id IS NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gm_memos' AND policyname='anon_gm_memos_insert') THEN
    CREATE POLICY "anon_gm_memos_insert" ON gm_memos FOR INSERT TO anon
      WITH CHECK (teacher_id IS NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='gm_memos' AND policyname='anon_gm_memos_update') THEN
    CREATE POLICY "anon_gm_memos_update" ON gm_memos FOR UPDATE TO anon
      USING (teacher_id IS NULL);
  END IF;
END $$;


-- ============================================================
-- 6. Session Logs (authoritative per-session record)
-- ============================================================

create table if not exists session_logs (
  id uuid primary key default gen_random_uuid(),
  scenario_slug text not null,
  scenario_title text,
  start_time timestamptz,
  end_time timestamptz,
  duration integer,                     -- seconds
  phase_durations jsonb,
  vote_results jsonb,
  vote_reasons jsonb,
  discovered_evidence jsonb,
  twist_revealed boolean not null default false,
  correct_players jsonb,
  gm_memo text,
  reflections jsonb,                    -- added Phase 13
  environment text,                     -- added Phase 13
  player_count integer,                 -- added Phase 13
  teacher_name text,                    -- added Phase 13
  teacher_id uuid references teachers(id),  -- added Phase 12
  class_id uuid references classes(id),     -- added Phase 12
  created_at timestamptz not null default now()
);

create index if not exists idx_session_logs_slug on session_logs(scenario_slug);
create index if not exists idx_session_logs_created on session_logs(created_at desc);
create index if not exists idx_session_logs_teacher on session_logs(teacher_id);
create index if not exists idx_session_logs_class on session_logs(class_id);

alter table session_logs enable row level security;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_logs' AND policyname='auth_session_logs_select') THEN
    CREATE POLICY "auth_session_logs_select" ON session_logs FOR SELECT TO authenticated
      USING (teacher_id = my_teacher_id() OR teacher_id IS NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_logs' AND policyname='auth_session_logs_insert') THEN
    CREATE POLICY "auth_session_logs_insert" ON session_logs FOR INSERT TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_logs' AND policyname='auth_session_logs_update') THEN
    CREATE POLICY "auth_session_logs_update" ON session_logs FOR UPDATE TO authenticated
      USING (teacher_id = my_teacher_id() OR teacher_id IS NULL)
      WITH CHECK (teacher_id = my_teacher_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_logs' AND policyname='anon_session_logs_insert') THEN
    CREATE POLICY "anon_session_logs_insert" ON session_logs FOR INSERT TO anon
      WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_logs' AND policyname='anon_session_logs_select') THEN
    CREATE POLICY "anon_session_logs_select" ON session_logs FOR SELECT TO anon
      USING (teacher_id IS NULL);
  END IF;
END $$;

-- Admin: can see session logs for classes in same school
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

-- Admin: can update session_logs for classes in same school
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
-- 7. Student Session Logs (per-student participation records)
-- ============================================================

create table if not exists student_session_logs (
  id uuid primary key default gen_random_uuid(),
  session_log_id uuid not null references session_logs(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  voted_for text,
  vote_reason text,
  is_correct boolean,
  created_at timestamptz not null default now()
);

create index if not exists idx_student_session_logs_session on student_session_logs(session_log_id);
create index if not exists idx_student_session_logs_student on student_session_logs(student_id);

alter table student_session_logs enable row level security;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='student_session_logs' AND policyname='auth_student_session_logs_all') THEN
    CREATE POLICY "auth_student_session_logs_all" ON student_session_logs FOR ALL TO authenticated
      USING (session_log_id IN (SELECT id FROM session_logs WHERE teacher_id = my_teacher_id()))
      WITH CHECK (session_log_id IN (SELECT id FROM session_logs WHERE teacher_id = my_teacher_id()));
  END IF;
END $$;

-- Admin: can see student session logs for sessions in same school
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


-- ============================================================
-- 8. Monthly Reports (optional persistence for report snapshots)
-- ============================================================

create table if not exists monthly_reports (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  year integer not null,
  month integer not null,
  summary_json jsonb not null default '{}',
  insights_json jsonb not null default '{}',
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(teacher_id, year, month)
);

create index if not exists idx_monthly_reports_teacher on monthly_reports(teacher_id);
create index if not exists idx_monthly_reports_year_month on monthly_reports(year, month);

alter table monthly_reports enable row level security;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='monthly_reports' AND policyname='auth_monthly_reports_select') THEN
    CREATE POLICY "auth_monthly_reports_select" ON monthly_reports FOR SELECT TO authenticated
      USING (teacher_id = my_teacher_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='monthly_reports' AND policyname='auth_monthly_reports_insert') THEN
    CREATE POLICY "auth_monthly_reports_insert" ON monthly_reports FOR INSERT TO authenticated
      WITH CHECK (teacher_id = my_teacher_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='monthly_reports' AND policyname='auth_monthly_reports_update') THEN
    CREATE POLICY "auth_monthly_reports_update" ON monthly_reports FOR UPDATE TO authenticated
      USING (teacher_id = my_teacher_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='monthly_reports' AND policyname='auth_monthly_reports_delete') THEN
    CREATE POLICY "auth_monthly_reports_delete" ON monthly_reports FOR DELETE TO authenticated
      USING (teacher_id = my_teacher_id());
  END IF;
END $$;


-- ============================================================
-- 9. Role Change Logs (audit trail for teacher role changes)
--
-- INSERT-only table. No UPDATE/DELETE needed.
-- Writes happen inside SECURITY DEFINER RPC (update_teacher_role).
-- Only admin can SELECT logs for their own school.
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

-- Admin can view audit logs for their own school only.
-- No INSERT/UPDATE/DELETE policies — writes are done via SECURITY DEFINER RPC.
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
-- 10. Teacher Invitations (token-based, one-time, expiring)
--
-- INSERT-only from SECURITY DEFINER RPCs.
-- Admin can SELECT invitations for their school.
-- No direct client mutations.
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
-- 10b. RPCs: Teacher Invitation Workflow
-- ============================================================

-- Create invitation (admin only)
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

-- Preview invitation (any caller, minimal info)
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

-- Consume invitation (authenticated user)
CREATE OR REPLACE FUNCTION consume_teacher_invitation(
  invite_token text
) RETURNS jsonb AS $$
DECLARE
  inv record;
  teacher_rec record;
BEGIN
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

  SELECT * INTO teacher_rec
  FROM public.teachers
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF teacher_rec IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_teacher_profile');
  END IF;

  IF teacher_rec.school_id IS NOT NULL THEN
    IF teacher_rec.school_id = inv.school_id THEN
      UPDATE public.teacher_invitations
      SET used_at = now(), used_by_teacher_id = teacher_rec.id
      WHERE id = inv.id;
      RETURN jsonb_build_object('ok', true, 'status', 'already_member');
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'different_school');
    END IF;
  END IF;

  UPDATE public.teachers
  SET school_id = inv.school_id, role = inv.role
  WHERE id = teacher_rec.id;

  UPDATE public.teacher_invitations
  SET used_at = now(), used_by_teacher_id = teacher_rec.id
  WHERE id = inv.id;

  RETURN jsonb_build_object('ok', true, 'status', 'joined');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 11. Session Runs (live session state for Realtime broadcast)
-- Phase 56
-- ============================================================

CREATE TABLE IF NOT EXISTS session_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_slug text NOT NULL,
  scenario_title text,
  teacher_id uuid REFERENCES teachers(id),
  class_id uuid REFERENCES classes(id),
  join_code text NOT NULL UNIQUE,
  current_phase text NOT NULL DEFAULT 'prep',
  timer_seconds integer NOT NULL DEFAULT 0,
  timer_running boolean NOT NULL DEFAULT false,
  discovered_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  twist_revealed boolean NOT NULL DEFAULT false,
  votes jsonb NOT NULL DEFAULT '{}'::jsonb,
  vote_reasons jsonb NOT NULL DEFAULT '{}'::jsonb,
  character_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_titles jsonb NOT NULL DEFAULT '[]'::jsonb,
  player_count integer NOT NULL DEFAULT 4,
  is_active boolean NOT NULL DEFAULT true,
  started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_runs_join_code ON session_runs(join_code);
CREATE INDEX IF NOT EXISTS idx_session_runs_teacher ON session_runs(teacher_id);
CREATE INDEX IF NOT EXISTS idx_session_runs_active ON session_runs(is_active) WHERE is_active = true;
-- Phase 72: One active session per teacher (safety net for RPC atomicity)
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_runs_teacher_active_unique
  ON session_runs(teacher_id) WHERE is_active = true;

ALTER TABLE session_runs ENABLE ROW LEVEL SECURITY;

-- Teacher: full access to own session_runs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_runs' AND policyname='auth_session_runs_all') THEN
    CREATE POLICY "auth_session_runs_all" ON session_runs FOR ALL TO authenticated
      USING (teacher_id = my_teacher_id())
      WITH CHECK (teacher_id = my_teacher_id());
  END IF;
END $$;

-- Anon (students): can SELECT active session_runs by join_code
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_runs' AND policyname='anon_session_runs_select') THEN
    CREATE POLICY "anon_session_runs_select" ON session_runs FOR SELECT TO anon
      USING (is_active = true);
  END IF;
END $$;

-- Authenticated users (non-owner): can also SELECT active session_runs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_runs' AND policyname='auth_session_runs_select_active') THEN
    CREATE POLICY "auth_session_runs_select_active" ON session_runs FOR SELECT TO authenticated
      USING (is_active = true);
  END IF;
END $$;


-- ============================================================
-- 12. Session Participants (students joining via code)
-- Phase 56
-- ============================================================

CREATE TABLE IF NOT EXISTS session_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_run_id uuid NOT NULL REFERENCES session_runs(id) ON DELETE CASCADE,
  participant_name text NOT NULL,
  student_id uuid REFERENCES students(id),
  session_token text NOT NULL UNIQUE,
  assigned_character text,
  voted_for text,
  vote_reason text,
  voted_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  token_expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_session_participants_run ON session_participants(session_run_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_token ON session_participants(session_token);

ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;

-- Teacher: can see participants in own session_runs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_participants' AND policyname='auth_session_participants_select') THEN
    CREATE POLICY "auth_session_participants_select" ON session_participants FOR SELECT TO authenticated
      USING (session_run_id IN (SELECT id FROM session_runs WHERE teacher_id = my_teacher_id()));
  END IF;
END $$;

-- Teacher: can UPDATE participants in own session_runs (character assignment)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='session_participants' AND policyname='auth_session_participants_update') THEN
    CREATE POLICY "auth_session_participants_update" ON session_participants FOR UPDATE TO authenticated
      USING (session_run_id IN (SELECT id FROM session_runs WHERE teacher_id = my_teacher_id()));
  END IF;
END $$;

-- Phase 71: Anon has NO direct access to session_participants.
-- All student operations go through SECURITY DEFINER RPCs:
--   rpc_join_session, rpc_reconnect_session, rpc_submit_vote, rpc_get_my_participant
-- See supabase-schema-phase71.sql for RPC definitions.
