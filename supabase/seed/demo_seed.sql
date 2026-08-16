-- Demo seed for review day (2026-08-17).
--
-- Populates ~3 weeks of history for mspb23012007@gmail.com so every screen has
-- something real to render. Without this the account has 1 weigh-in, 0 food
-- logs, 0 routines and 0 sessions, which leaves the Nutrition page, the weight
-- trend, the volume charts, PRs and the whole adaptive engine showing empty
-- states.
--
-- The numbers are internally consistent, not arbitrary: intake averages ~2860
-- kcal/day against a bodyweight climbing ~0.47 kg/week, so when the app
-- back-calculates TDEE (avg intake - weight change x 7700 / days) it lands
-- near 2350, and because 0.47 kg/wk deviates ~87% from the +0.25 kg/wk goal for
-- 3 straight weeks, proposeRetarget() fires a genuine "gaining faster than
-- planned" suggestion. Nothing here fakes a result the code didn't compute.
--
-- tdee_estimates is deliberately NOT seeded -- nutritionService.recompute()
-- derives and writes that row from this data, so the displayed estimate is
-- really computed rather than planted. Hit "Recompute" once after seeding.
--
-- Idempotent: re-running replaces rather than duplicates.
-- Reverse with supabase/seed/demo_teardown.sql.

begin;

-- ---------------------------------------------------------------------------
-- Daily weigh-ins: 22 days, 52.7 -> ~54.1 kg, with realistic day-to-day noise
-- so the EMA trend line has something to smooth (that contrast is the point of
-- the weight chart).
-- ---------------------------------------------------------------------------
insert into public.body_metrics (user_id, log_date, weight_kg)
select 'e9f30b90-ff22-40d6-9628-b11564bce3d3'::uuid,
       current_date - d,
       -- 0.080 kg/day = 0.56 kg/week. Deliberately well clear of the goal rate:
       -- computeSuggestion needs BOTH the recent and the prior 14-day window to
       -- deviate >20%, and at a gentler 0.0667 slope the prior window measured
       -- only 23% -- close enough to the threshold that a rounding difference
       -- between the SQL check and the JS EMA could silently kill the
       -- suggestion. Noise is 0.20 rather than 0.30 for the same reason: still
       -- visibly wobbly against the smoothed line, without moving the endpoints
       -- that weeklyRate() measures.
       round((52.70 + (21 - d) * 0.080 + 0.20 * sin((21 - d) * 1.7))::numeric, 1)
from generate_series(0, 21) as d
on conflict (user_id, log_date) do update set weight_kg = excluded.weight_kg;

-- ---------------------------------------------------------------------------
-- Food logs: same 4-meal template each day with a small daily wobble in
-- portion size, so the calorie series is not a flat line.
-- food_logs has no natural key, so clear the window first to stay idempotent.
-- ---------------------------------------------------------------------------
delete from public.food_logs
where user_id = 'e9f30b90-ff22-40d6-9628-b11564bce3d3'
  and log_date >= current_date - 21;

insert into public.food_logs (user_id, food_id, log_date, quantity_g, meal_type)
select 'e9f30b90-ff22-40d6-9628-b11564bce3d3'::uuid,
       m.food_id,
       current_date - d,
       greatest(5, round((m.qty * (1 + 0.08 * sin(d * 2.1)))::numeric, 0)),
       m.meal
