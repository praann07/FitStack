-- Phase 1: Fix remaining schema integrity issues
-- This migration adds CHECK constraints and fixes nullability issues
-- that were identified in the database audit (2026-08-29).

-- 1. Add CHECK constraint to workout_sets.set_type
-- Valid values: 'normal' (standard set), 'warmup' (warm-up set),
-- 'drop-set' (drop set), 'amrap' (as many reps as possible),
-- 'failure' (to muscular failure)
alter table public.workout_sets
  add constraint workout_sets_set_type_check
  check (set_type in ('normal', 'warmup', 'drop-set', 'amrap', 'failure'));

-- 2. Add CHECK constraint and NOT NULL to food_logs.meal_type
-- Valid values: 'breakfast', 'lunch', 'dinner', 'snack', 'other'
-- All logs must be categorized by meal type for accurate nutrition tracking
alter table public.food_logs
  add constraint food_logs_meal_type_check
  check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'other'));

-- Set default to 'other' for any existing null values before making NOT NULL
update public.food_logs
  set meal_type = 'other'
  where meal_type is null;

alter table public.food_logs
  alter column meal_type set not null;

-- 3. Add CHECK constraint to tdee_estimates.confidence
-- Valid values: 'low' (< 7 days data), 'medium' (7-14 days), 'high' (> 14 days)
-- Users need to know how reliable each TDEE estimate is
alter table public.tdee_estimates
  add constraint tdee_estimates_confidence_check
  check (confidence in ('low', 'medium', 'high'));

-- 4. Add missing indexes for query performance
-- These composite indexes support common query patterns:
-- - Finding logs for a user in a date range (most queries)
-- - Historical trends sorted by date descending

create index if not exists idx_body_metrics_user_date
  on public.body_metrics(user_id, log_date desc);

create index if not exists idx_workout_sessions_routine
  on public.workout_sessions(routine_id);

create index if not exists idx_exercises_created_by
  on public.exercises(created_by);

create index if not exists idx_foods_created_by
  on public.foods(created_by);

-- NOTE: routine_id nullability decision
-- workout_sessions.routine_id is currently nullable.
-- Frontend UX requires routines to be created first (no freestyle mode yet).
-- This is a UI limitation, not a database issue — the schema allows flexibility
-- for future freestyle logging feature (Phase 2).
-- NOT making this NOT NULL to preserve compatibility with potential future changes.
-- The RLS policy already limits access to own sessions regardless of routine_id.
