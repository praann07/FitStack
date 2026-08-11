import { cn } from '@/lib/cn'

export function Ring({
  value,
  max,
  size = 88,
  stroke = 7,
  className,
  children,
  trackClassName,
  onThreshold,
}: {
  /** 0..1 (or absolute value when max given) progress */
  value: number
  max?: number
  size?: number
  stroke?: number
  className?: string
  children?: React.ReactNode
  trackClassName?: string
  /** Warn colour used when exceeded — e.g. calories over target. */
  onThreshold?: boolean
}) {
  const ratio = Math.max(0, Math.min(1, max !== undefined ? value / max : value))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - ratio)

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-surface-3)"
          strokeWidth={stroke}
          className={cn('transition-[stroke]', trackClassName)}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={onThreshold && ratio >= 1 ? 'var(--color-danger)' : 'var(--color-volt)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset,stroke] duration-300"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}
