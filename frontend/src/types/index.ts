/**
 * Domain types.
 *
 * These mirror the FitStack database schema (system design §5) one-to-one so
 * that swapping the mock service layer for real REST responses in Phase 2 is a
 * transport change, not a modelling change.
 *
 * Units are metric everywhere, exactly as stored: kg, cm, kcal, grams.
 */

export type Goal = 'bulk' | 'cut' | 'maintain'
export type MuscleGroup = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core'
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'bodyweight'
export type SetType = 'warmup' | 'normal' | 'drop' | 'failure'
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type Confidence = 'low' | 'medium' | 'high'
export type TargetSource = 'adaptive' | 'manual'

export const MUSCLE_GROUPS: MuscleGroup[] = [
  'chest',
  'back',
  'legs',
  'shoulders',
  'arms',
  'core',
]

export const EQUIPMENT: Equipment[] = ['barbell', 'dumbbell', 'machine', 'bodyweight']

export const SET_TYPES: SetType[] = ['warmup', 'normal', 'drop', 'failure']

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

/** Warm-up and drop sets are excluded from PRs and volume (system design §7). */
export const QUALIFYING_SET_TYPES: SetType[] = ['normal', 'failure']

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface User {
  id: string
  email: string
  full_name: string
  goal: Goal
  /** Target weight-change rate. Positive when bulking, negative when cutting. */
  goal_rate_kg_week: number
  height_cm: number
  created_at: string
}

// ---------------------------------------------------------------------------
// Workout module
// ---------------------------------------------------------------------------

export interface Exercise {
  id: string
  name: string
  muscle_group: MuscleGroup
  equipment: Equipment
  is_custom: boolean
  created_by: string | null
}

export interface RoutineExercise {
  id: string
  routine_id: string
  exercise_id: string
  order_index: number
  target_sets: number
  /** e.g. "8-12" */
  target_rep_range: string
  target_rpe: number | null
  rest_seconds: number
  notes: string | null
}

export interface Routine {
  id: string
  user_id: string
  name: string
  notes: string | null
  created_at: string
  updated_at: string
}

/** Routine joined with its ordered exercises — what every routine screen renders. */
export interface RoutineDetail extends Routine {
  exercises: (RoutineExercise & { exercise: Exercise })[]
}

export interface WorkoutSession {
  id: string
  user_id: string
  routine_id: string | null
  /** ISO date, yyyy-MM-dd */
  session_date: string
  notes: string | null
  started_at: string | null
  ended_at: string | null
}

export interface WorkoutSet {
  id: string
  session_id: string
  exercise_id: string
  set_number: number
  weight_kg: number
  reps: number
  rpe: number | null
  set_type: SetType
  notes: string | null
  is_pr: boolean
}

/** A session hydrated with its sets, grouped per exercise, for detail screens. */
export interface SessionExerciseGroup {
  exercise: Exercise
  sets: WorkoutSet[]
  volume_kg: number
  top_set: WorkoutSet | null
}

export interface SessionDetail extends WorkoutSession {
  routine_name: string | null
  groups: SessionExerciseGroup[]
  total_volume_kg: number
  total_sets: number
  pr_count: number
  duration_minutes: number | null
}

export interface SessionSummary {
  id: string
  session_date: string
  routine_name: string | null
  title: string
  duration_minutes: number | null
  total_volume_kg: number
  total_sets: number
  pr_count: number
  exercise_count: number
  muscle_groups: MuscleGroup[]
}

export interface ExerciseHistoryPoint {
  session_id: string
  date: string
  best_weight_kg: number
  best_reps: number
  estimated_1rm: number
  volume_kg: number
  is_pr: boolean
}

export interface PlateauStatus {
  exercise_id: string
  exercise_name: string
  is_plateaued: boolean
  sessions_analysed: number
  /** Sessions since the last estimated-1RM improvement. */
  sessions_since_improvement: number
  best_estimated_1rm: number
  current_estimated_1rm: number
  last_improvement_date: string | null
}

export interface WeeklyVolumePoint {
  /** ISO date of the Monday that starts the week. */
  week_start: string
  label: string
  total_volume_kg: number
  by_muscle_group: Record<MuscleGroup, number>
  sets_by_muscle_group: Record<MuscleGroup, number>
  sessions: number
}

