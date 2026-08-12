import { supabase, currentUserId } from '@/lib/supabase'
import * as derive from './derive'
import { macrosFromCalories, targetCaloriesFor } from '@/lib/adaptive'
import { today } from '@/lib/date'
import {
  fetchBodyMetrics,
  fetchDismissedSuggestionIds,
  fetchFoodLogs,
  fetchFoods,
  fetchNutritionTargets,
  fetchSessions,
  fetchTdeeEstimates,
  fetchAllSets,
  groupSetsBySession,
  indexById,
} from './queries'
import { ApiError } from '@/types'
import type {
  Food,
  FoodLog,
  Goal,
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
  message: string
}

async function currentProfileRates(): Promise<{ goal: Goal; goal_rate_kg_week: number }> {
  const userId = await currentUserId()
  const { data, error } = await supabase.from('profiles').select('goal, goal_rate_kg_week').eq('id', userId).single()
  if (error) throw new ApiError(error.message, 500)
  return data as { goal: Goal; goal_rate_kg_week: number }
}

/** Shared by currentSuggestion/recompute/acceptSuggestion, and by dashboardService's summary. */
export async function computeCurrentSuggestion(): Promise<MacroSuggestion | null> {
  const [user, targets, metrics, sessions, sets, logs, foods, dismissed] = await Promise.all([
    currentProfileRates(),
    fetchNutritionTargets(),
    fetchBodyMetrics(),
    fetchSessions(),
    fetchAllSets(),
    fetchFoodLogs(),
    fetchFoods(),
    fetchDismissedSuggestionIds(),
  ])
  const target = derive.currentTargetOn(targets, today())
  return derive.computeSuggestion(user, target, metrics, sessions, groupSetsBySession(sets), logs, indexById(foods), dismissed)
}

