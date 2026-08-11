import { Link, useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Flame,
  Scale,
  Trophy,
  TrendingUp,
  Dumbbell,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Stat } from '@/components/ui/Stat'
import { Skeleton } from '@/components/ui/EmptyState'
import { EmptyState } from '@/components/ui/EmptyState'
import { MacroSummary } from '@/components/macros/MacroSummary'
import { SuggestionCard } from '@/components/macros/SuggestionCard'
import { TrendChart } from '@/components/charts/TrendChart'
import { VolumeChart } from '@/components/charts/VolumeChart'
import { useAsync, useAction } from '@/hooks/useAsync'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { dashboardService, nutritionService, progressService, workoutService } from '@/services'
import { friendlyDate, longDate, relativeDays } from '@/lib/date'
import { durationLabel } from '@/lib/date'
import { kg, num, signed, volume as volumeFmt } from '@/lib/format'
import { MUSCLE_COLOR, MUSCLE_LABEL, GOAL_LABEL } from '@/lib/format'
import { MUSCLE_GROUPS } from '@/types'
import type { MuscleGroup, PersonalRecord, PlateauStatus } from '@/types'

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const push = useToastStore((s) => s.push)
  const navigate = useNavigate()
  if (!user) return null

  return (
    <DashboardView
      userId={user.id}
      userName={user.full_name}
      onToast={push}
      onTargets={() => navigate('/nutrition/targets')}
    />
  )
}

