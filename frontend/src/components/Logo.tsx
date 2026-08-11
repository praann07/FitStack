import { cn } from '@/lib/cn'

export function Logo({ className, mark }: { className?: string; mark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="flex size-7 items-center justify-center rounded-lg bg-volt text-canvas">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
          <path
            d="M6.5 6.5v11M17.5 6.5v11M3 12h18M6.5 12l2-2M17.5 12l-2-2M6.5 12l2 2M17.5 12l-2 2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {!mark && (
        <span className="text-[17px] font-bold tracking-tight text-ink">
          Fit<span className="text-volt">Stack</span>
        </span>
      )}
    </span>
  )
}