/** Nutrition service (Supabase replatform Phase 3). `userId` kept for call-site compatibility but unused. */
export const nutritionService = {
  async searchFoods(_userId: string, query: string, limit = 40): Promise<Food[]> {
    let request = supabase.from('foods').select('*')
    const q = query.trim()
    if (q) request = request.or(`name.ilike.%${q}%,brand.ilike.%${q}%`)
    const { data, error } = await request
    if (error) throw new ApiError(error.message, 500)
    const foods = (data ?? []) as Food[]
    foods.sort((a, b) => {
      if (a.is_custom !== b.is_custom) return a.is_custom ? -1 : 1
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    })
    return foods.slice(0, limit)
  },

  async frequentFoods(_userId: string, limit = 8): Promise<Food[]> {
    const logs = await fetchFoodLogs()
    const counts = new Map<string, number>()
    for (const log of logs) counts.set(log.food_id, (counts.get(log.food_id) ?? 0) + 1)
    const topIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id)
    if (topIds.length === 0) return []
    const { data, error } = await supabase.from('foods').select('*').in('id', topIds)
    if (error) throw new ApiError(error.message, 500)
    const byId = indexById((data ?? []) as Food[])
    return topIds.map((id) => byId.get(id)).filter((f): f is Food => f !== undefined)
  },

  async createFood(_userId: string, payload: CustomFoodPayload): Promise<Food> {
    const name = payload.name.trim()
    const { data: clash } = await supabase.from('foods').select('id').ilike('name', name).limit(1)
    if (clash && clash.length > 0) throw new ApiError('A food with that name already exists.', 409)

    const userId = await currentUserId()
    const { data, error } = await supabase
      .from('foods')
      .insert({ ...payload, name, is_custom: true, created_by: userId })
      .select()
      .single()
    if (error) throw new ApiError(error.message, 500)
    return data as Food
  },

  async getDay(_userId: string, date: string): Promise<NutritionDay> {
    const [{ data: logs, error: logError }, foods, targets] = await Promise.all([
      supabase.from('food_logs').select('*').eq('log_date', date),
      fetchFoods(),
      fetchNutritionTargets(),
    ])
    if (logError) throw new ApiError(logError.message, 500)
    return derive.buildNutritionDay((logs ?? []) as FoodLog[], indexById(foods), targets, date)
  },

  async logFood(_userId: string, payload: LogFoodPayload): Promise<FoodLog> {
    const { data: visible } = await supabase.from('foods').select('id').eq('id', payload.food_id).limit(1)
    if (!visible || visible.length === 0) throw new ApiError('That food no longer exists.', 404)
    if (payload.quantity_g <= 0) throw new ApiError('Quantity must be greater than 0 g.', 422)

    const userId = await currentUserId()
    const { data, error } = await supabase.from('food_logs').insert({ ...payload, user_id: userId }).select().single()
    if (error) throw new ApiError(error.message, 500)
    return data as FoodLog
  },

  async updateLog(
    _userId: string,
    logId: string,
    patch: Partial<Pick<FoodLog, 'quantity_g' | 'meal_type'>>,
  ): Promise<FoodLog> {
    if (patch.quantity_g !== undefined && patch.quantity_g !== null && patch.quantity_g <= 0) {
      throw new ApiError('Quantity must be greater than 0 g.', 422)
    }
    const { data, error } = await supabase.from('food_logs').update(patch).eq('id', logId).select().single()
    if (error) throw new ApiError(error.message, 500)
    return data as FoodLog
  },

  async deleteLog(_userId: string, logId: string): Promise<void> {
    const { error } = await supabase.from('food_logs').delete().eq('id', logId)
    if (error) throw new ApiError(error.message, 500)
  },

  async copyDay(_userId: string, from: string, to: string): Promise<number> {
    const { data: source, error: sourceError } = await supabase.from('food_logs').select('*').eq('log_date', from)
    if (sourceError) throw new ApiError(sourceError.message, 500)
    if (!source || source.length === 0) throw new ApiError('That day has nothing logged to copy.', 404)

    const userId = await currentUserId()
    const rows = source.map((log) => ({
      user_id: userId,
      food_id: log.food_id,
      log_date: to,
      quantity_g: log.quantity_g,
      meal_type: log.meal_type,
    }))
    const { error } = await supabase.from('food_logs').insert(rows)
    if (error) throw new ApiError(error.message, 500)
    return rows.length
  },

  async currentTarget(_userId: string): Promise<NutritionTarget | null> {
    const targets = await fetchNutritionTargets()
    return derive.currentTargetOn(targets, today())
  },

  targetHistory(_userId: string): Promise<NutritionTarget[]> {
    return fetchNutritionTargets()
  },

  tdeeHistory(_userId: string): Promise<TdeeEstimate[]> {
    return fetchTdeeEstimates()
  },

  currentSuggestion(_userId: string): Promise<MacroSuggestion | null> {
    return computeCurrentSuggestion()
  },

  async recompute(_userId: string): Promise<RecomputeResult> {
    const [metrics, logs, foods] = await Promise.all([fetchBodyMetrics(), fetchFoodLogs(), fetchFoods()])
    const result = derive.computeTdee(metrics, logs, indexById(foods))
    if (result === null) {
      return {
        tdee: null,
        suggestion: null,
        message: 'Not enough data yet. Log weight and food for at least 7 days to get an adaptive estimate.',
      }
    }

    const userId = await currentUserId()
    const todayIso = today()
    await supabase.from('tdee_estimates').delete().eq('user_id', userId).eq('estimate_date', todayIso)
    const { data: estimate, error } = await supabase
      .from('tdee_estimates')
      .insert({
        user_id: userId,
        estimate_date: todayIso,
        estimated_tdee: result.estimated_tdee,
        weight_trend_kg: result.weight_trend_kg,
        confidence: result.confidence,
      })
      .select()
      .single()
    if (error) throw new ApiError(error.message, 500)

    return {
      tdee: estimate as TdeeEstimate,
      suggestion: await computeCurrentSuggestion(),
      message: `Recalculated from ${result.days_of_data} days of data.`,
    }
  },

  async acceptSuggestion(_userId: string, suggestionId: string): Promise<NutritionTarget> {
    const suggestion = await computeCurrentSuggestion()
    if (suggestion === null || suggestion.id !== suggestionId) {
      throw new ApiError('That suggestion is no longer current.', 409)
    }

    const userId = await currentUserId()
    const todayIso = today()
    await supabase.from('nutrition_targets').delete().eq('user_id', userId).eq('effective_date', todayIso)
    const { data, error } = await supabase
      .from('nutrition_targets')
      .insert({
        user_id: userId,
        effective_date: todayIso,
        calories: suggestion.proposed.calories,
        protein_g: suggestion.proposed.protein_g,
        carbs_g: suggestion.proposed.carbs_g,
        fat_g: suggestion.proposed.fat_g,
        source: 'adaptive',
      })
      .select()
      .single()
    if (error) throw new ApiError(error.message, 500)
    return data as NutritionTarget
  },

  async dismissSuggestion(_userId: string, suggestionId: string): Promise<void> {
    const userId = await currentUserId()
    const { data: existing } = await supabase
      .from('dismissed_suggestions')
      .select('id')
      .eq('user_id', userId)
      .eq('suggestion_id', suggestionId)
      .limit(1)
    if (existing && existing.length > 0) return
    const { error } = await supabase.from('dismissed_suggestions').insert({ user_id: userId, suggestion_id: suggestionId })
    if (error) throw new ApiError(error.message, 500)
  },

  async setManualTarget(_userId: string, macros: Macros): Promise<NutritionTarget> {
    const userId = await currentUserId()
    const todayIso = today()
    await supabase.from('nutrition_targets').delete().eq('user_id', userId).eq('effective_date', todayIso)
    const { data, error } = await supabase
      .from('nutrition_targets')
      .insert({
        user_id: userId,
        effective_date: todayIso,
        calories: Math.round(macros.calories),
        protein_g: Math.round(macros.protein_g),
        carbs_g: Math.round(macros.carbs_g),
        fat_g: Math.round(macros.fat_g),
        source: 'manual',
      })
      .select()
      .single()
    if (error) throw new ApiError(error.message, 500)
    return data as NutritionTarget
  },

  /** Preview used by the manual-target editor while the user drags calories — pure client-side math. */
  previewMacros(calories: number, weightKg: number, goal: 'bulk' | 'cut' | 'maintain'): Macros {
    return macrosFromCalories(calories, weightKg, goal)
  },

  suggestedCalories(tdee: number, goalRate: number): number {
    return targetCaloriesFor(tdee, goalRate)
  },
}
