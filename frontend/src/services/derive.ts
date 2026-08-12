/**
 * Read-model builders — client-side port of backend/app/services/derive.py
 * (Supabase replatform Phase 3). Services fetch raw rows from Supabase in bulk
 * (one query per table per operation, never per-item) and pass them here to
 * shape the exact same response contracts the pages already consume. Pure
 * functions only -- no I/O, no Supabase calls -- so they're trivial to reason
 * about and match 1:1 against the Python they replace.
 */
import { dateRange, shiftDate, weekLabel, weekStart } from '@/lib/date'
import {
  ema,
  estimateTdee,
  macrosFromCalories,
  proposeRetarget,
  targetCaloriesFor,
} from '@/lib/adaptive'
import type { TdeeResult } from '@/lib/adaptive'
import {
  detectPlateau,
  estimated1RM,
  isQualifying,
  setVolume,
  setsByMuscleGroup,
  topSet,
  totalVolume,
  volumeByMuscleGroup,
} from '@/lib/strength'
import type {
  BodyMetric,
  Exercise,
  Food,
  FoodLog,
  FoodLogEntry,
  MacroSuggestion,
  Macros,
  NutritionDay,
  NutritionTarget,
  PersonalRecord,
  PlateauStatus,
  ProgressTrend,
  SessionDetail,
  SessionExerciseGroup,
  SessionSummary,
  TrendPoint,
  User,
  WeeklyVolumePoint,
  WorkoutSession,
  WorkoutSet,
} from '@/types'
import { MEAL_TYPES, MUSCLE_GROUPS } from '@/types'

// ---------------------------------------------------------------------------
// Workout module
// ---------------------------------------------------------------------------

function sessionTitle(routineName: string | null, groups: SessionExerciseGroup[]): string {
  if (routineName) return routineName
  if (groups.length === 0) return 'Empty session'
  const muscleGroups = [...new Set(groups.map((g) => g.exercise.muscle_group))]
  return `Freestyle — ${muscleGroups.join(' / ')}`
}

