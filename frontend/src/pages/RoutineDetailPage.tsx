import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ChevronLeft,
  ClipboardList,
  Clock,
  Pencil,
  Play,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { useAsync, useAction } from '@/hooks/useAsync'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { useWorkoutStore } from '@/stores/workoutStore'
import { workoutService } from '@/services'
import { longDate } from '@/lib/date'
import { MUSCLE_COLOR, MUSCLE_LABEL, EQUIPMENT_LABEL } from '@/lib/format'

export function RoutineDetailPage() {
  const user = useAuthStore((s) => s.user)
  const { routineId } = useParams()
  if (!user || !routineId) return null
  return <DetailView userId={user.id} routineId={routineId} />
}

function DetailView({ userId, routineId }: { userId: string; routineId: string }) {
  const navigate = useNavigate()
  const push = useToastStore((s) => s.push)
  const setActive = useWorkoutStore((s) => s.setActive)
  const hasActive = useWorkoutStore((s) => s.hasActive)
  const routine = useAsync(() => workoutService.getRoutine(userId, routineId), [userId, routineId])
  const remove = useAction(() => workoutService.deleteRoutine(userId, routineId))
  const start = useAction(() => workoutService.startSession(userId, routineId))
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (routine.loading && !routine.data) return <DetailSkeleton />

  if (routine.error || !routine.data) {
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

  const r = routine.data
  const muscles = [...new Set(r.exercises.map((re) => re.exercise.muscle_group))]
  const totalSets = r.exercises.reduce((s, re) => s + re.target_sets, 0)

  async function handleStart() {
    if (hasActive) {
      push('You already have a workout in progress — resuming it.', 'info')
      navigate('/workout', { replace: true })
      return
    }
    const session = await start.run()
    if (session) {
      setActive(true)
      push(`Started ${r.name}`, 'success')
      navigate('/workout', { replace: true })
    }
  }

  async function handleDelete() {
    const ok = await remove.run()
    if (ok === null) return
    push(`Deleted "${r.name}"`, 'info')
    navigate('/routines', { replace: true })
  }

  return (
    <div className="flex flex-col gap-5">
      <Button variant="ghost" size="sm" className="self-start -mb-1" onClick={() => navigate('/routines')}>
        <ChevronLeft className="size-4" /> Back to routines
      </Button>

      <PageHeader
        title={r.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-ink-faint">Created {longDate(r.created_at.slice(0, 10))}</span>
            <Badge tone="neutral">{r.exercises.length} exercises</Badge>
            <Badge tone="neutral">{totalSets} working sets</Badge>
            {muscles.map((g) => (
              <span key={g} className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-muted">
                <span className="size-1.5 rounded-full" style={{ background: MUSCLE_COLOR[g] }} aria-hidden />
                {MUSCLE_LABEL[g]}
              </span>
            ))}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/routines/${r.id}/edit`)}>
              <Pencil className="size-3.5" /> Edit
            </Button>
            <Button size="sm" onClick={() => void handleStart()} loading={start.loading}>
              <Play className="size-3.5" /> Start workout
            </Button>
          </div>
        }
      />

      {r.notes && (
        <Card>
          <CardBody>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Notes</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">{r.notes}</p>
          </CardBody>
        </Card>
      )}

      {r.exercises.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList className="size-5" />}
            title="No exercises in this routine"
            action={<Button onClick={() => navigate(`/routines/${r.id}/edit`)}>Add exercises</Button>}
          />
        </Card>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {r.exercises.map((re, i) => (
            <li key={re.id}>
              <Card className="flex items-center gap-4 p-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[13px] font-bold tabular-nums text-ink-muted">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold text-ink">{re.exercise.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="size-1.5 rounded-full"
                        style={{ background: MUSCLE_COLOR[re.exercise.muscle_group] }}
                        aria-hidden
                      />
                      {MUSCLE_LABEL[re.exercise.muscle_group]}
                    </span>
                    <span className="text-ink-faint">·</span>
                    <span>{EQUIPMENT_LABEL[re.exercise.equipment]}</span>
                    {re.notes && (
                      <>
                        <span className="text-ink-faint">·</span>
                        <span className="truncate">{re.notes}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[14px] font-semibold tabular-nums text-ink">
                    {re.target_sets} × {re.target_rep_range}
                  </span>
                  <span className="flex items-center gap-1 text-[11.5px] text-ink-faint">
                    {re.target_rpe !== null && (
                      <Badge tone="neutral">RPE {re.target_rpe}</Badge>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" /> {re.rest_seconds}s
                    </span>
                  </span>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
        loading={remove.loading}
        error={remove.error}
        title={`Delete "${r.name}"?`}
        description="The routine template is removed. Workouts you already logged from it keep their full history."
        confirmLabel="Delete routine"
      />
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-6 w-72" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  )
}
