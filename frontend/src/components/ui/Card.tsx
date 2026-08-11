import { cn } from '@/lib/cn'
import type { HTMLAttributes, ReactNode } from 'react'

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]',
        className,
      )}
      {...rest}
    />
  )
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div className="flex items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-muted">
            {icon}
          </span>
        )}
        <div>
          <h2 className="text-[15px] font-semibold leading-tight text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5', className)} {...rest} />
}
