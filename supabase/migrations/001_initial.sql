-- セッション記録（1プレイ = 1レコード）
create table sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_name text not null,
  slug text not null,
  scenario_title text,
  environment text check (environment in ('classroom', 'dayservice', 'home')),
  player_count int,
  started_at timestamptz default now(),
  completed_at timestamptz,
  phase_durations jsonb
);

-- 投票記録
create table votes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  voter_name text,
  suspect_name text,
  is_correct boolean,
  created_at timestamptz default now()
);

-- 生徒振り返り
create table reflections (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

-- RLS
alter table sessions enable row level security;
alter table votes enable row level security;
alter table reflections enable row level security;

create policy "Anyone can insert sessions" on sessions for insert with check (true);
create policy "Anyone can insert votes" on votes for insert with check (true);
create policy "Anyone can insert reflections" on reflections for insert with check (true);
