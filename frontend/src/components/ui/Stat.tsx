import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

/** Big number + label card used across the dashboard. */
export function Stat({
  label,
  value,
  sub,
  icon,
  trend,
  className,
  valueClassName,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: ReactNode
  trend?: 'up' | 'down' | 'flat'
  className?: string
  valueClassName?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-[var(--radius-card)] border border-line bg-surface p-4',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium uppercase tracking-wide text-ink-faint">
          {label}
        </span>
        {icon && <span className="text-ink-faint">{icon}</span>}
      </div>
      <div className={cn('text-[26px] font-semibold leading-none tracking-tight text-ink', valueClassName)}>
        {value}
      </div>
      {sub && <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-muted">{sub}</div>}
      {trend && <TrendDot trend={trend} />}
    </div>
  )
}

function TrendDot({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  return (
    <span
      className={cn(
        'mt-1 inline-flex h-1.5 w-1.5 rounded-full',
        trend === 'up' && 'bg-positive',
        trend === 'down' && 'bg-danger',
        trend === 'flat' && 'bg-ink-faint',
      )}
      aria-hidden
    />
  )
}
