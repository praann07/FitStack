import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Dumbbell,
  History,
  LineChart,
  Trophy,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { ExerciseProgressChart } from '@/components/charts/ExerciseProgressChart'
import { useAsync } from '@/hooks/useAsync'
import { useAuthStore } from '@/stores/authStore'
import { workoutService } from '@/services'
import { longDate, durationLabel, relativeDays, shiftDate, today } from '@/lib/date'
import { num, signed, volume as volumeFmt } from '@/lib/format'
import { MUSCLE_COLOR, MUSCLE_LABEL } from '@/lib/format'
import { PLATEAU_SESSION_WINDOW } from '@/lib/strength'
import { MUSCLE_GROUPS } from '@/types'
import type { Exercise, ExerciseHistoryPoint, PlateauStatus, SessionSummary } from '@/types'

type Tab = 'sessions' | 'progression'
type Period = '30' | '90' | 'all'

const PERIODS: { value: Period; label: string }[] = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All time' },
]

export function WorkoutHistoryPage() {
  const user = useAuthStore((s) => s.user)
  if (!user) return null
  return <HistoryView userId={user.id} />
}

function HistoryView({ userId }: { userId: string }) {
  const [tab, setTab] = useState<Tab>('sessions')
  const navigate = useNavigate()

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Workout history"
        subtitle="Every session you've logged, and how each lift is actually progressing."
        actions={
          <Button onClick={() => navigate('/workout')}>
            <Dumbbell className="size-4" /> Start workout
          </Button>
        }
      />

      <Segmented
        options={[
          { value: 'sessions', label: 'Sessions' },
          { value: 'progression', label: 'Progression' },
        ]}
        value={tab}
        onChange={setTab}
        className="self-start"
      />

      {tab === 'sessions' ? <SessionsTab userId={userId} /> : <ProgressionTab userId={userId} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function SessionsTab({ userId }: { userId: string }) {
  const [period, setPeriod] = useState<Period>('90')
  const navigate = useNavigate()

  const from = period === 'all' ? undefined : shiftDate(today(), -Number(period))
  const sessions = useAsync(
    () => workoutService.listSessions(userId, { from }),
    [userId, period],
  )

  const totals = (sessions.data ?? []).reduce(
    (acc, s) => ({
      sessions: acc.sessions + 1,
      volume: acc.volume + s.total_volume_kg,
      sets: acc.sets + s.total_sets,
      prs: acc.prs + s.pr_count,
    }),
    { sessions: 0, volume: 0, sets: 0, prs: 0 },
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-muted">
          {sessions.data
            ? `${totals.sessions} workouts · ${volumeFmt(totals.volume)} · ${totals.sets} hard sets · ${totals.prs} PRs`
            : 'Loading…'}
        </p>
        <Segmented options={PERIODS} value={period} onChange={setPeriod} size="sm" />
      </div>

      {sessions.loading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {sessions.error && (
        <Card className="p-6">
          <EmptyState
            icon={<AlertTriangle className="size-5" />}
            title="Couldn't load your history"
            description={sessions.error}
            action={<Button onClick={sessions.reload}>Try again</Button>}
          />
        </Card>
      )}

      {!sessions.loading && !sessions.error && (sessions.data?.length ?? 0) === 0 && (
        <Card>
          <EmptyState
            icon={<History className="size-5" />}
            title={period === 'all' ? 'No workouts yet' : 'Nothing in this period'}
            description={
              period === 'all'
                ? 'Finish your first session and it lands here with every set, PR and drop of volume.'
                : 'Try a longer period, or start a workout to add to the record.'
            }
            action={
              period === 'all' ? (
                <Button onClick={() => navigate('/workout')}>
                  <Dumbbell className="size-4" /> Start one
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => setPeriod('all')}>
                  Show all time
                </Button>
              )
            }
          />
        </Card>
      )}

      {sessions.data && sessions.data.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {sessions.data.map((s) => (
            <SessionRow key={s.id} session={s} onOpen={() => navigate(`/workout/${s.id}`)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function SessionRow({ session, onOpen }: { session: SessionSummary; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full items-center gap-4 rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-muted group-hover:text-volt">
          <Activity className="size-4.5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[14.5px] font-semibold text-ink">{session.title}</p>
            {session.pr_count > 0 && <Badge tone="volt">PR</Badge>}
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-muted">
            {longDate(session.session_date)}
            {session.routine_name ? ` · ${session.routine_name}` : ''}
          </p>
          {session.muscle_groups.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {session.muscle_groups.slice(0, 4).map((g) => (
                <span key={g} className="inline-flex items-center gap-1 text-[11px] text-ink-faint">
                  <span className="size-1.5 rounded-full" style={{ background: MUSCLE_COLOR[g] }} aria-hidden />
                  {MUSCLE_LABEL[g]}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="hidden shrink-0 gap-6 sm:flex">
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Volume</p>
            <p className="text-[13.5px] font-semibold tabular-nums text-ink">
              {volumeFmt(session.total_volume_kg)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Sets</p>
            <p className="text-[13.5px] font-semibold tabular-nums text-ink">{session.total_sets}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Time</p>
            <p className="text-[13.5px] font-semibold tabular-nums text-ink">
              {durationLabel(session.duration_minutes)}
            </p>
          </div>
          {session.pr_count > 0 && (
            <div className="text-right">
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">PRs</p>
              <p className="flex items-center justify-end gap-1 text-[13.5px] font-semibold tabular-nums text-volt">
                <Trophy className="size-3.5" />
                {session.pr_count}
              </p>
            </div>
          )}
        </div>

        <ChevronRight className="size-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" />
      </button>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Progression (per-exercise)
// ---------------------------------------------------------------------------

function ProgressionTab({ userId }: { userId: string }) {
  const exercises = useAsync(() => workoutService.trainedExercises(userId), [userId])
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
          description="Log a few sessions and each lift gets its own estimated-1RM curve, PR markers and plateau check."
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ExercisePickerRow
        exercises={exercises.data}
        value={exerciseId}
        onChange={setSelectedId}
      />
      {selected && <ExerciseProgression key={selected.id} userId={userId} exercise={selected} />}
    </div>
  )
}

function ExercisePickerRow({
  exercises,
  value,
  onChange,
}: {
  exercises: Exercise[]
  value: string
  onChange: (id: string) => void
}) {
  const grouped = useMemo(
    () =>
      MUSCLE_GROUPS.map((group) => ({
        group,
        items: exercises.filter((e) => e.muscle_group === group),
      })).filter((g) => g.items.length > 0),
    [exercises],
  )

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="progression-exercise" className="text-[13px] font-medium text-ink-muted">
        Exercise
      </label>
      <div className="w-full sm:w-80">
        <Select id="progression-exercise" value={value} onChange={(e) => onChange(e.target.value)}>
          {grouped.map(({ group, items }) => (
            <optgroup key={group} label={MUSCLE_LABEL[group]}>
              {items.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>
    </div>
  )
}

function ExerciseProgression({ userId, exercise }: { userId: string; exercise: Exercise }) {
  const history = useAsync(
    () => workoutService.exerciseHistory(userId, exercise.id),
    [userId, exercise.id],
  )
  const plateau = useAsync(
    () => workoutService.plateauStatus(userId, exercise.id),
    [userId, exercise.id],
  )

  if (history.loading) return <Skeleton className="h-[380px] w-full" />

  if (history.error) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={<AlertTriangle className="size-5" />}
          title="Couldn't load this exercise"
          description={history.error}
          action={<Button onClick={history.reload}>Try again</Button>}
        />
      </Card>
    )
  }

  const points = history.data ?? []

  if (points.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<LineChart className="size-5" />}
          title={`No working sets for ${exercise.name}`}
          description="Warm-up and drop sets are excluded from progression tracking — log a working set to start the curve."
        />
      </Card>
    )
  }

  const first = points[0]
  const last = points[points.length - 1]
  const best = points.reduce((a, b) => (b.estimated_1rm > a.estimated_1rm ? b : a))
  const change = last.estimated_1rm - first.estimated_1rm
  const totalVolume = points.reduce((sum, p) => sum + p.volume_kg, 0)

  return (
    <div className="flex flex-col gap-4">
      {plateau.data?.is_plateaued && <PlateauBanner status={plateau.data} />}

      <Card>
        <CardHeader
          title={exercise.name}
          subtitle={`Estimated 1RM per session (Epley), with volume behind it · ${points.length} sessions`}
          icon={
            <span
              className="size-2.5 rounded-full"
              style={{ background: MUSCLE_COLOR[exercise.muscle_group] }}
              aria-hidden
            />
          }
          action={
            plateau.data && !plateau.data.is_plateaued ? (
              <Badge tone="positive">Progressing</Badge>
            ) : undefined
          }
        />
        <CardBody>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Current e1RM" value={`${num(last.estimated_1rm, 1)} kg`} />
            <MiniStat
              label="Best e1RM"
              value={`${num(best.estimated_1rm, 1)} kg`}
              hint={relativeDays(best.date)}
              highlight
            />
            <MiniStat
              label="Change"
              value={`${signed(change, 1)} kg`}
              hint={`since ${relativeDays(first.date)}`}
              tone={change >= 0 ? 'positive' : 'danger'}
            />
            <MiniStat label="Total volume" value={volumeFmt(totalVolume)} />
          </div>

          <ExerciseProgressChart points={points} />

          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-[11.5px] text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-volt" aria-hidden /> Estimated 1RM
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full border-2 border-canvas bg-volt" aria-hidden /> PR session
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-[3px] bg-protein/30" aria-hidden /> Session volume
            </span>
          </p>
        </CardBody>
      </Card>

      <SessionBreakdown points={points} />
    </div>
  )
}

function PlateauBanner({ status }: { status: PlateauStatus }) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-warning/30 bg-warning-soft p-4 sm:flex-row sm:items-center"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
        <AlertTriangle className="size-4.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink">
          {status.exercise_name} has stalled for {status.sessions_since_improvement} sessions
        </p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">
          No new best estimated 1RM since{' '}
          {status.last_improvement_date ? relativeDays(status.last_improvement_date) : 'the start'} — still{' '}
          {num(status.best_estimated_1rm, 1)} kg against {num(status.current_estimated_1rm, 1)} kg today.
          Flagged after {PLATEAU_SESSION_WINDOW}+ sessions without progress. Consider a deload week, a rep-range
          change, or adding a set of volume.
        </p>
      </div>
    </div>
  )
}

function SessionBreakdown({ points }: { points: ExerciseHistoryPoint[] }) {
  const navigate = useNavigate()
  const rows = [...points].reverse().slice(0, 12)

  return (
    <Card>
      <CardHeader title="Session by session" subtitle="Most recent first — top working set of each session" />
      <CardBody className="pt-0">
        <div className="-mx-1 overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[440px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                <th scope="col" className="py-2 pl-1 pr-3 font-medium">Date</th>
                <th scope="col" className="px-3 py-2 font-medium">Top set</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Est. 1RM</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Volume</th>
                <th scope="col" className="py-2 pl-3 pr-1 text-right font-medium">Session</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((p) => (
                <tr key={p.session_id} className="text-[13px] text-ink">
                  <td className="py-2.5 pl-1 pr-3 text-ink-muted">{longDate(p.date)}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {num(p.best_weight_kg, 1)} kg × {p.best_reps}
                    {p.is_pr && (
                      <Badge tone="volt" className="ml-2">
                        PR
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                    {num(p.estimated_1rm, 1)} kg
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
                    {num(p.volume_kg)} kg
                  </td>
                  <td className="py-2.5 pl-3 pr-1 text-right">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => navigate(`/workout/${p.session_id}`)}
                    >
                      Open <ChevronRight className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  )
}

function MiniStat({
  label,
  value,
  hint,
  highlight,
  tone,
}: {
  label: string
  value: string
  hint?: string
  highlight?: boolean
  tone?: 'positive' | 'danger'
}) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p
        className={`mt-0.5 text-[16px] font-semibold tabular-nums ${
          tone === 'positive'
            ? 'text-positive'
            : tone === 'danger'
              ? 'text-danger'
              : highlight
                ? 'text-volt'
                : 'text-ink'
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-ink-faint">{hint}</p>}
    </div>
  )
}
