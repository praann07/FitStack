# Progress & Routine-History Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add training-style tags to routines, snapshot a routine's structure into each session at start (so editing a routine never rewrites history), and add a set-by-set progression chart with a style filter.

**Architecture:** Three additive changes over the existing Supabase + React (Vite) stack.
1. A nullable `style` column on `routines` + a nullable `routine_snapshot jsonb` column on `workout_sessions` (one migration, additive only — existing RLS owner policies already cover both rows, so **no policy changes**).
2. Services read routine style / name from the snapshot when present, else fall back to the live join (`derive.buildSessionDetail` / `buildSessionSummary` gain `routine_style`).
3. A new pure derive fn `buildSetHistory` plus a `SetProgressionChart` (Recharts multi-line) rendered in the Workout History Progression tab, with a style dropdown that filters both the new chart and the existing top-set chart.

**Tech Stack:** TypeScript, React 19, Recharts, Supabase (supabase-js), oxlint, Vite. Windows/PowerShell 5.1 environment — no `make`, prefer `npm run` scripts.

## Global Constraints

- **Verify commands (npm run, from `frontend/`):** `npm run lint` (oxlint), `npm run build` (runs `tsc -b && vite build`). No test suite exists; there is no `test` script. Do not invent a test runner.
- **Units are metric everywhere (kg).** `estimated1RM(weight,reps) = weight*(1+reps/30)` from `frontend/src/lib/strength.ts:15`.
- **Warm-up and drop sets never count** — use `isQualifying(set)` / `QUALIFYING_SET_TYPES` (`types/index.ts:35`, `lib/strength.ts:21`).
- **Style value set is fixed:** `push | pull | legs | upper | lower | full-body | arms | core`, plus `null` = untagged. Keep the DB CHECK and the frontend enum in lockstep.
- **Style filter on a session:** use `routine_snapshot->>'style'` when the snapshot exists, else the live `routines.style` for sessions that still have a `routine_id`, else `null` (freestyle / deleted routine).
- **Migration is additive only** (`ALTER TABLE ... ADD COLUMN` + one `CHECK`). No table re-shape, no backfill, no data migration.
- Do **not** delete the dead `RouteGuard.tsx` in this work (separate decision).
- Follow existing code style: named function components, `cn()` for class merging, existing `Badge`/`Field`/`Select`/`Card` primitives, `useAsync`/`useAction` hooks for data loading.

---

### Task 1: Domain types + style label map (foundation)

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/lib/format.ts`

**Interfaces:**
- Produces:
  - `export type TrainingStyle = 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'full-body' | 'arms' | 'core'`
  - `export const TRAINING_STYLES: TrainingStyle[] = [...]`
  - `Routine` gains `style: TrainingStyle | null`
  - `RoutineInput` (in `services/workoutService.ts`, Task 2) gains `style: TrainingStyle | null` — Task 2 uses this.
  - `export const STYLE_LABEL: Record<TrainingStyle, string>` in `lib/format.ts`
  - `RoutineSnapshot` interface (used by Task 3/4).
- Consumes: nothing.

- [ ] **Step 1: Add the type + constant to types**

In `frontend/src/types/index.ts`, after the `SetType` type + `SET_TYPES` constant (around line 30), add:

```ts
export type TrainingStyle =
  | 'push'
  | 'pull'
  | 'legs'
  | 'upper'
  | 'lower'
  | 'full-body'
  | 'arms'
  | 'core'

