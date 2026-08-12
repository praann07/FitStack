/**
 * Service layer barrel.
 *
 * Components import from here and never touch the transport directly.
 * Phase 2: every service makes real HTTP calls against the FastAPI backend
 * (see fitstack-system-design.md §8 for the endpoint list).
 */
export { authService } from './authService'
export { workoutService } from './workoutService'
export { nutritionService } from './nutritionService'
export { progressService } from './progressService'
export { dashboardService } from './dashboardService'
export { API_BASE_URL } from './client'
export type { LogSetPayload, RoutineInput } from './workoutService'
export type { CustomFoodPayload, LogFoodPayload, RecomputeResult } from './nutritionService'
export type { MetricPayload } from './progressService'
