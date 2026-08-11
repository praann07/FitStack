import { useMemo, useState } from 'react'
import { CalendarDays, Flame, Pencil, RefreshCw, Target } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { Field, NumberField } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { SuggestionCard } from '@/components/macros/SuggestionCard'
import { TdeeChart } from '@/components/charts/TdeeChart'
import { useAsync, useAction } from '@/hooks/useAsync'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { nutritionService, progressService } from '@/services'
import { longDate } from '@/lib/date'
import { kcal, kg, num } from '@/lib/format'
import { CONFIDENCE_LABEL, MACRO_COLOR } from '@/lib/format'
import type { NutritionTarget } from '@/types'

export function NutritionTargetsPage() {
  const user = useAuthStore((s) => s.user)
  const push = useToastStore((s) => s.push)
  if (!user) return null

  return <TargetsView userId={user.id} goal={user.goal} onToast={push} />
}

function TargetsView({
  userId,
  goal,
  onToast,
}: {
  userId: string
  goal: 'bulk' | 'cut' | 'maintain'
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void
}) {
  const [manualOpen, setManualOpen] = useState(false)

  const target = useAsync(() => nutritionService.currentTarget(userId), [userId])
  const history = useAsync(() => nutritionService.targetHistory(userId), [userId])
  const tdee = useAsync(() => nutritionService.tdeeHistory(userId), [userId])
  const suggestion = useAsync(() => nutritionService.currentSuggestion(userId), [userId])
  const trend = useAsync(() => progressService.getTrend(userId, 90), [userId])

  const recompute = useAction(() => nutritionService.recompute(userId))
  const accept = useAction((id: string) => nutritionService.acceptSuggestion(userId, id))
  const dismiss = useAction((id: string) => nutritionService.dismissSuggestion(userId, id))

  const weightKg = trend.data?.current_trend_kg ?? 75

  function handleRecompute() {
    void recompute.run().then((res) => {
      if (res === null) {
        onToast(recompute.error ?? 'Could not recalculate TDEE', 'error')
        return
      }
      onToast(res.message, res.tdee ? 'success' : 'info')
      target.reload()
      tdee.reload()
      suggestion.reload()
    })
  }

  const loading = target.loading || tdee.loading

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Targets"
        subtitle="Calorie and macro targets, kept honest by the adaptive engine."
        actions={
          <Button onClick={handleRecompute} loading={recompute.loading}>
            <RefreshCw className="size-4" /> Recalculate TDEE
          </Button>
        }
      />

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-40 w-full lg:col-span-2" />
        </div>
      ) : (
        <>
          {suggestion.data && (
            <SuggestionCard
              suggestion={suggestion.data}
              accepting={accept.loading}
              onAccept={() =>
                void accept.run(suggestion.data!.id).then((ok) => {
                  if (ok === null) {
                    onToast(accept.error ?? 'Could not accept suggestion', 'error')
                    return
                  }
                  onToast(`Targets updated to ${num(ok.calories, 0)} kcal`, 'success')
                  target.reload()
                  history.reload()
                  suggestion.reload()
                })
              }
              onDismiss={() =>
                void dismiss.run(suggestion.data!.id).then((ok) => {
                  if (ok === null) {
                    onToast(dismiss.error ?? 'Could not dismiss suggestion', 'error')
                    return
                  }
                  onToast('Suggestion dismissed', 'info')
                  suggestion.reload()
                })
              }
            />
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Current target"
                subtitle="Applied to today, and any day without a newer target"
                icon={<Target className="size-4" />}
                action={
                  target.data && (
                    <Button variant="outline" size="sm" onClick={() => setManualOpen(true)}>
                      <Pencil className="size-3.5" /> Edit manually
                    </Button>
                  )
                }
              />
              <CardBody>
                {!target.data ? (
                  <EmptyState
                    title="No target set"
                    description="Recalculate TDEE to generate a starting target, or set one manually."
                  />
                ) : (
                  <TargetCard
                    target={target.data}
                    isBaseline={(tdee.data?.length ?? 0) === 0}
                  />
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="TDEE history"
                subtitle="Back-calculated maintenance from real food and weight data"
                icon={<Flame className="size-4" />}
              />
              <CardBody>
                {tdee.data && tdee.data.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    <TdeeChart estimates={tdee.data} />
                    <LatestEstimate estimates={tdee.data} />
                  </div>
                ) : (
                  <EmptyState
                    title="No estimates yet"
                    description="The adaptive engine needs ~7 days of weigh-ins and food logs. Hit 'Recalculate TDEE' to try."
                  />
                )}
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Target history"
              subtitle="Every target you've set, newest first"
              icon={<CalendarDays className="size-4" />}
            />
            <CardBody className="pt-1">
              {!history.data || history.data.length === 0 ? (
                <EmptyState title="No targets yet" description="Your first target will appear here." />
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {history.data.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold text-ink">{longDate(t.effective_date)}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-muted">
                          <span className="flex items-center gap-1.5">
                            <span className="size-1.5 rounded-full" style={{ background: MACRO_COLOR.protein }} aria-hidden />
                            P {t.protein_g}g
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="size-1.5 rounded-full" style={{ background: MACRO_COLOR.carbs }} aria-hidden />
                            C {t.carbs_g}g
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="size-1.5 rounded-full" style={{ background: MACRO_COLOR.fat }} aria-hidden />
                            F {t.fat_g}g
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[15px] font-bold tabular-nums text-ink">{kcal(t.calories)}</span>
                        <SourceBadge source={t.source} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </>
      )}

      {manualOpen && target.data && (
        <ManualTargetModal
          userId={userId}
          goal={goal}
          weightKg={weightKg}
          initial={target.data}
          onClose={() => setManualOpen(false)}
          onSaved={() => {
            target.reload()
            history.reload()
          }}
        />
      )}
    </div>
  )
}

function TargetCard({ target, isBaseline }: { target: NutritionTarget; isBaseline: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Calories</p>
          <p className="text-[32px] font-bold leading-none tabular-nums tracking-tight text-ink">
            {num(target.calories, 0)}
          </p>
          <p className="mt-1 text-[12.5px] text-ink-faint">kcal per day</p>
        </div>
        <SourceBadge source={target.source} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ['Protein', target.protein_g, MACRO_COLOR.protein],
            ['Carbs', target.carbs_g, MACRO_COLOR.carbs],
            ['Fat', target.fat_g, MACRO_COLOR.fat],
          ] as const
        ).map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-line bg-surface-2/60 p-3">
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink-muted">
              <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
              {label}
            </span>
            <p className="mt-1 text-[20px] font-semibold tabular-nums leading-none text-ink">
              {value}
              <span className="text-[12px] font-medium text-ink-faint">g</span>
            </p>
          </div>
        ))}
      </div>

      {target.source === 'manual' && (
        <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
          Manual target — the adaptive engine won't overwrite it until you recalculate and accept.
        </p>
      )}

      {isBaseline && target.source !== 'manual' && (
        <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed text-ink-muted">
          Starting baseline from the Mifflin-St Jeor formula. Once you have about a week of
          weigh-ins and food logs, FitStack replaces it with a TDEE back-calculated from what
          actually happened.
        </p>
      )}
    </div>
  )
}

