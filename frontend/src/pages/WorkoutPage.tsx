import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Dumbbell,
  Flag,
  ListPlus,
  Pencil,
  Play,
  Plus,
  Timer,
  Trash2,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { Field, Input, NumberField, Select } from '@/components/ui/Field'
import { ExercisePicker } from '@/components/exercises/ExercisePicker'
import { RestTimerBar } from '@/components/workout/RestTimerBar'
import { useAsync, useAction } from '@/hooks/useAsync'
import { useAuthStore } from '@/stores/authStore'
import { useRestTimerStore } from '@/stores/restTimerStore'
import { useToastStore } from '@/stores/toastStore'
import { useWorkoutStore } from '@/stores/workoutStore'
import { workoutService } from '@/services'
import { friendlyDate, durationLabel } from '@/lib/date'
import { num, volume as volumeFmt } from '@/lib/format'
import { MUSCLE_COLOR, MUSCLE_LABEL, SET_TYPE_LABEL } from '@/lib/format'
import type { LogSetPayload } from '@/services'
import type {
  Exercise,
  RoutineDetail,
  RoutineExercise,
  SessionDetail,
  SetType,
  WorkoutSet,
} from '@/types'

export function WorkoutPage() {
  const user = useAuthStore((s) => s.user)
  if (!user) return null
  return <WorkoutView userId={user.id} />
}

function WorkoutView({ userId }: { userId: string }) {
  const [version, setVersion] = useState(0)
  const active = useAsync(() => workoutService.getActiveSession(userId), [userId, version])

  const onStarted = () => setVersion((v) => v + 1)

  if (!active.data && active.loading) return <WorkoutSkeleton />

  if (active.error && !active.data) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Workout" />
        <Card className="p-6">
          <EmptyState
            icon={<AlertTriangle className="size-5" />}
            title="Couldn't load your workout"
            description={active.error}
            action={<Button onClick={active.reload}>Try again</Button>}
          />
        </Card>
      </div>
    )
  }

  if (active.data) {
    return (
      <ActiveWorkout
        key={active.data.id}
        session={active.data}
        userId={userId}
        onFinished={() => {
          setVersion((v) => v + 1)
        }}
      />
    )
  }

  return <StartWorkout userId={userId} onStarted={onStarted} />
}

function WorkoutSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Start screen
// ---------------------------------------------------------------------------