export interface PersonalRecord {
  set_id: string
  session_id: string
  date: string
  exercise_id: string
  exercise_name: string
  muscle_group: MuscleGroup
  weight_kg: number
  reps: number
  estimated_1rm: number
}

// ---------------------------------------------------------------------------
// Nutrition module
// ---------------------------------------------------------------------------

export interface Food {
  id: string
  name: string
  brand: string | null
  calories_per_100g: number
  protein_per_100g: number
  carbs_per_100g: number
  fat_per_100g: number
  /** Convenience portion, e.g. "1 medium (118 g)". Display only. */
  serving_label: string | null
  serving_g: number | null
  is_custom: boolean
  created_by: string | null
}

export interface FoodLog {
  id: string
  user_id: string
  food_id: string
  log_date: string
  quantity_g: number
  meal_type: MealType
}

export interface Macros {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface FoodLogEntry extends FoodLog {
  food: Food
  macros: Macros
}

export interface NutritionDay {
  date: string
  entries: FoodLogEntry[]
  totals: Macros
  target: NutritionTarget | null
  by_meal: Record<MealType, { entries: FoodLogEntry[]; totals: Macros }>
}

export interface NutritionTarget {
  id: string
  user_id: string
  effective_date: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  source: TargetSource
}

export interface TdeeEstimate {
  id: string
  user_id: string
  estimate_date: string
  estimated_tdee: number
  weight_trend_kg: number
  confidence: Confidence
}

/** Output of the adaptive engine — drives the suggestion banner. */
export interface MacroSuggestion {
  id: string
  created_date: string
  /** Signed kcal delta applied to the current target. */
  calorie_delta: number
  reason: string
  detail: string
  actual_rate_kg_week: number
  goal_rate_kg_week: number
  deviation_pct: number
  weeks_deviating: number
  proposed: Macros
  current: Macros
}

// ---------------------------------------------------------------------------
// Progress module
// ---------------------------------------------------------------------------

export interface BodyMetric {
  id: string
  user_id: string
  log_date: string
  weight_kg: number | null
  waist_cm: number | null
  chest_cm: number | null
  arm_cm: number | null
  photo_url: string | null
}

export interface TrendPoint {
  date: string
  weight_kg: number | null
  /** EMA-smoothed weight — the value every calculation and chart uses. */
  trend_kg: number | null
  calories: number | null
  volume_kg: number | null
}

export interface ProgressTrend {
  points: TrendPoint[]
  current_trend_kg: number | null
  rate_kg_week: number | null
  total_change_kg: number | null
  /** Weekly aggregation of training volume, aligned to the same window. */
  weekly_volume: { week_start: string; volume_kg: number }[]
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardSummary {
  today: {
    date: string
    totals: Macros
    target: NutritionTarget | null
    logged_entries: number
  }
  training: {
    week_start: string
    sessions_this_week: number
    /** Number of saved routines — what "a full week" means for this user. */
    planned_sessions: number
    volume_this_week_kg: number
    volume_last_week_kg: number
    sets_by_muscle_group: Record<MuscleGroup, number>
    last_session: SessionSummary | null
  }
  body: {
    current_trend_kg: number | null
    rate_kg_week: number | null
    goal_rate_kg_week: number
    goal: Goal
    last_logged_date: string | null
    days_since_weigh_in: number | null
  }
  tdee: TdeeEstimate | null
  recent_prs: PersonalRecord[]
  plateaus: PlateauStatus[]
  suggestion: MacroSuggestion | null
  streak_days: number
}

// ---------------------------------------------------------------------------
// Auth / API plumbing
// ---------------------------------------------------------------------------

export interface AuthSession {
  access_token: string
  user: User
}

export interface RegisterPayload {
  email: string
  password: string
  full_name: string
  goal: Goal
  goal_rate_kg_week: number
  height_cm: number
  /** First body-metric entry, so the new account has a starting point. */
  weight_kg: number
  age: number
  sex: 'male' | 'female'
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
}

/** Shape every service rejects with, mirroring FastAPI's error envelope. */
export class ApiError extends Error {
  status: number
  field?: string

  constructor(message: string, status = 400, field?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.field = field
  }
}
