import { useState } from 'react'
import { Plus, Scale, Trash2, TrendingUp } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { Field, Input, NumberField } from '@/components/ui/Field'
import { TrendChart } from '@/components/charts/TrendChart'
import { WeightCalendar } from '@/components/progress/WeightCalendar'
import { useAsync, useAction } from '@/hooks/useAsync'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { progressService } from '@/services'
import { friendlyDate, today } from '@/lib/date'
import { cm, kg, signed } from '@/lib/format'
import type { BodyMetric, Goal, ProgressTrend } from '@/types'

export function ProgressPage() {
  const user = useAuthStore((s) => s.user)
  const push = useToastStore((s) => s.push)
  if (!user) return null

  return <ProgressView userId={user.id} goal={user.goal} onToast={push} />
}

function ProgressView({
  userId,
  goal,
  onToast,
}: {
  userId: string
  goal: Goal
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void
}) {
  const metrics = useAsync(() => progressService.listMetrics(userId), [userId])
  const trend = useAsync(() => progressService.getTrend(userId, 90), [userId])

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Progress"
        subtitle="Weigh-ins, measurements and the smoothed trend."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <WeighInCard
          userId={userId}
          onToast={onToast}
          onSaved={() => {
            metrics.reload()
            trend.reload()
          }}
        />

        <Card>
          <CardHeader
            title="Weight trend"
            subtitle="Smoothed over raw weigh-ins, last 90 days"
            icon={<TrendingUp className="size-4" />}
          />
          <CardBody>
            {trend.loading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : trend.data && trend.data.points.length > 1 ? (
              <TrendChart points={trend.data.points} />
            ) : (
              <EmptyState
                title="No trend yet"
                description="Log at least two weigh-ins and the smoothed line appears here."
              />
            )}
            <TrendStats trend={trend.data} />
          </CardBody>
        </Card>
      </div>

      <WeightCalendar
        userId={userId}
        goal={goal}
        onChanged={() => {
          metrics.reload()
          trend.reload()
        }}
      />

      <Card>
        <CardHeader
          title="Weigh-in history"
          subtitle={
            metrics.data
              ? `${metrics.data.length} entries, newest first`
              : 'Newest first'
          }
          icon={<Scale className="size-4" />}
        />
        <CardBody className="pt-1">
          {metrics.loading ? (
            <Skeleton className="h-40 w-full" />
          ) : metrics.data && metrics.data.length > 0 ? (
            <MetricList metrics={metrics.data} onDelete={metrics.reload} userId={userId} />
          ) : (
            <EmptyState
              title="No weigh-ins yet"
              description="Log your first measurement above to start tracking."
            />
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function WeighInCard({
  userId,
  onToast,
  onSaved,
}: {
  userId: string
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void
  onSaved: () => void
}) {
  const [date, setDate] = useState(today())
  const [weight, setWeight] = useState<number | null>(null)
  const [waist, setWaist] = useState<number | null>(null)
  const [chest, setChest] = useState<number | null>(null)
  const [arm, setArm] = useState<number | null>(null)

  const save = useAction(() =>
    progressService.saveMetric(userId, {
      log_date: date,
      weight_kg: weight,
      waist_cm: waist,
      chest_cm: chest,
      arm_cm: arm,
    }),
  )

  function submit() {
    void save.run().then((ok) => {
      if (ok === null) {
        onToast(save.error ?? 'Could not save measurement', 'error')
        return
      }
      onToast(`Logged for ${friendlyDate(ok.log_date)}`, 'success')
      setDate(today())
      setWeight(null)
      setWaist(null)
      setChest(null)
      setArm(null)
      onSaved()
    })
  }

  const hasValue = weight !== null || waist !== null || chest !== null || arm !== null

  return (
    <Card>
      <CardHeader
        title="Log a measurement"
        subtitle="Upserts by date — re-logging today replaces today's entry"
        icon={<Scale className="size-4" />}
      />
      <CardBody>
        <div className="flex flex-col gap-3">
          <Field label="Date" htmlFor="metric-date">
            <Input
              id="metric-date"
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value || today())}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Weight">
              <NumberField value={weight} onValueChange={setWeight} suffix="kg" min={20} step={0.1} placeholder="80.0" />
            </Field>
            <Field label="Waist">
              <NumberField value={waist} onValueChange={setWaist} suffix="cm" min={20} step={0.1} placeholder="—" />
            </Field>
            <Field label="Chest">
              <NumberField value={chest} onValueChange={setChest} suffix="cm" min={20} step={0.1} placeholder="—" />
            </Field>
            <Field label="Arm">
              <NumberField value={arm} onValueChange={setArm} suffix="cm" min={10} step={0.1} placeholder="—" />
            </Field>
          </div>

          {save.error && (
            <p className="text-[12.5px] text-danger" role="alert">
              {save.error}
            </p>
          )}

          <Button onClick={submit} loading={save.loading} disabled={!hasValue} className="self-start">
            <Plus className="size-4" /> Log measurement
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}

function TrendStats({ trend }: { trend: ProgressTrend | null }) {
  const cur = trend?.current_trend_kg ?? null
  const rate = trend?.rate_kg_week ?? null
  const total = trend?.total_change_kg ?? null
  return (
    <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
      <MiniStat label="Trend weight" value={kg(cur, 2)} accent={cur !== null ? 'text-volt' : ''} />
      <MiniStat
        label="Rate"
        value={rate !== null ? `${signed(rate, 2)} kg/wk` : '—'}
        accent={rate !== null ? (rate < 0 ? 'text-positive' : rate > 0 ? 'text-warning' : '') : ''}
      />
      <MiniStat
        label="Total change"
        value={total !== null ? `${signed(total, 2)} kg` : '—'}
        accent={total !== null ? (total < 0 ? 'text-positive' : total > 0 ? 'text-warning' : '') : ''}
      />
    </div>
  )
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`mt-0.5 text-[15px] font-semibold tabular-nums ${accent || 'text-ink'}`}>{value}</p>
    </div>
  )
}

