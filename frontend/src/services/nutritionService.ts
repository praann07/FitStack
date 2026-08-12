import { request } from './client'
import { macrosFromCalories, targetCaloriesFor } from '@/lib/adaptive'
import type {
  Food,
  FoodLog,
  Macros,
  MacroSuggestion,
  MealType,
  NutritionDay,
  NutritionTarget,
  TdeeEstimate,
} from '@/types'

export interface LogFoodPayload {
  food_id: string
  log_date: string
  quantity_g: number
  meal_type: MealType
}

export interface CustomFoodPayload {
  name: string
  brand: string | null
  calories_per_100g: number
  protein_per_100g: number
  carbs_per_100g: number
  fat_per_100g: number
  serving_label: string | null
  serving_g: number | null
}

export interface RecomputeResult {
  tdee: TdeeEstimate | null
  suggestion: MacroSuggestion | null
  /** Set when there isn't enough data yet and we fell back to the last target. */
  message: string
}

/**
 * Nutrition service (Phase 2 — real backend). `userId` parameters are kept
 * for call-site compatibility but unused: identity comes from the token.
 */
export const nutritionService = {
  /** GET /api/v1/foods?search= */
  searchFoods(_userId: string, query: string, limit = 40): Promise<Food[]> {
    return request<Food[]>('GET', '/foods', undefined, { query: { search: query, limit } })
  },

  /** Foods the user logs most — the default list before they search. */
  frequentFoods(_userId: string, limit = 8): Promise<Food[]> {
    return request<Food[]>('GET', '/foods/frequent', undefined, { query: { limit } })
  },

  /** POST /api/v1/foods */
  createFood(_userId: string, payload: CustomFoodPayload): Promise<Food> {
    return request<Food>('POST', '/foods', payload)
  },

  /** GET /api/v1/nutrition/logs?date= */
  getDay(_userId: string, date: string): Promise<NutritionDay> {
    return request<NutritionDay>('GET', '/nutrition/logs', undefined, { query: { log_date: date } })
  },

  /** POST /api/v1/nutrition/logs */
  logFood(_userId: string, payload: LogFoodPayload): Promise<FoodLog> {
    return request<FoodLog>('POST', '/nutrition/logs', payload)
  },

  /** PATCH /api/v1/nutrition/logs/{id} */
  updateLog(
    _userId: string,
    logId: string,
    patch: Partial<Pick<FoodLog, 'quantity_g' | 'meal_type'>>,
  ): Promise<FoodLog> {
    return request<FoodLog>('PATCH', `/nutrition/logs/${logId}`, patch)
  },

  /** DELETE /api/v1/nutrition/logs/{id} */
  deleteLog(_userId: string, logId: string): Promise<void> {
    return request<void>('DELETE', `/nutrition/logs/${logId}`)
  },

  /** Copy an entire earlier day into the current one — a real habit for meal preppers. */
  copyDay(_userId: string, from: string, to: string): Promise<number> {
    return request<number>('POST', '/nutrition/logs/copy', { from_date: from, to_date: to })
  },

  /** GET /api/v1/nutrition/targets/current */
  currentTarget(_userId: string): Promise<NutritionTarget | null> {
    return request<NutritionTarget | null>('GET', '/nutrition/targets/current')
  },

  targetHistory(_userId: string): Promise<NutritionTarget[]> {
    return request<NutritionTarget[]>('GET', '/nutrition/targets')
  },

  /** GET /api/v1/nutrition/tdee-history */
  tdeeHistory(_userId: string): Promise<TdeeEstimate[]> {
    return request<TdeeEstimate[]>('GET', '/nutrition/tdee-history')
  },

  currentSuggestion(_userId: string): Promise<MacroSuggestion | null> {
    return request<MacroSuggestion | null>('GET', '/nutrition/targets/suggestion')
  },

  /** POST /api/v1/nutrition/targets/recompute */
  recompute(_userId: string): Promise<RecomputeResult> {
    return request<RecomputeResult>('POST', '/nutrition/targets/recompute')
  },

  /** Accepting a suggestion writes a new adaptive nutrition_targets row. */
  acceptSuggestion(_userId: string, suggestionId: string): Promise<NutritionTarget> {
    return request<NutritionTarget>('POST', '/nutrition/targets/accept', { suggestion_id: suggestionId })
  },

  dismissSuggestion(_userId: string, suggestionId: string): Promise<void> {
    return request<void>('POST', '/nutrition/targets/dismiss', { suggestion_id: suggestionId })
  },

  /** Manual override — source = 'manual', which pauses adaptive overwrites. */
  setManualTarget(_userId: string, macros: Macros): Promise<NutritionTarget> {
    return request<NutritionTarget>('POST', '/nutrition/targets', macros)
  },

  /** Preview used by the manual-target editor while the user drags calories — pure client-side math. */
  previewMacros(calories: number, weightKg: number, goal: 'bulk' | 'cut' | 'maintain'): Macros {
    return macrosFromCalories(calories, weightKg, goal)
  },

  suggestedCalories(tdee: number, goalRate: number): number {
    return targetCaloriesFor(tdee, goalRate)
  },
}
