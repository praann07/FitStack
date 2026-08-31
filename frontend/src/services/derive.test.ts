import { describe, expect, it } from 'vitest'
import { macrosFor, sumMacros, currentTargetOn, recomputePRs } from './derive'
import type { Food, Macros, NutritionTarget, WorkoutSession, WorkoutSet } from '@/types'

describe('macrosFor', () => {
  const chicken: Food = {
    id: 'f1',
    name: 'Chicken breast',
    brand: null,
    calories_per_100g: 165,
    protein_per_100g: 31,
    carbs_per_100g: 0,
    fat_per_100g: 3.6,
    serving_label: null,
    serving_g: null,
    is_custom: false,
    created_by: null,
  }

  it('scales macros by portion in grams', () => {
    // 200g = 2x the 100g column values
    expect(macrosFor(chicken, 200)).toEqual({
      calories: 330,
      protein_g: 62,
      carbs_g: 0,
      fat_g: 7.2,
    })
  })

  it('rounds servings to a single decimal (0.5g where needed)', () => {
    // 150g = 1.5x -> fat 3.6 * 1.5 = 5.4
    expect(macrosFor(chicken, 150)).toEqual({
      calories: 247.5,
      protein_g: 46.5,
      carbs_g: 0,
      fat_g: 5.4,
    })
  })
})

describe('sumMacros', () => {
  it('sums each macro column across entries', () => {
    const a: Macros = { calories: 100, protein_g: 10, carbs_g: 5, fat_g: 2 }
    const b: Macros = { calories: 250, protein_g: 20, carbs_g: 0, fat_g: 8 }
    expect(sumMacros([a, b])).toEqual({ calories: 350, protein_g: 30, carbs_g: 5, fat_g: 10 })
  })

  it('returns zeros for an empty list', () => {
    expect(sumMacros([])).toEqual({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })
  })
})

describe('currentTargetOn', () => {
  const target = (id: string, effective_date: string): NutritionTarget => ({
    id,
    effective_date,
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    user_id: 'u1',
    source: 'manual',
  })

  it('picks the latest effective target on or before the given date', () => {
    const targets = [target('old', '2026-01-01'), target('new', '2026-06-01')]
    expect(currentTargetOn(targets, '2026-06-15')?.id).toBe('new')
    expect(currentTargetOn(targets, '2026-03-01')?.id).toBe('old')
  })

  it('ignores targets that take effect after the given date', () => {
    expect(currentTargetOn([target('later', '2026-12-01')], '2026-01-01')).toBeNull()
  })

  it('is insensitive to input order', () => {
    const a = target('a', '2026-02-01')
    const b = target('b', '2026-07-01')
    expect(currentTargetOn([b, a], '2026-08-01')?.id).toBe('b')
    expect(currentTargetOn([b, a], '2026-06-01')?.id).toBe('a')
  })
})

describe('recomputePRs', () => {
  const set = (id: string, sessionId: string, weightKg: number, reps: number, setNumber = 1): WorkoutSet => ({
    id,
    session_id: sessionId,
    exercise_id: 'e1',
    set_number: setNumber,
    weight_kg: weightKg,
    reps,
    rpe: null,
    set_type: 'normal',
    notes: null,
    is_pr: false,
  })
  const session = (id: string, date: string): WorkoutSession => ({
    id,
    user_id: 'u1',
    routine_id: null,
    session_date: date,
    notes: null,
    started_at: null,
    ended_at: null,
  })

  it('flags a heavier-but-weaker single as NOT a PR when its e1RM is lower', () => {
    const sessions = [session('s1', '2026-01-01'), session('s2', '2026-01-08')]
    // History: 100kg x 5 (e1RM 116.7). Later: 110kg x 1 (e1RM 113.7) — heavier
    // raw weight but a LOWER estimated 1RM, so it is not a personal record.
    const sets = [
      set('a', 's1', 100, 5),
      set('b', 's2', 110, 1),
    ]
    const result = recomputePRs(sessions, sets)
    const byId = new Map(result.map((s) => [s.id, s]))
    expect(byId.get('a')!.is_pr).toBe(true)
    expect(byId.get('b')!.is_pr).toBe(false)
  })
})
