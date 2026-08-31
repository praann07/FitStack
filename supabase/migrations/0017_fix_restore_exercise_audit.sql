-- Fix restore_exercise's audit_log insert.
--
-- restore_exercise logged the restoration with action='restore', but the
-- audit_log.action CHECK constraint only allows ('insert','update','delete').
-- So an admin calling restore_exercise hit a CHECK violation inside the
-- SECURITY DEFINER body and the restore failed. A restore edits
-- exercises.deleted_at (timestamp -> null), which is an update; the restore
-- context stays visible in new_data, so no meaning is lost.

create or replace function public.restore_exercise(exercise_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid;
  exercise_exists boolean;
begin
  admin_id := auth.uid();

  -- Authorization: must be authenticated admin
  if admin_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not public.is_admin() then
    raise exception 'forbidden: only admins can restore exercises' using errcode = '42501';
  end if;

  -- Validation: exercise must exist
  select exists(
    select 1 from public.exercises where id = exercise_id
  ) into exercise_exists;

  if not exercise_exists then
    raise exception 'exercise not found' using errcode = '42704';
  end if;

  -- Restore the exercise
  update public.exercises set deleted_at = null where id = exercise_id;

  -- Log the restoration as an update (the only action kinds audit_log accepts)
  insert into public.audit_log (user_id, table_name, action, record_id, new_data)
  values (admin_id, 'exercises', 'update', exercise_id,
    jsonb_build_object('action', 'restored', 'restored_by', admin_id));
end;
$$;