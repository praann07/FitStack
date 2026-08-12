-- Pilot auth: password signup replaces OTP, gated behind manual admin
-- approval (10-15 known testers). profiles.approved defaults false; every
-- write/read of real user data requires it, not just a client-side screen --
-- an unapproved-but-signed-up user already has a valid Supabase session and
-- could otherwise call the API directly. profiles itself stays exempt: a
-- user must be able to read their own `approved` flag to see the pending
-- screen, and the on-signup trigger needs to write the initial row.

alter table public.profiles add column approved boolean not null default false;

-- Training domain
alter policy "own routines" on public.routines
  using (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved));

alter policy "own routine exercises" on public.routine_exercises
  using (
    exists (select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid()))
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved)
  )
  with check (
    exists (select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid()))
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved)
  );

alter policy "own sessions" on public.workout_sessions
  using (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved));

alter policy "own sets" on public.workout_sets
  using (
    exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid()))
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved)
  )
  with check (
    exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid()))
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved)
  );

alter policy "insert own custom exercise" on public.exercises
  with check (created_by = (select auth.uid()) and is_custom = true and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved));
alter policy "modify own custom exercise" on public.exercises
  using (created_by = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved));
alter policy "delete own custom exercise" on public.exercises
  using (created_by = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved));

-- Nutrition domain
alter policy "insert own custom food" on public.foods
  with check (created_by = (select auth.uid()) and is_custom = true and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved));
alter policy "modify own custom food" on public.foods
  using (created_by = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved));
alter policy "delete own custom food" on public.foods
  using (created_by = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved));

alter policy "select own food logs" on public.food_logs
  using (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved));
alter policy "insert own visible food logs" on public.food_logs
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.foods f where f.id = food_id and (f.is_custom = false or f.created_by = (select auth.uid())))
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved)
  );
alter policy "modify own food logs" on public.food_logs
  using (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved));
alter policy "delete own food logs" on public.food_logs
  using (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved));

alter policy "own nutrition targets" on public.nutrition_targets
  using (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved));

alter policy "own tdee estimates" on public.tdee_estimates
  using (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved));

alter policy "own dismissed suggestions" on public.dismissed_suggestions
  using (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved));

-- Progress domain
alter policy "own body metrics" on public.body_metrics
  using (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved));
