import type { Database } from './db'
import { ema, estimateTdee, proposeRetarget } from '@/lib/adaptive'
import {
  detectPlateau,
  emptyMuscleRecord,
  estimated1RM,
  isQualifying,
  setVolume,
  setsByMuscleGroup,
  topSet,
  totalVolume,
  volumeByMuscleGroup,
} from '@/lib/strength'
import { dateRange, shiftDate, today, weekLabel, weekStart } from '@/lib/date'
import type {
  Exercise,
  ExerciseHistoryPoint,
  Food,
  FoodLogEntry,
  Macros,
  MacroSuggestion,
  MealType,
  MuscleGroup,
  NutritionDay,
  NutritionTarget,
  PersonalRecord,
  PlateauStatus,
  ProgressTrend,
  RoutineDetail,
  SessionDetail,
  SessionSummary,
  WeeklyVolumePoint,
  WorkoutSession,
  WorkoutSet,
} from '@/types'
import { MEAL_TYPES } from '@/types'

/**
 * Read-model derivations.
 *
 * These produce exactly the payloads the documented REST endpoints are
 * expected to return (system design §8), so the components consuming them
 * never learn where the data came from.
 */

export function exerciseMap(db: Database): Map<string, Exercise> {
  return new Map(db.exercises.map((e) => [e.id, e]))
}

export function foodMap(db: Database): Map<string, Food> {
  return new Map(db.foods.map((f) => [f.id, f]))
}

export function userSessions(db: Database, userId: string): WorkoutSession[] {
  return db.sessions
    .filter((s) => s.user_id === userId)
    .sort((a, b) => b.session_date.localeCompare(a.session_date))
}

export function sessionSets(db: Database, sessionId: string): WorkoutSet[] {
  return db.sets
    .filter((s) => s.session_id === sessionId)
    .sort((a, b) => a.set_number - b.set_number)
}

export function userSets(db: Database, userId: string): WorkoutSet[] {
  const sessionIds = new Set(db.sessions.filter((s) => s.user_id === userId).map((s) => s.id))
  return db.sets.filter((s) => sessionIds.has(s.session_id))
}

export function routineDetail(db: Database, routineId: string): RoutineDetail | null {
  const routine = db.routines.find((r) => r.id === routineId)
  if (!routine) return null
  const exById = exerciseMap(db)
  const exercises = db.routineExercises
    .filter((re) => re.routine_id === routineId)
    .sort((a, b) => a.order_index - b.order_index)
    .flatMap((re) => {
      const exercise = exById.get(re.exercise_id)
      return exercise ? [{ ...re, exercise }] : []
    })
  return { ...routine, exercises }
}

function sessionTitle(routineName: string | null, groups: { exercise: Exercise }[]): string {
  if (routineName) return routineName
  if (groups.length === 0) return 'Empty session'
  const groupsUsed = [...new Set(groups.map((g) => g.exercise.muscle_group))]
  return `Freestyle — ${groupsUsed.join(' / ')}`
}

