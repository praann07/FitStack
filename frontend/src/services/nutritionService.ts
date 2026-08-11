import { apiCall } from './client'
import { getDb, mutate } from './db'
import {
  buildNutritionDay,
  computeSuggestion,
  computeTdee,
  currentTargetOn,
} from './derive'
import { generateId } from '@/mock/seed'
import { macrosFromCalories, targetCaloriesFor } from '@/lib/adaptive'
import { today } from '@/lib/date'
import { ApiError } from '@/types'
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

export const nutritionService = {
  /** GET /api/v1/foods?search= */
  searchFoods(userId: string, query: string, limit = 40): Promise<Food[]> {
    return apiCall('GET /foods', () => {
      const db = getDb()
      const q = query.trim().toLowerCase()
      const visible = db.foods.filter((f) => f.created_by === null || f.created_by === userId)
      const matched = q
        ? visible.filter(
            (f) =>
              f.name.toLowerCase().includes(q) || (f.brand ?? '').toLowerCase().includes(q),
          )
        : visible
      return matched
        .sort((a, b) => {
          if (a.is_custom !== b.is_custom) return a.is_custom ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        .slice(0, limit)
    })
  },

  /** Foods the user logs most — the default list before they search. */
  frequentFoods(userId: string, limit = 8): Promise<Food[]> {
    return apiCall('GET /foods?frequent=true', () => {
      const db = getDb()
      const counts = new Map<string, number>()
      for (const log of db.foodLogs) {
        if (log.user_id !== userId) continue
        counts.set(log.food_id, (counts.get(log.food_id) ?? 0) + 1)
      }
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .flatMap(([foodId]) => {
          const food = db.foods.find((f) => f.id === foodId)
          return food ? [food] : []
        })
    })
  },

  /** POST /api/v1/foods */
  createFood(userId: string, payload: CustomFoodPayload): Promise<Food> {
    return apiCall('POST /foods', () =>
      mutate((db) => {
        const name = payload.name.trim()
        if (
          db.foods.some(
            (f) =>
              f.name.toLowerCase() === name.toLowerCase() &&
              (f.created_by === null || f.created_by === userId),
          )
        ) {
          throw new ApiError('A food with that name already exists.', 409, 'name')
        }
        const food: Food = {
          id: generateId('fd'),
          ...payload,
          name,
          is_custom: true,
          created_by: userId,
        }
        db.foods.push(food)
        return food
      }),
    )
  },

  /** GET /api/v1/nutrition/logs?date= */
  getDay(userId: string, date: string): Promise<NutritionDay> {
    return apiCall('GET /nutrition/logs', () => buildNutritionDay(getDb(), userId, date))
  },

  /** POST /api/v1/nutrition/logs */
  logFood(userId: string, payload: LogFoodPayload): Promise<FoodLog> {
    return apiCall('POST /nutrition/logs', () =>
      mutate((db) => {
        if (!db.foods.some((f) => f.id === payload.food_id)) {
          throw new ApiError('That food no longer exists.', 404)
        }
        if (payload.quantity_g <= 0) {
          throw new ApiError('Quantity must be greater than 0 g.', 422, 'quantity_g')
        }
        const log: FoodLog = { id: generateId('fl'), user_id: userId, ...payload }
        db.foodLogs.push(log)
        return log
      }),
    )
  },

  /** PATCH /api/v1/nutrition/logs/{id} */
  updateLog(userId: string, logId: string, patch: Partial<Pick<FoodLog, 'quantity_g' | 'meal_type'>>): Promise<FoodLog> {
    return apiCall('PATCH /nutrition/logs/{id}', () =>
      mutate((db) => {
        const log = db.foodLogs.find((l) => l.id === logId && l.user_id === userId)
        if (!log) throw new ApiError('Entry not found.', 404)
        if (patch.quantity_g !== undefined && patch.quantity_g <= 0) {
          throw new ApiError('Quantity must be greater than 0 g.', 422, 'quantity_g')
        }
        Object.assign(log, patch)
        return { ...log }
      }),
    )
  },

  /** DELETE /api/v1/nutrition/logs/{id} */
  deleteLog(userId: string, logId: string): Promise<void> {
    return apiCall('DELETE /nutrition/logs/{id}', () =>
      mutate((db) => {
        db.foodLogs = db.foodLogs.filter((l) => !(l.id === logId && l.user_id === userId))
      }),
    )
  },

  /** Copy an entire earlier day into the current one — a real habit for meal preppers. */
  copyDay(userId: string, from: string, to: string): Promise<number> {
    return apiCall('POST /nutrition/logs/copy', () =>
      mutate((db) => {
        const source = db.foodLogs.filter((l) => l.user_id === userId && l.log_date === from)
        if (source.length === 0) throw new ApiError('That day has nothing logged to copy.', 404)
        source.forEach((log) => {
          db.foodLogs.push({ ...log, id: generateId('fl'), log_date: to })
        })
        return source.length
      }),
    )
  },

  /** GET /api/v1/nutrition/targets/current */
  currentTarget(userId: string): Promise<NutritionTarget | null> {
    return apiCall('GET /nutrition/targets/current', () => currentTargetOn(getDb(), userId, today()))
  },

  targetHistory(userId: string): Promise<NutritionTarget[]> {
    return apiCall('GET /nutrition/targets', () =>
      getDb()
        .nutritionTargets.filter((t) => t.user_id === userId)
        .sort((a, b) => b.effective_date.localeCompare(a.effective_date)),
    )
  },

  /** GET /api/v1/nutrition/tdee-history */
  tdeeHistory(userId: string): Promise<TdeeEstimate[]> {
    return apiCall('GET /nutrition/tdee-history', () =>
      getDb()
        .tdeeEstimates.filter((t) => t.user_id === userId)
        .sort((a, b) => a.estimate_date.localeCompare(b.estimate_date)),
    )
  },

  currentSuggestion(userId: string): Promise<MacroSuggestion | null> {
    return apiCall('GET /nutrition/targets/suggestion', () => computeSuggestion(getDb(), userId))
  },

  /** POST /api/v1/nutrition/targets/recompute */
  recompute(userId: string): Promise<RecomputeResult> {
    return apiCall('POST /nutrition/targets/recompute', () =>
      mutate((db) => {
        const result = computeTdee(db, userId)
        if (!result) {
          return {
            tdee: null,
            suggestion: null,
            message:
              'Not enough data yet. Log weight and food for at least 7 days to get an adaptive estimate.',
          }
        }
        const estimate: TdeeEstimate = {
          id: generateId('tdee'),
          user_id: userId,
          estimate_date: today(),
          estimated_tdee: result.estimated_tdee,
          weight_trend_kg: result.weight_trend_kg,
          confidence: result.confidence,
        }
        db.tdeeEstimates = db.tdeeEstimates.filter(
          (t) => !(t.user_id === userId && t.estimate_date === estimate.estimate_date),
        )
        db.tdeeEstimates.push(estimate)
        return {
          tdee: estimate,
          suggestion: computeSuggestion(db, userId),
          message: `Recalculated from ${result.days_of_data} days of data.`,
        }
      }),
    )
  },

  /** Accepting a suggestion writes a new adaptive nutrition_targets row. */
  acceptSuggestion(userId: string, suggestionId: string): Promise<NutritionTarget> {
    return apiCall('POST /nutrition/targets/accept', () =>
      mutate((db) => {
        const suggestion = computeSuggestion(db, userId)
        if (!suggestion || suggestion.id !== suggestionId) {
          throw new ApiError('That suggestion is no longer current.', 409)
        }
        const target: NutritionTarget = {
          id: generateId('nt'),
          user_id: userId,
          effective_date: today(),
          calories: suggestion.proposed.calories,
          protein_g: suggestion.proposed.protein_g,
          carbs_g: suggestion.proposed.carbs_g,
          fat_g: suggestion.proposed.fat_g,
          source: 'adaptive',
        }
        db.nutritionTargets = db.nutritionTargets.filter(
          (t) => !(t.user_id === userId && t.effective_date === target.effective_date),
        )
        db.nutritionTargets.push(target)
        return target
      }),
    )
  },

  dismissSuggestion(userId: string, suggestionId: string): Promise<void> {
    return apiCall('POST /nutrition/targets/dismiss', () =>
      mutate((db) => {
        void userId
        if (!db.dismissedSuggestions.includes(suggestionId)) {
          db.dismissedSuggestions.push(suggestionId)
        }
      }),
    )
  },

  /** Manual override — source = 'manual', which pauses adaptive overwrites. */
  setManualTarget(userId: string, macros: Macros): Promise<NutritionTarget> {
    return apiCall('POST /nutrition/targets', () =>
      mutate((db) => {
        const target: NutritionTarget = {
          id: generateId('nt'),
          user_id: userId,
          effective_date: today(),
          calories: Math.round(macros.calories),
          protein_g: Math.round(macros.protein_g),
          carbs_g: Math.round(macros.carbs_g),
          fat_g: Math.round(macros.fat_g),
          source: 'manual',
        }
        db.nutritionTargets = db.nutritionTargets.filter(
          (t) => !(t.user_id === userId && t.effective_date === target.effective_date),
        )
        db.nutritionTargets.push(target)
        return target
      }),
    )
  },

  /** Preview used by the manual-target editor while the user drags calories. */
  previewMacros(calories: number, weightKg: number, goal: 'bulk' | 'cut' | 'maintain'): Macros {
    return macrosFromCalories(calories, weightKg, goal)
  },

  suggestedCalories(tdee: number, goalRate: number): number {
    return targetCaloriesFor(tdee, goalRate)
  },
}
