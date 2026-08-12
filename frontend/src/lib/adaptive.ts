import type { Confidence, Goal, Macros } from '@/types'

/**
 * The adaptive engine — system design §7.
 *
 * This is the live implementation, consumed by services/derive.ts and
 * services/nutritionService.ts to compute TDEE estimates and macro
 * suggestions against real Supabase data. (Briefly mirrored an in-progress
 * FastAPI port during the Phase 1/2 mock-frontend era; that backend has
 * since been replaced by the Supabase replatform, and this file is the
 * source of truth again.)
 */

/** kcal per kg of body mass — the standard approximation used for back-calc. */
export const KCAL_PER_KG = 7700

/** Exponential moving average over a daily series, gaps carried forward. */
export function ema(values: (number | null)[], alpha = 0.25): (number | null)[] {
  let current: number | null = null
  return values.map((v) => {
    if (v === null || Number.isNaN(v)) return current
    current = current === null ? v : alpha * v + (1 - alpha) * current
    return current
  })
}

/** Least-squares slope of y over x (x in days) -> units per day. */
export function linearSlope(points: { x: number; y: number }[]): number | null {
  const n = points.length
  if (n < 2) return null
  const meanX = points.reduce((s, p) => s + p.x, 0) / n
  const meanY = points.reduce((s, p) => s + p.y, 0) / n
  let num = 0
  let den = 0
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY)
    den += (p.x - meanX) ** 2
  }
  if (den === 0) return null
  return num / den
}

export function confidenceFromDays(days: number): Confidence {
  if (days < 7) return 'low'
  if (days < 14) return 'medium'
  return 'high'
}

export interface TdeeInput {
  /** Smoothed weight per day in the window; null where no weigh-in exists. */
  trendWeights: (number | null)[]
  /** Calories per day; null where nothing was logged (skipped, never zeroed). */
  calories: (number | null)[]
}

export interface TdeeResult {
  estimated_tdee: number
  weight_trend_kg: number
  rate_kg_week: number
  confidence: Confidence
  days_of_data: number
  avg_daily_calories: number
}

/**
 * Back-calculate maintenance calories from what actually happened:
 *   TDEE = avg daily intake − (weight change kg × 7700 / days)
 * Missing days are skipped rather than treated as zero-calorie days.
 */
export function estimateTdee(input: TdeeInput): TdeeResult | null {
  const loggedCalories = input.calories.filter((c): c is number => c !== null && c > 0)
  const weightPoints = input.trendWeights
    .map((w, i) => ({ x: i, y: w }))
    .filter((p): p is { x: number; y: number } => p.y !== null)

  if (loggedCalories.length < 3 || weightPoints.length < 3) return null

  const avgDailyCalories = loggedCalories.reduce((s, c) => s + c, 0) / loggedCalories.length
  const slopePerDay = linearSlope(weightPoints)
  if (slopePerDay === null) return null

  const spanDays = weightPoints[weightPoints.length - 1].x - weightPoints[0].x
  const weightChange = slopePerDay * spanDays
  const days = Math.max(spanDays, 1)

  const tdee = avgDailyCalories - (weightChange * KCAL_PER_KG) / days

  return {
    estimated_tdee: Math.round(tdee),
    weight_trend_kg: Number(weightPoints[weightPoints.length - 1].y.toFixed(2)),
    rate_kg_week: Number((slopePerDay * 7).toFixed(3)),
    confidence: confidenceFromDays(Math.min(loggedCalories.length, weightPoints.length)),
    days_of_data: Math.min(loggedCalories.length, weightPoints.length),
    avg_daily_calories: Math.round(avgDailyCalories),
  }
}

/**
 * Mifflin-St Jeor fallback for accounts without 7+ days of history
 * (system design §10 — new user, insufficient data).
 */
export interface BaselineInput {
  weight_kg: number
  height_cm: number
  age: number
  sex: 'male' | 'female'
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
}

export const ACTIVITY_MULTIPLIER: Record<BaselineInput['activity_level'], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

