import type { ReactNode } from 'react'

/** Shared dark tooltip shell for every Recharts tooltip. */
export function ChartTooltip({ label, children }: { label?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 shadow-[var(--shadow-pop)]">
      {label !== undefined && <p className="mb-1 text-[11.5px] font-semibold text-ink-faint">{label}</p>}
      {children}
    </div>
  )
}

export function TooltipRow({ color, name, value }: { color: string; name: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-[12.5px]">
      <span className="size-2 rounded-sm" style={{ background: color }} aria-hidden />
      <span className="text-ink-muted">{name}</span>
      <span className="ml-auto pl-3 font-semibold tabular-nums text-ink">{value}</span>
    </div>
  )
}
