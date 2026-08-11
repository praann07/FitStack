import { useEffect, useRef, useState } from 'react'
import { Bug, Check } from 'lucide-react'
import {
  failNextRequests,
  getTransportState,
  setLatencyMode,
  subscribeTransport,
} from '@/services'
import type { LatencyMode } from '@/services'
import { cn } from '@/lib/cn'

const MODES: { value: LatencyMode; label: string }[] = [
  { value: 'fast', label: 'Fast' },
  { value: 'realistic', label: 'Realistic' },
  { value: 'slow', label: 'Slow' },
]

/**
 * Demo-only transport controls (mock backend latency + forced failures).
 * This file disappears in Phase 2 when the mock transport does.
 */
export function DevControls() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<LatencyMode>(() => getTransportState().latency)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => subscribeTransport((s) => setMode(s.latency)), [])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-medium text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink-muted"
      >
        <Bug className="size-3.5" />
        <span className="flex-1 text-left">Demo controls</span>
        <span className="capitalize">{mode}</span>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-1 w-64 animate-scale-in rounded-xl border border-line bg-surface-2 p-3 shadow-[var(--shadow-pop)]">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            Mock API latency
          </p>
          <div className="mb-3 flex gap-1">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setLatencyMode(m.value)}
                className={cn(
                  'flex-1 rounded-md px-2 py-1.5 text-[12px] font-medium capitalize transition-colors',
                  mode === m.value ? 'bg-volt-soft text-volt' : 'text-ink-muted hover:bg-surface-3',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              failNextRequests(1)
              setOpen(false)
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 text-[12px] font-medium text-ink-muted transition-colors hover:text-danger"
          >
            <Check className="size-3.5" /> Fail next request
          </button>
          <p className="mt-2 text-[11px] leading-snug text-ink-faint">
            Exercises the loading / error / retry states on real screens.
          </p>
        </div>
      )}
    </div>
  )
}
