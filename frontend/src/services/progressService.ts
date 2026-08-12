import { request } from './client'
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
 * Progress service (Phase 2 — real backend). `userId` parameters are kept
 * for call-site compatibility but unused: identity comes from the token.
 */
export const progressService = {
  /** GET /api/v1/progress/metrics?from=&to= */
  listMetrics(_userId: string, filters?: { from?: string; to?: string }): Promise<BodyMetric[]> {
    return request<BodyMetric[]>('GET', '/progress/metrics', undefined, {
      query: { from: filters?.from, to: filters?.to },
    })
  },

  /** POST /api/v1/progress/metrics — upsert, since (user_id, log_date) is unique. */
  saveMetric(_userId: string, payload: MetricPayload): Promise<BodyMetric> {
    return request<BodyMetric>('POST', '/progress/metrics', payload)
  },

  deleteMetric(_userId: string, metricId: string): Promise<void> {
    return request<void>('DELETE', `/progress/metrics/${metricId}`)
  },

  /** GET /api/v1/progress/trend — smoothed weight + training-volume overlay. */
  getTrend(_userId: string, days = 90, endDate?: string): Promise<ProgressTrend> {
    return request<ProgressTrend>('GET', '/progress/trend', undefined, {
      query: { days, end_date: endDate },
    })
  },
}
