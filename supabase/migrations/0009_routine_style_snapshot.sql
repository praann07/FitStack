-- Add a training-style tag to routines and a structure snapshot to sessions.
-- Both columns are additive and nullable, so existing rows and existing RLS
-- owner policies are untouched -- no policy changes, no backfill.
--
-- Style: an optional program label so the progression views can compare
-- sessions within the same style (push / pull / upper / lower ...) instead
-- of accidentally mixing programs. null = untagged.
--
-- routine_snapshot: a denormalized copy of the routine's structure taken at
-- session-start (see RoutineSnapshot in frontend/types). Editing the routine
-- template later must never retroactively rewrite what past sessions "were",
-- so each session owns its own frozen copy of the routine it was started
-- from. null = freestyle session (or pre-migration session, which falls back
-- to the live join).

alter table public.routines
  add column style text;

alter table public.routines
  add constraint routines_style_check
  check (style is null or style in
    ('push','pull','legs','upper','lower','full-body','arms','core'));

alter table public.workout_sessions
  add column routine_snapshot jsonb;
