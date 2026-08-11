import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

type Tone = 'volt' | 'neutral' | 'positive' | 'warning' | 'danger' | 'info' | 'protein' | 'carbs' | 'fat'

const TONE: Record<Tone, string> = {
  volt: 'bg-volt-soft text-volt',
  neutral: 'bg-surface-3 text-ink-muted',
  positive: 'bg-positive-soft text-positive',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  protein: 'bg-info-soft text-protein',
  carbs: 'bg-warning-soft text-carbs',
  fat: 'bg-[#2a1633] text-fat',
}

const SIZE = {
  sm: 'h-5 px-1.5 text-[11px] rounded-md gap-1',
  md: 'h-6 px-2 text-[12px] rounded-md gap-1.5',
} as const

export function Badge({
  tone = 'neutral',
  size = 'sm',
  dot,
  className,
  children,
}: {
  tone?: Tone
  size?: keyof typeof SIZE
  dot?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium tracking-wide',
        TONE[tone],
        SIZE[size],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}
