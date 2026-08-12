create table public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  weight_kg numeric(5,2),
  waist_cm numeric(5,1),
  chest_cm numeric(5,1),
  arm_cm numeric(5,1),
  photo_url text,
  unique (user_id, log_date)
);
create index body_metrics_user_date_idx on public.body_metrics(user_id, log_date);
alter table public.body_metrics enable row level security;
create policy "own body metrics" on public.body_metrics
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
