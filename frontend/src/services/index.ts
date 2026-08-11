/**
 * Service layer barrel.
 *
 * Components import from here and never touch the mock store directly. In
 * Phase 2 each service keeps its signature and swaps its body for a real HTTP
 * call — every method is already annotated with the endpoint it maps to
 * (system design §8).
 */
export { authService } from './authService'
export { workoutService } from './workoutService'
export { nutritionService } from './nutritionService'
export { progressService } from './progressService'
export { dashboardService } from './dashboardService'
export { resetDb } from './db'
export {
  API_BASE_URL,
  failNextRequests,
  getTransportState,
  setLatencyMode,
  subscribeTransport,
} from './client'
export type { LatencyMode } from './client'
export type { LogSetPayload, RoutineInput } from './workoutService'
export type { CustomFoodPayload, LogFoodPayload, RecomputeResult } from './nutritionService'
export type { MetricPayload } from './progressService'