export function buildSessionDetail(
  session: WorkoutSession,
  sets: WorkoutSet[],
  exerciseById: Map<string, Exercise>,
  routineName: string | null,
): SessionDetail {
  const order: string[] = []
  const byExercise = new Map<string, WorkoutSet[]>()
  for (const s of sets) {
    if (!byExercise.has(s.exercise_id)) {
      byExercise.set(s.exercise_id, [])
      order.push(s.exercise_id)
    }
    byExercise.get(s.exercise_id)!.push(s)
  }

  const groups: SessionExerciseGroup[] = []
  for (const exerciseId of order) {
    const exercise = exerciseById.get(exerciseId)
    if (!exercise) continue
    const groupSets = byExercise.get(exerciseId)!
    groups.push({
      exercise,
      sets: groupSets,
      volume_kg: totalVolume(groupSets),
      top_set: topSet(groupSets),
    })
  }

  let duration_minutes: number | null = null
  if (session.started_at && session.ended_at) {
    duration_minutes = Math.round(
      (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000,
    )
  }

  return {
    ...session,
    routine_name: routineName,
    groups,
    total_volume_kg: totalVolume(sets),
    total_sets: sets.filter(isQualifying).length,
    pr_count: sets.filter((s) => s.is_pr).length,
    duration_minutes,
  }
}

export function buildSessionSummary(detail: SessionDetail): SessionSummary {
  return {
    id: detail.id,
    session_date: detail.session_date,
    routine_name: detail.routine_name,
    title: sessionTitle(detail.routine_name, detail.groups),
    duration_minutes: detail.duration_minutes,
    total_volume_kg: detail.total_volume_kg,
    total_sets: detail.total_sets,
    pr_count: detail.pr_count,
    exercise_count: detail.groups.length,
    muscle_groups: [...new Set(detail.groups.map((g) => g.exercise.muscle_group))],
  }
}

/** sessions must be pre-sorted oldest-to-newest; setsBySession keyed by session id. */
export function buildExerciseHistory(
  sessions: WorkoutSession[],
  setsBySession: Map<string, WorkoutSet[]>,
  exerciseId: string,
) {
  const points: {
    session_id: string
    date: string
    best_weight_kg: number
    best_reps: number
    estimated_1rm: number
    volume_kg: number
    is_pr: boolean
  }[] = []

  for (const session of sessions) {
    const sets = (setsBySession.get(session.id) ?? []).filter((s) => s.exercise_id === exerciseId)
    const qualifying = sets.filter(isQualifying)
    if (qualifying.length === 0) continue
    const best = topSet(qualifying)
    if (!best) continue
    points.push({
      session_id: session.id,
      date: session.session_date,
      best_weight_kg: best.weight_kg,
      best_reps: best.reps,
      estimated_1rm: Math.round(estimated1RM(best.weight_kg, best.reps) * 10) / 10,
      volume_kg: qualifying.reduce((sum, s) => sum + setVolume(s), 0),
      is_pr: qualifying.some((s) => s.is_pr),
    })
  }
  return points.sort((a, b) => a.date.localeCompare(b.date))
}

export function buildPlateauStatus(
  exercise: Exercise,
  history: ReturnType<typeof buildExerciseHistory>,
): PlateauStatus {
  const result = detectPlateau(history.map((p) => ({ date: p.date, estimated_1rm: p.estimated_1rm })))
  return {
    exercise_id: exercise.id,
    exercise_name: exercise.name,
    is_plateaued: result.isPlateaued,
    sessions_analysed: history.length,
    sessions_since_improvement: result.sessionsSinceImprovement,
    best_estimated_1rm: Math.round(result.bestE1rm * 10) / 10,
    current_estimated_1rm: Math.round(result.currentE1rm * 10) / 10,
    last_improvement_date: result.lastImprovementDate,
  }
}

/** sessions oldest-to-newest; sets = every qualifying set the user has ever logged. */
export function buildAllPlateaus(
  sessions: WorkoutSession[],
  setsBySession: Map<string, WorkoutSet[]>,
  exerciseById: Map<string, Exercise>,
): PlateauStatus[] {
  const trained = new Set<string>()
  for (const sets of setsBySession.values()) {
    for (const s of sets) if (isQualifying(s)) trained.add(s.exercise_id)
  }

  const statuses: PlateauStatus[] = []
  for (const exerciseId of trained) {
    const exercise = exerciseById.get(exerciseId)
    if (!exercise) continue
    const history = buildExerciseHistory(sessions, setsBySession, exerciseId)
    const status = buildPlateauStatus(exercise, history)
    if (status.is_plateaued) statuses.push(status)
  }
  return statuses.sort((a, b) => b.sessions_since_improvement - a.sessions_since_improvement)
}

export function buildWeeklyVolume(
  sessions: WorkoutSession[],
  setsBySession: Map<string, WorkoutSet[]>,
  exerciseById: Map<string, Exercise>,
  weeks: number,
): WeeklyVolumePoint[] {
  const currentWeek = weekStart(new Date())
  const buckets = new Map<string, WorkoutSet[]>()
  const sessionCount = new Map<string, number>()
  for (let i = weeks - 1; i >= 0; i--) {
    buckets.set(shiftDate(currentWeek, -i * 7), [])
  }

  for (const session of sessions) {
    const bucket = weekStart(session.session_date)
    if (!buckets.has(bucket)) continue
    buckets.get(bucket)!.push(...(setsBySession.get(session.id) ?? []))
    sessionCount.set(bucket, (sessionCount.get(bucket) ?? 0) + 1)
  }

  return [...buckets.entries()].map(([wk, sets]) => ({
    week_start: wk,
    label: weekLabel(wk),
    total_volume_kg: totalVolume(sets),
    by_muscle_group: volumeByMuscleGroup(sets, exerciseById),
    sets_by_muscle_group: setsByMuscleGroup(sets, exerciseById),
    sessions: sessionCount.get(wk) ?? 0,
  }))
}

/**
 * Chronological PR pass over every set the user has ever logged: a set is a PR
 * when it beats the best estimated 1RM (or matches the best weight with more
 * reps) seen so far for that exercise. Returns a new array with `is_pr`
 * recalculated -- caller persists whichever rows actually changed.
 */
export function recomputePRs(sessions: WorkoutSession[], sets: WorkoutSet[]): WorkoutSet[] {
  const dateBySession = new Map(sessions.map((s) => [s.id, s.session_date]))
  const ordered = [...sets].sort((a, b) => {
    const dateCompare = (dateBySession.get(a.session_id) ?? '').localeCompare(
      dateBySession.get(b.session_id) ?? '',
    )
    return dateCompare !== 0 ? dateCompare : a.set_number - b.set_number
  })

  const best = new Map<string, { e1rm: number; weight: number }>()
  const result = new Map<string, WorkoutSet>()
  for (const s of ordered) {
    if (!isQualifying(s) || !s.weight_kg || !s.reps) {
      result.set(s.id, { ...s, is_pr: false })
      continue
    }
    const current = best.get(s.exercise_id) ?? { e1rm: 0, weight: 0 }
    const e1rm = estimated1RM(s.weight_kg, s.reps)
    const pr = e1rm > current.e1rm + 0.01 || s.weight_kg > current.weight + 0.01
    result.set(s.id, { ...s, is_pr: pr })
    if (pr) {
      best.set(s.exercise_id, { e1rm: Math.max(current.e1rm, e1rm), weight: Math.max(current.weight, s.weight_kg) })
    }
  }
  return sets.map((s) => result.get(s.id)!)
}

export function buildRecentPRs(
  sessions: WorkoutSession[],
  exerciseById: Map<string, Exercise>,
  prSets: WorkoutSet[],
  limit = 8,
): PersonalRecord[] {
  const sessionById = new Map(sessions.map((s) => [s.id, s]))
  const out: PersonalRecord[] = []
  for (const s of prSets) {
    const exercise = exerciseById.get(s.exercise_id)
    const session = sessionById.get(s.session_id)
    if (!exercise || !session) continue
    out.push({
      set_id: s.id,
      session_id: s.session_id,
      date: session.session_date,
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      muscle_group: exercise.muscle_group,
      weight_kg: s.weight_kg,
      reps: s.reps,
      estimated_1rm: Math.round(estimated1RM(s.weight_kg, s.reps) * 10) / 10,
    })
  }
  out.sort((a, b) => (a.date === b.date ? b.estimated_1rm - a.estimated_1rm : b.date.localeCompare(a.date)))
  return out.slice(0, limit)
}

// ---------------------------------------------------------------------------
// Nutrition module
// ---------------------------------------------------------------------------

export function macrosFor(food: Food, quantityG: number): Macros {
  const ratio = quantityG / 100
  return {
    calories: Math.round(food.calories_per_100g * ratio * 10) / 10,
    protein_g: Math.round(food.protein_per_100g * ratio * 10) / 10,
    carbs_g: Math.round(food.carbs_per_100g * ratio * 10) / 10,
    fat_g: Math.round(food.fat_per_100g * ratio * 10) / 10,
  }
}

export function sumMacros(list: Macros[]): Macros {
  return list.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein_g: acc.protein_g + m.protein_g,
      carbs_g: acc.carbs_g + m.carbs_g,
      fat_g: acc.fat_g + m.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  )
}

