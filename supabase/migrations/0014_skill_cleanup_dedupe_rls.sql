-- Skill-test cleanup surfaced by Supabase Postgres Best Practices:
--   1. Drop duplicate indexes (migration 0011 re-created indexes 0006 already made).
--   2. Fix audit_log RLS initplan (bare auth.role()/auth.uid() per row).
--   3. Revoke anon/PUBLIC execute on SECURITY DEFINER RPCs + the event-trigger helper.

-- ---------------------------------------------------------------------------
-- 1. Duplicate indexes
--    Keep the migration-0006 indexes (official names); drop 0011's/others' dupes.
--    body_metrics: UNIQUE(user_id, log_date) already provides an index on those
--    cols; keep the DESC query index for "where user_id = X order by log_date desc".
-- ---------------------------------------------------------------------------
drop index if exists public.idx_exercises_created_by;     -- dup of exercises_created_by_idx
drop index if exists public.idx_foods_created_by;         -- dup of foods_created_by_idx
drop index if exists public.idx_workout_sessions_routine; -- dup of workout_sessions_routine_id_idx
drop index if exists public.body_metrics_user_date_idx;   -- dup of UNIQUE(body_metrics_user_id_log_date_key)

-- Keep idx_body_metrics_user_date (user_id, log_date desc): the query index that
-- matches the app's "log_date desc" trend reads after the user_id RLS filter.

-- ---------------------------------------------------------------------------
-- 2. audit_log RLS initplan: rewrite bare auth.role()/auth.uid() as (select ...)
--    so each is evaluated once per statement, not once per row.
-- ---------------------------------------------------------------------------
drop policy if exists "admins select audit logs" on public.audit_log;
create policy "admins select audit logs" on public.audit_log
  for select using (
    (select auth.role()) = 'authenticated'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Tighten execute on SECURITY DEFINER functions
--    soft_delete_exercise / restore_exercise: meant for signed-in users
--    (they self-guard via auth.uid()); drop anon + PUBLIC.
--    rls_auto_enable: an event trigger; must not be callable via /rpc/ at all.
-- ---------------------------------------------------------------------------
revoke execute on function public.soft_delete_exercise(uuid) from public, anon;
revoke execute on function public.restore_exercise(uuid) from public, anon;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
