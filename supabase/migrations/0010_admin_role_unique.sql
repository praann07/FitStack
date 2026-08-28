-- Close two gaps from the zeroth review's "Future Work" list:
--
-- 1. Formalize "Admin" as an explicit database concept instead of "whoever
--    holds Supabase dashboard access". Add profiles.role ('user'|'admin') and
--    route ALL approval changes through SECURITY DEFINER RPCs that re-check
--    is_admin() in the body (non-admins get 42501). A BEFORE UPDATE trigger on
--    profiles is the authoritative guard: neither `approved` nor `role` may be
--    changed by a non-admin, closing self-approval and self-promotion at the
--    database layer, not the client.
--
-- 2. Replace the app's "delete-then-insert" per-(user,date) nutrition write
--    pattern with real UNIQUE constraints, making the database (not app code)
--    the source of truth for one nutrition target / one tdee estimate per day.

-- 1. Admin role
alter table public.profiles
  add column role text not null default 'user'
  check (role in ('user', 'admin'));

-- Bootstrap: the pilot operator (owner) is the initial admin.
update public.profiles set role = 'admin'
  where id = 'e9f30b90-ff22-40d6-9628-b11564bce3d3';

-- 2. UNIQUE per (user, date) on nutrition writes
alter table public.nutrition_targets
  add constraint nutrition_targets_user_date_unique unique (user_id, effective_date);
alter table public.tdee_estimates
  add constraint tdee_estimates_user_date_unique unique (user_id, estimate_date);

-- 3. Admin helpers (security definer, but every entry point re-checks is_admin)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  )
$$;

create or replace function public.admin_set_approved(target_uid uuid, approved boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.profiles set approved = admin_set_approved.approved where id = target_uid;
end;
$$;

create or replace function public.admin_list_users()
returns table (id uuid, full_name text, email varchar, approved boolean, role text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, u.email, p.approved, p.role, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at;
end;
$$;

-- 4. Trigger guard: non-admins can never flip approved/role on any row.
create or replace function public.guard_profile_admin_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.approved is distinct from old.approved) or (new.role is distinct from old.role) then
    if (select auth.uid()) is not null and not public.is_admin() then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_admin_columns on public.profiles;
create trigger trg_guard_profile_admin_columns
  before update on public.profiles
  for each row execute function public.guard_profile_admin_columns();

-- 5. Hardening: none of these are anonymous RPCs. The trigger helper is
--    trigger-only; the admin functions are reached by authenticated admins
--    (and self-guard), never by anon.
revoke execute on function public.guard_profile_admin_columns() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.admin_set_approved(uuid, boolean) from public, anon;
revoke execute on function public.admin_list_users() from public, anon;