export function buildSessionDetail(db: Database, session: WorkoutSession): SessionDetail {
  const exById = exerciseMap(db)
  const sets = sessionSets(db, session.id)
  const order: string[] = []
  const byExercise = new Map<string, WorkoutSet[]>()
  for (const set of sets) {
    if (!byExercise.has(set.exercise_id)) {
      byExercise.set(set.exercise_id, [])
      order.push(set.exercise_id)
    }
    byExercise.get(set.exercise_id)!.push(set)
  }

  const groups = order.flatMap((exerciseId) => {
    const exercise = exById.get(exerciseId)
    if (!exercise) return []
    const groupSets = byExercise.get(exerciseId)!
    return [
      {
        exercise,
        sets: groupSets,
        volume_kg: totalVolume(groupSets),
        top_set: topSet(groupSets),
      },
    ]
  })

  const routine = session.routine_id ? db.routines.find((r) => r.id === session.routine_id) : null
  const duration =
    session.started_at && session.ended_at
      ? Math.round(
          (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000,
        )
      : null

  return {
    ...session,
    routine_name: routine?.name ?? null,
    groups,
    total_volume_kg: totalVolume(sets),
    total_sets: sets.filter(isQualifying).length,
    pr_count: sets.filter((s) => s.is_pr).length,
    duration_minutes: duration,
  }
}

export function buildSessionSummary(db: Database, session: WorkoutSession): SessionSummary {
  const detail = buildSessionDetail(db, session)
  return {
    id: session.id,
    session_date: session.session_date,
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

export function buildExerciseHistory(
  db: Database,
  userId: string,
  exerciseId: string,
): ExerciseHistoryPoint[] {
  const sessions = db.sessions.filter((s) => s.user_id === userId)
  const points: ExerciseHistoryPoint[] = []
  for (const session of sessions) {
    const sets = db.sets.filter((s) => s.session_id === session.id && s.exercise_id === exerciseId)
    const qualifying = sets.filter(isQualifying)
    if (qualifying.length === 0) continue
    const best = topSet(qualifying)
    if (!best) continue
    points.push({
      session_id: session.id,
      date: session.session_date,
      best_weight_kg: best.weight_kg,
      best_reps: best.reps,
      estimated_1rm: Number(estimated1RM(best.weight_kg, best.reps).toFixed(1)),
      volume_kg: qualifying.reduce((sum, s) => sum + setVolume(s), 0),
      is_pr: qualifying.some((s) => s.is_pr),
    })
  }
  return points.sort((a, b) => a.date.localeCompare(b.date))
}

export function buildPlateauStatus(
  db: Database,
  userId: string,
  exerciseId: string,
): PlateauStatus | null {
  const exercise = db.exercises.find((e) => e.id === exerciseId)
  if (!exercise) return null
  const history = buildExerciseHistory(db, userId, exerciseId)
  const result = detectPlateau(history)
  return {
    exercise_id: exerciseId,
    exercise_name: exercise.name,
    is_plateaued: result.isPlateaued,
    sessions_analysed: history.length,
    sessions_since_improvement: result.sessionsSinceImprovement,
    best_estimated_1rm: Number(result.bestE1rm.toFixed(1)),
    current_estimated_1rm: Number(result.currentE1rm.toFixed(1)),
    last_improvement_date: result.lastImprovementDate,
  }
}

export function buildAllPlateaus(db: Database, userId: string): PlateauStatus[] {
  const trained = new Set(userSets(db, userId).filter(isQualifying).map((s) => s.exercise_id))
  return [...trained]
    .flatMap((exerciseId) => {
      const status = buildPlateauStatus(db, userId, exerciseId)
      return status && status.is_plateaued ? [status] : []
    })
    .sort((a, b) => b.sessions_since_improvement - a.sessions_since_improvement)
}

export function buildWeeklyVolume(
  db: Database,
  userId: string,
  weeks: number,
): WeeklyVolumePoint[] {
  const exById = exerciseMap(db)
  const sessions = db.sessions.filter((s) => s.user_id === userId)
  const currentWeek = weekStart(today())
  const buckets = new Map<string, WorkoutSet[]>()
  const sessionCount = new Map<string, number>()

  for (let i = weeks - 1; i >= 0; i--) {
    buckets.set(shiftDate(currentWeek, -i * 7), [])
  }

  for (const session of sessions) {
    const bucket = weekStart(session.session_date)
    if (!buckets.has(bucket)) continue
    buckets.get(bucket)!.push(...sessionSets(db, session.id))
    sessionCount.set(bucket, (sessionCount.get(bucket) ?? 0) + 1)
  }

  return [...buckets.entries()].map(([week_start, sets]) => ({
    week_start,
    label: weekLabel(week_start),
    total_volume_kg: totalVolume(sets),
    by_muscle_group: volumeByMuscleGroup(sets, exById),
    sets_by_muscle_group: setsByMuscleGroup(sets, exById),
    sessions: sessionCount.get(week_start) ?? 0,
  }))
}

export function buildRecentPRs(db: Database, userId: string, limit = 8): PersonalRecord[] {
  const exById = exerciseMap(db)
  const sessionById = new Map(
    db.sessions.filter((s) => s.user_id === userId).map((s) => [s.id, s]),
  )
  return db.sets
    .filter((s) => s.is_pr && sessionById.has(s.session_id))
    .flatMap((set) => {
      const exercise = exById.get(set.exercise_id)
      const session = sessionById.get(set.session_id)
      if (!exercise || !session) return []
      return [
        {
          set_id: set.id,
          session_id: set.session_id,
          date: session.session_date,
          exercise_id: exercise.id,
          exercise_name: exercise.name,
          muscle_group: exercise.muscle_group,
          weight_kg: set.weight_kg,
          reps: set.reps,
          estimated_1rm: Number(estimated1RM(set.weight_kg, set.reps).toFixed(1)),
        },
      ]
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.estimated_1rm - a.estimated_1rm)
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export const EMPTY_MACROS: Macros = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }

export function macrosFor(food: Food, quantityG: number): Macros {
  const ratio = quantityG / 100
  return {
    calories: Number((food.calories_per_100g * ratio).toFixed(1)),
    protein_g: Number((food.protein_per_100g * ratio).toFixed(1)),
    carbs_g: Number((food.carbs_per_100g * ratio).toFixed(1)),
    fat_g: Number((food.fat_per_100g * ratio).toFixed(1)),
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
    { ...EMPTY_MACROS },
  )
}

export function currentTargetOn(
  db: Database,
  userId: string,
  date: string,
): NutritionTarget | null {
  const applicable = db.nutritionTargets
    .filter((t) => t.user_id === userId && t.effective_date <= date)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date))
  return applicable[0] ?? null
}

export function buildNutritionDay(db: Database, userId: string, date: string): NutritionDay {
  const fById = foodMap(db)
  const entries: FoodLogEntry[] = db.foodLogs
    .filter((l) => l.user_id === userId && l.log_date === date)
    .flatMap((log) => {
      const food = fById.get(log.food_id)
      if (!food) return []
      return [{ ...log, food, macros: macrosFor(food, log.quantity_g) }]
    })

  const by_meal = MEAL_TYPES.reduce(
    (acc, meal) => {
      const mealEntries = entries.filter((e) => e.meal_type === meal)
      acc[meal] = { entries: mealEntries, totals: sumMacros(mealEntries.map((e) => e.macros)) }
      return acc
    },
    {} as Record<MealType, { entries: FoodLogEntry[]; totals: Macros }>,
  )

  return {
    date,
    entries,
    totals: sumMacros(entries.map((e) => e.macros)),
    target: currentTargetOn(db, userId, date),
    by_meal,
  }
}

export function caloriesByDate(db: Database, userId: string): Map<string, number> {
  const fById = foodMap(db)
  const out = new Map<string, number>()
  for (const log of db.foodLogs) {
    if (log.user_id !== userId) continue
    const food = fById.get(log.food_id)
    if (!food) continue
    out.set(
      log.log_date,
      (out.get(log.log_date) ?? 0) + (food.calories_per_100g * log.quantity_g) / 100,
    )
  }
  return out
}

// ---------------------------------------------------------------------------
// Progress / trend
// ---------------------------------------------------------------------------

export function buildTrend(db: Database, userId: string, days: number): ProgressTrend {
  const end = today()
  const start = shiftDate(end, -(days - 1))
  const dates = dateRange(start, end)

  const weightByDate = new Map(
    db.bodyMetrics
      .filter((m) => m.user_id === userId && m.weight_kg !== null)
      .map((m) => [m.log_date, m.weight_kg as number]),
  )
  const calories = caloriesByDate(db, userId)

  const volumeByDate = new Map<string, number>()
  for (const session of db.sessions.filter((s) => s.user_id === userId)) {
    volumeByDate.set(
      session.session_date,
      (volumeByDate.get(session.session_date) ?? 0) + totalVolume(sessionSets(db, session.id)),
    )
  }

  // Seed the EMA from data preceding the window so the first visible point is
  // already smoothed rather than snapping to a raw weigh-in.
  const warmupDates = dateRange(shiftDate(start, -14), shiftDate(start, -1))
  const rawAll = [...warmupDates, ...dates].map((d) => weightByDate.get(d) ?? null)
  const smoothedAll = ema(rawAll)
  const smoothed = smoothedAll.slice(warmupDates.length)

  const points = dates.map((date, i) => ({
    date,
    weight_kg: weightByDate.get(date) ?? null,
    trend_kg: smoothed[i] === null ? null : Number((smoothed[i] as number).toFixed(2)),
    calories: calories.has(date) ? Math.round(calories.get(date)!) : null,
    volume_kg: volumeByDate.get(date) ?? null,
  }))

  const known = points.filter((p) => p.trend_kg !== null)
  const first = known[0]?.trend_kg ?? null
  const last = known[known.length - 1]?.trend_kg ?? null

  const rate = weeklyRate(db, userId, 21)

  const weeklyVolume = buildWeeklyVolume(db, userId, Math.max(4, Math.ceil(days / 7))).map((w) => ({
    week_start: w.week_start,
    volume_kg: w.total_volume_kg,
  }))

  return {
    points,
    current_trend_kg: last,
    rate_kg_week: rate,
    total_change_kg: first !== null && last !== null ? Number((last - first).toFixed(2)) : null,
    weekly_volume: weeklyVolume,
  }
}

/** Weekly rate of change of the smoothed trend over the trailing `days` window. */
export function weeklyRate(db: Database, userId: string, days: number, endDate = today()): number | null {
  const start = shiftDate(endDate, -(days - 1))
  const dates = dateRange(shiftDate(start, -14), endDate)
  const weightByDate = new Map(
    db.bodyMetrics
      .filter((m) => m.user_id === userId && m.weight_kg !== null)
      .map((m) => [m.log_date, m.weight_kg as number]),
  )
  const smoothed = ema(dates.map((d) => weightByDate.get(d) ?? null))
  const series = dates
    .map((date, i) => ({ date, value: smoothed[i] }))
    .filter((p) => p.date >= start && p.value !== null) as { date: string; value: number }[]

  if (series.length < 4) return null
  const spanDays = dateRange(series[0].date, series[series.length - 1].date).length - 1
  if (spanDays <= 0) return null
  return Number((((series[series.length - 1].value - series[0].value) / spanDays) * 7).toFixed(3))
}

export function computeTdee(db: Database, userId: string, endDate = today()) {
  // The current day is still being logged, so the window stops at yesterday —
  // including a half-logged day would understate average intake and, with it,
  // the TDEE estimate.
  const dates = dateRange(shiftDate(endDate, -21), shiftDate(endDate, -1))
  const weightByDate = new Map(
    db.bodyMetrics
      .filter((m) => m.user_id === userId && m.weight_kg !== null)
      .map((m) => [m.log_date, m.weight_kg as number]),
  )
  const calories = caloriesByDate(db, userId)
  const smoothed = ema(dates.map((d) => weightByDate.get(d) ?? null))
  return estimateTdee({
    trendWeights: smoothed,
    calories: dates.map((d) => (calories.has(d) ? Math.round(calories.get(d)!) : null)),
  })
}

/**
 * The adaptive macro suggestion surfaced on the dashboard and targets screen.
 * Deterministic id per (target, week) so a dismissal sticks until the next
 * weekly recompute.
 */
export function computeSuggestion(db: Database, userId: string): MacroSuggestion | null {
  const user = db.users.find((u) => u.id === userId)
  if (!user) return null
  const target = currentTargetOn(db, userId, today())
  if (!target) return null

  const recentRate = weeklyRate(db, userId, 14)
  if (recentRate === null) return null

  const priorRate = weeklyRate(db, userId, 14, shiftDate(today(), -7))
  const deviates = (rate: number | null) => {
    if (rate === null) return false
    const dev =
      Math.abs(user.goal_rate_kg_week) < 0.05
        ? Math.abs(rate) / 0.1
        : Math.abs(rate - user.goal_rate_kg_week) / Math.abs(user.goal_rate_kg_week)
    return dev > 0.2
  }
  const weeksDeviating = (deviates(recentRate) ? 1 : 0) + (deviates(priorRate) ? 1 : 0)

  const trend = buildTrend(db, userId, 21)
  const weight = trend.current_trend_kg ?? 0
  const current: Macros = {
    calories: target.calories,
    protein_g: target.protein_g,
    carbs_g: target.carbs_g,
    fat_g: target.fat_g,
  }

  const result = proposeRetarget({
    actual_rate_kg_week: recentRate,
    goal_rate_kg_week: user.goal_rate_kg_week,
    weeks_deviating: weeksDeviating,
    current,
    weight_kg: weight,
    goal: user.goal,
  })
  if (!result) return null

  const suggestionId = `sug-${target.id}-${weekStart(today())}`
  if (db.dismissedSuggestions.includes(suggestionId)) return null

  return {
    id: suggestionId,
    created_date: weekStart(today()),
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

/** Consecutive days (ending today or yesterday) with either food or training logged. */
export function loggingStreak(db: Database, userId: string): number {
  const logged = new Set<string>()
  db.foodLogs.filter((l) => l.user_id === userId).forEach((l) => logged.add(l.log_date))
  db.sessions.filter((s) => s.user_id === userId).forEach((s) => logged.add(s.session_date))
  db.bodyMetrics.filter((m) => m.user_id === userId).forEach((m) => logged.add(m.log_date))

  let streak = 0
  let cursor = today()
  if (!logged.has(cursor)) cursor = shiftDate(cursor, -1)
  while (logged.has(cursor)) {
    streak += 1
    cursor = shiftDate(cursor, -1)
  }
  return streak
}

export function emptyMuscleMap(): Record<MuscleGroup, number> {
  return emptyMuscleRecord()
}
