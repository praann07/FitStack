import { QUALIFYING_SET_TYPES } from '@/types'
import type { WorkoutSet, MuscleGroup, Exercise } from '@/types'

/**
 * Training maths — system design §7.
 *
 * Phase 1 runs these client-side against mock data. In Phase 2 the backend
 * owns them; the shapes returned here are what the API is expected to return,
 * so the UI does not change.
 */

/** Epley: 1RM = weight * (1 + reps / 30). Used to compare PRs across rep ranges. */
export function estimated1RM(weightKg: number, reps: number): number {
  if (!weightKg || !reps) return 0
  return weightKg * (1 + reps / 30)
}

/** Warm-up and drop sets never count toward PRs or volume. */
export function isQualifying(set: Pick<WorkoutSet, 'set_type'>): boolean {
  return QUALIFYING_SET_TYPES.includes(set.set_type)
}

export function setVolume(set: Pick<WorkoutSet, 'weight_kg' | 'reps' | 'set_type'>): number {
  if (!isQualifying(set)) return 0
  return (set.weight_kg || 0) * (set.reps || 0)
}

export function totalVolume(sets: WorkoutSet[]): number {
  return sets.reduce((sum, s) => sum + setVolume(s), 0)
}

export function topSet(sets: WorkoutSet[]): WorkoutSet | null {
  const qualifying = sets.filter(isQualifying)
  if (qualifying.length === 0) return null
  return qualifying.reduce((best, s) =>
    estimated1RM(s.weight_kg, s.reps) > estimated1RM(best.weight_kg, best.reps) ? s : best,
  )
}

/**
 * PR check for a single set against the historical best for that exercise.
 * A set is a PR when it beats the previous best estimated 1RM, or matches the
 * best weight with more reps.
 */
export function isPersonalRecord(
  candidate: Pick<WorkoutSet, 'weight_kg' | 'reps' | 'set_type'>,
  history: Pick<WorkoutSet, 'weight_kg' | 'reps' | 'set_type'>[],
): boolean {
  if (!isQualifying(candidate)) return false
  if (!candidate.weight_kg || !candidate.reps) return false
  const best = history.filter(isQualifying).reduce(
    (acc, s) => ({
      e1rm: Math.max(acc.e1rm, estimated1RM(s.weight_kg, s.reps)),
      weight: Math.max(acc.weight, s.weight_kg),
    }),
    { e1rm: 0, weight: 0 },
  )
  const candidateE1rm = estimated1RM(candidate.weight_kg, candidate.reps)
  // +0.01 guards against float noise re-flagging an identical set.
  return candidateE1rm > best.e1rm + 0.01 || candidate.weight_kg > best.weight + 0.01
}

export function emptyMuscleRecord(): Record<MuscleGroup, number> {
  return { chest: 0, back: 0, legs: 0, shoulders: 0, arms: 0, core: 0 }
}

export function volumeByMuscleGroup(
  sets: WorkoutSet[],
  exerciseById: Map<string, Exercise>,
): Record<MuscleGroup, number> {
  const out = emptyMuscleRecord()
  for (const set of sets) {
    const exercise = exerciseById.get(set.exercise_id)
    if (!exercise) continue
    out[exercise.muscle_group] += setVolume(set)
  }
  return out
}

export function setsByMuscleGroup(
  sets: WorkoutSet[],
  exerciseById: Map<string, Exercise>,
): Record<MuscleGroup, number> {
  const out = emptyMuscleRecord()
  for (const set of sets) {
    if (!isQualifying(set)) continue
    const exercise = exerciseById.get(set.exercise_id)
    if (!exercise) continue
    out[exercise.muscle_group] += 1
  }
  return out
}

/**
 * Weekly hard-set landmarks per muscle group (Renaissance Periodization style).
 * MEV = minimum effective volume, MAV = adaptive volume, MRV = maximum
 * recoverable volume. Used to colour the weekly volume bars.
 */
export const VOLUME_LANDMARKS: Record<MuscleGroup, { mev: number; mav: number; mrv: number }> = {
  chest: { mev: 8, mav: 16, mrv: 22 },
  back: { mev: 10, mav: 18, mrv: 25 },
  legs: { mev: 8, mav: 16, mrv: 22 },
  shoulders: { mev: 8, mav: 16, mrv: 24 },
  arms: { mev: 6, mav: 14, mrv: 20 },
  core: { mev: 4, mav: 10, mrv: 16 },
}

export type VolumeZone = 'below' | 'optimal' | 'high' | 'over'

export function volumeZone(group: MuscleGroup, hardSets: number): VolumeZone {
  const { mev, mav, mrv } = VOLUME_LANDMARKS[group]
  if (hardSets < mev) return 'below'
  if (hardSets <= mav) return 'optimal'
  if (hardSets <= mrv) return 'high'
  return 'over'
}

export const VOLUME_ZONE_COPY: Record<VolumeZone, string> = {
  below: 'Below MEV',
  optimal: 'In range',
  high: 'Above MAV',
  over: 'Over MRV',
}

/**
 * Plateau detection: no improvement in best estimated 1RM across the last N
 * sessions for an exercise.
 */
export const PLATEAU_SESSION_WINDOW = 4

export function detectPlateau(points: { date: string; estimated_1rm: number }[]): {
  isPlateaued: boolean
  sessionsSinceImprovement: number
  bestE1rm: number
  currentE1rm: number
  lastImprovementDate: string | null
} {
  if (points.length === 0) {
    return {
      isPlateaued: false,
      sessionsSinceImprovement: 0,
      bestE1rm: 0,
      currentE1rm: 0,
      lastImprovementDate: null,
    }
  }
  const ordered = [...points].sort((a, b) => a.date.localeCompare(b.date))
  let best = 0
  let lastImprovementIndex = -1
  let lastImprovementDate: string | null = null
  ordered.forEach((p, i) => {
    if (p.estimated_1rm > best + 0.01) {
      best = p.estimated_1rm
      lastImprovementIndex = i
      lastImprovementDate = p.date
    }
  })
  const sessionsSinceImprovement = ordered.length - 1 - lastImprovementIndex
  return {
    isPlateaued:
      ordered.length > PLATEAU_SESSION_WINDOW && sessionsSinceImprovement >= PLATEAU_SESSION_WINDOW,
    sessionsSinceImprovement,
    bestE1rm: best,
    currentE1rm: ordered[ordered.length - 1].estimated_1rm,
    lastImprovementDate,
  }
}
