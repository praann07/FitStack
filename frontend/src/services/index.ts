/**
 * Service layer barrel.
 *
 * Components import from here and never touch supabase-js directly.
 * Phase 3: every service queries Supabase (Postgres + RLS) directly; there
 * is no backend server in this path anymore.
 */
export { authService } from './authService'
export { workoutService } from './workoutService'
export { nutritionService } from './nutritionService'
export { progressService } from './progressService'
export { dashboardService } from './dashboardService'
export type { LogSetPayload, RoutineInput } from './workoutService'
export type { CustomFoodPayload, LogFoodPayload, RecomputeResult } from './nutritionService'
export type { MetricPayload } from './progressService'
