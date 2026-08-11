import { create } from 'zustand'

const SOUND_KEY = 'fitstack.restTimer.sound'

function readSoundPreference(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

interface RestTimerState {
  /** Epoch ms the countdown finishes at, or null when idle. */
  endsAt: number | null
  /** Full length of the current rest period, for the progress bar. */
  durationSeconds: number
  /** Exercise the rest belongs to — shown on the timer bar. */
  label: string | null
  soundEnabled: boolean

  start: (seconds: number, label: string) => void
  extend: (deltaSeconds: number) => void
  stop: () => void
  toggleSound: () => void
}

/**
 * Rest timer state.
 *
 * Purely client-side (system design §9): seeded from
 * `routine_exercises.rest_seconds` when a set is logged. Kept in a store rather
 * than component state so it survives re-renders of the exercise list and stays
 * accurate when the tab is backgrounded — the countdown is derived from an
 * absolute timestamp, not an accumulating interval.
 */
export const useRestTimerStore = create<RestTimerState>((set, get) => ({
  endsAt: null,
  durationSeconds: 0,
  label: null,
  soundEnabled: readSoundPreference(),

  start(seconds, label) {
    if (seconds <= 0) return
    set({ endsAt: Date.now() + seconds * 1000, durationSeconds: seconds, label })
  },

  extend(deltaSeconds) {
    const { endsAt, durationSeconds } = get()
    if (endsAt === null) return
    const next = Math.max(Date.now() + 1000, endsAt + deltaSeconds * 1000)
    set({
      endsAt: next,
      durationSeconds: Math.max(durationSeconds + deltaSeconds, Math.ceil((next - Date.now()) / 1000)),
    })
  },

  stop() {
    set({ endsAt: null, durationSeconds: 0, label: null })
  },

  toggleSound() {
    const next = !get().soundEnabled
    try {
      localStorage.setItem(SOUND_KEY, next ? 'on' : 'off')
    } catch {
      // Preference is a nicety — ignore storage failures.
    }
    set({ soundEnabled: next })
  },
}))

/** Short two-tone chime via WebAudio, so no asset has to ship or load. */
export function playRestChime(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const now = ctx.currentTime
    ;[
      [880, 0],
      [1174.7, 0.16],
    ].forEach(([freq, offset]) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + offset)
      gain.gain.exponentialRampToValueAtTime(0.16, now + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + offset)
      osc.stop(now + offset + 0.24)
    })
    setTimeout(() => void ctx.close(), 800)
  } catch {
    // Autoplay policy or unsupported browser — the visual timer is enough.
  }
}
