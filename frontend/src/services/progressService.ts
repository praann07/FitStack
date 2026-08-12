import { supabase, currentUserId } from '@/lib/supabase'
import * as derive from './derive'
import { fetchBodyMetrics, fetchFoodLogs, fetchFoods, fetchSessions, fetchAllSets, groupSetsBySession, indexById } from './queries'
import { ApiError } from '@/types'
import type { BodyMetric, ProgressTrend } from '@/types'

export interface MetricPayload {
  log_date: string
  weight_kg: number | null
  waist_cm: number | null
  chest_cm: number | null
  arm_cm: number | null
  photo_url?: string | null
}

/**
 * Progress service (Supabase replatform Phase 3). `userId` parameters are
 * kept for call-site compatibility but unused: identity comes from the
 * Supabase session, and RLS scopes every query to the caller's own rows.
 */
export const progressService = {
  listMetrics(_userId: string, filters?: { from?: string; to?: string }): Promise<BodyMetric[]> {
    return fetchBodyMetrics(filters)
  },

  /** Upsert on (user_id, log_date) -- matches the old backend's unique-constraint-driven upsert. */
  async saveMetric(_userId: string, payload: MetricPayload): Promise<BodyMetric> {
    if (Object.values({ weight_kg: payload.weight_kg, waist_cm: payload.waist_cm, chest_cm: payload.chest_cm, arm_cm: payload.arm_cm }).every((v) => v === null)) {
      throw new ApiError('Enter at least one measurement.', 422)
    }
    const userId = await currentUserId()
    const { data, error } = await supabase
      .from('body_metrics')
      .upsert(
        {
          user_id: userId,
          log_date: payload.log_date,
          weight_kg: payload.weight_kg,
          waist_cm: payload.waist_cm,
          chest_cm: payload.chest_cm,
          arm_cm: payload.arm_cm,
          ...(payload.photo_url !== undefined && payload.photo_url !== null ? { photo_url: payload.photo_url } : {}),
        },
        { onConflict: 'user_id,log_date' },
      )
      .select()
      .single()
    if (error) throw new ApiError(error.message, 500)
    return data as BodyMetric
  },

  async deleteMetric(_userId: string, metricId: string): Promise<void> {
    const { error, count } = await supabase.from('body_metrics').delete({ count: 'exact' }).eq('id', metricId)
    if (error) throw new ApiError(error.message, 500)
    if (!count) throw new ApiError('Entry not found.', 404)
  },

  async getTrend(_userId: string, days = 90, endDate?: string): Promise<ProgressTrend> {
    const [metrics, sessions, sets, logs, foods] = await Promise.all([
      fetchBodyMetrics(),
      fetchSessions(),
      fetchAllSets(),
      fetchFoodLogs(),
      fetchFoods(),
    ])
    return derive.buildTrend(metrics, sessions, groupSetsBySession(sets), logs, indexById(foods), days, endDate)
  },
}