from generate_series(0, 21) as d
cross join (values
  -- breakfast ~910 kcal
  ('ea2787fb-d8da-49b4-bd71-da9ff91c4a67'::uuid, 100, 'breakfast'),  -- Rolled Oats
  ('11372a8b-70b7-4958-b4b6-ba02d37c0ade'::uuid, 118, 'breakfast'),  -- Banana
  ('6a4753b6-664c-4550-8302-b2922dfd6109'::uuid, 250, 'breakfast'),  -- Semi-Skimmed Milk
  ('8c26febf-cfcb-4efb-a0f2-b08444737707'::uuid, 110, 'breakfast'),  -- Plain Bagel
  -- lunch ~940 kcal
  ('b4142fd8-b014-4169-9124-bb183b2cbabb'::uuid, 110, 'lunch'),      -- Chicken Breast
  ('6e1f7027-7b4a-491b-84cf-bf7009590bdf'::uuid, 450, 'lunch'),      -- White Rice
  ('4d0d0b4b-071c-4425-8d12-10b417fffb49'::uuid, 150, 'lunch'),      -- Broccoli
  ('192490ff-a86b-44a1-8e61-2b70b589f08c'::uuid,  14, 'lunch'),      -- Olive Oil
  -- dinner ~660 kcal
  ('86953d49-9b73-47f7-9005-70efa76e7985'::uuid, 100, 'dinner'),     -- Salmon Fillet
  ('93773050-acd0-4670-bd77-3cb06a131ff6'::uuid, 400, 'dinner'),     -- Sweet Potato
  ('bae2eec9-b349-4ad9-bb7f-03c61e40be46'::uuid, 200, 'dinner'),     -- Mixed Vegetables
  -- snack ~345 kcal
  ('a5a086f9-0b6e-467d-b79c-50b7bd88b609'::uuid,  32, 'snack'),      -- Peanut Butter
  ('96a3f685-d532-4600-9755-b71871e9f933'::uuid, 180, 'snack'),      -- Apple
  ('41db8ff4-b924-4d3b-939d-d777763be7f7'::uuid, 100, 'snack')       -- Greek Yogurt 0%
) as m(food_id, qty, meal);

-- ---------------------------------------------------------------------------
-- Routines: a push/pull/legs split. Fixed ids so teardown is exact.
-- ---------------------------------------------------------------------------
delete from public.routines where id in (
  'd0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000002',
  'd0000000-0000-0000-0000-000000000003'
);

insert into public.routines (id, user_id, name, notes) values
  ('d0000000-0000-0000-0000-000000000001', 'e9f30b90-ff22-40d6-9628-b11564bce3d3', 'Push A', 'Chest and shoulders. Bench first while fresh.'),
  ('d0000000-0000-0000-0000-000000000002', 'e9f30b90-ff22-40d6-9628-b11564bce3d3', 'Pull A', 'Back thickness then width, arms last.'),
  ('d0000000-0000-0000-0000-000000000003', 'e9f30b90-ff22-40d6-9628-b11564bce3d3', 'Legs A', 'Quads then posterior chain.');

insert into public.routine_exercises (routine_id, exercise_id, order_index, target_sets, target_rep_range, target_rpe, rest_seconds) values
  ('d0000000-0000-0000-0000-000000000001', 'b9a3cb8d-d2c7-463b-98e9-dd8512cac818', 0, 3, '6-8',  8.0, 150),
  ('d0000000-0000-0000-0000-000000000001', '3c1fdfb2-6f30-448e-b923-3ff60ff62678', 1, 3, '8-12', 8.5, 105),
  ('d0000000-0000-0000-0000-000000000001', '9e2c9fb2-0e0a-4e26-aba4-5b5f99463156', 2, 3, '6-10', 8.0, 120),
  ('d0000000-0000-0000-0000-000000000002', '4bd321cd-7975-4bab-b5a3-cbf89f601790', 0, 3, '6-8',  8.0, 150),
  ('d0000000-0000-0000-0000-000000000002', 'd180cdfe-d780-49c9-b5c7-72d262761541', 1, 3, '8-12', 8.5, 105),
  ('d0000000-0000-0000-0000-000000000002', '6a836df6-b1a1-430a-a5e7-b4081536d122', 2, 3, '8-12', 9.0,  75),
  ('d0000000-0000-0000-0000-000000000003', '0241a2c2-be31-410f-b8e1-47862727f258', 0, 3, '8-12', 8.5, 150),
  ('d0000000-0000-0000-0000-000000000003', 'd4e68bd4-ebf2-44ee-8759-586f74ced285', 1, 3, '6-10', 8.0, 135);

-- ---------------------------------------------------------------------------
-- Nine sessions, three per week for three weeks.
-- ---------------------------------------------------------------------------
delete from public.workout_sessions
where id::text like 'd0000000-0000-0000-0001-%';

