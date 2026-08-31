import { describe, expect, it } from 'vitest'
import { estimateTdee, proposeRetarget } from './adaptive'
import type { Macros } from '@/types'

describe('estimateTdee', () => {
  it('returns null when there is too little intake or weight data', () => {
    expect(estimateTdee({ trendWeights: [70, 70], calories: [2000] })).toBeNull()
  })

  it('equals intake when weight is perfectly flat', () => {
    const result = estimateTdee({
      trendWeights: [70, 70, 70, 70, 70],
      calories: [2000, 2000, 2000],
    })
    expect(result).toMatchObject({
      estimated_tdee: 2000,
      weight_trend_kg: 70,
      rate_kg_week: 0,
      confidence: 'low',
      days_of_data: 3,
      avg_daily_calories: 2000,
    })
  })

  it('adds the deficit from weight loss back into the calorie estimate', () => {
    // Linear drop 80 -> 77 kg over 7 daily points (slope -0.5 kg/day = -3.5 kg/wk)
    const result = estimateTdee({
      trendWeights: [80, 79.5, 79, 78.5, 78, 77.5, 77],
      calories: [2500, 2500, 2500],
    })
    expect(result).toMatchObject({
      estimated_tdee: 6350, // 2500 - (-0.5 * 6 * 7700 / 6) = 2500 + 3850
      weight_trend_kg: 77,
      rate_kg_week: -3.5,
      avg_daily_calories: 2500,
    })
  })
})

describe('proposeRetarget', () => {
  const current: Macros = { calories: 2960, protein_g: 103, carbs_g: 437, fat_g: 89 }

  it('returns null while on track', () => {
    expect(
      proposeRetarget({
        actual_rate_kg_week: 0.24,
        goal_rate_kg_week: 0.25,
        weeks_deviating: 2,
        current,
        weight_kg: 54,
        goal: 'bulk',
      }),
    ).toBeNull()
  })

  it('proposes +150 kcal when gaining well below goal for two weeks', () => {
    const result = proposeRetarget({
      actual_rate_kg_week: 0.0,
      goal_rate_kg_week: 0.25,
      weeks_deviating: 2,
      current,
      weight_kg: 54,
      goal: 'bulk',
    })
    expect(result).not.toBeNull()
    expect(result!.calorie_delta).toBe(150)
    expect(result!.reason).toBe('Gaining slower than planned')
    // Protein is anchored to bodyweight and held fixed across the move.
    expect(result!.proposed.protein_g).toBe(current.protein_g)
    expect(result!.proposed.calories).toBe(3110)
  })

  it('does not propose while deviating for only one week', () => {
    expect(
      proposeRetarget({
        actual_rate_kg_week: 0.0,
        goal_rate_kg_week: 0.25,
        weeks_deviating: 1,
        current,
        weight_kg: 54,
        goal: 'bulk',
      }),
    ).toBeNull()
  })

  // --- Cutting (negative goal) cases --------------------------------------

  it('labels gaining during a cut as the wrong way, not "losing faster"', () => {
    const result = proposeRetarget({
      actual_rate_kg_week: 1.83,
      goal_rate_kg_week: -0.5,
      weeks_deviating: 2,
      current,
      weight_kg: 54,
      goal: 'cut',
    })
    expect(result).not.toBeNull()
    expect(result!.calorie_delta).toBe(-150)
    // The user is gaining weight, so the reason must not claim they are losing.
    expect(result!.reason).not.toMatch(/Losing/)
  })

  it('labels losing slower than a cut goal as stalled, not losing faster', () => {
    const result = proposeRetarget({
      actual_rate_kg_week: -0.2,
      goal_rate_kg_week: -0.5,
      weeks_deviating: 2,
      current,
      weight_kg: 54,
      goal: 'cut',
    })
    expect(result).not.toBeNull()
    expect(result!.calorie_delta).toBe(-150)
    expect(result!.reason).toMatch(/stall/i)
  })

  it('labels losing faster than a cut goal as losing faster and adds calories', () => {
    const result = proposeRetarget({
      actual_rate_kg_week: -1.0,
      goal_rate_kg_week: -0.5,
      weeks_deviating: 2,
      current,
      weight_kg: 54,
      goal: 'cut',
    })
    expect(result).not.toBeNull()
    expect(result!.calorie_delta).toBe(150)
    expect(result!.reason).toMatch(/Losing faster/i)
  })
})
