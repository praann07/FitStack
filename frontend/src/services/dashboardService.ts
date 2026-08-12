import { request } from './client'
import type { DashboardSummary } from '@/types'

/**
 * Dashboard service (Phase 2 — real backend). `userId` kept for call-site
 * compatibility but unused: identity comes from the token.
 */
export const dashboardService = {
  /** GET /api/v1/dashboard/summary */
  summary(_userId: string): Promise<DashboardSummary> {
    return request<DashboardSummary>('GET', '/dashboard/summary')
  },
}
