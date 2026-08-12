create table public.foods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  calories_per_100g numeric(6,2),
  protein_per_100g numeric(6,2),
  carbs_per_100g numeric(6,2),
  fat_per_100g numeric(6,2),
  serving_label text,
  serving_g numeric(6,1),
  is_custom boolean not null default false,
  created_by uuid references auth.users(id) on delete cascade
);
alter table public.foods enable row level security;
create policy "select visible foods" on public.foods
  for select using (is_custom = false or created_by = auth.uid());
create policy "insert own custom food" on public.foods
  for insert with check (created_by = auth.uid() and is_custom = true);
create policy "modify own custom food" on public.foods
  for update using (created_by = auth.uid());
create policy "delete own custom food" on public.foods
  for delete using (created_by = auth.uid());

create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid not null references public.foods(id),
  log_date date not null,
  quantity_g numeric(7,2) not null,
  meal_type text
);
create index food_logs_user_date_idx on public.food_logs(user_id, log_date);
alter table public.food_logs enable row level security;
create policy "select own food logs" on public.food_logs
  for select using (user_id = auth.uid());
create policy "insert own visible food logs" on public.food_logs
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.foods f where f.id = food_id and (f.is_custom = false or f.created_by = auth.uid()))
  );
create policy "modify own food logs" on public.food_logs
  for update using (user_id = auth.uid());
create policy "delete own food logs" on public.food_logs
  for delete using (user_id = auth.uid());

create table public.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_date date not null,
  calories int not null,
  protein_g int not null,
  carbs_g int not null,
  fat_g int not null,
  source text not null default 'adaptive'
);
create index nutrition_targets_user_date_idx on public.nutrition_targets(user_id, effective_date);
alter table public.nutrition_targets enable row level security;
create policy "own nutrition targets" on public.nutrition_targets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.tdee_estimates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  estimate_date date not null,
  estimated_tdee int not null,
  weight_trend_kg numeric(5,2),
  confidence text
);
create index tdee_estimates_user_date_idx on public.tdee_estimates(user_id, estimate_date);
alter table public.tdee_estimates enable row level security;
create policy "own tdee estimates" on public.tdee_estimates
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.dismissed_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  suggestion_id text not null,
  created_at timestamptz not null default now()
);
create index dismissed_suggestions_user_idx on public.dismissed_suggestions(user_id);
alter table public.dismissed_suggestions enable row level security;
create policy "own dismissed suggestions" on public.dismissed_suggestions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
