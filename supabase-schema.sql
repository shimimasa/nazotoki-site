-- Supabase schema for nazotoki-site session tracking
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/kicxjugcfczziczlihvt/sql

-- 1. Sessions table
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_name text not null,
  slug text not null,
  scenario_title text not null,
  environment text not null check (environment in ('classroom', 'dayservice', 'home')),
  player_count integer not null default 4,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  phase_durations jsonb,
  created_at timestamptz not null default now()
);

-- 2. Votes table
create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  voter_name text not null,
  suspect_name text not null,
  is_correct boolean not null default false,
  created_at timestamptz not null default now()
);

-- 3. Reflections table
create table if not exists reflections (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_sessions_slug on sessions(slug);
create index if not exists idx_sessions_teacher on sessions(teacher_name);
create index if not exists idx_sessions_started on sessions(started_at desc);
create index if not exists idx_votes_session on votes(session_id);
create index if not exists idx_reflections_session on reflections(session_id);

-- RLS (Row Level Security) - anon can insert and read
alter table sessions enable row level security;
alter table votes enable row level security;
alter table reflections enable row level security;

create policy "Allow anon insert sessions" on sessions for insert to anon with check (true);
create policy "Allow anon select sessions" on sessions for select to anon using (true);
create policy "Allow anon update sessions" on sessions for update to anon using (true);

create policy "Allow anon insert votes" on votes for insert to anon with check (true);
create policy "Allow anon select votes" on votes for select to anon using (true);

create policy "Allow anon insert reflections" on reflections for insert to anon with check (true);
create policy "Allow anon select reflections" on reflections for select to anon using (true);