insert into public.workout_sessions (id, user_id, routine_id, session_date, started_at, ended_at, notes) values
  ('d0000000-0000-0000-0001-000000000001','e9f30b90-ff22-40d6-9628-b11564bce3d3','d0000000-0000-0000-0000-000000000001', current_date - 19, (current_date - 19) + time '18:05', (current_date - 19) + time '19:12', 'Felt heavy, bar speed slow.'),
  ('d0000000-0000-0000-0001-000000000002','e9f30b90-ff22-40d6-9628-b11564bce3d3','d0000000-0000-0000-0000-000000000002', current_date - 17, (current_date - 17) + time '18:10', (current_date - 17) + time '19:20', null),
  ('d0000000-0000-0000-0001-000000000003','e9f30b90-ff22-40d6-9628-b11564bce3d3','d0000000-0000-0000-0000-000000000003', current_date - 15, (current_date - 15) + time '17:55', (current_date - 15) + time '18:58', null),
  ('d0000000-0000-0000-0001-000000000004','e9f30b90-ff22-40d6-9628-b11564bce3d3','d0000000-0000-0000-0000-000000000001', current_date - 12, (current_date - 12) + time '18:00', (current_date - 12) + time '19:08', 'Bench moved better today.'),
  ('d0000000-0000-0000-0001-000000000005','e9f30b90-ff22-40d6-9628-b11564bce3d3','d0000000-0000-0000-0000-000000000002', current_date - 10, (current_date - 10) + time '18:15', (current_date - 10) + time '19:25', null),
  ('d0000000-0000-0000-0001-000000000006','e9f30b90-ff22-40d6-9628-b11564bce3d3','d0000000-0000-0000-0000-000000000003', current_date -  8, (current_date -  8) + time '18:05', (current_date -  8) + time '19:10', null),
  ('d0000000-0000-0000-0001-000000000007','e9f30b90-ff22-40d6-9628-b11564bce3d3','d0000000-0000-0000-0000-000000000001', current_date -  5, (current_date -  5) + time '17:50', (current_date -  5) + time '19:00', 'PR on bench.'),
  ('d0000000-0000-0000-0001-000000000008','e9f30b90-ff22-40d6-9628-b11564bce3d3','d0000000-0000-0000-0000-000000000002', current_date -  3, (current_date -  3) + time '18:20', (current_date -  3) + time '19:30', null),
  ('d0000000-0000-0000-0001-000000000009','e9f30b90-ff22-40d6-9628-b11564bce3d3','d0000000-0000-0000-0000-000000000003', current_date -  1, (current_date -  1) + time '18:00', (current_date -  1) + time '19:05', 'Legs felt strong.');

