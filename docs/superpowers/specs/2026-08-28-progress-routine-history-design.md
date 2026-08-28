# Progress & Routine-History Features (Set-by-Set, Style Tags, Session Snapshot)

**Date:** 2026-08-28
**Status:** Approved (design brainstormed + reviewed against an external
assessment; user reversed D6 toward JSONB snapshot). Code not yet written.

## Problem

Three requested frontend improvements for the workout module, gated behind a
shared data-model fix:

1. **Set-by-set progress views.** Today the only per-exercise progression chart
   (`ExerciseProgressChart`, reached from the Workout History Progression tab)
   tracks a single value per session — the *top set's* estimated 1RM
   (`derive.buildExerciseHistory` uses `topSet()`). The user wants to see how
   **each specific set** (Set 1, Set 2, Set 3 …) progresses over time, i.e. the
   whole working-set "ladder" for one exercise across sessions.

2. **Training-style tags on routines.** Add a `style` label to routines so the
   user can compare progress **within the same training style** (push / pull /
   legs / upper / lower / full-body / arms / core), rather than accidentally
   mixing different program styles when judging whether an exercise is
   progressing.

3. **Preserve old routine structures when a split is redesigned (D6).**
   `workoutService.updateRoutine` (`workoutService.ts:202-217`) deletes and
   re-inserts `routine_exercises` on the **same** `routines` row. Past
   `workout_sessions.routine_id` still points at that live routine, so editing a
   routine **retroactively rewrites** what past sessions "were." This is a
   recognized correctness flaw in the data model.

## Decisions

- **D6 approach (user reversed an earlier choice):** version-tables were the
  initial design, but the user adopted the JSONB-snapshot alternative after an
  external review highlighted it is ~20% of the cost for ~90% of the value and
  **cannot corrupt historical data** (it only adds behavior for new writes). The
  snapshot model is preferred over version tables for a single-user pilot.
- **Set-by-set chart:** multi-line — each set number is its own series for a
  chosen exercise over time; **"plot what exists, gap where missing"** when set
  counts differ between sessions.
- **Style tag:** a `style` column on `routines`; a style dropdown filters both
  the new set-by-set chart **and** the existing top-set progression chart.
- **Scope:** items 1–3 only. Item 4 (deploy/onboard) and item 5 (email
  auto-approval) are out of scope and documented as future work.

## Requirements

### Item 1 — Set-by-set progress
- R1.1 A new chart in the Workout History Progression tab lets the user pick an
  exercise (existing exercise picker) and see one line per working set index.
- R1.2 Lines are labeled "Set 1", "Set 2", … and drawn only where the set
  exists in a session; sessions with fewer sets simply leave a gap for higher
  indices ("plot what exists").
- R1.3 Metric: **e1RM per set** (Epley, consistent with the PR system). A weight
  toggle is acceptable but not required for approval.
- R1.4 Warm-up and drop sets are excluded (consistent with
  `QUALIFYING_SET_TYPES` in `types/index.ts:35`).
- R1.5 The same style filter from item 2 applies (see R2.4).

### Item 2 — Training-style tags
- R2.1 A `style` column on `routines` (nullable; `null` = untagged), accepting
  `push | pull | legs | upper | lower | full-body | arms | core`.
