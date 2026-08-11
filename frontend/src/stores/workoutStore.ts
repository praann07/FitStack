import { create } from 'zustand'
import { workoutService } from '@/services'

interface WorkoutState {
  hasActive: boolean
  /** Bumped whenever the active-session status might have changed. */
  version: number
  refresh: (userId: string) => Promise<void>
  setActive: (active: boolean) => void
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  hasActive: false,
  version: 0,

  async refresh(userId) {
    try {
      const session = await workoutService.getActiveSession(userId)
      set({ hasActive: session !== null, version: get().version + 1 })
    } catch {
      // Transport hiccup — leave the current flag alone.
    }
  },

  setActive(active) {
    if (get().hasActive !== active) set({ hasActive: active })
  },
}))