export const ACTIVITY_LABEL: Record<BaselineInput['activity_level'], string> = {
  sedentary: 'Sedentary — desk job, no training',
  light: 'Light — training 1-3x / week',
  moderate: 'Moderate — training 3-5x / week',
  active: 'Active — training 6-7x / week',
  very_active: 'Very active — physical job + training',
}

export function mifflinStJeor(input: BaselineInput): number {
  const base = 10 * input.weight_kg + 6.25 * input.height_cm - 5 * input.age
  const bmr = input.sex === 'male' ? base + 5 : base - 161
  return Math.round(bmr * ACTIVITY_MULTIPLIER[input.activity_level])
}

/**
 * Turn a maintenance number into macro targets.
 * Protein is anchored to bodyweight and held fixed; fat takes a fixed share of
 * calories; carbs absorb the remainder — so calorie adjustments only move
 * carbs/fat, never protein (system design §7).
 */
export function macrosFromCalories(calories: number, weightKg: number, goal: Goal): Macros {
  const proteinPerKg = goal === 'cut' ? 2.2 : 1.9
  const protein_g = Math.round(weightKg * proteinPerKg)
  const fatShare = goal === 'cut' ? 0.25 : 0.27
  const fat_g = Math.round((calories * fatShare) / 9)
  const remaining = calories - protein_g * 4 - fat_g * 9
  const carbs_g = Math.max(0, Math.round(remaining / 4))
  return { calories: Math.round(calories), protein_g, carbs_g, fat_g }
}

export function targetCaloriesFor(tdee: number, goalRateKgWeek: number): number {
  // Daily surplus/deficit required to move at the requested weekly rate.
  const dailyDelta = (goalRateKgWeek * KCAL_PER_KG) / 7
  return Math.round((tdee + dailyDelta) / 10) * 10
}

/**
 * Macro re-targeting: if the actual trend rate deviates >20% from the goal rate
 * for 2 consecutive weeks, propose a ±100-150 kcal move.
 */
export const DEVIATION_THRESHOLD = 0.2

export interface RetargetInput {
  actual_rate_kg_week: number
  goal_rate_kg_week: number
  weeks_deviating: number
  current: Macros
  weight_kg: number
  goal: Goal
}

export interface RetargetResult {
  calorie_delta: number
  deviation_pct: number
  proposed: Macros
  reason: string
  detail: string
}

export function proposeRetarget(input: RetargetInput): RetargetResult | null {
  const { actual_rate_kg_week: actual, goal_rate_kg_week: goal, current } = input

  // Maintenance goals compare against an absolute band rather than a ratio.
  const deviation =
    Math.abs(goal) < 0.05
      ? Math.abs(actual) / 0.1
      : Math.abs(actual - goal) / Math.abs(goal)

  if (deviation <= DEVIATION_THRESHOLD) return null
  if (input.weeks_deviating < 2) return null

  const movingTooFast = Math.abs(actual) > Math.abs(goal)
  const magnitude = deviation > 0.5 ? 150 : 100
  // Gaining faster than planned -> cut calories; slower -> add calories.
  const direction = actual > goal ? -1 : 1
  const calorie_delta = magnitude * direction

  const proposed = macrosFromCalories(
    current.calories + calorie_delta,
    input.weight_kg,
    input.goal,
  )

  const reason =
    direction < 0
      ? input.goal === 'cut'
        ? 'Losing faster than planned'
        : 'Gaining faster than planned'
      : input.goal === 'cut'
        ? 'Fat loss has stalled'
        : 'Gaining slower than planned'

  const detail =
    `Your smoothed trend is moving ${actual >= 0 ? '+' : '−'}${Math.abs(actual).toFixed(2)} kg/week ` +
    `against a ${goal >= 0 ? '+' : '−'}${Math.abs(goal).toFixed(2)} kg/week goal ` +
    `(${Math.round(deviation * 100)}% off) for ${input.weeks_deviating} weeks. ` +
    `${movingTooFast ? 'Pulling' : 'Adding'} ${Math.abs(calorie_delta)} kcal keeps protein fixed and adjusts carbs and fat.`

  return {
    calorie_delta,
    deviation_pct: Math.round(deviation * 100),
    proposed,
    reason,
    detail,
  }
}
