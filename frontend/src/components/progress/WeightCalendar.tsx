import { useMemo, useState } from 'react'
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Field, NumberField } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/EmptyState'
import { useAction, useAsync } from '@/hooks/useAsync'
import { useToastStore } from '@/stores/toastStore'
import { progressService } from '@/services'
import { fromIsoDate, longDate, toIsoDate, today as todayIso } from '@/lib/date'
import { cn } from '@/lib/cn'
import type { BodyMetric, Goal, TrendPoint } from '@/types'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** Day-over-day trend moves smaller than this don't count as a direction. */
const TREND_DEADZONE_KG = 0.005

/**
 * Month-grid view of daily weigh-ins. Each logged day is tinted by whether
 * the smoothed trend moved toward or away from the user's goal that day.
 * Clicking any non-future day opens a weight-only quick entry.
 */
export function WeightCalendar({
  userId,
  goal,
  onChanged,
}: {
  userId: string
  goal: Goal
  onChanged: () => void
}) {
  const [viewedMonth, setViewedMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const gridStart = startOfWeek(viewedMonth, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(viewedMonth), { weekStartsOn: 1 })

  const gridDays = useMemo(() => {
    const out: Date[] = []
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) out.push(d)
    return out
  }, [gridStart, gridEnd])

  const fromIso = toIsoDate(gridStart)
  const toIso = toIsoDate(gridEnd)
  // +1 so the trend point for the day *before* the first visible cell is also
  // fetched — needed to color that cell's day-over-day trend direction.
  const trendDays = gridDays.length + 1

  const metrics = useAsync(
    () => progressService.listMetrics(userId, { from: fromIso, to: toIso }),
    [userId, fromIso, toIso],
  )
  const trend = useAsync(
    () => progressService.getTrend(userId, trendDays, toIso),
    [userId, trendDays, toIso],
  )

  const metricByDate = useMemo(() => {
    const map = new Map<string, BodyMetric>()
    for (const m of metrics.data ?? []) map.set(m.log_date, m)
    return map
  }, [metrics.data])

  const trendByDate = useMemo(() => {
    const map = new Map<string, TrendPoint>()
    for (const p of trend.data?.points ?? []) map.set(p.date, p)
    return map
  }, [trend.data])

  const loading = metrics.loading || trend.loading
  const selectedMetric = selectedDay ? (metricByDate.get(selectedDay) ?? null) : null

  function reload() {
    metrics.reload()
    trend.reload()
    onChanged()
  }

  return (
    <Card>
      <CardHeader
        title="Weight calendar"
        subtitle="Click any day to log or edit its weight"
        icon={<CalendarDays className="size-4" />}
        action={
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Previous month"
              onClick={() => setViewedMonth((m) => addMonths(m, -1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-28 text-center text-[13px] font-medium text-ink">
              {format(viewedMonth, 'MMMM yyyy')}
            </span>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Next month"
              onClick={() => setViewedMonth((m) => addMonths(m, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        }
      />
      <CardBody>
        {loading ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-ink-faint">
              {WEEKDAY_LABELS.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {gridDays.map((d) => {
                const iso = toIsoDate(d)
                const metric = metricByDate.get(iso)
                const inMonth = isSameMonth(d, viewedMonth)
                const future = iso > todayIso()
                const tone = cellTone(iso, metric, trendByDate, goal)
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={future}
                    onClick={() => setSelectedDay(iso)}
                    className={cn(
                      'flex h-14 flex-col items-center justify-center gap-0.5 rounded-lg border text-[12px] transition-colors',
                      'disabled:cursor-not-allowed disabled:opacity-40',
                      !inMonth && 'opacity-50',
                      tone === 'positive' && 'border-positive/30 bg-positive-soft text-positive',
                      tone === 'warning' && 'border-warning/30 bg-warning-soft text-warning',
                      tone === 'danger' && 'border-danger/30 bg-danger-soft text-danger',
                      tone === 'neutral' && 'border-line bg-surface-2 text-ink hover:border-line-strong',
                      tone === 'empty' &&
                        'border-dashed border-line text-ink-faint hover:border-line-strong hover:text-ink-muted',
                    )}
                  >
                    <span className="text-[11px] opacity-70">{format(d, 'd')}</span>
                    <span className="font-semibold tabular-nums">
                      {metric?.weight_kg != null ? metric.weight_kg.toFixed(1) : '—'}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </CardBody>

      <QuickEntryModal
        key={selectedDay ?? 'none'}
        open={selectedDay !== null}
        date={selectedDay}
        existing={selectedMetric}
        userId={userId}
        onClose={() => setSelectedDay(null)}
        onSaved={() => {
          setSelectedDay(null)
          reload()
        }}
      />
    </Card>
  )
}

type Tone = 'positive' | 'warning' | 'danger' | 'neutral' | 'empty'

/** Colors a logged day by whether the smoothed trend moved toward the goal since the day before. */
function cellTone(
  iso: string,
  metric: BodyMetric | undefined,
  trendByDate: Map<string, TrendPoint>,
  goal: Goal,
): Tone {
  if (!metric || metric.weight_kg == null) return 'empty'

  const trendToday = trendByDate.get(iso)?.trend_kg
  const prevIso = toIsoDate(addDays(fromIsoDate(iso), -1))
  const trendPrev = trendByDate.get(prevIso)?.trend_kg
  if (trendToday == null || trendPrev == null) return 'neutral'

  const delta = trendToday - trendPrev
  if (Math.abs(delta) <= TREND_DEADZONE_KG) {
    return goal === 'maintain' ? 'positive' : 'neutral'
  }
  if (goal === 'maintain') return 'warning' // any real drift while maintaining is off-track, never "wrong direction"

  const movingUp = delta > 0
  const wantsUp = goal === 'bulk'
  return movingUp === wantsUp ? 'positive' : 'danger'
}

function QuickEntryModal({
  open,
  date,
  existing,
  userId,
  onClose,
  onSaved,
}: {
  open: boolean
  date: string | null
  existing: BodyMetric | null
  userId: string
  onClose: () => void
  onSaved: () => void
}) {
  const push = useToastStore((s) => s.push)
  const [weight, setWeight] = useState<number | null>(existing?.weight_kg ?? null)

  const save = useAction(() => {
    if (!date) return Promise.reject(new Error('No date selected'))
    // Carry over any other measurements already logged for this day -- the
    // backend upsert overwrites every field in the payload, so sending null
    // here would silently erase them.
    return progressService.saveMetric(userId, {
      log_date: date,
      weight_kg: weight,
      waist_cm: existing?.waist_cm ?? null,
      chest_cm: existing?.chest_cm ?? null,
      arm_cm: existing?.arm_cm ?? null,
      photo_url: existing?.photo_url ?? null,
    })
  })

  function submit() {
    if (weight === null) return
    void save.run().then((ok) => {
      if (ok === null) {
        push(save.error ?? 'Could not save weight', 'error')
        return
      }
      push(`Logged for ${date ? longDate(date) : 'that day'}`, 'success')
      onSaved()
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={date ? longDate(date) : 'Log weight'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.loading} disabled={weight === null}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Weight">
        <NumberField value={weight} onValueChange={setWeight} suffix="kg" min={20} step={0.1} placeholder="80.0" autoFocus />
      </Field>
      {save.error && (
        <p className="mt-2 text-[12.5px] text-danger" role="alert">
          {save.error}
        </p>
      )}
    </Modal>
  )
}
