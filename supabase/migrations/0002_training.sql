create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group text not null,
  equipment text,
  is_custom boolean not null default false,
  created_by uuid references auth.users(id) on delete cascade
);
alter table public.exercises enable row level security;
create policy "select visible exercises" on public.exercises
  for select using (is_custom = false or created_by = auth.uid());
create policy "insert own custom exercise" on public.exercises
  for insert with check (created_by = auth.uid() and is_custom = true);
create policy "modify own custom exercise" on public.exercises
  for update using (created_by = auth.uid());
create policy "delete own custom exercise" on public.exercises
  for delete using (created_by = auth.uid());

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.routines enable row level security;
create policy "own routines" on public.routines
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  order_index int not null,
  target_sets int,
  target_rep_range text,
  target_rpe numeric(3,1),
  rest_seconds int not null default 90,
  notes text
);
create index routine_exercises_routine_id_idx on public.routine_exercises(routine_id);
alter table public.routine_exercises enable row level security;
create policy "own routine exercises" on public.routine_exercises
  for all
  using (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()));

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid references public.routines(id) on delete set null,
  session_date date not null,
  notes text,
  started_at timestamptz,
  ended_at timestamptz
);
create index workout_sessions_user_date_idx on public.workout_sessions(user_id, session_date);
alter table public.workout_sessions enable row level security;
create policy "own sessions" on public.workout_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  set_number int not null,
  weight_kg numeric(6,2),
  reps int,
  rpe numeric(3,1),
  set_type text not null default 'normal',
  notes text,
  is_pr boolean not null default false
);
create index workout_sets_session_id_idx on public.workout_sets(session_id);
alter table public.workout_sets enable row level security;
create policy "own sets" on public.workout_sets
  for all
  using (exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = auth.uid()));
