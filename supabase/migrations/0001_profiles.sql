create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  goal text check (goal in ('bulk','cut','maintain')),
  goal_rate_kg_week numeric(4,2),
  height_cm numeric(5,1),
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profile_complete_when_onboarded check (
    not onboarded or (goal is not null and goal_rate_kg_week is not null and height_cm is not null)
  )
);

alter table public.profiles enable row level security;

create policy "select own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
