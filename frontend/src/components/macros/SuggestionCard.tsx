import { ArrowDownRight, ArrowUpRight, Sparkles, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { kcal, num, signed } from '@/lib/format'
import { MACRO_COLOR } from '@/lib/format'
import { shortDate } from '@/lib/date'
import type { MacroSuggestion } from '@/types'

/**
 * The adaptive retarget banner — dashboard + targets screen.
 * Proposes a kcal move when the real trend deviates from the goal for two weeks.
 */
export function SuggestionCard({
  suggestion,
  accepting,
  onAccept,
  onDismiss,
  onViewTargets,
}: {
  suggestion: MacroSuggestion
  accepting?: boolean
  onAccept: () => void
  onDismiss: () => void
  onViewTargets?: () => void
}) {
  const up = suggestion.calorie_delta > 0

  return (
    <Card className="relative overflow-hidden border-volt/25">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{
          background:
            'linear-gradient(180deg, var(--color-volt), var(--color-volt-dim))',
        }}
      />
      <div className="flex flex-col gap-4 p-5 pl-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-volt-soft text-volt">
              <Sparkles className="size-4.5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="volt">Adaptive suggestion</Badge>
                <span className="text-[11.5px] text-ink-faint">
                  from {shortDate(suggestion.created_date)}
                </span>
              </div>
              <h2 className="mt-1 text-[15px] font-semibold text-ink">{suggestion.reason}</h2>
              <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-ink-muted">
                {suggestion.detail}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onDismiss} className="shrink-0">
            <X className="size-3.5" /> Dismiss
          </Button>
        </div>

        <div className="grid gap-4 rounded-xl border border-line bg-surface-2/60 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
          <div className="flex items-center gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Current
              </span>
              <span className="text-lg font-bold tabular-nums text-ink">
                {kcal(suggestion.current.calories)}
              </span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold ${
                  up ? 'bg-positive-soft text-positive' : 'bg-danger-soft text-danger'
                }`}
              >
                {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {signed(suggestion.calorie_delta, 0)}
              </span>
              <span className="text-[10.5px] text-ink-faint">kcal / day</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Proposed
              </span>
              <span className="text-lg font-bold tabular-nums text-volt">
                {kcal(suggestion.proposed.calories)}
              </span>
            </div>
          </div>

          <div className="hidden h-10 w-px bg-line sm:block" />

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12.5px]">
            {(
              [
                ['Protein', 'protein_g', MACRO_COLOR.protein],
                ['Carbs', 'carbs_g', MACRO_COLOR.carbs],
                ['Fat', 'fat_g', MACRO_COLOR.fat],
              ] as const
            ).map(([label, key, color]) => {
              const from = suggestion.current[key]
              const to = suggestion.proposed[key]
              const diff = to - from
              return (
                <span key={key} className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
                  <span className="text-ink-muted">{label}</span>
                  <span className="font-semibold tabular-nums text-ink">
                    {num(from, 0)} → {num(to, 0)}
                    {diff !== 0 && (
                      <span className={diff > 0 ? 'text-positive' : 'text-danger'}>
                        {' '}
                        {signed(diff, 0)}g
                      </span>
                    )}
                  </span>
                </span>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" loading={accepting} onClick={onAccept}>
            Accept {up ? 'increase' : 'adjustment'}
          </Button>
          {onViewTargets && (
            <Button variant="outline" size="sm" onClick={onViewTargets}>
              View targets
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
