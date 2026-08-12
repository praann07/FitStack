-- 1. handle_new_user is a trigger function; it must not be callable directly
-- via PostgREST's /rpc/ endpoint (flagged by the security advisor).
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 2. Cover every FK used by an RLS policy join/filter with an index
-- (flagged by the performance advisor -- these are read on every RLS check).
create index exercises_created_by_idx on public.exercises(created_by);
create index foods_created_by_idx on public.foods(created_by);
create index food_logs_food_id_idx on public.food_logs(food_id);
create index routine_exercises_exercise_id_idx on public.routine_exercises(exercise_id);
create index routines_user_id_idx on public.routines(user_id);
create index workout_sessions_routine_id_idx on public.workout_sessions(routine_id);
create index workout_sets_exercise_id_idx on public.workout_sets(exercise_id);

-- 3. Wrap auth.uid() as (select auth.uid()) in every policy so Postgres
-- evaluates it once per statement (InitPlan) instead of once per row.

alter policy "select own profile" on public.profiles
  using ((select auth.uid()) = id);
alter policy "update own profile" on public.profiles
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

alter policy "select visible exercises" on public.exercises
  using (is_custom = false or created_by = (select auth.uid()));
alter policy "insert own custom exercise" on public.exercises
  with check (created_by = (select auth.uid()) and is_custom = true);
alter policy "modify own custom exercise" on public.exercises
  using (created_by = (select auth.uid()));
alter policy "delete own custom exercise" on public.exercises
  using (created_by = (select auth.uid()));

alter policy "own routines" on public.routines
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy "own routine exercises" on public.routine_exercises
  using (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())))
  with check (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())));

alter policy "own sessions" on public.workout_sessions
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy "own sets" on public.workout_sets
  using (exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid())))
  with check (exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid())));

alter policy "select visible foods" on public.foods
  using (is_custom = false or created_by = (select auth.uid()));
alter policy "insert own custom food" on public.foods
  with check (created_by = (select auth.uid()) and is_custom = true);
alter policy "modify own custom food" on public.foods
  using (created_by = (select auth.uid()));
alter policy "delete own custom food" on public.foods
  using (created_by = (select auth.uid()));

alter policy "select own food logs" on public.food_logs
  using (user_id = (select auth.uid()));
alter policy "insert own visible food logs" on public.food_logs
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.foods f where f.id = food_id and (f.is_custom = false or f.created_by = (select auth.uid())))
  );
alter policy "modify own food logs" on public.food_logs
  using (user_id = (select auth.uid()));
alter policy "delete own food logs" on public.food_logs
  using (user_id = (select auth.uid()));

alter policy "own nutrition targets" on public.nutrition_targets
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy "own tdee estimates" on public.tdee_estimates
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy "own dismissed suggestions" on public.dismissed_suggestions
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy "own body metrics" on public.body_metrics
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
