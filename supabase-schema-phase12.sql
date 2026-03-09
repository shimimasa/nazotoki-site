-- Phase 12: Teacher Account, Class Management, Student Logs
-- STATUS: APPLIED — This migration has been applied. See supabase-schema.sql for canonical schema.
-- Run this in Supabase SQL Editor AFTER the existing schema

-- 1. Teachers profile table (linked to Supabase Auth)
create table if not exists teachers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_teachers_auth on teachers(auth_user_id);

alter table teachers enable row level security;

-- Teachers can only read/update their own profile
create policy "Teachers read own profile"
  on teachers for select
  using (auth.uid() = auth_user_id);

create policy "Teachers insert own profile"
  on teachers for insert
  with check (auth.uid() = auth_user_id);

create policy "Teachers update own profile"
  on teachers for update
  using (auth.uid() = auth_user_id);

-- Allow anon to read teachers (for backward compat during transition)
create policy "Anon read teachers"
  on teachers for select
  to anon using (true);

create policy "Anon insert teachers"
  on teachers for insert
  to anon with check (true);

-- 2. Classes table
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  class_name text not null,
  grade_label text,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_classes_teacher on classes(teacher_id);

alter table classes enable row level security;

create policy "Anon full access classes"
  on classes for all
  to anon using (true) with check (true);

-- TODO: Replace with teacher_id-based RLS when auth is fully integrated
-- create policy "Teachers manage own classes"
--   on classes for all
--   using (teacher_id in (select id from teachers where auth_user_id = auth.uid()));

-- 3. Students table (per class)
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_students_class on students(class_id);

alter table students enable row level security;

create policy "Anon full access students"
  on students for all
  to anon using (true) with check (true);

-- 4. Student session logs (participation records)
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

create policy "Anon full access student_session_logs"
  on student_session_logs for all
  to anon using (true) with check (true);

-- 5. Add teacher_id and class_id to session_logs (nullable for backward compat)
alter table session_logs add column if not exists teacher_id uuid references teachers(id);
alter table session_logs add column if not exists class_id uuid references classes(id);

create index if not exists idx_session_logs_teacher on session_logs(teacher_id);
create index if not exists idx_session_logs_class on session_logs(class_id);

-- 6. Add teacher_id to gm_memos (nullable for backward compat)
-- Also drop the unique constraint on scenario_slug so multiple teachers can have memos
-- We add a unique constraint on (scenario_slug, teacher_id) instead
alter table gm_memos add column if not exists teacher_id uuid references teachers(id);

-- Note: If the existing unique constraint on scenario_slug causes issues with multi-teacher,
-- you may need to drop and recreate it:
-- alter table gm_memos drop constraint if exists gm_memos_scenario_slug_key;
-- create unique index if not exists idx_gm_memos_slug_teacher on gm_memos(scenario_slug, teacher_id);