function StartWorkout({ userId, onStarted }: { userId: string; onStarted: () => void }) {
  const push = useToastStore((s) => s.push)
  const setActive = useWorkoutStore((s) => s.setActive)
  const navigate = useNavigate()
  const routines = useAsync(() => workoutService.listRoutines(userId), [userId])
  const start = useAction((routineId: string | null) => workoutService.startSession(userId, routineId))

  async function handleStart(routineId: string | null, name: string) {
    const session = await start.run(routineId)
    if (session) {
      setActive(true)
      push(`Started ${name}`, 'success')
      onStarted()
      navigate('/workout', { replace: true })
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Workout"
        subtitle="Start a routine or go freestyle — your session autosaves every set."
        actions={
          <Button
            onClick={() => void handleStart(null, 'a free workout')}
            loading={start.loading}
            data-start-free
          >
            <Play className="size-4" /> Free workout
          </Button>
        }
      />

      <div className="grid gap-4">
        {routines.loading && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {!routines.loading && routines.error && (
          <Card className="p-6">
            <EmptyState
              icon={<AlertTriangle className="size-5" />}
              title="Couldn't load your routines"
              description={routines.error}
              action={<Button onClick={routines.reload}>Try again</Button>}
            />
          </Card>
        )}

        {!routines.loading && !routines.error && (routines.data?.length ?? 0) === 0 && (
          <Card>
            <CardHeader
              title="No routines yet"
              subtitle="Build a routine once, then start it here whenever you train."
              icon={<ListPlus className="size-4" />}
              action={
                <Button variant="outline" size="sm" onClick={() => navigate('/routines/new')}>
                  <Plus className="size-3.5" /> Build one
                </Button>
              }
            />
          </Card>
        )}

        {routines.data && routines.data.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {routines.data.map((routine) => (
              <RoutineCard
                key={routine.id}
                routine={routine}
                starting={start.loading}
                onStart={() => void handleStart(routine.id, routine.name)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function RoutineCard({
  routine,
  onStart,
  starting,
}: {
  routine: RoutineDetail
  onStart: () => void
  starting: boolean
}) {
  const navigate = useNavigate()
  const muscles = [...new Set(routine.exercises.map((re) => re.exercise.muscle_group))]
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{routine.name}</h3>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">
            {routine.exercises.length} exercise{routine.exercises.length === 1 ? '' : 's'}
            {routine.exercises.reduce((s, re) => s + re.target_sets, 0)} sets
          </p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-muted">
          <Dumbbell className="size-4" />
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {muscles.map((g) => (
          <span key={g} className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-muted">
            <span className="size-1.5 rounded-full" style={{ background: MUSCLE_COLOR[g] }} aria-hidden />
            {MUSCLE_LABEL[g]}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-1 items-end justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate(`/routines/${routine.id}`)}
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-volt hover:text-volt-dim"
        >
          View <ChevronRight className="size-3.5" />
        </button>
        <Button size="sm" onClick={onStart} loading={starting}>
          <Play className="size-3.5" /> Start
        </Button>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Active session
// ---------------------------------------------------------------------------

function ActiveWorkout({
  session,
  userId,
  onFinished,
}: {
  session: SessionDetail
  userId: string
  onFinished: () => void
}) {
  const push = useToastStore((s) => s.push)
  const setActive = useWorkoutStore((s) => s.setActive)
  const navigate = useNavigate()
  const [picked, setPicked] = useState<Exercise[]>([])
  const [adding, setAdding] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [notes, setNotes] = useState('')
  const stopRest = useRestTimerStore((s) => s.stop)

  const routine = useAsync(
    () => (session.routine_id ? workoutService.getRoutine(userId, session.routine_id) : Promise.resolve(null)),
    [session.routine_id, userId],
  )

  const finish = useAction((n: string | null) => workoutService.completeSession(userId, session.id, n))
  const discard = useAction(() => workoutService.discardSession(userId, session.id))

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    setActive(true)
    return () => setActive(false)
  }, [setActive])

  // Leaving the workout (finish, discard, unmount) should never leave a rest
  // countdown running behind other screens.
  useEffect(() => () => stopRest(), [stopRest])

  const rows = useMemo(() => {
    const out: { exercise: Exercise; target: RoutineExercise | null }[] = []
    if (routine.data) {
      for (const re of routine.data.exercises) {
        out.push({ exercise: re.exercise, target: re })
      }
    } else {
      for (const g of session.groups) {
        if (!out.some((r) => r.exercise.id === g.exercise.id)) {
          out.push({ exercise: g.exercise, target: null })
        }
      }
    }
    for (const ex of picked) {
      if (!out.some((r) => r.exercise.id === ex.id)) out.push({ exercise: ex, target: null })
    }
    return out
  }, [routine.data, session.groups, picked])

  const elapsedMinutes = session.started_at
    ? Math.max(0, Math.floor((now - new Date(session.started_at).getTime()) / 60000))
    : null

  const onDataChanged = () => {
    onFinished()
  }

  async function handleFinish() {
    const result = await finish.run(notes.trim() === '' ? null : notes.trim())
    if (result) {
      setActive(false)
      stopRest()
      push(
        `Finished — ${result.total_sets} sets, ${volumeFmt(result.total_volume_kg)}${
          result.pr_count > 0 ? `, ${result.pr_count} PR${result.pr_count === 1 ? '' : 's'}` : ''
        }`,
        'success',
      )
      navigate(`/workout/${result.id}`, { replace: true })
    }
  }

  async function handleDiscard() {
    const ok = await discard.run()
    if (ok === null) return
    setActive(false)
    stopRest()
    setDiscarding(false)
    push('Workout discarded', 'info')
    onFinished()
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={session.routine_name ?? 'Free workout'}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5 text-volt" />
              <span className="font-semibold tabular-nums text-volt">
                {durationLabel(elapsedMinutes)}
              </span>
              elapsed
            </span>
            <Badge dot>Live</Badge>
            {session.total_sets > 0 && (
              <span className="text-ink-faint">
                {session.total_sets} {session.total_sets === 1 ? 'set' : 'sets'} ·{' '}
                {volumeFmt(session.total_volume_kg)} ·{' '}
                {session.pr_count > 0
                  ? `${session.pr_count} ${session.pr_count === 1 ? 'PR' : 'PRs'}`
                  : 'no PRs yet'}
              </span>
            )}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="danger" size="sm" onClick={() => setDiscarding(true)}>
              <Trash2 className="size-3.5" /> Discard
            </Button>
            <Button size="sm" onClick={() => setFinishing(true)}>
              <Flag className="size-3.5" /> Finish
            </Button>
          </div>
        }
      />

      {finishing && (
        <Card className="border-volt/30">
          <CardBody className="flex flex-col gap-3">
            <p className="text-[14px] font-semibold text-ink">Finish this workout</p>
            <Field label="Notes (optional)" hint="How did it feel? Any niggles to remember next time?">
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Left shoulder felt tight on pressing…"
              />
            </Field>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setFinishing(false)}>
                Keep training
              </Button>
              <Button size="sm" onClick={() => void handleFinish()} loading={finish.loading}>
                <CheckCircle2 className="size-3.5" /> Finish workout
              </Button>
            </div>
            {finish.error && <p className="text-[12.5px] text-danger">{finish.error}</p>}
          </CardBody>
        </Card>
      )}

      {rows.length === 0 && !adding && (
        <Card>
          <EmptyState
            icon={<Dumbbell className="size-5" />}
            title="Nothing logged yet"
            description="Add an exercise and start logging sets. Every set is saved instantly."
            action={
              <Button onClick={() => setAdding(true)}>
                <Plus className="size-4" /> Add exercise
              </Button>
            }
          />
        </Card>
      )}

      {adding && (
        <ExercisePicker
          userId={userId}
          onPick={(ex) => {
            setPicked((p) => (p.some((e) => e.id === ex.id) ? p : [...p, ex]))
            setAdding(false)
          }}
          onClose={() => setAdding(false)}
        />
      )}

      {rows.map((row) => (
        <ExerciseRow
          key={row.exercise.id}
          sessionId={session.id}
          userId={userId}
          exercise={row.exercise}
          target={row.target}
          sets={session.groups.find((g) => g.exercise.id === row.exercise.id)?.sets ?? []}
          onChanged={onDataChanged}
          onToast={push}
        />
      ))}

      {rows.length > 0 && (
        <Button variant="outline" className="self-start" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add exercise
        </Button>
      )}

      <RestTimerBar />

      <ConfirmDialog
        open={discarding}
        onCancel={() => setDiscarding(false)}
        onConfirm={() => void handleDiscard()}
        loading={discard.loading}
        error={discard.error}
        tone="danger"
        title="Discard this workout?"
        description={
          session.total_sets > 0
            ? `${session.total_sets} logged ${session.total_sets === 1 ? 'set' : 'sets'} and ${volumeFmt(
                session.total_volume_kg,
              )} of volume will be deleted. This can't be undone.`
            : "Nothing has been logged yet, so there's nothing to lose."
        }
        confirmLabel="Discard workout"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Exercise row (sets + log form)
// ---------------------------------------------------------------------------

function ExerciseRow({
  sessionId,
  userId,
  exercise,
  target,
  sets,
  onChanged,
  onToast,
}: {
  sessionId: string
  userId: string
  exercise: Exercise
  target: RoutineExercise | null
  sets: WorkoutSet[]
  onChanged: () => void
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void
}) {
  const [weight, setWeight] = useState<number | null>(null)
  const [reps, setReps] = useState<number | null>(null)
  const [rpe, setRpe] = useState<number | null>(null)
  const [setType, setSetType] = useState<SetType>('normal')
  const [editing, setEditing] = useState<WorkoutSet | null>(null)
  const [showSets, setShowSets] = useState(sets.length > 0)
  const [pendingDelete, setPendingDelete] = useState<WorkoutSet | null>(null)
  const startRest = useRestTimerStore((s) => s.start)

  // Seeded from routine_exercises.rest_seconds; freestyle work falls back to 90 s.
  const restSeconds = target?.rest_seconds ?? 90

  const previous = useAsync(
    () => workoutService.lastPerformance(userId, exercise.id, sessionId),
    [userId, exercise.id, sessionId],
  )
  const log = useAction((p: Omit<LogSetPayload, 'exercise_id'>) =>
    workoutService.logSet(userId, sessionId, { ...p, exercise_id: exercise.id }),
  )
  const update = useAction((setId: string, patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps' | 'rpe' | 'set_type'>>) =>
    workoutService.updateSet(userId, sessionId, setId, patch),
  )
  const remove = useAction((setId: string) => workoutService.deleteSet(userId, sessionId, setId))

  function resetForm() {
    setWeight(null)
    setReps(null)
    setRpe(null)
    setSetType('normal')
    setEditing(null)
  }

  function beginEdit(set: WorkoutSet) {
    setEditing(set)
    setWeight(set.weight_kg)
    setReps(set.reps)
    setRpe(set.rpe)
    setSetType(set.set_type)
  }

  async function submit() {
    if (weight === null || weight <= 0 || reps === null || reps <= 0) return
    if (editing) {
      const ok = await update.run(editing.id, { weight_kg: weight, reps, rpe, set_type: setType })
      if (ok) {
        onToast('Set updated', 'info')
        resetForm()
        onChanged()
      }
    } else {
      const result = await log.run({ weight_kg: weight, reps, rpe, set_type: setType })
      if (result) {
        if (result.is_pr) {
          onToast(`PR! ${num(result.set.weight_kg, 1)} kg × ${result.set.reps}`, 'success')
        }
        // Drop sets run straight into the next set, so no rest is started.
        if (setType !== 'drop') {
          const seconds = setType === 'warmup' ? Math.min(restSeconds, 60) : restSeconds
          startRest(seconds, exercise.name)
        }
        resetForm()
        setShowSets(true)
        onChanged()
      }
    }
  }

  return (
    <Card>
      <CardHeader
        title={
          <div className="flex items-center gap-2.5">
            <span
              className="size-2 rounded-full"
              style={{ background: MUSCLE_COLOR[exercise.muscle_group] }}
              aria-hidden
            />
            <span>{exercise.name}</span>
            {sets.some((s) => s.is_pr) && <Badge tone="volt">PR</Badge>}
          </div>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2">
            <Badge tone="neutral">{MUSCLE_LABEL[exercise.muscle_group]}</Badge>
            {target ? (
              <span>
                {target.target_sets} × {target.target_rep_range}
                {target.target_rpe !== null && ` @ RPE ${target.target_rpe}`}
              </span>
            ) : (
              <span>Working sets</span>
            )}
            <button
              type="button"
              onClick={() => startRest(restSeconds, exercise.name)}
              title="Start the rest timer for this exercise"
              className="inline-flex items-center gap-1 text-ink-faint underline-offset-2 hover:text-volt hover:underline"
            >
              <Timer className="size-3.5" aria-hidden />
              {restSeconds}s rest
            </button>
            {sets.length > 0 && (
              <button
                type="button"
                onClick={() => setShowSets((v) => !v)}
                className="text-volt underline-offset-2 hover:underline"
              >
                {showSets ? 'Hide' : 'Show'} sets ({sets.length})
              </button>
            )}
          </span>
        }
        action={
          sets.length > 0 ? (
            <span className="text-[12.5px] tabular-nums text-ink-faint">
              {sets.reduce((s, set) => s + set.weight_kg * set.reps, 0).toLocaleString('en-GB')} kg
            </span>
          ) : undefined
        }
      />

      <CardBody className="flex flex-col gap-3">
        {target?.notes && (
          <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] leading-snug text-ink-muted">
            <span className="font-semibold text-ink">Cue · </span>
            {target.notes}
          </p>
        )}

        {previous.data && previous.data.sets.length > 0 && (
          <p className="text-[12px] text-ink-faint">
            Last time ({friendlyDate(previous.data.date)}):{' '}
            {previous.data.sets
              .filter((s) => s.set_type === 'normal' || s.set_type === 'failure')
              .map((s) => `${num(s.weight_kg, 1)} kg × ${s.reps}`)
              .join(' · ')}
          </p>
        )}

        {showSets && sets.length > 0 && (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {sets.map((set) => (
              <li key={set.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-5 shrink-0 text-[12px] font-semibold tabular-nums text-ink-faint">
                  {set.set_number}
                </span>
                <span className="text-[13.5px] font-medium tabular-nums text-ink">
                  {num(set.weight_kg, 1)} kg × {set.reps}
                </span>
                {set.set_type !== 'normal' && <Badge tone="neutral">{SET_TYPE_LABEL[set.set_type]}</Badge>}
                {set.rpe !== null && (
                  <span className="text-[12px] text-ink-faint">RPE {set.rpe}</span>
                )}
                {set.is_pr && <Badge tone="volt">PR</Badge>}
                <span className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => beginEdit(set)}
                    aria-label={`Edit set ${set.set_number}`}
                    className="flex size-7 items-center justify-center rounded-md text-ink-faint hover:bg-surface-2 hover:text-ink"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(set)}
                    aria-label={`Delete set ${set.set_number}`}
                    className="flex size-7 items-center justify-center rounded-md text-ink-faint hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          className="grid grid-cols-2 items-end gap-2.5 sm:grid-cols-[1fr_1fr_1fr_auto_auto]"
        >
          <Field label="Weight">
            <NumberField
              value={weight}
              onValueChange={setWeight}
              suffix="kg"
              placeholder="0"
              min={0}
              autoFocus={sets.length === 0}
            />
          </Field>
          <Field label="Reps">
            <NumberField value={reps} onValueChange={setReps} suffix="reps" placeholder="0" min={1} />
          </Field>
          <Field label="RPE" hint={editing ? 'Editing set' : undefined}>
            <NumberField value={rpe} onValueChange={setRpe} placeholder="—" min={1} />
          </Field>
          <Field label="Type">
            <Select
              value={setType}
              onChange={(e) => setSetType(e.target.value as SetType)}
              aria-label="Set type"
            >
              {(['normal', 'warmup', 'drop', 'failure'] as SetType[]).map((t) => (
                <option key={t} value={t}>
                  {SET_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-center gap-1.5 pb-0.5">
            {editing && (
              <Button variant="ghost" size="sm" type="button" onClick={resetForm} aria-label="Cancel editing">
                <X className="size-4" />
              </Button>
            )}
            <Button size="sm" type="submit" loading={log.loading || update.loading}>
              {editing ? 'Save' : <Plus className="size-4" />}
            </Button>
          </div>
          {log.error && (
            <p role="alert" className="col-span-full text-[12.5px] text-danger">
              {log.error}
            </p>
          )}
          {update.error && (
            <p role="alert" className="col-span-full text-[12.5px] text-danger">
              {update.error}
            </p>
          )}
        </form>
      </CardBody>

      <ConfirmDialog
        open={pendingDelete !== null}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return
          void remove.run(pendingDelete.id).then((ok) => {
            if (ok === null) return
            setPendingDelete(null)
            onToast('Set deleted — PRs recalculated', 'info')
            onChanged()
          })
        }}
        loading={remove.loading}
        error={remove.error}
        title={`Delete set ${pendingDelete?.set_number ?? ''}?`}
        description={
          pendingDelete
            ? `${num(pendingDelete.weight_kg, 1)} kg × ${pendingDelete.reps} on ${exercise.name}. Remaining sets are renumbered and personal records are recalculated.`
            : undefined
        }
        confirmLabel="Delete set"
      />
    </Card>
  )
}