const PAGE_SIZE = 14

function MetricList({
  metrics,
  userId,
  onDelete,
}: {
  metrics: BodyMetric[]
  userId: string
  onDelete: () => void
}) {
  const push = useToastStore((s) => s.push)
  const remove = useAction((id: string) => progressService.deleteMetric(userId, id))
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [pendingDelete, setPendingDelete] = useState<BodyMetric | null>(null)

  const shown = metrics.slice(0, visible)
  const remaining = metrics.length - shown.length

  function handleDelete() {
    if (!pendingDelete) return
    void remove.run(pendingDelete.id).then((ok) => {
      if (ok === null) {
        push(remove.error ?? 'Could not delete entry', 'error')
        return
      }
      setPendingDelete(null)
      push('Entry removed', 'info')
      onDelete()
    })
  }

  return (
    <>
      <ul className="flex flex-col divide-y divide-line">
        {shown.map((metric) => (
          <li key={metric.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-ink">{friendlyDate(metric.log_date)}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-ink-muted">
                {metric.weight_kg !== null && <span>Weight {kg(metric.weight_kg, 1)}</span>}
                {metric.waist_cm !== null && <span>Waist {cm(metric.waist_cm, 1)}</span>}
                {metric.chest_cm !== null && <span>Chest {cm(metric.chest_cm, 1)}</span>}
                {metric.arm_cm !== null && <span>Arm {cm(metric.arm_cm, 1)}</span>}
              </p>
            </div>
            <button
              type="button"
              aria-label={`Delete entry for ${metric.log_date}`}
              onClick={() => setPendingDelete(metric)}
              className="flex size-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-surface-2 hover:text-danger"
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>

      {remaining > 0 && (
        <div className="flex justify-center border-t border-line pt-3">
          <Button variant="ghost" size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE * 2)}>
            Show {Math.min(remaining, PAGE_SIZE * 2)} more
            <span className="text-ink-faint">· {remaining} older</span>
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        loading={remove.loading}
        error={remove.error}
        title="Delete this entry?"
        description={
          pendingDelete
            ? `The weigh-in for ${friendlyDate(pendingDelete.log_date).toLowerCase()} is removed and the smoothed trend recalculates without it.`
            : undefined
        }
        confirmLabel="Delete entry"
      />
    </>
  )
}
