import { useEffect, useRef, useState } from 'react'
import { Bell, BellOff, Minus, Plus, Timer, X } from 'lucide-react'
import { playRestChime, useRestTimerStore } from '@/stores/restTimerStore'
import { useToastStore } from '@/stores/toastStore'
import { clock } from '@/lib/date'
import { cn } from '@/lib/cn'

/**
 * Floating rest countdown shown during an active workout.
 *
 * Seeded from the routine's `rest_seconds` when a set is logged; the lifter can
 * add or remove 15 s or skip it entirely. Renders nothing when idle.
 */
export function RestTimerBar() {
  const endsAt = useRestTimerStore((s) => s.endsAt)
  const duration = useRestTimerStore((s) => s.durationSeconds)
  const label = useRestTimerStore((s) => s.label)
  const soundEnabled = useRestTimerStore((s) => s.soundEnabled)
  const extend = useRestTimerStore((s) => s.extend)
  const stop = useRestTimerStore((s) => s.stop)
  const toggleSound = useRestTimerStore((s) => s.toggleSound)
  const push = useToastStore((s) => s.push)

  const [remaining, setRemaining] = useState(0)
  const firedRef = useRef(false)

  useEffect(() => {
    if (endsAt === null) return
    firedRef.current = false

    const tick = () => {
      const left = (endsAt - Date.now()) / 1000
      setRemaining(Math.max(0, left))
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true
        if (useRestTimerStore.getState().soundEnabled) playRestChime()
        push('Rest complete — next set', 'info')
        window.setTimeout(() => useRestTimerStore.getState().stop(), 1500)
      }
    }

    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [endsAt, push])

  if (endsAt === null) return null

  const done = remaining <= 0
  const progress = duration > 0 ? Math.min(1, Math.max(0, 1 - remaining / duration)) : 1

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 md:pl-64">
      <div
        role="timer"
        aria-live="off"
        aria-label={`Rest timer, ${clock(remaining)} remaining`}
        className={cn(
          'pointer-events-auto relative w-full max-w-md overflow-hidden rounded-xl border bg-surface-2',
          'shadow-[var(--shadow-pop)] transition-colors',
          done ? 'border-volt' : 'border-line-strong',
        )}
      >
        <div className="flex items-center gap-3 px-3.5 py-2.5">
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg',
              done ? 'bg-volt text-canvas' : 'bg-volt-soft text-volt',
            )}
          >
            <Timer className="size-4.5" aria-hidden />
          </span>

          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-2">
              <span
                className={cn(
                  'text-[19px] font-bold tabular-nums leading-none',
                  done ? 'text-volt' : 'text-ink',
                )}
              >
                {clock(remaining)}
              </span>
              <span className="truncate text-[12px] text-ink-muted">
                {done ? 'Rest complete' : `Rest · ${label ?? 'next set'}`}
              </span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => extend(-15)}
              aria-label="Take 15 seconds off the rest timer"
              className="flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-3 hover:text-ink"
            >
              <Minus className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => extend(15)}
              aria-label="Add 15 seconds to the rest timer"
              className="flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-3 hover:text-ink"
            >
              <Plus className="size-4" />
            </button>
            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundEnabled ? 'Mute rest timer chime' : 'Unmute rest timer chime'}
              aria-pressed={soundEnabled}
              className="flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-3 hover:text-ink"
            >
              {soundEnabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
            </button>
            <button
              type="button"
              onClick={stop}
              aria-label="Skip rest"
              className="flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-3 hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="h-1 w-full bg-surface-3" aria-hidden>
          <div
            className={cn('h-full transition-[width] duration-200 ease-linear', done ? 'bg-volt' : 'bg-volt-dim')}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}
