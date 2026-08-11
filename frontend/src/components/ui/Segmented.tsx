import { cn } from '@/lib/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  badge?: number
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (v: T) => void
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors',
              size === 'sm' ? 'h-6.5 px-2.5 text-[12px]' : 'h-7.5 px-3 text-[13px]',
              active
                ? 'bg-surface-3 text-ink shadow-[var(--shadow-card)]'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {opt.label}
            {opt.badge !== undefined && (
              <span
                className={cn(
                  'rounded px-1 text-[11px] tabular-nums',
                  active ? 'bg-volt-soft text-volt' : 'bg-surface-3 text-ink-faint',
                )}
              >
                {opt.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
