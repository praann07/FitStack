import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  Clock,
  Dumbbell,
  ListPlus,
  Trophy,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { useAsync } from '@/hooks/useAsync'
import { useAuthStore } from '@/stores/authStore'
import { workoutService } from '@/services'
import { longDate, durationLabel } from '@/lib/date'
import { num, volume as volumeFmt } from '@/lib/format'
import { MUSCLE_COLOR, MUSCLE_LABEL, SET_TYPE_LABEL } from '@/lib/format'

export function WorkoutDetailPage() {
  const user = useAuthStore((s) => s.user)
  const { sessionId } = useParams()
  if (!user || !sessionId) return null
  return <DetailView userId={user.id} sessionId={sessionId} />
}

function DetailView({ userId, sessionId }: { userId: string; sessionId: string }) {
  const session = useAsync(() => workoutService.getSession(userId, sessionId), [userId, sessionId])
  const navigate = useNavigate()

  if (session.loading && !session.data) return <DetailSkeleton />

  if (session.error || !session.data) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/workout/history')}>
          <ChevronLeft className="size-4" /> Back to history
        </Button>
        <Card className="p-6">
          <EmptyState
            icon={<AlertTriangle className="size-5" />}
            title="Workout not found"
            description={session.error ?? 'This session may have been deleted.'}
            action={<Button onClick={() => navigate('/workout/history')}>Back to history</Button>}
          />
        </Card>
      </div>
    )
  }

  const s = session.data

  return (
    <div className="flex flex-col gap-5">
      <Button variant="ghost" size="sm" className="self-start -mb-1" onClick={() => navigate('/workout/history')}>
        <ChevronLeft className="size-4" /> Back to history
      </Button>

      <PageHeader
        title={s.routine_name ?? 'Free workout'}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" /> {longDate(s.session_date)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" /> {durationLabel(s.duration_minutes)}
            </span>
            <Badge tone="neutral">{s.total_sets} sets</Badge>
            <Badge tone="neutral">{volumeFmt(s.total_volume_kg)}</Badge>
            {s.pr_count > 0 && (
              <Badge tone="volt">
                <Trophy className="size-3" /> {s.pr_count} PRs
              </Badge>
            )}
          </span>
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/workout')}>
            <Dumbbell className="size-3.5" /> New workout
          </Button>
        }
      />

      {s.notes && (
        <Card className="border-l-4 border-l-volt/40">
          <CardBody>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Notes</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">{s.notes}</p>
          </CardBody>
        </Card>
      )}

      {s.groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListPlus className="size-5" />}
            title="No exercises logged"
            description="This session finished without any working sets."
          />
        </Card>
      ) : (
        s.groups.map((group) => (
          <Card key={group.exercise.id}>
            <CardHeader
              title={
                <div className="flex items-center gap-2.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: MUSCLE_COLOR[group.exercise.muscle_group] }}
                    aria-hidden
                  />
                  <span>{group.exercise.name}</span>
                  {group.sets.some((set) => set.is_pr) && <Badge tone="volt">PR</Badge>}
                </div>
              }
              subtitle={
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{MUSCLE_LABEL[group.exercise.muscle_group]}</Badge>
                  <span>Best {group.top_set ? `${num(group.top_set.weight_kg, 1)} kg × ${group.top_set.reps}` : '—'}</span>
                </span>
              }
              action={
                <span className="text-[12.5px] tabular-nums text-ink-faint">
                  {volumeFmt(group.volume_kg)}
                </span>
              }
            />
            <CardBody className="pt-1">
              <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
                {group.sets.map((set) => (
                  <li key={set.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-5 shrink-0 text-[12px] font-semibold tabular-nums text-ink-faint">
                      {set.set_number}
                    </span>
                    <span className="text-[13.5px] font-medium tabular-nums text-ink">
                      {num(set.weight_kg, 1)} kg × {set.reps}
                    </span>
                    {set.set_type !== 'normal' && <Badge tone="neutral">{SET_TYPE_LABEL[set.set_type]}</Badge>}
                    {set.rpe !== null && <span className="text-[12px] text-ink-faint">RPE {set.rpe}</span>}
                    {set.is_pr && <Badge tone="volt">PR</Badge>}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] text-ink-faint">
                View the trend for{' '}
                <Link
                  to={`/progress?exercise=${group.exercise.id}`}
                  className="font-semibold text-volt hover:text-volt-dim"
                >
                  {group.exercise.name}
                </Link>
              </p>
            </CardBody>
          </Card>
        ))
      )}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-6 w-72" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
