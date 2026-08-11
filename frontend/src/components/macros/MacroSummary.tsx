import { Card } from '@/components/ui/Card'
import { Ring } from '@/components/ui/Ring'
import { MacroBar } from '@/components/macros/MacroBar'
import { MACRO_COLOR } from '@/lib/format'
import { kcal } from '@/lib/format'
import type { Macros } from '@/types'

export function MacroSummary({
  totals,
  target,
  onTargetClick,
  label = "Today's macros",
}: {
  totals: Macros
  target: Macros | null
  onTargetClick?: () => void
  label?: string
}) {
  const remaining = target ? target.calories - totals.calories : 0

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">{label}</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">
            {target ? (
              <>
                <span className={remaining >= 0 ? 'text-ink-muted' : 'font-semibold text-danger'}>
                  {remaining >= 0 ? `${Math.round(remaining).toLocaleString()} kcal` : `${Math.abs(Math.round(remaining)).toLocaleString()} kcal over`}
                </span>{' '}
                remaining
                {onTargetClick && (
                  <button type="button" onClick={onTargetClick} className="ml-1 font-semibold text-volt hover:text-volt-dim">
                    Edit target
                  </button>
                )}
              </>
            ) : (
              'Set a daily target to see progress.'
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-5">
        <Ring
          value={totals.calories}
          max={target?.calories ?? 1}
          size={92}
          stroke={8}
          onThreshold={!!target && totals.calories >= target.calories}
        >
          <span className="text-lg font-bold tabular-nums leading-none text-ink">
            {Math.round(totals.calories).toLocaleString()}
          </span>
          <span className="mt-0.5 text-[11px] text-ink-faint">
            {target ? `of ${Math.round(target.calories).toLocaleString()}` : 'kcal'}
          </span>
        </Ring>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <MacroBar
            label="Protein"
            value={totals.protein_g}
            target={target?.protein_g ?? 1}
            color={MACRO_COLOR.protein}
            icon={<span className="size-1.5 rounded-full" style={{ background: MACRO_COLOR.protein }} />}
          />
          <MacroBar
            label="Carbs"
            value={totals.carbs_g}
            target={target?.carbs_g ?? 1}
            color={MACRO_COLOR.carbs}
            icon={<span className="size-1.5 rounded-full" style={{ background: MACRO_COLOR.carbs }} />}
          />
          <MacroBar
            label="Fat"
            value={totals.fat_g}
            target={target?.fat_g ?? 1}
            color={MACRO_COLOR.fat}
            icon={<span className="size-1.5 rounded-full" style={{ background: MACRO_COLOR.fat }} />}
          />
        </div>
      </div>

      {target && (
        <p className="mt-4 border-t border-line pt-3 text-[11.5px] text-ink-faint">
          Target {kcal(target.calories)} · {target.protein_g}g P / {target.carbs_g}g C / {target.fat_g}g F
        </p>
      )}
    </Card>
  )
}