- R2.2 The routine editor shows a style dropdown and persists it.
- R2.3 Routine cards / detail show a small style chip when set.
- R2.4 A style dropdown on **both** the new set-by-set chart and the existing
  top-set progression chart filters which sessions contribute ("All styles /
  push / pull / …"). Filtering happens on pre-approved sessions' routine style,
  using the session's snapshot style when present and falling back to the
  current routine style otherwise (see R3.4).

### Item 3 — Session structure snapshot (D6 fix)
- R3.1 Add `routine_snapshot JSONB` to `workout_sessions` (nullable).
- R3.2 At session start (`workoutService.startSession`, `workoutService.ts:283`),
  capture the selected routine's `routine_exercises` (with exercise identity)
  into `routine_snapshot`. Freestyle sessions store `null`.
- R3.3 On session read, prefer `routine_snapshot` when present; fall back to a
  live join to `routine_exercises` / `routines` for pre-migration sessions.
- R3.4 Pre-migration sessions with `NULL` snapshot are treated as "the routine
  as it currently is" (matches today's behavior) and are eligible for a
  one-shot backfill to the current structure; backfill is optional and additive.
- R3.5 Editing a routine thereafter has **zero retroactive effect** on historical
  sessions (the fix for D6).

## Design

### Data model

```sql
-- Migration 0009_routine_snapshot.sql
ALTER TABLE public.workout_sessions
  ADD COLUMN routine_snapshot jsonb;

ALTER TABLE public.routines
  ADD COLUMN style text;

-- value check on style
ALTER TABLE public.routines
  ADD CONSTRAINT routines_style_check
  CHECK (style IS NULL OR style IN
    ('push','pull','legs','upper','lower','full-body','arms','core'));
```

`routine_snapshot` shape (denormalized at session-start, with exercise identity
so reads don't need a join):

```json
{
  "routine_id": "<uuid>",
  "routine_name": "Upper power",
  "style": "push",
  "exercises": [
    { "exercise_id": "<uuid>", "name": "Bench Press",
      "muscle_group": "chest", "equipment": "barbell",
      "order_index": 0, "target_sets": 3, "target_rep_range": "8-12",
      "target_rpe": null, "rest_seconds": 90, "notes": null }
  ]
}
```

RLS: `workout_sessions` and `routines` already have owner-scoped policies
(`0002_training.sql`, `0007_approval_gate.sql`); the snapshot column and style
column are covered by those same policies — **no new policy required**.

### Services / read-model

- `workoutService.startSession(routineId)` → after creating the session,
  snapshot the routine. Reuse the existing `getRoutine`/`attachRoutineExercises`
  plumbing; store the JSON above.
- `workoutService.listSessions` / `loadSessionDetail`: when building
  `SessionSummary` / `SessionDetail`, prefer `routine_snapshot` for the name and
  style; fall back to the live join. `SessionSummary` gains an optional `style`.
- New pure derive fn in `services/derive.ts`:

  ```ts
  buildSetHistory(sessions, setsBySession, exerciseId):
    Array<{ session_id, date, bySet: Record<SetIndex, { weight_kg, reps, e1rm }> }>
  ```

  qualifying sets only; `bySet` keyed by `set_number`; only indices present in
  that session ("plot what exists").

### UI

- New `SetProgressionChart` (Recharts `LineChart`) in the WorkoutHistory
  Progression tab: one `<Line>` per set index, legend auto-derived from data,
  gap where a set is absent. Reuses the existing chart-tooltip palette.
- `RoutineEditorPage`: add a `style` dropdown; `RoutineInput` carries it.
- `RoutinesPage` / `RoutineDetailPage`: style chip.
- Style dropdown on the Progression tab that filters sessions for both charts.

## Risks / open items

- Migration is low-risk (additive columns only; no row reshaping). The one
  re-shaping decision is the **optional backfill** of existing sessions' null
  snapshots — default is *no backfill* (fall back to live routine), keeping it
  additive and reversible.
- e1RM-vs-weight for the set chart: defaulted to e1RM; a weight toggle is a
  possible follow-up micro-decision.
- Recharts bundle advisory (>500 kB) is pre-existing and unchanged.

## Out of scope

- Items 4 (deploy + on-board group) and 5 (email approval automation) — see
  `PROJECT_OVERVIEW.md` §6. The 2FA/email plan is paused (Resend `weighsfit.in`
  KYC unreachable).
- Progress photos (deliberate; column exists, no storage/UI).

## Follow-up (external-review debts, not part of this spec)

- Unit tests for `lib/*` + `services/derive.ts` (highest-leverage; land *before*
  the routine changes per the review's §5.2/§7).
- Deploy to a public URL + SMTP swap + error boundaries/Sentry (review §5.5,
  §5.11, §5.14).
