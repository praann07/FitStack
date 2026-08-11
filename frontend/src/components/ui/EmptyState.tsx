import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} />
}

export function SkeletonLines({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-4', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <Skeleton className="mb-3 h-4 w-1/3" />
      <SkeletonLines lines={2} />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-10 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-1 flex size-11 items-center justify-center rounded-xl bg-surface-2 text-ink-faint">
          {icon}
        </div>
      )}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {description && (
        <p className="max-w-sm text-[13px] leading-relaxed text-ink-muted">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