-- ---------------------------------------------------------------------------
-- Sets: linear progression across the three cycles, so estimated-1RM climbs and
-- the exercise progress charts have a real upward slope. is_pr is set on the
-- top set of cycles 2 and 3, where the weight genuinely exceeded the previous
-- best -- the flag is not sprinkled at random, because buildRecentPRs reads it
-- directly.
-- ---------------------------------------------------------------------------
insert into public.workout_sets (session_id, exercise_id, set_number, weight_kg, reps, rpe, set_type, is_pr) values
  -- cycle 1: push
  ('d0000000-0000-0000-0001-000000000001','b9a3cb8d-d2c7-463b-98e9-dd8512cac818',1,40.0,8,7.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000001','b9a3cb8d-d2c7-463b-98e9-dd8512cac818',2,40.0,8,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000001','b9a3cb8d-d2c7-463b-98e9-dd8512cac818',3,40.0,7,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000001','3c1fdfb2-6f30-448e-b923-3ff60ff62678',1,16.0,11,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000001','3c1fdfb2-6f30-448e-b923-3ff60ff62678',2,16.0,10,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000001','3c1fdfb2-6f30-448e-b923-3ff60ff62678',3,16.0, 9,9.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000001','9e2c9fb2-0e0a-4e26-aba4-5b5f99463156',1,25.0, 9,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000001','9e2c9fb2-0e0a-4e26-aba4-5b5f99463156',2,25.0, 8,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000001','9e2c9fb2-0e0a-4e26-aba4-5b5f99463156',3,25.0, 7,9.0,'normal',false),
  -- cycle 1: pull
  ('d0000000-0000-0000-0001-000000000002','4bd321cd-7975-4bab-b5a3-cbf89f601790',1,45.0, 8,7.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000002','4bd321cd-7975-4bab-b5a3-cbf89f601790',2,45.0, 8,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000002','4bd321cd-7975-4bab-b5a3-cbf89f601790',3,45.0, 7,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000002','d180cdfe-d780-49c9-b5c7-72d262761541',1,45.0,11,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000002','d180cdfe-d780-49c9-b5c7-72d262761541',2,45.0,10,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000002','d180cdfe-d780-49c9-b5c7-72d262761541',3,45.0, 9,9.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000002','6a836df6-b1a1-430a-a5e7-b4081536d122',1,15.0,12,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000002','6a836df6-b1a1-430a-a5e7-b4081536d122',2,15.0,11,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000002','6a836df6-b1a1-430a-a5e7-b4081536d122',3,15.0,10,9.0,'normal',false),
  -- cycle 1: legs
  ('d0000000-0000-0000-0001-000000000003','0241a2c2-be31-410f-b8e1-47862727f258',1,90.0,12,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000003','0241a2c2-be31-410f-b8e1-47862727f258',2,90.0,11,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000003','0241a2c2-be31-410f-b8e1-47862727f258',3,90.0,10,9.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000003','d4e68bd4-ebf2-44ee-8759-586f74ced285',1,50.0,10,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000003','d4e68bd4-ebf2-44ee-8759-586f74ced285',2,50.0, 9,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000003','d4e68bd4-ebf2-44ee-8759-586f74ced285',3,50.0, 8,9.0,'normal',false),
  -- cycle 2: push (+2.5 kg bench, +2 kg incline, +2.5 kg OHP)
  ('d0000000-0000-0000-0001-000000000004','b9a3cb8d-d2c7-463b-98e9-dd8512cac818',1,42.5,8,7.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000004','b9a3cb8d-d2c7-463b-98e9-dd8512cac818',2,42.5,8,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000004','b9a3cb8d-d2c7-463b-98e9-dd8512cac818',3,42.5,8,8.5,'normal',true),
  ('d0000000-0000-0000-0001-000000000004','3c1fdfb2-6f30-448e-b923-3ff60ff62678',1,18.0,10,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000004','3c1fdfb2-6f30-448e-b923-3ff60ff62678',2,18.0,10,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000004','3c1fdfb2-6f30-448e-b923-3ff60ff62678',3,18.0, 9,9.0,'normal',true),
  ('d0000000-0000-0000-0001-000000000004','9e2c9fb2-0e0a-4e26-aba4-5b5f99463156',1,27.5, 9,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000004','9e2c9fb2-0e0a-4e26-aba4-5b5f99463156',2,27.5, 8,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000004','9e2c9fb2-0e0a-4e26-aba4-5b5f99463156',3,27.5, 8,9.0,'normal',true),
  -- cycle 2: pull
  ('d0000000-0000-0000-0001-000000000005','4bd321cd-7975-4bab-b5a3-cbf89f601790',1,47.5, 8,7.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000005','4bd321cd-7975-4bab-b5a3-cbf89f601790',2,47.5, 8,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000005','4bd321cd-7975-4bab-b5a3-cbf89f601790',3,47.5, 8,8.5,'normal',true),
  ('d0000000-0000-0000-0001-000000000005','d180cdfe-d780-49c9-b5c7-72d262761541',1,50.0,10,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000005','d180cdfe-d780-49c9-b5c7-72d262761541',2,50.0,10,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000005','d180cdfe-d780-49c9-b5c7-72d262761541',3,50.0, 9,9.0,'normal',true),
  ('d0000000-0000-0000-0001-000000000005','6a836df6-b1a1-430a-a5e7-b4081536d122',1,17.5,11,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000005','6a836df6-b1a1-430a-a5e7-b4081536d122',2,17.5,10,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000005','6a836df6-b1a1-430a-a5e7-b4081536d122',3,17.5,10,9.0,'normal',true),
  -- cycle 2: legs
  ('d0000000-0000-0000-0001-000000000006','0241a2c2-be31-410f-b8e1-47862727f258',1,100.0,11,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000006','0241a2c2-be31-410f-b8e1-47862727f258',2,100.0,11,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000006','0241a2c2-be31-410f-b8e1-47862727f258',3,100.0,10,9.0,'normal',true),
  ('d0000000-0000-0000-0001-000000000006','d4e68bd4-ebf2-44ee-8759-586f74ced285',1,55.0,10,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000006','d4e68bd4-ebf2-44ee-8759-586f74ced285',2,55.0, 9,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000006','d4e68bd4-ebf2-44ee-8759-586f74ced285',3,55.0, 9,9.0,'normal',true),
  -- cycle 3: push
  ('d0000000-0000-0000-0001-000000000007','b9a3cb8d-d2c7-463b-98e9-dd8512cac818',1,45.0,8,7.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000007','b9a3cb8d-d2c7-463b-98e9-dd8512cac818',2,45.0,8,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000007','b9a3cb8d-d2c7-463b-98e9-dd8512cac818',3,45.0,8,9.0,'normal',true),
  ('d0000000-0000-0000-0001-000000000007','3c1fdfb2-6f30-448e-b923-3ff60ff62678',1,20.0,10,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000007','3c1fdfb2-6f30-448e-b923-3ff60ff62678',2,20.0, 9,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000007','3c1fdfb2-6f30-448e-b923-3ff60ff62678',3,20.0, 9,9.0,'normal',true),
  ('d0000000-0000-0000-0001-000000000007','9e2c9fb2-0e0a-4e26-aba4-5b5f99463156',1,30.0, 8,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000007','9e2c9fb2-0e0a-4e26-aba4-5b5f99463156',2,30.0, 8,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000007','9e2c9fb2-0e0a-4e26-aba4-5b5f99463156',3,30.0, 7,9.5,'normal',true),
  -- cycle 3: pull
  ('d0000000-0000-0000-0001-000000000008','4bd321cd-7975-4bab-b5a3-cbf89f601790',1,50.0, 8,7.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000008','4bd321cd-7975-4bab-b5a3-cbf89f601790',2,50.0, 8,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000008','4bd321cd-7975-4bab-b5a3-cbf89f601790',3,50.0, 7,9.0,'normal',true),
  ('d0000000-0000-0000-0001-000000000008','d180cdfe-d780-49c9-b5c7-72d262761541',1,55.0,10,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000008','d180cdfe-d780-49c9-b5c7-72d262761541',2,55.0, 9,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000008','d180cdfe-d780-49c9-b5c7-72d262761541',3,55.0, 9,9.0,'normal',true),
  ('d0000000-0000-0000-0001-000000000008','6a836df6-b1a1-430a-a5e7-b4081536d122',1,20.0,10,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000008','6a836df6-b1a1-430a-a5e7-b4081536d122',2,20.0,10,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000008','6a836df6-b1a1-430a-a5e7-b4081536d122',3,20.0, 9,9.0,'normal',true),
  -- cycle 3: legs
  ('d0000000-0000-0000-0001-000000000009','0241a2c2-be31-410f-b8e1-47862727f258',1,110.0,11,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000009','0241a2c2-be31-410f-b8e1-47862727f258',2,110.0,10,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000009','0241a2c2-be31-410f-b8e1-47862727f258',3,110.0,10,9.0,'normal',true),
  ('d0000000-0000-0000-0001-000000000009','d4e68bd4-ebf2-44ee-8759-586f74ced285',1,60.0,10,8.0,'normal',false),
  ('d0000000-0000-0000-0001-000000000009','d4e68bd4-ebf2-44ee-8759-586f74ced285',2,60.0, 9,8.5,'normal',false),
  ('d0000000-0000-0000-0001-000000000009','d4e68bd4-ebf2-44ee-8759-586f74ced285',3,60.0, 9,9.5,'normal',true);

commit;
