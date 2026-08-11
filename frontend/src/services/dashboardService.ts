import { apiCall } from './client'
import { getDb } from './db'
import {
  buildAllPlateaus,
  buildNutritionDay,
  buildRecentPRs,
  buildSessionSummary,
  buildWeeklyVolume,
  computeSuggestion,
  loggingStreak,
  weeklyRate,
} from './derive'
import { daysBetween, today, weekStart } from '@/lib/date'
import { ApiError } from '@/types'
import type { DashboardSummary } from '@/types'

export const dashboardService = {
  /** GET /api/v1/dashboard/summary */
  summary(userId: string): Promise<DashboardSummary> {
    return apiCall('GET /dashboard/summary', () => {
      const db = getDb()
      const user = db.users.find((u) => u.id === userId)
      if (!user) throw new ApiError('Account not found.', 404)

      const date = today()
      const day = buildNutritionDay(db, userId, date)
      const volume = buildWeeklyVolume(db, userId, 2)
      const thisWeek = volume[volume.length - 1]
      const lastWeek = volume[volume.length - 2]

      const finished = db.sessions
        .filter((s) => s.user_id === userId && s.ended_at !== null)
        .sort((a, b) => b.session_date.localeCompare(a.session_date))
      const lastSession = finished[0] ? buildSessionSummary(db, finished[0]) : null

      const metrics = db.bodyMetrics
        .filter((m) => m.user_id === userId && m.weight_kg !== null)
        .sort((a, b) => b.log_date.localeCompare(a.log_date))
      const lastWeighIn = metrics[0]?.log_date ?? null

      const tdee = db.tdeeEstimates
        .filter((t) => t.user_id === userId)
        .sort((a, b) => b.estimate_date.localeCompare(a.estimate_date))[0]

      const trendWeight = (() => {
        const recent = metrics.slice(0, 21).reverse()
        if (recent.length === 0) return null
        let value: number | null = null
        for (const m of recent) {
          const w = m.weight_kg as number
          value = value === null ? w : 0.25 * w + 0.75 * value
        }
        return value === null ? null : Number(value.toFixed(2))
      })()

      return {
        today: {
          date,
          totals: day.totals,
          target: day.target,
          logged_entries: day.entries.length,
        },
        training: {
          week_start: weekStart(date),
          sessions_this_week: thisWeek?.sessions ?? 0,
          planned_sessions: db.routines.filter((r) => r.user_id === userId).length,
          volume_this_week_kg: thisWeek?.total_volume_kg ?? 0,
          volume_last_week_kg: lastWeek?.total_volume_kg ?? 0,
          sets_by_muscle_group:
            thisWeek?.sets_by_muscle_group ??
            { chest: 0, back: 0, legs: 0, shoulders: 0, arms: 0, core: 0 },
          last_session: lastSession,
        },
        body: {
          current_trend_kg: trendWeight,
          rate_kg_week: weeklyRate(db, userId, 21),
          goal_rate_kg_week: user.goal_rate_kg_week,
          goal: user.goal,
          last_logged_date: lastWeighIn,
          days_since_weigh_in: lastWeighIn ? daysBetween(lastWeighIn, date) : null,
        },
        tdee: tdee ?? null,
        recent_prs: buildRecentPRs(db, userId, 6),
        plateaus: buildAllPlateaus(db, userId).slice(0, 4),
        suggestion: computeSuggestion(db, userId),
        streak_days: loggingStreak(db, userId),
      }
    })
  },
}
