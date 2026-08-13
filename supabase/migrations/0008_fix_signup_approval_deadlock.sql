-- Migration 0007 gated body_metrics and nutrition_targets behind
-- profiles.approved, same as every other user-data table. But
-- authService.signUp writes the user's first body_metrics row and baseline
-- nutrition_targets row as PART OF signup, before any admin has approved
-- them -- so every signup failed with an RLS violation, since a brand new
-- account is unapproved by definition. Chicken-and-egg. Found by actually
-- running a real signup, not by reasoning about the policies in the abstract.
--
-- Fix: these two tables don't need the approval gate. They're the seed data
-- written once at signup (and later, ordinary logging), not "using the app"
-- in the sense that matters for the pilot's access control -- nothing an
-- unapproved user writes here is visible or actionable until they're
-- approved anyway (the client won't even route them past the pending-
-- approval screen). Every other table (workouts, food logs, routines,
-- custom exercises/foods, tdee_estimates, dismissed_suggestions) keeps the
-- approved gate -- none of those are written during signup, only once a
-- user is actually using the app, which already requires approval via the
-- client routing.

alter policy "own body metrics" on public.body_metrics
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "own nutrition targets" on public.nutrition_targets
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
