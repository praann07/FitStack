import type { Exercise } from '@/types'

/**
 * System exercise library (created_by = null, is_custom = false), equivalent to
 * the seeded `exercises` table. IDs are stable slugs standing in for UUIDs.
 */
type Seed = [id: string, name: string, group: Exercise['muscle_group'], equipment: Exercise['equipment']]

const SEEDS: Seed[] = [
  // Chest
  ['ex-bench-press', 'Barbell Bench Press', 'chest', 'barbell'],
  ['ex-incline-bench', 'Incline Barbell Bench Press', 'chest', 'barbell'],
  ['ex-db-bench', 'Dumbbell Bench Press', 'chest', 'dumbbell'],
  ['ex-incline-db-press', 'Incline Dumbbell Press', 'chest', 'dumbbell'],
  ['ex-cable-fly', 'Cable Chest Fly', 'chest', 'machine'],
  ['ex-pec-deck', 'Pec Deck', 'chest', 'machine'],
  ['ex-dips', 'Chest Dips', 'chest', 'bodyweight'],

  // Back
  ['ex-deadlift', 'Conventional Deadlift', 'back', 'barbell'],
  ['ex-barbell-row', 'Barbell Row', 'back', 'barbell'],
  ['ex-pendlay-row', 'Pendlay Row', 'back', 'barbell'],
  ['ex-pull-up', 'Pull-Up', 'back', 'bodyweight'],
  ['ex-chin-up', 'Chin-Up', 'back', 'bodyweight'],
  ['ex-lat-pulldown', 'Lat Pulldown', 'back', 'machine'],
  ['ex-seated-row', 'Seated Cable Row', 'back', 'machine'],
  ['ex-db-row', 'Single-Arm Dumbbell Row', 'back', 'dumbbell'],
  ['ex-face-pull', 'Face Pull', 'back', 'machine'],

  // Legs
  ['ex-back-squat', 'Barbell Back Squat', 'legs', 'barbell'],
  ['ex-front-squat', 'Front Squat', 'legs', 'barbell'],
  ['ex-rdl', 'Romanian Deadlift', 'legs', 'barbell'],
  ['ex-leg-press', 'Leg Press', 'legs', 'machine'],
  ['ex-hack-squat', 'Hack Squat', 'legs', 'machine'],
  ['ex-bulgarian-split', 'Bulgarian Split Squat', 'legs', 'dumbbell'],
  ['ex-leg-curl', 'Lying Leg Curl', 'legs', 'machine'],
  ['ex-leg-extension', 'Leg Extension', 'legs', 'machine'],
  ['ex-walking-lunge', 'Walking Lunge', 'legs', 'dumbbell'],
  ['ex-calf-raise', 'Standing Calf Raise', 'legs', 'machine'],

  // Shoulders
  ['ex-ohp', 'Overhead Press', 'shoulders', 'barbell'],
  ['ex-db-shoulder-press', 'Seated Dumbbell Shoulder Press', 'shoulders', 'dumbbell'],
  ['ex-lateral-raise', 'Dumbbell Lateral Raise', 'shoulders', 'dumbbell'],
  ['ex-cable-lateral', 'Cable Lateral Raise', 'shoulders', 'machine'],
  ['ex-rear-delt-fly', 'Rear Delt Fly', 'shoulders', 'dumbbell'],

  // Arms
  ['ex-barbell-curl', 'Barbell Curl', 'arms', 'barbell'],
  ['ex-incline-db-curl', 'Incline Dumbbell Curl', 'arms', 'dumbbell'],
  ['ex-hammer-curl', 'Hammer Curl', 'arms', 'dumbbell'],
  ['ex-preacher-curl', 'Preacher Curl', 'arms', 'machine'],
  ['ex-skullcrusher', 'EZ-Bar Skullcrusher', 'arms', 'barbell'],
  ['ex-tricep-pushdown', 'Tricep Rope Pushdown', 'arms', 'machine'],
  ['ex-overhead-tricep', 'Overhead Cable Tricep Extension', 'arms', 'machine'],
  ['ex-close-grip-bench', 'Close-Grip Bench Press', 'arms', 'barbell'],

  // Core
  ['ex-hanging-leg-raise', 'Hanging Leg Raise', 'core', 'bodyweight'],
  ['ex-cable-crunch', 'Cable Crunch', 'core', 'machine'],
  ['ex-plank', 'Weighted Plank', 'core', 'bodyweight'],
  ['ex-ab-wheel', 'Ab Wheel Rollout', 'core', 'bodyweight'],
]

export const SYSTEM_EXERCISES: Exercise[] = SEEDS.map(([id, name, muscle_group, equipment]) => ({
  id,
  name,
  muscle_group,
  equipment,
  is_custom: false,
  created_by: null,
}))
