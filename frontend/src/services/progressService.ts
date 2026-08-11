import { apiCall } from './client'
import { getDb, mutate } from './db'
import { buildTrend } from './derive'
import { generateId } from '@/mock/seed'
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

export const progressService = {
  /** GET /api/v1/progress/metrics?from=&to= */
  listMetrics(userId: string, filters?: { from?: string; to?: string }): Promise<BodyMetric[]> {
    return apiCall('GET /progress/metrics', () =>
      getDb()
        .bodyMetrics.filter((m) => m.user_id === userId)
        .filter((m) => !filters?.from || m.log_date >= filters.from)
        .filter((m) => !filters?.to || m.log_date <= filters.to)
        .sort((a, b) => b.log_date.localeCompare(a.log_date)),
    )
  },

  /** POST /api/v1/progress/metrics — upsert, since (user_id, log_date) is unique. */
  saveMetric(userId: string, payload: MetricPayload): Promise<BodyMetric> {
    return apiCall('POST /progress/metrics', () =>
      mutate((db) => {
        const hasValue =
          payload.weight_kg !== null ||
          payload.waist_cm !== null ||
          payload.chest_cm !== null ||
          payload.arm_cm !== null
        if (!hasValue) throw new ApiError('Enter at least one measurement.', 422, 'weight_kg')

        const existing = db.bodyMetrics.find(
          (m) => m.user_id === userId && m.log_date === payload.log_date,
        )
        if (existing) {
          Object.assign(existing, payload, { photo_url: payload.photo_url ?? existing.photo_url })
          return { ...existing }
        }
        const metric: BodyMetric = {
          id: generateId('bm'),
          user_id: userId,
          log_date: payload.log_date,
          weight_kg: payload.weight_kg,
          waist_cm: payload.waist_cm,
          chest_cm: payload.chest_cm,
          arm_cm: payload.arm_cm,
          photo_url: payload.photo_url ?? null,
        }
        db.bodyMetrics.push(metric)
        return metric
      }),
    )
  },

  deleteMetric(userId: string, metricId: string): Promise<void> {
    return apiCall('DELETE /progress/metrics/{id}', () =>
      mutate((db) => {
        const exists = db.bodyMetrics.some((m) => m.id === metricId && m.user_id === userId)
        if (!exists) throw new ApiError('Entry not found.', 404)
        db.bodyMetrics = db.bodyMetrics.filter((m) => m.id !== metricId)
      }),
    )
  },

  /** GET /api/v1/progress/trend — smoothed weight + training-volume overlay. */
  getTrend(userId: string, days = 90): Promise<ProgressTrend> {
    return apiCall('GET /progress/trend', () => buildTrend(getDb(), userId, days))
  },
}
