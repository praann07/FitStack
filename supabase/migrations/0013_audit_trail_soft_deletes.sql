-- Phase 5: Add audit trail and soft deletes for data recovery and compliance.
-- Allows users to recover deleted items and admins to see change history.

-- 1. Add soft_delete columns to entities
alter table public.exercises
  add column deleted_at timestamptz;

alter table public.routines
  add column deleted_at timestamptz;

alter table public.foods
  add column deleted_at timestamptz;

-- 2. Create audit_log table for all data changes
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  table_name text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  record_id uuid not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_user_id_idx on public.audit_log(user_id);
create index audit_log_table_name_idx on public.audit_log(table_name);
create index audit_log_created_at_idx on public.audit_log(created_at desc);
create index audit_log_record_id_idx on public.audit_log(record_id);

alter table public.audit_log enable row level security;

-- Only admins can read audit logs
create policy "admins view audit logs" on public.audit_log
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- 3. Update RLS policies to exclude soft-deleted items
-- Exercises: filter out deleted items
alter policy "select visible exercises" on public.exercises
  using (is_custom = false and deleted_at is null or created_by = auth.uid() and deleted_at is null);

-- Routines: filter out deleted items
alter policy "own routines" on public.routines
  using (user_id = auth.uid() and deleted_at is null)
  with check (user_id = auth.uid() and deleted_at is null);

-- Foods: filter out deleted items
alter policy "select visible foods" on public.foods
  using (is_custom = false and deleted_at is null or created_by = auth.uid() and deleted_at is null);

-- 4. Helper function: soft_delete_exercise
create or replace function public.soft_delete_exercise(exercise_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  user_id uuid;
  old_data jsonb;
begin
  user_id := auth.uid();
  if user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Get old data for audit log
  select jsonb_build_object(
    'id', id, 'name', name, 'muscle_group', muscle_group,
    'equipment', equipment, 'is_custom', is_custom, 'created_by', created_by
  ) into old_data
  from public.exercises where id = exercise_id;

  -- Soft delete the exercise
  update public.exercises set deleted_at = now() where id = exercise_id;

  -- Log the deletion
  insert into public.audit_log (user_id, table_name, action, record_id, old_data)
  values (user_id, 'exercises', 'delete', exercise_id, old_data);
end;
$$;

-- 5. Helper function: restore_exercise (for recovery)
create or replace function public.restore_exercise(exercise_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.exercises set deleted_at = null where id = exercise_id;
end;
$$;

-- 6. Revoke permissions on audit functions from non-admins
revoke execute on function public.soft_delete_exercise(uuid) from public, anon;
revoke execute on function public.restore_exercise(uuid) from public, anon;