function LatestEstimate({ estimates }: { estimates: { estimate_date: string; estimated_tdee: number; weight_trend_kg: number; confidence: 'low' | 'medium' | 'high' }[] }) {
  const latest = estimates[estimates.length - 1]
  if (!latest) return null
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-3 text-[12.5px]">
      <span className="flex items-center gap-2 text-ink-muted">
        <Flame className="size-3.5 text-volt" />
        Latest: <span className="font-semibold tabular-nums text-ink">{kcal(latest.estimated_tdee)}</span>
      </span>
      <span className="text-ink-muted">
        Trend weight <span className="font-semibold tabular-nums text-ink">{kg(latest.weight_trend_kg, 2)}</span>
      </span>
      <span className="text-ink-muted">from {longDate(latest.estimate_date)}</span>
      <ConfidenceBadge confidence={latest.confidence} />
    </div>
  )
}

function ConfidenceBadge({ confidence }: { confidence: 'low' | 'medium' | 'high' }) {
  const tone = confidence === 'high' ? 'positive' : confidence === 'medium' ? 'neutral' : 'warning'
  return (
    <Badge tone={tone} dot>
      {CONFIDENCE_LABEL[confidence]}
    </Badge>
  )
}

function SourceBadge({ source }: { source: 'adaptive' | 'manual' }) {
  return (
    <Badge tone={source === 'adaptive' ? 'volt' : 'info'} dot>
      {source === 'adaptive' ? 'Adaptive' : 'Manual'}
    </Badge>
  )
}

function ManualTargetModal({
  userId,
  goal,
  weightKg,
  initial,
  onClose,
  onSaved,
}: {
  userId: string
  goal: 'bulk' | 'cut' | 'maintain'
  weightKg: number
  initial: NutritionTarget
  onClose: () => void
  onSaved: () => void
}) {
  const push = useToastStore((s) => s.push)
  const [calories, setCalories] = useState<number | null>(initial.calories)

  const preview = useMemo(
    () => (calories !== null ? nutritionService.previewMacros(calories, weightKg, goal) : null),
    [calories, weightKg, goal],
  )

  const save = useAction((macros: NonNullable<typeof preview>) =>
    nutritionService.setManualTarget(userId, macros),
  )

  function submit() {
    if (!preview) return
    void save.run(preview).then((ok) => {
      if (ok === null) {
        push(save.error ?? 'Could not save target', 'error')
        return
      }
      push(`Manual target set to ${num(ok.calories, 0)} kcal`, 'success')
      onSaved()
      onClose()
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Set target manually"
      description="Switches your target to manual until you recalculate and accept an adaptive suggestion."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.loading} disabled={calories === null || calories <= 0}>
            Save target
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Daily calories" hint={`Protein is anchored to ${kg(weightKg, 2)}; carbs and fat adjust with calories.`}>
          <NumberField value={calories} onValueChange={setCalories} suffix="kcal" min={800} placeholder="2000" autoFocus />
        </Field>

        {preview && (
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ['Protein', preview.protein_g, MACRO_COLOR.protein],
                ['Carbs', preview.carbs_g, MACRO_COLOR.carbs],
                ['Fat', preview.fat_g, MACRO_COLOR.fat],
              ] as const
            ).map(([label, value, color]) => (
              <div key={label} className="rounded-xl border border-line bg-surface-2/60 p-3">
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink-muted">
                  <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
                  {label}
                </span>
                <p className="mt-1 text-[18px] font-semibold tabular-nums leading-none text-ink">
                  {value}
                  <span className="text-[12px] font-medium text-ink-faint">g</span>
                </p>
              </div>
            ))}
          </div>
        )}

        {save.error && (
          <p className="text-[12.5px] text-danger" role="alert">
            {save.error}
          </p>
        )}
      </div>
    </Modal>
  )
}