export const TRAINING_STYLES: TrainingStyle[] = [
  'push',
  'pull',
  'legs',
  'upper',
  'lower',
  'full-body',
  'arms',
  'core',
]
```

- [ ] **Step 2: Extend the `Routine` type**

In the same file, change the `Routine` interface (around line 80) to add the nullable style column:

```ts
export interface Routine {
  id: string
  user_id: string
  name: string
  /** e.g. "push", "pull", "upper", "lower". `null` = untagged. */
  style: TrainingStyle | null
  notes: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 3: Add the `RoutineSnapshot` type**

In the same file, after the `SessionDetail`/`SessionSummary` interfaces (around line 146), add the snapshot shape (denormalized at session-start, exercise identity included so reads need no join):

```ts
/** Structure of a routine captured at session-start. The whole object is the
 * `routine_snapshot` jsonb on workout_sessions, so editing the routine later
 * never rewrites what past sessions "were." */
export interface RoutineSnapshotExercise {
  exercise_id: string
  name: string
  muscle_group: MuscleGroup
  equipment: Equipment
  order_index: number
  target_sets: number
  target_rep_range: string
  target_rpe: number | null
  rest_seconds: number
  notes: string | null
}

export interface RoutineSnapshot {
  routine_id: string
  routine_name: string
  style: TrainingStyle | null
  exercises: RoutineSnapshotExercise[]
}
```

- [ ] **Step 4: Add the `STYLE_LABEL` map**

In `frontend/src/lib/format.ts`, update the type import on line 1 to include `TrainingStyle`, then add after `SET_TYPE_SHORT` (around line 104):

```ts
export const STYLE_LABEL: Record<TrainingStyle, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  upper: 'Upper',
  lower: 'Lower',
  'full-body': 'Full body',
  arms: 'Arms',
  core: 'Core',
}
```

Change line 1 import to:
```ts
import type { Goal, MuscleGroup, SetType, MealType, Confidence, Equipment, TrainingStyle } from '@/types'
```

- [ ] **Step 5: Verify types compile**

Run: `npm run build` from `frontend/` — this runs `tsc -b`. Expected: `tsc` succeeds (possible warning about `RoutineInput` not yet carrying `style`; that's fixed in Task 2 — if only `RoutineInput` errors, proceed).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/lib/format.ts
git commit -m "feat: add training-style type + routine snapshot type"
```

---

### Task 2: Schema migration (style + routine_snapshot)

**Files:**
- Create: `supabase/migrations/0009_routine_style_snapshot.sql`

**Interfaces:**
- Consumes: `TrainingStyle` value set.
- Produces: `routines.style text` (nullable) + `routines_style_check` constraint; `workout_sessions.routine_snapshot jsonb` (nullable). No new RLS.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0009_routine_style_snapshot.sql`:

```sql
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
```

- [ ] **Step 2: Sanity-check the SQL is additive**

Confirm the file contains only `alter table ... add column` (x2) and `add constraint ... check` (x1) — no `drop`, no `update`, no `delete`.

- [ ] **Step 3: Apply the migration to the Supabase project**

Use the Supabase MCP `supabase_apply_migration` tool, project `mdqcaqksvqkanhgjrlwa`, name `routine_style_snapshot`, with the exact SQL from Step 1. Confirm success.

- [ ] **Step 4: Verify columns exist**

Use `supabase_list_tables` (verbose) on project `mdqcaqksvqkanhgjrlwa`, schema `public`. Expected: `routines` now has `style text`; `workout_sessions` now has `routine_snapshot jsonb`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0009_routine_style_snapshot.sql
git commit -m "feat(db): routine style column + session routine snapshot"
```

---

### Task 3: Capture the snapshot on session start; thread style into the service

**Files:**
- Modify: `frontend/src/services/workoutService.ts`
- Modify: `frontend/src/services/queries.ts`
- Modify: `frontend/src/services/derive.ts`

**Interfaces:**
- Consumes: `RoutineSnapshot`, `TrainingStyle`, `STYLE_LABEL` (Task 1), `attachRoutineExercises` (existing, `workoutService.ts:60`).
- Produces:
  - `interface RoutedSession extends WorkoutSession { routine_style: string | null }`
  - `export async function fetchSessionsWithStyle(opts?: { onlyFinished?: boolean }): Promise<RoutedSession[]>`
  - `export function captureRoutineSnapshot(routine: RoutineDetail): RoutineSnapshot`
  - `buildSessionDetail` + `buildSessionSummary` each gain a `routine_style: string | null` field.
  - `workoutService.startSession` now stores `routine_snapshot`; `loadSessionDetail`/`listSessions` thread `routine_style`.
- Later consumed by: Task 4 (set-by-set filter reads `routine_style`), and Task 4's `setHistory` service method.

- [ ] **Step 1: Add `RoutedSession` + `fetchSessionsWithStyle` to queries**

In `frontend/src/services/queries.ts`, add a `RoutineSnapshot`-based helper. Add these exports (after `fetchSessions`, around line 31):

```ts
/** A session plus the routine style attributed to it for style-filtering:
 * from the session's own routine_snapshot when present, else the live
 * routines.style join, else null (freestyle / routine since deleted). */
export interface RoutedSession extends WorkoutSession {
  routine_style: string | null
}

/** Like fetchSessions but resolves each session's routine_style. */
export async function fetchSessionsWithStyle(opts?: { onlyFinished?: boolean }): Promise<RoutedSession[]> {
  const sessions = await fetchSessions(opts)
  if (sessions.length === 0) return []

  const styleBySession = new Map<string, string | null>()
  const liveRoutineIds = new Set<string>()

  for (const s of sessions) {
    const snap = (s as { routine_snapshot?: { style?: string | null } | null }).routine_snapshot
    if (snap && snap.style !== undefined && snap.style !== null) {
      styleBySession.set(s.id, snap.style)
    } else if (s.routine_id) {
      liveRoutineIds.add(s.routine_id)
    }
  }

  if (liveRoutineIds.size > 0) {
    const { data: routines } = await supabase
      .from('routines')
      .select('id, style')
      .in('id', [...liveRoutineIds])
    for (const s of sessions) {
      if (styleBySession.has(s.id)) continue
      if (!s.routine_id) { styleBySession.set(s.id, null); continue }
      const live = (routines ?? []).find((r) => r.id === s.routine_id)
      styleBySession.set(s.id, live?.style ?? null)
    }
  } else {
    for (const s of sessions) {
      if (!styleBySession.has(s.id)) styleBySession.set(s.id, null)
    }
  }

  return sessions.map((s, i) => ({
    ...s,
    routine_style: styleBySession.get(s.id) ?? null,
  }))
}
```

Note: `fetchSessions` returns `WorkoutSession[]` whose rows may already contain the `routine_snapshot` JSONB column (since it does `select('*')`); we read it defensively via a cast so we don't depend on the base type.

Add `supabase` is already imported at the top of `queries.ts` — confirm (`import { supabase } from '@/lib/supabase'`, line 11). No new import needed.

- [ ] **Step 2: Add `captureRoutineSnapshot` to workoutService**

In `frontend/src/services/workoutService.ts`, add a helper near `attachRoutineExercises` (after line 75). Import `RoutineSnapshot` and `TrainingStyle` symbols as needed in the type-import block (lines 6-21) — add `RoutineSnapshot` and `TrainingStyle` to that `import type` list.

```ts
/** Frozen copy of a routine taken at session-start, so later edits to the
 * template never retroactively rewrite history. */
function captureRoutineSnapshot(routine: RoutineDetail): RoutineSnapshot {
  return {
    routine_id: routine.id,
    routine_name: routine.name,
    style: routine.style,
    exercises: routine.exercises
      .sort((a, b) => a.order_index - b.order_index)
      .map((re) => ({
        exercise_id: re.exercise.id,
        name: re.exercise.name,
        muscle_group: re.exercise.muscle_group,
        equipment: re.exercise.equipment,
        order_index: re.order_index,
        target_sets: re.target_sets,
        target_rep_range: re.target_rep_range,
        target_rpe: re.target_rpe,
        rest_seconds: re.rest_seconds,
        notes: re.notes,
      })),
  }
}
```

- [ ] **Step 3: Extend `buildSessionDetail` / `buildSessionSummary` with `routine_style`**

In `frontend/src/services/derive.ts`, change `buildSessionDetail` signature to accept a routine style and emit it. Change the signature and body (lines 63-108):

```ts
export function buildSessionDetail(
  session: WorkoutSession,
  sets: WorkoutSet[],
  exerciseById: Map<string, Exercise>,
  routineName: string | null,
  routineStyle: string | null = null,
): SessionDetail {
```

Add `routine_style: routineStyle` to the returned object (after `routine_name`):

```ts
  return {
    ...session,
    routine_name: routineName,
    routine_style: routineStyle,
    groups,
    ...
  }
```

And in `buildSessionSummary` (line 110-123), add the passthrough field:

```ts
export function buildSessionSummary(detail: SessionDetail): SessionSummary {
  return {
    id: detail.id,
    session_date: detail.session_date,
    routine_name: detail.routine_name,
    routine_style: detail.routine_style,
    title: sessionTitle(detail.routine_name, detail.groups),
    ...
  }
}
```

- [ ] **Step 4: Add `routine_style` to the TypeScript domain types**

In `frontend/src/types/index.ts`:
- Add to `SessionDetail` (line 126): `routine_style: string | null`
- Add to `SessionSummary` (line 135): `routine_style: string | null`

Both mirror `routine_name` (string | null).

- [ ] **Step 5: Capture snapshot in `startSession`**

In `frontend/src/services/workoutService.ts`, replace `startSession` (lines 283-300) so it snapshots the routine for routine-based sessions:

```ts
async startSession(_userId: string, routineId: string | null): Promise<SessionDetail> {
  const { data: active } = await supabase.from('workout_sessions').select('id').is('ended_at', null).maybeSingle()
  if (active) throw new ApiError('You already have a workout in progress.', 409)

  const userId = await currentUserId()

  let snapshot: RoutineSnapshot | null = null
  if (routineId) {
    const routine = await workoutService.getRoutine(_userId, routineId)
    snapshot = captureRoutineSnapshot(routine)
  }

  const { data, error } = await supabase
    .from('workout_sessions')
    .insert({
      user_id: userId,
      routine_id: routineId,
      routine_snapshot: snapshot,
      session_date: today(),
      started_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) throw new ApiError(error.message, 500)
  return loadSessionDetail(data as WorkoutSession)
}
```

- [ ] **Step 6: Thread snapshot name+style through reads (`loadSessionDetail`, `listSessions`)**

The goal: when a session has a `routine_snapshot`, attribute routine identity (name + style) from it; else fall back to the live join.

Update `loadSessionDetail` (lines 96-104) to prefer the snapshot:

```ts
async function loadSessionDetail(session: WorkoutSession): Promise<SessionDetail> {
  const snap = (session as WorkoutSession & { routine_snapshot?: RoutineSnapshot | null }).routine_snapshot
  const [{ data: sets, error }, exercises] = await Promise.all([
    supabase.from('workout_sets').select('*').eq('session_id', session.id).order('set_number'),
    fetchExercises(),
  ])
  if (error) throw new ApiError(error.message, 500)

  if (snap) {
    // Snapshot is authoritative: no live join needed for identity.
    return derive.buildSessionDetail(
      session,
      (sets ?? []) as WorkoutSet[],
      indexById(exercises),
      snap.routine_name,
      snap.style,
    )
  }

  const name = await routineName(session.routine_id)
  return derive.buildSessionDetail(
    session,
    (sets ?? []) as WorkoutSet[],
    indexById(exercises),
    name,
    null, // pre-snapshot / freestyle: no style attribution
  )
}
```

Update `listSessions` (lines 228-268) to resolve style from snapshot-or-live. Replace the routine-name fetch + summary mapping block (lines 254-267). The current code fetches `routines (id, name)`. Extend it to include `style` and resolve per session:

```ts
    const routineIds = [...new Set(sessions.map((s) => s.routine_id).filter((id): id is string => id !== null))]
    const { data: routines } = routineIds.length > 0 ? await supabase.from('routines').select('id, name, style').in('id', routineIds) : { data: [] }
    const routineById = new Map((routines ?? []).map((r) => [r.id, { name: r.name as string, style: r.style as string | null }]))

    return sessions.map((session) => {
      const snap = (session as WorkoutSession & { routine_snapshot?: RoutineSnapshot | null }).routine_snapshot
      const live = session.routine_id ? routineById.get(session.routine_id) : undefined
      const routineName = snap ? snap.routine_name : (live?.name ?? null)
      const routineStyle = snap ? snap.style : (live?.style ?? null)
      return derive.buildSessionSummary(
        derive.buildSessionDetail(
          session,
          setsBySession.get(session.id) ?? [],
          exerciseById,
          routineName,
          routineStyle,
        ),
      )
    })
```

Also update the `Routine`-typed import/map usage: `routineById` replaces the old `nameById`; the `.style as string | null` cast is fine since the column is validated by the DB CHECK.

- [ ] **Step 7: Typecheck + lint**

Run from `frontend/`:
- `npm run build` (tsc -b) — expect success.
- `npm run lint` (oxlint) — expect no new errors.

Note: your live dev server (Vite) will hot-reload these changes.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/services/workoutService.ts frontend/src/services/queries.ts frontend/src/services/derive.ts frontend/src/types/index.ts
git commit -m "feat: snapshot routine at session start; thread routine style through reads"
```

---

### Task 4: buildSetHistory derive fn + setHistory service method

**Files:**
- Modify: `frontend/src/services/derive.ts`
- Modify: `frontend/src/services/queries.ts` (already has `RoutedSession`/`fetchSessionsWithStyle` from Task 3)
- Modify: `frontend/src/services/workoutService.ts`

**Interfaces:**
- Consumes: `RoutedSession`, `fetchSessionsWithStyle` (Task 3), `isQualifying`, `estimated1RM`, `WorkoutSet`.
- Produces:
  - `export interface SetHistoryPoint { session_id: string; date: string; by_set: Record<number, { weight_kg: number; reps: number; e1rm: number }> }`
  - `export function buildSetHistory(sessions: RoutedSession[], setsBySession: Map<string, WorkoutSet[]>, exerciseId: string, style?: string | null): SetHistoryPoint[]`
  - `workoutService.setHistory(userId, exerciseId, opts?: { style?: string | null }): Promise<SetHistoryPoint[]>`
- Later consumed by: Task 5 (`SetProgressionChart`).

- [ ] **Step 1: Add the type + derive fn**

In `frontend/src/services/derive.ts`, import `RoutedSession` from `./queries` at the type-import area. Add after `buildExerciseHistory`/`buildPlateauStatus` (near line 175):

```ts
/** Per-session, per-set progression for one exercise. qualifying sets only;
 * by_set keyed by set_number ("plot what exists" — a session with 3 sets has
 * keys 1,2,3, not 4+). style filters sessions by their attributed routine
 * style (snapshot-first). */
export function buildSetHistory(
  sessions: RoutedSession[],
  setsBySession: Map<string, WorkoutSet[]>,
  exerciseId: string,
  style?: string | null,
): SetHistoryPoint[] {
  const points: SetHistoryPoint[] = []
  for (const session of sessions) {
    if (style && session.routine_style !== style) continue
    const sets = (setsBySession.get(session.id) ?? [])
      .filter((s) => s.exercise_id === exerciseId && isQualifying(s))
      .sort((a, b) => a.set_number - b.set_number)
    if (sets.length === 0) continue
    const by_set: Record<number, { weight_kg: number; reps: number; e1rm: number }> = {}
    for (const s of sets) {
      by_set[s.set_number] = {
        weight_kg: s.weight_kg,
        reps: s.reps,
        e1rm: estimated1RM(s.weight_kg, s.reps),
      }
    }
    points.push({ session_id: session.id, date: session.session_date, by_set })
  }
  return points.sort((a, b) => a.date.localeCompare(b.date))
}
```

Define `SetHistoryPoint` in `frontend/src/types/index.ts` (after `ExerciseHistoryPoint`, line ~156):

```ts
export interface SetHistoryPoint {
  session_id: string
  date: string
  /** keyed by set index (1-based); only indices present in that session. */
  by_set: Record<number, { weight_kg: number; reps: number; e1rm: number }>
}
```

- [ ] **Step 2: Add the `setHistory` service method**

In `frontend/src/services/workoutService.ts`, inside the `workoutService` object (after `exerciseHistory`, line ~438), add:

```ts
async setHistory(
  _userId: string,
  exerciseId: string,
  opts?: { style?: string | null },
): Promise<SetHistoryPoint[]> {
  const [sessions, sets] = await Promise.all([
    fetchSessionsWithStyle(),
    fetchAllSets(),
  ])
  return derive.buildSetHistory(sessions, groupSetsBySession(sets), exerciseId, opts?.style)
}
```

Import `fetchSessionsWithStyle` alongside the other queries imports (line 4) and `SetHistoryPoint` in the type-import block (lines 6-21).

- [ ] **Step 3: Typecheck + lint**

Run from `frontend/`: `npm run build`, then `npm run lint`. Expect success.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/services/derive.ts frontend/src/services/workoutService.ts frontend/src/types/index.ts frontend/src/services/queries.ts
git commit -m "feat: set-by-set history derive + service method"
```

---

### Task 5: SetProgressionChart (Recharts multi-line)

**Files:**
- Create: `frontend/src/components/charts/SetProgressionChart.tsx`

**Interfaces:**
- Consumes: `SetHistoryPoint`, `ChartTooltip`, `TooltipRow` (from `@/components/charts/ChartTooltip`), `num`/`shortDate` helpers, Recharts `LineChart`.
- Produces: `SetProgressionChart({ points, height? }: { points: SetHistoryPoint[]; height?: number })` — one `<Line>` per set index, legend + tooltip, gaps where a set index is absent.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/charts/SetProgressionChart.tsx`:

```tsx
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTooltip, TooltipRow } from '@/components/charts/ChartTooltip'
import { shortDate } from '@/lib/date'
import { num } from '@/lib/format'
import type { SetHistoryPoint } from '@/types'

/** Epley 1RM per set-index across sessions — each working set is its own line,
 * drawn only where it was logged ("plot what exists, gap where missing"). */
export function SetProgressionChart({
  points,
  height = 280,
}: {
  points: SetHistoryPoint[]
  height?: number
}) {
  // Max set index across all sessions -> number of lines.
  const maxIndex = points.reduce((m, p) => Math.max(m, ...Object.keys(p.by_set).map(Number)), 0)

  // Row per session: { label, [setIndex]: e1rm or null }
  const data = points.map((p) => {
    const row: Record<string, number | string | null> = { label: shortDate(p.date), date: p.date }
    for (let i = 1; i <= maxIndex; i++) {
      row[String(i)] = p.by_set[i]?.e1rm ?? null
    }
    return row
  })

  const SERIES: { index: number; dash: string }[] = []
  for (let i = 1; i <= maxIndex; i++) SERIES.push({ index: i, dash: i === 1 ? '' : `${i} ${i}` })

  if (maxIndex === 0) return null

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
        <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={28}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          domain={['dataMin - 4', 'dataMax + 4']}
          width={44}
          tickFormatter={(v: number) => String(Math.round(v))}
        />
        <Tooltip
          cursor={{ stroke: 'var(--color-line-strong)' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const row = payload[0].payload
            return (
              <ChartTooltip label={label}>
                {Array.from({ length: maxIndex }, (_, k) => k + 1).map((i) => {
                  const v = (row as Record<string, unknown>)[String(i)] as number | null
                  return (
                    <TooltipRow
                      key={i}
                      color={SERIES[i - 1].dash ? 'var(--color-ink-faint)' : 'var(--color-volt)'}
                      name={`Set ${i}`}
                      value={v === null || v === undefined ? '—' : `${num(v, 1)} kg (e1RM)`}
                    />
                  )
                })}
              </ChartTooltip>
            )
          }}
        />
        {SERIES.map(({ index, dash }) => (
          <Line
            key={index}
            isAnimationActive={false}
            dataKey={String(index)}
            stroke={index === 1 ? 'var(--color-volt)' : `var(--color-liquid-${(index % 4) + 1})`}
            strokeWidth={2}
            strokeDasharray={dash || undefined}
            dot={{ r: 2, fill: 'currentColor', strokeWidth: 0 }}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
```

> The `--color-liquid-N` palette may not exist in this project's CSS. To keep the build safe, replace the stroke expression with a stable inline palette defined in the file so we don't depend on unknown CSS vars:

Replace the stroke expression in the `.map` with a local palette:

```tsx
  const PALETTE = ['var(--color-volt)', 'var(--color-liquid-2)', 'var(--color-liquid-3)', 'var(--color-liquid-4)']
```

and use `stroke={PALETTE[(index - 1) % PALETTE.length]}`. If `--color-liquid-*` are not defined in your CSS, use literal hexes instead (e.g. `#38bdf8`, `#a78bfa`, `#34d399`, `#fbbf24`) — the only requirement is each set line is visually distinct from the top-set chart's volt line.

- [ ] **Step 2: Typecheck + lint**

Run from `frontend/`: `npm run build`, then `npm run lint`. Fix any unused-import lint errors (e.g. remove `date`/`shortDate` if unused — `shortDate` is used for `label`, keep it; drop `date` if unused).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/charts/SetProgressionChart.tsx
git commit -m "feat: set-by-set progression chart"
```

---

### Task 6: Style dropdown + wire both charts into the Progression tab

**Files:**
- Modify: `frontend/src/pages/WorkoutHistoryPage.tsx`

**Interfaces:**
- Consumes: `workoutService.exerciseHistory`, `workoutService.setHistory`, `SetProgressionChart`, `TRAINING_STYLES`, `STYLE_LABEL`, `Select`.
- Produces: a style `<Select>` on the Progression tab; `ExerciseProgression` gains a `routineStyle?: string | null` prop; a new `SetProgression` card below the existing top-set card.

- [ ] **Step 1: Add style state + dropdown to `ProgressionTab`**

Replace `ProgressionTab` (lines 263-314) so it holds a style filter and passes it to both children:

```tsx
function ProgressionTab({ userId }: { userId: string }) {
  const exercises = useAsync(() => workoutService.trainedExercises(userId), [userId])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [style, setStyle] = useState<string>('')

  const exerciseId = selectedId ?? exercises.data?.[0]?.id ?? null
  const selected = exercises.data?.find((e) => e.id === exerciseId) ?? null

  if (exercises.loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-[380px] w-full" />
      </div>
    )
  }

  if (exercises.error) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={<AlertTriangle className="size-5" />}
          title="Couldn't load your exercises"
          description={exercises.error}
          action={<Button onClick={exercises.reload}>Try again</Button>}
        />
      </Card>
    )
  }

  if (!exercises.data || exercises.data.length === 0 || !exerciseId) {
    return (
      <Card>
        <EmptyState
          icon={<LineChart className="size-5" />}
          title="No progression data yet"
          description="Log a few sessions and each lift gets its own progress curves, PR markers and plateau check."
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <ExercisePickerRow
          exercises={exercises.data}
          value={exerciseId}
          onChange={setSelectedId}
        />
        <StylePicker value={style} onChange={setStyle} />
      </div>
      {selected && (
        <ExerciseProgression
          key={`${selected.id}:${style}`}
          userId={userId}
          exercise={selected}
          routineStyle={style === '' ? null : style}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add the `StylePicker` component**

Add below `ExercisePickerRow` (after line 354):

```tsx
function StylePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label htmlFor="progression-style" className="flex items-center gap-3">
      <span className="text-[13px] font-medium text-ink-muted">Style</span>
      <div className="w-44">
        <Select id="progression-style" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">All styles</option>
          {TRAINING_STYLES.map((s) => (
            <option key={s} value={s}>
              {STYLE_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>
    </label>
  )
}
```

Import `TRAINING_STYLES` from `@/types` and `STYLE_LABEL` from `@/lib/format` at the top of the file (they're already partially imported — `MUSCLE_COLOR, MUSCLE_LABEL` come from `@/lib/format` on line 26; extend that import). `Select` is already imported (line 18).

- [ ] **Step 3: Thread `routineStyle` into `ExerciseProgression` and filter `exerciseHistory`**

Change `ExerciseProgression` signature (line 356) and the `history` hook (line 357):

```tsx
function ExerciseProgression({
  userId,
  exercise,
  routineStyle,
}: {
  userId: string
  exercise: Exercise
  routineStyle: string | null
}) {
  const history = useAsync(
    () => workoutService.exerciseHistory(userId, exercise.id, { style: routineStyle }),
    [userId, exercise.id, routineStyle],
  )
  const plateau = useAsync(
    () => workoutService.plateauStatus(userId, exercise.id),
    [userId, exercise.id],
  )
  ...
```

Update `exerciseHistory` in `workoutService.ts` to accept and apply the filter:

```ts
async exerciseHistory(
  _userId: string,
  exerciseId: string,
  opts?: { style?: string | null },
): Promise<ExerciseHistoryPoint[]> {
  const [sessions, sets] = await Promise.all([
    fetchSessionsWithStyle(),
    fetchAllSets(),
  ])
  return derive.buildExerciseHistory(sessions, groupSetsBySession(sets), exerciseId, opts?.style)
}
```

Then update `derive.buildExerciseHistory` (lines 126-158) to accept optional `style` and `RoutedSession` and filter:

```ts
export function buildExerciseHistory(
  sessions: RoutedSession[],
  setsBySession: Map<string, WorkoutSet[]>,
  exerciseId: string,
  style?: string | null,
) {
  const points: ExerciseHistoryPoint[] = []
  for (const session of sessions) {
    if (style && session.routine_style !== style) continue
    ...
  }
  return points.sort((a, b) => a.date.localeCompare(b.date))
}
```

Change its `sessions` param type from `WorkoutSession[]` to `RoutedSession[]` (import `RoutedSession` in derive.ts). Its callers — `plateauStatus` (workoutService.ts:444), `buildAllPlateaus` (derive.ts:192), `buildPlateauStatus` callers — pass plain sessions. Those call sites already receive `WorkoutSession[]`; to keep types compatible, either:
- Make `buildExerciseHistory` accept `Array<WorkoutSession & { routine_style?: string | null }>` (structural, so both plain and routed sessions satisfy it), then read `session.routine_style` defensively. This is the least disruptive option.

Use this signature:

```ts
export function buildExerciseHistory(
  sessions: Array<WorkoutSession & { routine_style?: string | null }>,
  setsBySession: Map<string, WorkoutSet[]>,
  exerciseId: string,
  style?: string | null,
) {
```

and filter with `if (style && session.routine_style !== style) continue`. This keeps `buildAllPlateaus`/`plateauStatus` working unchanged (their sessions lack `routine_style`, so `undefined !== style` only skips when a style is requested — which those callers never do).

- [ ] **Step 4: Add the set-by-set card to `ExerciseProgression`**

After the existing top-set `<Card>` (the one containing `ExerciseProgressChart`, ending around line 454), before `<SessionBreakdown>`, add a set-progression card using the new chart. `ExerciseProgression` needs to also fetch set history, so add a second `useAsync` and render it:

Add near the other hooks (after the `plateau` hook, line 361-364):

```tsx
  const setHistory = useAsync(
    () => workoutService.setHistory(userId, exercise.id, { style: routineStyle }),
    [userId, exercise.id, routineStyle],
  )
```

Add after the top-set card (before `<SessionBreakdown points={points} />`):

```tsx
      <Card>
        <CardHeader
          title="Set by set"
          subtitle="Estimated 1RM for each working set across sessions — see the whole ladder, not just the top."
        />
        <CardBody>
          {setHistory.loading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : setHistory.error ? (
            <EmptyState icon={<AlertTriangle className="size-5" />} title="Couldn't load set data" description={setHistory.error} />
          ) : (setHistory.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={<LineChart className="size-5" />}
              title="No set-by-set data for this filter"
              description="Warm-up and drop sets are excluded. Pick 'All styles' or log working sets to see the ladder."
            />
          ) : (
            <SetProgressionChart points={setHistory.data!} />
          )}
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-[11.5px] text-ink-muted">
            {Array.from({ length: maxSetIndex(setHistory.data ?? []) }, (_, k) => k + 1).map((i) => (
              <span key={i} className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-current" aria-hidden /> Set {i}
              </span>
            ))}
          </p>
        </CardBody>
      </Card>
```

Import `SetProgressionChart` at the top (after `ExerciseProgressChart` import, line 20). Add a tiny helper near `MiniStat`:

```tsx
function maxSetIndex(points: SetHistoryPoint[]): number {
  return points.reduce((m, p) => Math.max(m, ...Object.keys(p.by_set).map(Number)), 0)
}
```

Import `SetHistoryPoint` type into the file's type-import from `@/types` (extend line 30).

- [ ] **Step 5: Typecheck + lint + build**

Run from `frontend/`: `npm run build` then `npm run lint`. Fix any type mismatches (double-check `routine_style` exists on `SessionSummary`/`SessionDetail` from Task 3, and that all `buildExerciseHistory` callers still typecheck).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/WorkoutHistoryPage.tsx frontend/src/services/workoutService.ts frontend/src/services/derive.ts frontend/src/components/charts/SetProgressionChart.tsx
git commit -m "feat: style filter + set-by-set view in progression tab"
```

---

### Task 7: Routine editor style dropdown + cards/detail chip

**Files:**
- Modify: `frontend/src/pages/RoutineEditorPage.tsx`
- Modify: `frontend/src/pages/RoutinesPage.tsx`
- Modify: `frontend/src/pages/RoutineDetailPage.tsx`
- Modify: `frontend/src/services/workoutService.ts` (`RoutineInput` plus create/update to persist `style`)

**Interfaces:**
- Consumes: `TrainingStyle`, `TRAINING_STYLES`, `STYLE_LABEL`, `Field`/`Select`, `Badge`.
- Produces: `RoutineInput.style: TrainingStyle | null`; create/update persist it.

- [ ] **Step 1: Add `style` to `RoutineInput` and persist it**

In `frontend/src/services/workoutService.ts`, update the `RoutineInput` interface (lines 32-43):

```ts
export interface RoutineInput {
  name: string
  style: TrainingStyle | null
  notes: string | null
  exercises: ...
}
```

Import `TrainingStyle` in the type-import block. Update `createRoutine` (line 189) and `updateRoutine` (line 205) to include `style`:

```ts
.insert({ user_id: userId, name: input.name.trim(), style: input.style ?? null, notes: input.notes })
```

```ts
.update({ name: input.name.trim(), style: input.style ?? null, notes: input.notes, updated_at: new Date().toISOString() })
```

- [ ] **Step 2: Editor — add the style dropdown**

In `RoutineEditorPage.tsx`:
- Import `TRAINING_STYLES` from `@/types` and `STYLE_LABEL` from `@/lib/format`.
- Add `const [style, setStyle] = useState<TrainingStyle | ''>('')`.
- In the load `useEffect`, set `setStyle(routine.data.style ?? '')` alongside `setName`/`setNotes` (around line 58).
- In `handleSave`, add `style: style === '' ? null : (style as TrainingStyle)` to the `RoutineInput` (line 124).
- In the name/notes `Card` (lines 166-186), add a style field next to Notes. Add a third field in the `sm:grid-cols-2` grid (or its own row):

```tsx
<Field label="Style (optional)" hint="Compares this routine's lifts within the same program style.">
  <Select
    value={style}
    onChange={(e) => setStyle(e.target.value as TrainingStyle | '')}
  >
    <option value="">No style</option>
    {TRAINING_STYLES.map((s) => (
      <option key={s} value={s}>{STYLE_LABEL[s]}</option>
    ))}
  </Select>
</Field>
```

Import `Select` from `@/components/ui/Field` (line 8 currently imports `Field, Input, NumberField` — add `Select`).

- [ ] **Step 3: Cards — add the style chip**

In `RoutinesPage.tsx`, import `STYLE_LABEL` (extend line 25) and `Badge` (already imported, line 16). In the routine card, inside the muscle-group row area (after line 137-144), add a style chip when set:

```tsx
{routine.style && (
  <Badge tone="info" className="mr-1 mb-0.5">{STYLE_LABEL[routine.style]}</Badge>
)}
```

Place it just above/next to the muscle dots row so the tag reads: e.g. inside the `mt-3 flex flex-wrap gap-1.5` div, prepend the `<Badge>` before the `muscles.map`. `Routine` type already has `style` from Task 1.

- [ ] **Step 4: Detail — add the style chip**

In `RoutineDetailPage.tsx`, import `STYLE_LABEL` (extend line 24; `Badge` already imported line 13). In the `PageHeader` subtitle (around line 98), add a chip when set:

```tsx
{r.style && <Badge tone="info">{STYLE_LABEL[r.style]}</Badge>}
```

Place it among the existing badges (after the `{r.exercises.length} exercises` badge, line 99).

- [ ] **Step 5: Typecheck + lint + build**

Run from `frontend/`: `npm run build`, `npm run lint`. Verify no orphan references to `style` on `Routine`/`RoutineDetail`/`RoutineInput`, and that the editor's save path passes `style` through.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/RoutineEditorPage.tsx frontend/src/pages/RoutinesPage.tsx frontend/src/pages/RoutineDetailPage.tsx frontend/src/services/workoutService.ts
git commit -m "feat: routine style tag — editor dropdown, cards and detail chip"
```

---

### Task 8: End-to-end verification + demo

**Files:** none (verification only).

- [ ] **Step 1: Full lint + typecheck + build**

From `frontend/`: run `npm run lint`, then `npm run build`. Both must pass cleanly.

- [ ] **Step 2: Confirm dev server reflects changes**

With Vite running at `http://localhost:5173`, hard-reload. Confirm no console errors (`window` → browser console). The dev server hot-reloads the edited files.

- [ ] **Step 3: Manual demo checklist (against the live app)**

1. **Style tag, create:** Routines → New → name it, pick a style (e.g. "Push"), add ≥1 exercise, Create. Confirm the card shows the "Push" chip.
2. **Style tag, edit:** open that routine → Edit → change style to "Upper" → Save. Confirm chip updates.
3. **Snapshot on start:** from the routine, Start workout, log a few working sets across at least one exercise (get 2-3 sessions' worth over time), Finish the workout. Confirm the session's name comes from the routine.
4. **Snapshot protection:** edit the routine (change exercises/order/name), then open the *older* session in Workout History → the older session's title/routine attribution should NOT have changed (snapshot wins over live routine).
5. **Set-by-set chart:** Workout History → Progression → pick an exercise you've done for multiple sessions → the "Set by set" card shows one line per set index, with gaps where a session had fewer sets, and each line labeled Set 1/2/3…
6. **Style filter:** on the Progression tab, set the Style dropdown to a style you actually used → both the top-set chart and the Set-by-set card filter to only those sessions. "All styles" restores everything.

- [ ] **Step 4: Commit any demo-fix changes as a final commit**

If the demo surfaced a defect, fix + commit it; otherwise no-op.

---

## Self-Review

**Spec coverage:**
- Item 1 (set-by-set): Task 4 (derive + service) + Task 5 (chart) + Task 6 (wiring). R1.1-R1.5 all covered — exercise picker reused, one line per set, e1RM metric, warm-up/drop excluded, style filter shared (R1.5/R2.4).
- Item 2 (style): Task 1 (type + label), Task 2 (migration/column), Task 7 (editor dropdown + cards/detail chip + persist). R2.1-R2.4 covered. Style filter on both charts = Task 6.
- Item 3 (snapshot): Task 2 (column), Task 3 (capture at start + read fallback). R3.1-R3.5 covered: JSONB column, snapshot at `startSession`, prefer-snapshot-on-read/fallback, no destructive backfill (default), zero retroactive effect (R3.5) because snapshot is authoritative.
- Scope guard: items 4-5 excluded; RouteGuard untouched; migration additive.

**Placeholder scan:** every code step is concrete code — no "TBD"/"handle edge cases". The one variance flagged (CSS palette var names for set-line colors) is resolved inline with a defensive palette fallback rather than a TODO.

**Type consistency:** `TrainingStyle` / `TRAINING_STYLES` / `STYLE_LABEL` introduced once in Task 1 and reused with matching names. `Routine.style` matches the DB column. `routine_style` on `SessionSummary`/`SessionDetail` matches what derive emits. `RoutedSession.routine_style`, `buildSetHistory`/`SetHistoryPoint`, `setHistory`, and `captureRoutineSnapshot` are each defined exactly once with a single spelling used across tasks. `RoutineSnapshot.exercises` field names (`exercise_id`, `name`, `muscle_group`, `equipment`, `order_index`, `target_sets`, `target_rep_range`, `target_rpe`, `rest_seconds`, `notes`) match both the snapshot JSON in the spec and the `RoutineExercise`/`Exercise` types they're built from and read into. `buildExerciseHistory` takes a structural `Array<WorkoutSession & { routine_style?: ... }>` so existing callers (plateauStatus/buildAllPlateaus) remain valid.

**Ordering rationale:** style infra first (types/migration) because both charts and the snapshot depend on it; snapshot capture next so new sessions get frozen history before the chart features read them; then derive + chart + wiring; editor/cards last as pure UI.