/** Most recent target whose effective_date is on or before onDate. targets: any order. */
export function currentTargetOn(targets: NutritionTarget[], onDate: string): NutritionTarget | null {
  const eligible = targets.filter((t) => t.effective_date <= onDate)
  if (eligible.length === 0) return null
  return eligible.reduce((latest, t) => (t.effective_date > latest.effective_date ? t : latest))
}

export function buildNutritionDay(
  logs: FoodLog[],
  foodById: Map<string, Food>,
  targets: NutritionTarget[],
  onDate: string,
): NutritionDay {
  const entries: FoodLogEntry[] = []
  for (const log of logs) {
    const food = foodById.get(log.food_id)
    if (!food) continue
    entries.push({ ...log, food, macros: macrosFor(food, log.quantity_g) })
  }

  const byMeal = {} as NutritionDay['by_meal']
  for (const meal of MEAL_TYPES) {
    const mealEntries = entries.filter((e) => e.meal_type === meal)
    byMeal[meal] = { entries: mealEntries, totals: sumMacros(mealEntries.map((e) => e.macros)) }
  }

  return {
    date: onDate,
    entries,
    totals: sumMacros(entries.map((e) => e.macros)),
    target: currentTargetOn(targets, onDate),
    by_meal: byMeal,
  }
}