function DashboardView({
  userId,
  userName,
  onToast,
  onTargets,
}: {
  userId: string
  userName: string
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void
  onTargets: () => void
}) {
  const navigate = useNavigate()
  const summary = useAsync(() => dashboardService.summary(userId), [userId])
  const trend = useAsync(() => progressService.getTrend(userId, 90), [userId])
  const volume = useAsync(() => workoutService.weeklyVolume(userId, 12), [userId])

  const accept = useAction((id: string) => nutritionService.acceptSuggestion(userId, id))
  const dismiss = useAction((id: string) => nutritionService.dismissSuggestion(userId, id))

  // Error is checked before the skeleton: a failed first load has no data, and
  // must not sit on a loading state forever.
  if (summary.error && !summary.data) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Dashboard" />
        <Card className="p-6">
          <EmptyState
            icon={<AlertTriangle className="size-5" />}
            title="Couldn't load your dashboard"
            description={summary.error}
            action={<Button onClick={summary.reload}>Try again</Button>}
          />
        </Card>
      </div>
    )
  }

  if (summary.loading || !summary.data) return <DashboardSkeleton />

  const s = summary.data
  const lastVol = s.training.volume_last_week_kg
  const isOnTrack =
    s.body.rate_kg_week !== null &&
    Math.abs(s.body.rate_kg_week - s.body.goal_rate_kg_week) / Math.max(Math.abs(s.body.goal_rate_kg_week), 0.05) <= 0.2

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`Hi, ${userName.split(' ')[0] ?? 'there'}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {friendlyDate(s.today.date)}
            <Badge tone={s.body.goal === 'cut' ? 'warning' : s.body.goal === 'bulk' ? 'positive' : 'neutral'}>
              {GOAL_LABEL[s.body.goal]} · {signed(s.body.goal_rate_kg_week, 2)} kg/wk
            </Badge>
            {s.streak_days > 0 && (
              <Badge tone="info" dot>
                {s.streak_days}-day streak
              </Badge>
            )}
          </span>
        }
        actions={
          <Button onClick={() => navigate('/workout')}>
            <Dumbbell className="size-4" />
            {s.training.last_session ? 'Start a workout' : 'First workout'}
          </Button>
        }
      />

      {s.body.last_logged_date !== null && (s.body.days_since_weigh_in ?? 99) > 3 && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-warning">
          <Scale className="size-4 shrink-0" />
          <span className="flex-1">
            No weigh-in in {s.body.days_since_weigh_in} days — the adaptive engine needs fresh data
            to estimate your TDEE.
          </span>
          <Link to="/progress" className="shrink-0 font-semibold underline-offset-2 hover:underline">
            Log now
          </Link>
        </div>
      )}

      {s.suggestion && (
        <SuggestionCard
          suggestion={s.suggestion}
          accepting={accept.loading}
          onAccept={() =>
            void accept.run(s.suggestion!.id).then((ok) => {
              if (ok) {
                onToast(`Targets updated to ${num(ok.calories, 0)} kcal`, 'success')
                summary.reload()
              }
            })
          }
          onDismiss={() =>
            void dismiss.run(s.suggestion!.id).then((ok) => {
              if (ok) {
                onToast('Suggestion dismissed', 'info')
                summary.reload()
              }
            })
          }
          onViewTargets={onTargets}
        />
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Trend weight"
          icon={<Scale className="size-4" />}
          value={kg(s.body.current_trend_kg, 2)}
          sub={
            <span className="flex items-center gap-1">
              {s.body.rate_kg_week !== null && (
                <>
                  <span className={isOnTrack ? 'text-positive' : 'text-warning'}>
                    {signed(s.body.rate_kg_week, 2)} kg/wk
                  </span>
                  <span className="text-ink-faint">· goal {signed(s.body.goal_rate_kg_week, 2)}</span>
                </>
              )}
            </span>
          }
        />
        <Stat
          label="Volume this week"
          icon={<Activity className="size-4" />}
          value={volumeFmt(s.training.volume_this_week_kg)}
          sub={
            lastVol > 0 ? (
              <span className="text-ink-faint">last week {volumeFmt(lastVol)}</span>
            ) : (
              <span className="text-ink-faint">no sessions last week</span>
            )
          }
        />
        <Stat
          label="Sessions this week"
          icon={<CalendarDays className="size-4" />}
          value={s.training.sessions_this_week}
          sub={
            <span className="text-ink-faint">
              {s.training.planned_sessions > 0
                ? `of ${s.training.planned_sessions} in your program`
                : 'no routines saved yet'}
            </span>
          }
        />
        <Stat
          label="Estimated TDEE"
          icon={<Flame className="size-4" />}
          value={s.tdee ? num(s.tdee.estimated_tdee) : '—'}
          sub={
            s.tdee ? (
              <span className="text-ink-faint">{s.tdee.confidence} confidence</span>
            ) : (
              <span className="text-ink-faint">needs ~7 days of data</span>
            )
          }
        />
      </div>

      <MacroSummary totals={s.today.totals} target={s.today.target} onTargetClick={onTargets} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Weight trend"
            subtitle="Smoothed trend over raw weigh-ins, with training volume"
            icon={<TrendingUp className="size-4" />}
          />
          <CardBody>
            {trend.loading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : trend.data && trend.data.points.length > 1 ? (
              <TrendChart points={trend.data.points} />
            ) : (
              <EmptyState title="No weigh-ins yet" description="Log your first weight on the Progress screen." />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Weekly volume"
            subtitle="Hard-set tonnage by muscle group, last 12 weeks"
            icon={<Dumbbell className="size-4" />}
          />
          <CardBody>
            {volume.loading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : volume.data && volume.data.some((w) => w.total_volume_kg > 0) ? (
              <VolumeChart points={volume.data} />
            ) : (
              <EmptyState title="No training logged yet" description="Volume builds up once you finish workouts." />
            )}
            <MuscleLegend sets={s.training.sets_by_muscle_group} />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RecentPrs prs={s.recent_prs} />
        <Plateaus plateaus={s.plateaus} />
      </div>

      {s.training.last_session && (
        <Card>
          <CardHeader
            title="Last workout"
            subtitle={longDate(s.training.last_session.session_date)}
            icon={<Activity className="size-4" />}
            action={
              <Button variant="outline" size="sm" onClick={() => navigate(`/workout/${s.training!.last_session!.id}`)}>
                View <ChevronRight className="size-3.5" />
              </Button>
            }
          />
          <CardBody>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <div>
                <p className="text-[15px] font-semibold text-ink">{s.training.last_session.title}</p>
                <p className="mt-0.5 flex items-center gap-2 text-[12.5px] text-ink-muted">
                  {s.training.last_session.muscle_groups.map((g) => (
                    <span key={g} className="inline-flex items-center gap-1">
                      <span className="size-1.5 rounded-full" style={{ background: MUSCLE_COLOR[g] }} aria-hidden />
                      {MUSCLE_LABEL[g]}
                    </span>
                  ))}
                </p>
              </div>
              <div className="ml-auto grid grid-cols-3 gap-6 text-right">
                <MiniStat label="Duration" value={durationLabel(s.training.last_session.duration_minutes)} />
                <MiniStat label="Volume" value={volumeFmt(s.training.last_session.total_volume_kg)} />
                <MiniStat
                  label="PRs"
                  value={String(s.training.last_session.pr_count)}
                  highlight={s.training.last_session.pr_count > 0}
                />
              </div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`mt-0.5 text-[15px] font-semibold tabular-nums ${highlight ? 'text-volt' : 'text-ink'}`}>
        {value}
      </p>
    </div>
  )
}

function RecentPrs({ prs }: { prs: PersonalRecord[] }) {
  return (
    <Card>
      <CardHeader
        title="Recent PRs"
        subtitle="Latest estimated-1RM records"
        icon={<Trophy className="size-4" />}
        action={<Link to="/workout/history" className="text-[12.5px] font-semibold text-volt hover:text-volt-dim">All</Link>}
      />
      <CardBody className="pt-1">
        {prs.length === 0 ? (
          <EmptyState title="No PRs yet" description="Beat a previous best set and it shows up here." />
        ) : (
          <ul className="flex flex-col">
            {prs.map((pr) => (
              <li key={pr.set_id}>
                <Link
                  to={`/workout/${pr.session_id}`}
                  className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-2"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-volt-soft text-volt">
                    <Trophy className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{pr.exercise_name}</p>
                    <p className="text-[12px] text-ink-muted">
                      {num(pr.weight_kg, 1)} kg × {pr.reps} reps
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-bold tabular-nums text-volt">
                      e1RM {num(pr.estimated_1rm, 1)} kg
                    </p>
                    <p className="text-[11px] text-ink-faint">{relativeDays(pr.date)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function Plateaus({ plateaus }: { plateaus: PlateauStatus[] }) {
  return (
    <Card>
      <CardHeader
        title="Stalled lifts"
        subtitle="No estimated-1RM improvement in the last 4+ sessions"
        icon={<AlertTriangle className="size-4" />}
      />
      <CardBody className="pt-1">
        {plateaus.length === 0 ? (
          <EmptyState title="Nothing stalled" description="Every tracked lift has improved recently." />
        ) : (
          <ul className="flex flex-col">
            {plateaus.map((p) => (
              <li
                key={p.exercise_id}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
                  <AlertTriangle className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-ink">{p.exercise_name}</p>
                  <p className="text-[12px] text-ink-muted">
                    {num(p.current_estimated_1rm, 1)} kg e1RM · best {num(p.best_estimated_1rm, 1)} kg
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-semibold text-warning">
                    {p.sessions_since_improvement} sessions
                  </p>
                  <p className="text-[11px] text-ink-faint">no progress</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function MuscleLegend({ sets }: { sets: Record<MuscleGroup, number> }) {
  const active = MUSCLE_GROUPS.filter((g) => (sets[g] ?? 0) > 0)
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3">
      {active.length === 0 && <span className="text-[11.5px] text-ink-faint">No sets this week yet.</span>}
      {active.map((g) => (
        <span key={g} className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-muted">
          <span className="size-2 rounded-[3px]" style={{ background: MUSCLE_COLOR[g] }} aria-hidden />
          {MUSCLE_LABEL[g]}
          <span className="font-semibold tabular-nums text-ink">{sets[g]}</span>
        </span>
      ))}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-2 h-5 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[320px] w-full" />
        <Skeleton className="h-[320px] w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    </div>
  )
}
