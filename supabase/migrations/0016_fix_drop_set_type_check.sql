-- Fix the workout_sets.set_type CHECK constraint drift.
--
-- Migration 0011 added a CHECK constraint that listed 'drop-set', but the
-- application (frontend/src/types SetType, SET_TYPES, SET_TYPE_LABEL, and the
-- WorkoutPage set-type select) has always sent 'drop'. As a result, logging a
-- drop set from the UI failed with a CHECK constraint violation because the
-- only accepted value for that variant was the never-sent 'drop-set'.
--
-- The frontend enum is the source of truth for what is actually written, so the
-- constraint is aligned to 'drop'. 'normal', 'warmup', 'failure' are unchanged.
-- 'amrap' is retained for forward compatibility and is harmless (an unused
-- allowed value does not break anything).

alter table public.workout_sets
  drop constraint workout_sets_set_type_check;

alter table public.workout_sets
  add constraint workout_sets_set_type_check
  check (set_type in ('normal', 'warmup', 'drop', 'amrap', 'failure'));
