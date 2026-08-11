import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  ListPlus,
  Pencil,
  Play,
  Plus,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { useAsync, useAction } from '@/hooks/useAsync'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { useWorkoutStore } from '@/stores/workoutStore'
import { workoutService } from '@/services'
import { relativeDays } from '@/lib/date'
import { MUSCLE_COLOR, MUSCLE_LABEL } from '@/lib/format'
import type { RoutineDetail } from '@/types'

export function RoutinesPage() {
  const user = useAuthStore((s) => s.user)
  if (!user) return null
  return <RoutinesView userId={user.id} />
}

function RoutinesView({ userId }: { userId: string }) {
  const push = useToastStore((s) => s.push)
  const navigate = useNavigate()
  const setActive = useWorkoutStore((s) => s.setActive)
  const hasActive = useWorkoutStore((s) => s.hasActive)
  const routines = useAsync(() => workoutService.listRoutines(userId), [userId])
  const remove = useAction((id: string) => workoutService.deleteRoutine(userId, id))
  const start = useAction((id: string) => workoutService.startSession(userId, id))
  const [pendingDelete, setPendingDelete] = useState<RoutineDetail | null>(null)

  async function handleStart(id: string, name: string) {
    if (hasActive) {
      push('You already have a workout in progress — resuming it.', 'info')
      navigate('/workout', { replace: true })
      return
    }
    const session = await start.run(id)
    if (session) {
      setActive(true)
      push(`Started ${name}`, 'success')
      navigate('/workout', { replace: true })
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return
    const ok = await remove.run(pendingDelete.id)
    if (ok === null) return
    push(`Deleted "${pendingDelete.name}"`, 'info')
    setPendingDelete(null)
    routines.reload()
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Routines"
        subtitle="Your saved training plans — start one straight from here."
        actions={
          <Button onClick={() => navigate('/routines/new')}>
            <Plus className="size-4" /> New routine
          </Button>
        }
      />

      {routines.loading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      )}

      {routines.error && (
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
          <EmptyState
            icon={<ClipboardList className="size-5" />}
            title="No routines yet"
            description="Name a plan, pick the exercises, set the reps — then one tap starts your session."
            action={
              <Button onClick={() => navigate('/routines/new')}>
                <ListPlus className="size-4" /> Build your first routine
              </Button>
            }
          />
        </Card>
      )}

      {routines.data && routines.data.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {routines.data.map((routine) => {
            const muscles = [...new Set(routine.exercises.map((re) => re.exercise.muscle_group))]
            const totalSets = routine.exercises.reduce((s, re) => s + re.target_sets, 0)
            return (
              <Card key={routine.id} className="flex flex-col p-5">
                <button
                  type="button"
                  onClick={() => navigate(`/routines/${routine.id}`)}
                  className="flex items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0">
                    <h3 className="truncate text-[15px] font-semibold text-ink">{routine.name}</h3>
                    <p className="mt-0.5 text-[12.5px] text-ink-muted">
                      {routine.exercises.length} exercise{routine.exercises.length === 1 ? '' : 's'} ·{' '}
                      {totalSets} sets · updated {relativeDays(routine.updated_at.slice(0, 10))}
                    </p>
                  </div>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-muted">
                    <Dumbbell className="size-4" />
                  </span>
                </button>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {muscles.map((g) => (
                    <span key={g} className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-muted">
                      <span className="size-1.5 rounded-full" style={{ background: MUSCLE_COLOR[g] }} aria-hidden />
                      {MUSCLE_LABEL[g]}
                    </span>
                  ))}
                </div>

                {routine.notes && (
                  <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-faint">
                    {routine.notes}
                  </p>
                )}

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="xs" onClick={() => navigate(`/routines/${routine.id}/edit`)}>
                      <Pencil className="size-3.5" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="hover:text-danger"
                      onClick={() => setPendingDelete(routine)}
                    >
                      <Trash2 className="size-3.5" /> Delete
                    </Button>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="xs" onClick={() => navigate(`/routines/${routine.id}`)}>
                      View <ChevronRight className="size-3.5" />
                    </Button>
                    <Button size="sm" onClick={() => void handleStart(routine.id, routine.name)} loading={start.loading}>
                      <Play className="size-3.5" /> Start
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void handleDelete()}
        loading={remove.loading}
        error={remove.error}
        title={`Delete "${pendingDelete?.name ?? ''}"?`}
        description="The routine template is removed. Workouts you already logged from it keep their full history."
        confirmLabel="Delete routine"
      />
    </div>
  )
}