export function caloriesByDate(logs: FoodLog[], foodById: Map<string, Food>): Map<string, number> {
  const out = new Map<string, number>()
  for (const log of logs) {
    const food = foodById.get(log.food_id)
    if (!food) continue
    const cals = (food.calories_per_100g || 0) * (log.quantity_g / 100)
    out.set(log.log_date, (out.get(log.log_date) ?? 0) + cals)
  }
  return out
}

// ---------------------------------------------------------------------------
// Progress / trend
// ---------------------------------------------------------------------------

function weightByDate(metrics: BodyMetric[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of metrics) if (m.weight_kg !== null) out.set(m.log_date, m.weight_kg)
  return out
}

export function weeklyRate(
  metrics: BodyMetric[],
  days: number,
  endDate?: string,
): number | null {
  const end = endDate ?? new Date().toISOString().slice(0, 10)
  const start = shiftDate(end, -(days - 1))
  const dates = dateRange(shiftDate(start, -14), end)
  const weightMap = weightByDate(metrics)
  const smoothed = ema(dates.map((d) => weightMap.get(d) ?? null))
  const series = dates
    .map((d, i) => ({ date: d, value: smoothed[i] }))
    .filter((p) => p.date >= start && p.value !== null) as { date: string; value: number }[]
  if (series.length < 4) return null
  const spanDays =
    (new Date(series[series.length - 1].date).getTime() - new Date(series[0].date).getTime()) / 86400000
  if (spanDays <= 0) return null
  return Math.round((((series[series.length - 1].value - series[0].value) / spanDays) * 7) * 1000) / 1000
}

export function buildTrend(
  metrics: BodyMetric[],
  sessions: WorkoutSession[],
  setsBySession: Map<string, WorkoutSet[]>,
  logs: FoodLog[],
  foodById: Map<string, Food>,
  days: number,
  endDate?: string,
): ProgressTrend {
  const end = endDate ?? new Date().toISOString().slice(0, 10)
  const start = shiftDate(end, -(days - 1))
  const dates = dateRange(start, end)

  const weightMap = weightByDate(metrics)
  const calories = caloriesByDate(logs, foodById)

  const volumeByDate = new Map<string, number>()
  for (const session of sessions) {
    const vol = totalVolume(setsBySession.get(session.id) ?? [])
    volumeByDate.set(session.session_date, (volumeByDate.get(session.session_date) ?? 0) + vol)
  }

  const warmupDates = dateRange(shiftDate(start, -14), shiftDate(start, -1))
  const smoothedAll = ema([...warmupDates, ...dates].map((d) => weightMap.get(d) ?? null))
  const smoothed = smoothedAll.slice(warmupDates.length)

  const points: TrendPoint[] = dates.map((d, i) => ({
    date: d,
    weight_kg: weightMap.get(d) ?? null,
    trend_kg: smoothed[i] !== null ? Math.round(smoothed[i]! * 100) / 100 : null,
    calories: calories.has(d) ? Math.round(calories.get(d)!) : null,
    volume_kg: volumeByDate.get(d) ?? null,
  }))

  const known = points.filter((p) => p.trend_kg !== null)
  const first = known.length > 0 ? known[0].trend_kg : null
  const last = known.length > 0 ? known[known.length - 1].trend_kg : null

  const rate = weeklyRate(metrics, 21, end)

  const weeklyVolume = buildWeeklyVolume(
    sessions,
    setsBySession,
    new Map(),
    Math.max(4, Math.ceil(days / 7)),
  ).map((w) => ({ week_start: w.week_start, volume_kg: w.total_volume_kg }))

  return {
    points,
    current_trend_kg: last,
    rate_kg_week: rate,
    total_change_kg: first !== null && last !== null ? Math.round((last - first) * 100) / 100 : null,
    weekly_volume: weeklyVolume,
  }
}

