import { supabase, currentUserId } from '@/lib/supabase'
import * as derive from './derive'
import { computeCurrentSuggestion } from './nutritionService'
import { today, weekStart } from '@/lib/date'
import {
  fetchBodyMetrics,
  fetchExercises,
  fetchFoodLogs,
  fetchFoods,
  fetchNutritionTargets,
  fetchSessions,
  fetchAllSets,
  groupSetsBySession,
  indexById,
} from './queries'
import { ApiError } from '@/types'
import type { DashboardSummary, Goal } from '@/types'

/** Dashboard service (Supabase replatform Phase 3). `userId` kept for call-site compatibility but unused. */
export const dashboardService = {
  async summary(_userId: string): Promise<DashboardSummary> {
    const userId = await currentUserId()
    const [profile, sessions, sets, exercises, metrics, logs, foods, targets, tdeeRows, routineCount] =
      await Promise.all([
        supabase.from('profiles').select('goal, goal_rate_kg_week').eq('id', userId).single(),
        fetchSessions(),
        fetchAllSets(),
        fetchExercises(),
        fetchBodyMetrics(),
        fetchFoodLogs(),
        fetchFoods(),
        fetchNutritionTargets(),
        supabase.from('tdee_estimates').select('*').order('estimate_date', { ascending: false }).limit(1),
        supabase.from('routines').select('id', { count: 'exact', head: true }),
      ])
    if (profile.error) throw new ApiError(profile.error.message, 500)
    const user = profile.data as { goal: Goal; goal_rate_kg_week: number }

    const todayIso = today()
    const setsBySession = groupSetsBySession(sets)
    const foodById = indexById(foods)
    const exerciseById = indexById(exercises)

    const day = derive.buildNutritionDay(logs.filter((l) => l.log_date === todayIso), foodById, targets, todayIso)

    const volume = derive.buildWeeklyVolume(sessions, setsBySession, exerciseById, 2)
    const thisWeek = volume[volume.length - 1]
    const lastWeek = volume[volume.length - 2]

    const finished = sessions.filter((s) => s.ended_at !== null)
    const lastSession =
      finished.length > 0
        ? derive.buildSessionSummary(
            derive.buildSessionDetail(finished[0], setsBySession.get(finished[0].id) ?? [], exerciseById, null),
          )
        : null

    const weighIns = metrics.filter((m) => m.weight_kg !== null).sort((a, b) => b.log_date.localeCompare(a.log_date))
    const lastWeighIn = weighIns.length > 0 ? weighIns[0].log_date : null

    const suggestion = await computeCurrentSuggestion()

    const loggedDates = new Set<string>()
    for (const l of logs) loggedDates.add(l.log_date)
    for (const s of sessions) loggedDates.add(s.session_date)
    for (const m of metrics) loggedDates.add(m.log_date)

    return {
      today: {
        date: todayIso,
        totals: day.totals,
        target: day.target,
        logged_entries: day.entries.length,
      },
      training: {
        week_start: weekStart(todayIso),
        sessions_this_week: thisWeek.sessions,
        planned_sessions: routineCount.count ?? 0,
        volume_this_week_kg: thisWeek.total_volume_kg,
        volume_last_week_kg: lastWeek.total_volume_kg,
        sets_by_muscle_group: thisWeek.sets_by_muscle_group,
        last_session: lastSession,
      },
      body: {
        current_trend_kg: derive.recentWeighInTrend(metrics),
        rate_kg_week: derive.weeklyRate(metrics, 21),
        goal_rate_kg_week: user.goal_rate_kg_week,
        goal: user.goal,
        last_logged_date: lastWeighIn,
        days_since_weigh_in: lastWeighIn ? daysBetween(lastWeighIn, todayIso) : null,
      },
      tdee: tdeeRows.data && tdeeRows.data.length > 0 ? tdeeRows.data[0] : null,
      recent_prs: derive.buildRecentPRs(sessions, exerciseById, sets.filter((s) => s.is_pr), 6),
      plateaus: derive.buildAllPlateaus(sessions, setsBySession, exerciseById).slice(0, 4),
      suggestion,
      streak_days: derive.loggingStreak(loggedDates),
    }
  },
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000)
}
