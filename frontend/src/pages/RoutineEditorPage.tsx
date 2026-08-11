import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, GripVertical, Plus, Save, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { Field, Input, NumberField } from '@/components/ui/Field'
import { ExercisePicker } from '@/components/exercises/ExercisePicker'
import { useAsync, useAction } from '@/hooks/useAsync'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { workoutService } from '@/services'
import { MUSCLE_COLOR, MUSCLE_LABEL } from '@/lib/format'
import type { Exercise } from '@/types'
import type { RoutineInput } from '@/services'

interface Row {
  exercise: Exercise
  target_sets: number
  target_rep_range: string
  target_rpe: number | null
  rest_seconds: number
  notes: string
}

export function RoutineEditorPage() {
  const user = useAuthStore((s) => s.user)
  const { routineId } = useParams()
  if (!user) return null
  return <EditorView userId={user.id} routineId={routineId ?? null} />
}

function EditorView({ userId, routineId }: { userId: string; routineId: string | null }) {
  const editing = routineId !== null
  const navigate = useNavigate()
  const push = useToastStore((s) => s.push)

  const routine = useAsync(
    () => (editing ? workoutService.getRoutine(userId, routineId) : Promise.resolve(null)),
    [userId, routineId, editing],
  )

  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [errors, setErrors] = useState<{ name?: string; exercises?: string }>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!editing) {
      setLoaded(true)
      return
    }
    if (routine.data && !loaded) {
      setName(routine.data.name)
      setNotes(routine.data.notes ?? '')
      setRows(
        routine.data.exercises.map((re) => ({
          exercise: re.exercise,
          target_sets: re.target_sets,
          target_rep_range: re.target_rep_range,
          target_rpe: re.target_rpe,
          rest_seconds: re.rest_seconds,
          notes: re.notes ?? '',
        })),
      )
      setLoaded(true)
    }
  }, [editing, routine.data, loaded])

  const save = useAction((input: RoutineInput) =>
    editing
      ? workoutService.updateRoutine(userId, routineId!, input)
      : workoutService.createRoutine(userId, input),
  )

  if ((editing && routine.loading && !routine.data) || (editing && !loaded)) return <EditorSkeleton />

  if (editing && (routine.error || !routine.data)) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" className="self-start" onClick={() => navigate('/routines')}>
          <ChevronLeft className="size-4" /> Back to routines
        </Button>
        <Card className="p-6">
          <EmptyState
            icon={<AlertTriangle className="size-5" />}
            title="Routine not found"
            description={routine.error ?? 'It may have been deleted.'}
            action={<Button onClick={() => navigate('/routines')}>Back to routines</Button>}
          />
        </Card>
      </div>
    )
  }

  function patchRow(index: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function moveRow(index: number, dir: -1 | 1) {
    setRows((rs) => {
      const target = index + dir
      if (target < 0 || target >= rs.length) return rs
      const next = [...rs]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function removeRow(index: number) {
    setRows((rs) => rs.filter((_, i) => i !== index))
  }

  async function handleSave() {
    const errs: typeof errors = {}
    if (name.trim() === '') errs.name = 'Give your routine a name'
    if (rows.length === 0) errs.exercises = 'Add at least one exercise'
    setErrors(errs)
    if (Object.values(errs).some(Boolean)) return

    const input: RoutineInput = {
      name: name.trim(),
      notes: notes.trim() === '' ? null : notes.trim(),
      exercises: rows.map((r) => ({
        exercise_id: r.exercise.id,
        target_sets: Math.max(1, r.target_sets || 3),
        target_rep_range: r.target_rep_range.trim() === '' ? '8-12' : r.target_rep_range.trim(),
        target_rpe: r.target_rpe,
        rest_seconds: r.rest_seconds || 90,
        notes: r.notes.trim() === '' ? null : r.notes.trim(),
      })),
    }

    const result = await save.run(input)
    if (result) {
      push(editing ? 'Routine updated' : 'Routine created', 'success')
      navigate(`/routines/${result.id}`, { replace: true })
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Button variant="ghost" size="sm" className="self-start -mb-1" onClick={() => navigate('/routines')}>
        <ChevronLeft className="size-4" /> Back to routines
      </Button>

      <PageHeader
        title={editing ? 'Edit routine' : 'New routine'}
        subtitle="Order matters — the list is exactly how the session will flow."
        actions={
          <Button onClick={() => void handleSave()} loading={save.loading}>
            <Save className="size-4" /> {editing ? 'Save changes' : 'Create routine'}
          </Button>
        }
      />

      {save.error && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          {save.error}
        </div>
      )}

      <Card>
        <CardBody className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" error={errors.name}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Upper power"
                aria-invalid={!!errors.name}
              />
            </Field>
            <Field label="Notes (optional)" hint="Told to members, coaches or future you.">
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Heavy compounds first, push hard…"
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      {errors.exercises && (
        <p className="text-[13px] text-danger" role="alert">
          {errors.exercises}
        </p>
      )}

      {rows.length > 0 && (
        <ol className="flex flex-col gap-2.5">
          {rows.map((row, i) => (
            <li key={row.exercise.id}>
              <Card>
                <CardBody className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-ink-faint">
                      <GripVertical className="size-4" />
                      <span className="text-[13px] font-bold tabular-nums">{i + 1}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-ink">
                        {row.exercise.name}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-muted">
                        <span
                          className="size-1.5 rounded-full"
                          style={{ background: MUSCLE_COLOR[row.exercise.muscle_group] }}
                          aria-hidden
                        />
                        {MUSCLE_LABEL[row.exercise.muscle_group]}
                      </span>
                    </span>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="xs" onClick={() => moveRow(i, -1)} disabled={i === 0} aria-label="Move up">
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => moveRow(i, 1)}
                        disabled={i === rows.length - 1}
                        aria-label="Move down"
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button variant="ghost" size="xs" className="hover:text-danger" onClick={() => removeRow(i)} aria-label="Remove">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Field label="Working sets">
                      <NumberField value={row.target_sets} onValueChange={(v) => patchRow(i, { target_sets: v ?? 3 })} min={1} suffix="sets" />
                    </Field>
                    <Field label="Rep range">
                      <Input value={row.target_rep_range} onChange={(e) => patchRow(i, { target_rep_range: e.target.value })} placeholder="8-12" />
                    </Field>
                    <Field label="RPE (optional)">
                      <NumberField value={row.target_rpe} onValueChange={(v) => patchRow(i, { target_rpe: v })} placeholder="—" min={1} />
                    </Field>
                    <Field label="Rest">
                      <NumberField value={row.rest_seconds} onValueChange={(v) => patchRow(i, { rest_seconds: v ?? 90 })} min={0} suffix="s" />
                    </Field>
                  </div>

                  <Field label="Notes (optional)">
                    <Input value={row.notes} onChange={(e) => patchRow(i, { notes: e.target.value })} placeholder="Chest-supported, squeeze at the top…" />
                  </Field>
                </CardBody>
              </Card>
            </li>
          ))}
        </ol>
      )}

      {pickerOpen ? (
        <ExercisePicker
          userId={userId}
          onPick={(ex) => {
            setRows((rs) => (rs.some((r) => r.exercise.id === ex.id) ? rs : [...rs, defaultRow(ex)]))
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setPickerOpen(true)}>
          <Plus className="size-4" /> Add exercise
        </Button>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={() => navigate('/routines')}>
          Cancel
        </Button>
        <Button onClick={() => void handleSave()} loading={save.loading}>
          <Save className="size-4" /> {editing ? 'Save changes' : 'Create routine'}
        </Button>
      </div>
    </div>
  )
}

function defaultRow(exercise: Exercise): Row {
  return {
    exercise,
    target_sets: 3,
    target_rep_range: '8-12',
    target_rpe: null,
    rest_seconds: 90,
    notes: '',
  }
}

function EditorSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
