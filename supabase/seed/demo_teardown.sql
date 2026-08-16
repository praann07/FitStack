-- Reverses supabase/seed/demo_seed.sql.
--
-- Removes only what the seed created. Everything the seed touched is either
-- prefixed d0000000- (routines, sessions -- sets and routine_exercises cascade)
-- or falls inside the seeded 22-day window for this one user, so genuine data
-- logged outside that window survives.
--
-- Note: body_metrics rows in the window are deleted outright, including the
-- original 54.0 kg entry the seed overwrote. Re-add it afterwards if you want
-- it back:
--   insert into public.body_metrics (user_id, log_date, weight_kg)
--   values ('e9f30b90-ff22-40d6-9628-b11564bce3d3', '2026-08-16', 54.0);

begin;

delete from public.workout_sessions where id::text like 'd0000000-0000-0000-0001-%';
delete from public.routines        where id::text like 'd0000000-0000-0000-0000-%';

delete from public.food_logs
where user_id = 'e9f30b90-ff22-40d6-9628-b11564bce3d3'
  and log_date >= current_date - 21;

delete from public.body_metrics
where user_id = 'e9f30b90-ff22-40d6-9628-b11564bce3d3'
  and log_date >= current_date - 21;

-- Written by nutritionService.recompute() from the seeded data, not by the seed.
delete from public.tdee_estimates
where user_id = 'e9f30b90-ff22-40d6-9628-b11564bce3d3';

commit;