export function computeTdee(
  metrics: BodyMetric[],
  logs: FoodLog[],
  foodById: Map<string, Food>,
  endDate?: string,
): TdeeResult | null {
  const end = endDate ?? new Date().toISOString().slice(0, 10)
  const dates = dateRange(shiftDate(end, -21), shiftDate(end, -1))
  const weightMap = weightByDate(metrics)
  const calories = caloriesByDate(logs, foodById)
  const smoothed = ema(dates.map((d) => weightMap.get(d) ?? null))
  return estimateTdee({
    trendWeights: smoothed,
    calories: dates.map((d) => (calories.has(d) ? Math.round(calories.get(d)!) : null)),
  })
}

export function computeSuggestion(
  user: Pick<User, 'goal' | 'goal_rate_kg_week'>,
  currentTarget: NutritionTarget | null,
  metrics: BodyMetric[],
  sessions: WorkoutSession[],
  setsBySession: Map<string, WorkoutSet[]>,
  logs: FoodLog[],
  foodById: Map<string, Food>,
  dismissedSuggestionIds: string[],
): MacroSuggestion | null {
  if (currentTarget === null) return null

  const todayIso = new Date().toISOString().slice(0, 10)
  const recentRate = weeklyRate(metrics, 14)
  if (recentRate === null) return null
  const priorRate = weeklyRate(metrics, 14, shiftDate(todayIso, -7))

  function deviates(rate: number | null): boolean {
    if (rate === null) return false
    const dev =
      Math.abs(user.goal_rate_kg_week) < 0.05
        ? Math.abs(rate) / 0.1
        : Math.abs(rate - user.goal_rate_kg_week) / Math.abs(user.goal_rate_kg_week)
    return dev > 0.2
  }
  const weeksDeviating = Number(deviates(recentRate)) + Number(deviates(priorRate))

  const trend = buildTrend(metrics, sessions, setsBySession, logs, foodById, 21)
  const weight = trend.current_trend_kg ?? 0
  const current: Macros = {
    calories: currentTarget.calories,
    protein_g: currentTarget.protein_g,
    carbs_g: currentTarget.carbs_g,
    fat_g: currentTarget.fat_g,
  }

  const result = proposeRetarget({
    actual_rate_kg_week: recentRate,
    goal_rate_kg_week: user.goal_rate_kg_week,
    weeks_deviating: weeksDeviating,
    current,
    weight_kg: weight,
    goal: user.goal,
  })
  if (result === null) return null

  const suggestionId = `sug-${currentTarget.id}-${weekStart(todayIso)}`
  if (dismissedSuggestionIds.includes(suggestionId)) return null

  return {
    id: suggestionId,
    created_date: weekStart(todayIso),
    calorie_delta: result.calorie_delta,
    reason: result.reason,
    detail: result.detail,
    actual_rate_kg_week: recentRate,
    goal_rate_kg_week: user.goal_rate_kg_week,
    deviation_pct: result.deviation_pct,
    weeks_deviating: weeksDeviating,
    proposed: result.proposed,
    current,
  }
}

/**
 * Dashboard-only trend weight: a recency-weighted blend over the most recent
 * up to 21 *logged* weigh-ins (gaps between them are ignored entirely) --
 * deliberately not the calendar-day EMA buildTrend/weeklyRate use, which
 * carries the last value forward through unlogged days. Mirrors
 * backend/app/api/dashboard.py::summary's inline trend_weight calculation.
 */
export function recentWeighInTrend(metrics: BodyMetric[]): number | null {
  const logged = metrics.filter((m) => m.weight_kg !== null).sort((a, b) => b.log_date.localeCompare(a.log_date))
  const recent = logged.slice(0, 21).reverse()
  if (recent.length === 0) return null
  let value: number | null = null
  for (const m of recent) {
    value = value === null ? m.weight_kg : 0.25 * m.weight_kg! + 0.75 * value
  }
  return value !== null ? Math.round(value * 100) / 100 : null
}

export function loggingStreak(loggedDates: Set<string>): number {
  const todayIso = new Date().toISOString().slice(0, 10)
  let cursor = loggedDates.has(todayIso) ? todayIso : shiftDate(todayIso, -1)
  let streak = 0
  while (loggedDates.has(cursor)) {
    streak++
    cursor = shiftDate(cursor, -1)
  }
  return streak
}

export { MUSCLE_GROUPS, macrosFromCalories, targetCaloriesFor }
