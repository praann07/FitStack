import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

export function MacroBar({
  label,
  value,
  target,
  color,
  unit = 'g',
  icon,
  decimals = 0,
}: {
  label: string
  value: number
  target: number
  color: string
  unit?: string
  icon?: ReactNode
  decimals?: number
}) {
  const ratio = target > 0 ? value / target : 0
  const over = ratio >= 1

  const fmt = (n: number) =>
    decimals > 0 ? n.toFixed(decimals).replace(/\.0$/, '') : String(Math.round(n))

  return (
    <div>
      <div className="flex items-center justify-between text-[12.5px]">
        <span className="flex items-center gap-1.5 font-medium text-ink-muted">
          {icon}
          {label}
        </span>
        <span className="tabular-nums text-ink">
          {fmt(value)}
          <span className="text-ink-faint"> / {fmt(target)} {unit}</span>
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuenow={Math.min(100, Math.round(ratio * 100))}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-300', over && 'opacity-80')}
          style={{
            width: `${Math.min(100, ratio * 100)}%`,
            background: color,
            opacity: over ? 0.75 : 1,
          }}
        />
      </div>
    </div>
  )
}
