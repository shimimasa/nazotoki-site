-- ==========================================================================
-- Phase 20: Monthly Reports table
--
-- Optional persistence for monthly report snapshots.
-- The feature works without this table (computes on-the-fly from session_logs).
-- This table enables: viewing past snapshots, faster re-access, future cron jobs.
--
-- Run this in Supabase SQL Editor after Phase 20 deployment.
-- ==========================================================================

-- 1. Create table
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

-- 2. Indexes
create index if not exists idx_monthly_reports_teacher on monthly_reports(teacher_id);
create index if not exists idx_monthly_reports_year_month on monthly_reports(year, month);

-- 3. RLS
alter table monthly_reports enable row level security;

create policy "auth_monthly_reports_select"
  on monthly_reports for select to authenticated
  using (teacher_id = my_teacher_id());

create policy "auth_monthly_reports_insert"
  on monthly_reports for insert to authenticated
  with check (teacher_id = my_teacher_id());

create policy "auth_monthly_reports_update"
  on monthly_reports for update to authenticated
  using (teacher_id = my_teacher_id());

create policy "auth_monthly_reports_delete"
  on monthly_reports for delete to authenticated
  using (teacher_id = my_teacher_id());
