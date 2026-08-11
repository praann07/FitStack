import { SYSTEM_EXERCISES } from './exercises'
import { SYSTEM_FOODS } from './foods'
import { ema, estimateTdee, macrosFromCalories } from '@/lib/adaptive'
import { estimated1RM, isQualifying } from '@/lib/strength'
import { dateRange, shiftDate, today, toIsoDate, fromIsoDate } from '@/lib/date'
import type {
  BodyMetric,
  Exercise,
  Food,
  FoodLog,
  MealType,
  NutritionTarget,
  Routine,
  RoutineExercise,
  TdeeEstimate,
  User,
  WorkoutSession,
  WorkoutSet,
} from '@/types'

/**
 * Mock database seed.
 *
 * Produces a coherent 16-week history for the demo account: a 4-day
 * upper/lower program with realistic progression (and one stalled lift),
 * daily bodyweight with real noise, and food logs whose calories actually
 * explain the weight trend — so the adaptive TDEE engine lands on a sensible
 * number instead of a made-up one.
 *
 * Everything is generated relative to the current date, so the demo is never
 * stale. Phase 2 replaces this entire module with API responses.
 */

export interface Database {
  users: User[]
  /** Mock-only: plaintext credentials for the local demo. Never shipped. */
  credentials: Record<string, string>
  exercises: Exercise[]
  routines: Routine[]
  routineExercises: RoutineExercise[]
  sessions: WorkoutSession[]
  sets: WorkoutSet[]
  foods: Food[]
  foodLogs: FoodLog[]
  nutritionTargets: NutritionTarget[]
  tdeeEstimates: TdeeEstimate[]
  bodyMetrics: BodyMetric[]
  dismissedSuggestions: string[]
}

export const DEMO_EMAIL = 'demo@fitstack.app'
export const DEMO_PASSWORD = 'fitstack123'

const HISTORY_DAYS = 112 // 16 weeks
const NUTRITION_DAYS = 74

let counter = 0
const id = (prefix: string) => `${prefix}-${(++counter).toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`

/** Deterministic PRNG so the seeded history is stable within a build. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20240711)
const jitter = (spread: number) => (rand() - 0.5) * 2 * spread
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
const roundTo = (value: number, step: number) => Math.round(value / step) * step

// ---------------------------------------------------------------------------
// Program definition
// ---------------------------------------------------------------------------

interface ProgressionSpec {
  /** Working weight at the start of the history window. */
  start: number
  /** Weekly increment in kg. */
  inc: number
  /** Weight rounding increment. */
  step: number
  /** Reps on the top set. */
  reps: number
  /** Week index after which progression stalls (drives plateau detection). */
  stallsAfterWeek?: number
}

const PROGRESSION: Record<string, ProgressionSpec> = {
  'ex-bench-press': { start: 92.5, inc: 0.8, step: 2.5, reps: 6, stallsAfterWeek: 10 },
  'ex-barbell-row': { start: 80, inc: 0.7, step: 2.5, reps: 8 },
  'ex-incline-db-press': { start: 30, inc: 0.35, step: 2, reps: 10 },
  'ex-lat-pulldown': { start: 65, inc: 0.7, step: 2.5, reps: 11 },
  'ex-lateral-raise': { start: 12, inc: 0.15, step: 2, reps: 14 },
  'ex-tricep-pushdown': { start: 32.5, inc: 0.4, step: 2.5, reps: 12 },
  'ex-incline-db-curl': { start: 14, inc: 0.18, step: 2, reps: 11 },

  'ex-back-squat': { start: 120, inc: 1.1, step: 2.5, reps: 5 },
  'ex-rdl': { start: 100, inc: 0.9, step: 2.5, reps: 9 },
  'ex-leg-press': { start: 200, inc: 2.4, step: 5, reps: 11 },
  'ex-leg-curl': { start: 45, inc: 0.5, step: 2.5, reps: 12 },
  'ex-calf-raise': { start: 80, inc: 0.7, step: 2.5, reps: 13 },
  'ex-hanging-leg-raise': { start: 5, inc: 0.12, step: 2.5, reps: 12 },

  'ex-ohp': { start: 57.5, inc: 0.45, step: 2.5, reps: 6 },
  'ex-pull-up': { start: 84, inc: 0.55, step: 2.5, reps: 8 },
  'ex-db-bench': { start: 34, inc: 0.3, step: 2, reps: 10 },
  'ex-seated-row': { start: 70, inc: 0.75, step: 2.5, reps: 11 },
  'ex-face-pull': { start: 27.5, inc: 0.3, step: 2.5, reps: 17 },
  'ex-barbell-curl': { start: 40, inc: 0.35, step: 2.5, reps: 9 },
  'ex-skullcrusher': { start: 35, inc: 0.35, step: 2.5, reps: 11 },

  'ex-deadlift': { start: 150, inc: 1.3, step: 2.5, reps: 4 },
  'ex-front-squat': { start: 90, inc: 0.8, step: 2.5, reps: 7 },
  'ex-bulgarian-split': { start: 24, inc: 0.25, step: 2, reps: 10 },
  'ex-leg-extension': { start: 55, inc: 0.6, step: 2.5, reps: 13 },
  'ex-cable-crunch': { start: 45, inc: 0.5, step: 2.5, reps: 13 },
}

const COMPOUNDS = new Set([
  'ex-bench-press',
  'ex-back-squat',
  'ex-deadlift',
  'ex-ohp',
  'ex-barbell-row',
  'ex-front-squat',
])

interface RoutineSpec {
  name: string
  notes: string
  /** ISO weekday (1 = Monday). */
  weekday: number
  exercises: {
    exerciseId: string
    sets: number
    repRange: string
    rpe: number | null
    rest: number
    notes?: string
  }[]
}

const PROGRAM: RoutineSpec[] = [
  {
    name: 'Upper A — Horizontal',
    notes: 'Bench and row focus. Push the top set, back off 5% for the rest.',
    weekday: 1,
    exercises: [
      { exerciseId: 'ex-bench-press', sets: 4, repRange: '5-8', rpe: 8, rest: 180, notes: 'Pause 1s on the chest for the first two sets.' },
      { exerciseId: 'ex-barbell-row', sets: 4, repRange: '6-10', rpe: 8, rest: 150 },
      { exerciseId: 'ex-incline-db-press', sets: 3, repRange: '8-12', rpe: 9, rest: 120 },
      { exerciseId: 'ex-lat-pulldown', sets: 3, repRange: '10-12', rpe: 9, rest: 90 },
      { exerciseId: 'ex-lateral-raise', sets: 3, repRange: '12-15', rpe: 9, rest: 60, notes: 'Slow eccentric, no swinging.' },
      { exerciseId: 'ex-tricep-pushdown', sets: 3, repRange: '10-15', rpe: 9, rest: 60 },
      { exerciseId: 'ex-incline-db-curl', sets: 3, repRange: '10-12', rpe: 9, rest: 60 },
    ],
  },
  {
    name: 'Lower A — Squat',
    notes: 'Heavy squat day. Keep RDLs controlled, leave one in the tank.',
    weekday: 2,
    exercises: [
      { exerciseId: 'ex-back-squat', sets: 4, repRange: '4-6', rpe: 8, rest: 210, notes: 'Belt from set 2 onward.' },
      { exerciseId: 'ex-rdl', sets: 3, repRange: '8-10', rpe: 8, rest: 150 },
      { exerciseId: 'ex-leg-press', sets: 3, repRange: '10-12', rpe: 9, rest: 120 },
      { exerciseId: 'ex-leg-curl', sets: 3, repRange: '10-15', rpe: 9, rest: 90 },
      { exerciseId: 'ex-calf-raise', sets: 4, repRange: '10-15', rpe: 9, rest: 60 },
      { exerciseId: 'ex-hanging-leg-raise', sets: 3, repRange: '10-15', rpe: 8, rest: 60 },
    ],
  },
  {
    name: 'Upper B — Vertical',
    notes: 'Overhead press and pull-ups first while fresh.',
    weekday: 4,
    exercises: [
      { exerciseId: 'ex-ohp', sets: 4, repRange: '5-8', rpe: 8, rest: 180 },
      { exerciseId: 'ex-pull-up', sets: 4, repRange: '6-10', rpe: 9, rest: 150, notes: 'Add weight once you hit 10 clean reps.' },
      { exerciseId: 'ex-db-bench', sets: 3, repRange: '8-12', rpe: 9, rest: 120 },
      { exerciseId: 'ex-seated-row', sets: 3, repRange: '10-12', rpe: 9, rest: 90 },
      { exerciseId: 'ex-face-pull', sets: 3, repRange: '15-20', rpe: 8, rest: 60 },
      { exerciseId: 'ex-barbell-curl', sets: 3, repRange: '8-12', rpe: 9, rest: 60 },
      { exerciseId: 'ex-skullcrusher', sets: 3, repRange: '10-12', rpe: 9, rest: 60 },
    ],
  },
  {
    name: 'Lower B — Deadlift',
    notes: 'Pull heavy, then quality accessory work. Stop if bar speed dies.',
    weekday: 5,
    exercises: [
      { exerciseId: 'ex-deadlift', sets: 3, repRange: '3-5', rpe: 8, rest: 240, notes: 'Reset every rep. No touch-and-go.' },
      { exerciseId: 'ex-front-squat', sets: 3, repRange: '6-8', rpe: 8, rest: 180 },
      { exerciseId: 'ex-bulgarian-split', sets: 3, repRange: '8-12', rpe: 9, rest: 90 },
      { exerciseId: 'ex-leg-extension', sets: 3, repRange: '12-15', rpe: 9, rest: 60 },
      { exerciseId: 'ex-cable-crunch', sets: 3, repRange: '12-15', rpe: 9, rest: 60 },
    ],
  },
]

// ---------------------------------------------------------------------------
// Nutrition templates
// ---------------------------------------------------------------------------

type MealTemplate = { meal: MealType; items: [string, number][] }

const BREAKFASTS: MealTemplate[][] = [
  [{ meal: 'breakfast', items: [['fd-oats', 80], ['fd-whey', 30], ['fd-banana', 118], ['fd-peanut-butter', 16], ['fd-milk-semi', 250]] }],
  [{ meal: 'breakfast', items: [['fd-eggs', 174], ['fd-sourdough', 110], ['fd-avocado', 60]] }],
  [{ meal: 'breakfast', items: [['fd-greek-yogurt', 340], ['fd-blueberries', 80], ['fd-honey', 21], ['fd-almonds', 30]] }],
  [{ meal: 'breakfast', items: [['fd-egg-white', 200], ['fd-eggs', 58], ['fd-bagel', 85], ['fd-cheddar', 25]] }],
]

const LUNCHES: MealTemplate[][] = [
  [{ meal: 'lunch', items: [['fd-chicken-breast', 180], ['fd-basmati-rice', 250], ['fd-broccoli', 150], ['fd-olive-oil', 10]] }],
  [{ meal: 'lunch', items: [['fd-turkey-mince', 200], ['fd-pasta', 250], ['fd-ketchup', 30], ['fd-cheddar', 20]] }],
  [{ meal: 'lunch', items: [['fd-salmon', 130], ['fd-potato', 250], ['fd-mixed-veg', 200]] }],
  [{ meal: 'lunch', items: [['fd-tuna-tin', 112], ['fd-wholemeal-bread', 88], ['fd-avocado', 70], ['fd-apple', 180]] }],
]

const DINNERS: MealTemplate[][] = [
  [{ meal: 'dinner', items: [['fd-lean-beef-mince', 200], ['fd-white-rice', 250], ['fd-mixed-veg', 150]] }],
  [{ meal: 'dinner', items: [['fd-chicken-thigh', 200], ['fd-sweet-potato', 250], ['fd-spinach', 60], ['fd-olive-oil', 10]] }],
  [{ meal: 'dinner', items: [['fd-cod', 180], ['fd-jasmine-rice', 220], ['fd-broccoli', 150]] }],
  [{ meal: 'dinner', items: [['fd-prawns', 150], ['fd-pasta', 220], ['fd-olive-oil', 12], ['fd-spinach', 50]] }],
]

/** Used to close the gap between a meal plan and the day's calorie goal. */
const TOP_UPS: [foodId: string, meal: MealType][] = [
  ['fd-white-rice', 'dinner'],
  ['fd-basmati-rice', 'lunch'],
  ['fd-oats', 'breakfast'],
  ['fd-whey', 'snack'],
  ['fd-peanut-butter', 'snack'],
  ['fd-sourdough', 'breakfast'],
]

const SNACKS: MealTemplate[][] = [
  [{ meal: 'snack', items: [['fd-whey', 30], ['fd-rice-cakes', 24], ['fd-peanut-butter', 20]] }],
  [{ meal: 'snack', items: [['fd-protein-bar', 60], ['fd-apple', 180]] }],
  [{ meal: 'snack', items: [['fd-cottage-cheese', 200], ['fd-dark-chocolate', 20]] }],
  [{ meal: 'snack', items: [['fd-casein', 30], ['fd-almonds', 30]] }],
]

// ---------------------------------------------------------------------------
// Seed builder
// ---------------------------------------------------------------------------

export function createSeedDatabase(): Database {
  counter = 0
  const end = today()
  const start = shiftDate(end, -HISTORY_DAYS)
  const days = dateRange(start, end)

  const user: User = {
    id: 'usr-demo',
    email: DEMO_EMAIL,
    full_name: 'Daniel Okafor',
    goal: 'bulk',
    goal_rate_kg_week: 0.25,
    height_cm: 180,
    created_at: `${shiftDate(end, -HISTORY_DAYS - 9)}T09:12:00.000Z`,
  }

  const customExercise: Exercise = {
    id: 'ex-custom-meadows',
    name: 'Meadows Row',
    muscle_group: 'back',
    equipment: 'barbell',
    is_custom: true,
    created_by: user.id,
  }

  const customFood: Food = {
    id: 'fd-custom-overnight-oats',
    name: 'Overnight Oats (my recipe)',
    brand: null,
    calories_per_100g: 172,
    protein_per_100g: 11.4,
    carbs_per_100g: 21.6,
    fat_per_100g: 4.8,
    serving_label: 'Jar (400 g)',
    serving_g: 400,
    is_custom: true,
    created_by: user.id,
  }

  const exercises = [...SYSTEM_EXERCISES, customExercise]
  const foods = [...SYSTEM_FOODS, customFood]
  const foodById = new Map(foods.map((f) => [f.id, f]))

  // --- Routines -------------------------------------------------------------
  const routines: Routine[] = []
  const routineExercises: RoutineExercise[] = []
  const routineIdByWeekday = new Map<number, string>()

  PROGRAM.forEach((spec, index) => {
    const routineId = `rt-${index + 1}`
    routines.push({
      id: routineId,
      user_id: user.id,
      name: spec.name,
      notes: spec.notes,
      created_at: `${shiftDate(end, -HISTORY_DAYS - 2)}T18:40:00.000Z`,
      updated_at: `${shiftDate(end, -(21 - index * 3))}T20:05:00.000Z`,
    })
    routineIdByWeekday.set(spec.weekday, routineId)
    spec.exercises.forEach((ex, order) => {
      routineExercises.push({
        id: id('rex'),
        routine_id: routineId,
        exercise_id: ex.exerciseId,
        order_index: order,
        target_sets: ex.sets,
        target_rep_range: ex.repRange,
        target_rpe: ex.rpe,
        rest_seconds: ex.rest,
        notes: ex.notes ?? null,
      })
    })
  })

  // --- Body metrics ---------------------------------------------------------
  // Trend: +0.23 kg/week for the first 12 weeks, +0.45 kg/week for the last 4
  // (the deviation the adaptive engine is supposed to catch).
  const START_WEIGHT = 83.4
  const bodyMetrics: BodyMetric[] = []
  const weightByDate = new Map<string, number>()

  days.forEach((date, i) => {
    const earlyDays = Math.min(i, HISTORY_DAYS - 28)
    const lateDays = Math.max(0, i - (HISTORY_DAYS - 28))
    const base = START_WEIGHT + earlyDays * (0.23 / 7) + lateDays * (0.45 / 7)
    const weekday = fromIsoDate(date).getDay()
    const weekendBump = weekday === 0 || weekday === 6 ? 0.35 : 0
    const raw = base + weekendBump + jitter(0.42)

    // Real logs have gaps: a missed weigh-in here and there plus a short break.
    const inGap = i >= HISTORY_DAYS - 47 && i <= HISTORY_DAYS - 44
    if (inGap || (rand() < 0.12 && i < HISTORY_DAYS)) return

    const weight = Number(raw.toFixed(1))
    weightByDate.set(date, weight)

    const weekIndex = Math.floor(i / 7)
    const isMeasureDay = weekday === 0 // Sunday tape day
    bodyMetrics.push({
      id: id('bm'),
      user_id: user.id,
      log_date: date,
      weight_kg: weight,
      waist_cm: isMeasureDay ? Number((81 + weekIndex * 0.11 + jitter(0.15)).toFixed(1)) : null,
      chest_cm: isMeasureDay ? Number((104.2 + weekIndex * 0.19 + jitter(0.2)).toFixed(1)) : null,
      arm_cm: isMeasureDay ? Number((38.4 + weekIndex * 0.085 + jitter(0.1)).toFixed(1)) : null,
      photo_url: null,
    })
  })

  // --- Workout sessions -----------------------------------------------------
  const sessions: WorkoutSession[] = []
  const sets: WorkoutSet[] = []
  const routineExercisesByRoutine = new Map<string, RoutineExercise[]>()
  for (const rex of routineExercises) {
    const list = routineExercisesByRoutine.get(rex.routine_id) ?? []
    list.push(rex)
    routineExercisesByRoutine.set(rex.routine_id, list)
  }

  days.forEach((date, i) => {
    const weekday = fromIsoDate(date).getDay()
    const routineId = routineIdByWeekday.get(weekday)
    if (!routineId) return

    const weekIndex = Math.floor(i / 7)
    // A missed week (illness) plus the occasional skipped session.
    if (weekIndex === 6) return
    if (rand() < 0.07) return

    const sessionId = id('ws')
    const startHour = 17 + Math.floor(rand() * 2)
    const startMinute = Math.floor(rand() * 50)
    const durationMin = 58 + Math.floor(rand() * 30)
    const startedAt = `${date}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00.000Z`
    const endedAt = new Date(
      new Date(startedAt).getTime() + durationMin * 60_000,
    ).toISOString()

    sessions.push({
      id: sessionId,
      user_id: user.id,
      routine_id: routineId,
      session_date: date,
      notes: rand() < 0.18 ? pick(SESSION_NOTES) : null,
      started_at: startedAt,
      ended_at: endedAt,
    })

    const rexList = routineExercisesByRoutine.get(routineId) ?? []
    for (const rex of rexList) {
      const spec = PROGRESSION[rex.exercise_id]
      if (!spec) continue

      const stalled = spec.stallsAfterWeek !== undefined && weekIndex > spec.stallsAfterWeek
      const effectiveWeek = stalled ? spec.stallsAfterWeek! : weekIndex

      // Double progression: reps climb inside a block, then the weight steps up
      // and reps reset. Deterministic on purpose — random jitter would create
      // lucky one-off bests that make plateau detection meaningless.
      const blockWeeks = Math.max(1, Math.round(spec.step / spec.inc))
      const block = Math.floor(effectiveWeek / blockWeeks)
      const weekInBlock = effectiveWeek % blockWeeks
      const working = roundTo(spec.start + block * spec.step, spec.step)
      // A stalled lift keeps grinding the same weight for slightly fewer reps,
      // so nothing beats the best it hit before the stall.
      const topReps = stalled
        ? spec.reps - 1
        : spec.reps + Math.min(weekInBlock, Math.max(0, blockWeeks - 1), 2)
      let setNumber = 1

      if (COMPOUNDS.has(rex.exercise_id)) {
        for (const [ratio, reps] of [
          [0.5, 8],
          [0.75, 5],
        ] as const) {
          sets.push({
            id: id('set'),
            session_id: sessionId,
            exercise_id: rex.exercise_id,
            set_number: setNumber++,
            weight_kg: roundTo(working * ratio, spec.step),
            reps,
            rpe: null,
            set_type: 'warmup',
            notes: null,
            is_pr: false,
          })
        }
      }

      for (let s = 0; s < rex.target_sets; s++) {
        // Reps drop across sets as fatigue accumulates; the first set is the top set.
        const reps = Math.max(3, topReps - Math.round(s * 0.8))
        const weight = s === 0 ? working : roundTo(working * (1 - 0.03 * s), spec.step)
        const rpe = Math.min(10, Number(((rex.target_rpe ?? 8) + s * 0.35 + jitter(0.3)).toFixed(1)))
        const lastSet = s === rex.target_sets - 1
        sets.push({
          id: id('set'),
          session_id: sessionId,
          exercise_id: rex.exercise_id,
          set_number: setNumber++,
          weight_kg: Number(weight.toFixed(2)),
          reps,
          rpe,
          set_type: lastSet && rand() < 0.12 ? 'failure' : 'normal',
          notes: rand() < 0.05 ? pick(SET_NOTES) : null,
          is_pr: false,
        })
      }
    }
  })

  markPersonalRecords(sets, sessions)

  // --- Nutrition ------------------------------------------------------------
  const foodLogs: FoodLog[] = []
  const caloriesByDate = new Map<string, number>()
  const nutritionStart = shiftDate(end, -NUTRITION_DAYS)

  for (const date of dateRange(nutritionStart, end)) {
    const isRecent = dateDiff(date, end) <= 27
    const goalCalories = (isRecent ? 3390 : 3150) + jitter(140)

    // Two untracked days — the TDEE window must skip, never zero, these.
    if (rand() < 0.05 && date !== end) continue

    const templates = [pick(BREAKFASTS), pick(LUNCHES), pick(DINNERS), pick(SNACKS)]
    // Today is only partially logged — the app should show a live, in-progress day.
    const active = date === end ? templates.slice(0, 2) : templates

    const flat = active.flat()
    const rawTotal = flat.reduce((sum, meal) => {
      return (
        sum +
        meal.items.reduce((s, [foodId, qty]) => {
          const food = foodById.get(foodId)
          return food ? s + (food.calories_per_100g * qty) / 100 : s
        }, 0)
      )
    }, 0)

    // Portions flex within believable bounds; whatever gap is left is closed
    // with a top-up food, the way a lifter actually hits their number.
    const scale = date === end ? 1 : Math.min(1.3, Math.max(0.78, goalCalories / rawTotal))
    let dayCalories = 0

    for (const meal of flat) {
      for (const [foodId, qty] of meal.items) {
        const food = foodById.get(foodId)
        if (!food) continue
        const quantity = Math.max(5, roundTo(qty * scale, 5))
        dayCalories += (food.calories_per_100g * quantity) / 100
        foodLogs.push({
          id: id('fl'),
          user_id: user.id,
          food_id: foodId,
          log_date: date,
          quantity_g: quantity,
          meal_type: meal.meal,
        })
      }
    }

    if (date !== end) {
      const shortfall = goalCalories - dayCalories
      if (Math.abs(shortfall) > 120) {
        const [fillerId, fillerMeal] = pick(TOP_UPS)
        const filler = foodById.get(fillerId)
        if (filler && filler.calories_per_100g > 0) {
          const grams = roundTo((shortfall / filler.calories_per_100g) * 100, 5)
          if (grams >= 10) {
            dayCalories += (filler.calories_per_100g * grams) / 100
            foodLogs.push({
              id: id('fl'),
              user_id: user.id,
              food_id: fillerId,
              log_date: date,
              quantity_g: grams,
              meal_type: fillerMeal,
            })
          }
        }
      }
    }

    caloriesByDate.set(date, Math.round(dayCalories))
  }

  // --- Targets --------------------------------------------------------------
  const nutritionTargets: NutritionTarget[] = [
    buildTarget(user.id, shiftDate(end, -HISTORY_DAYS), 3050, 83.5),
    buildTarget(user.id, shiftDate(end, -56), 3120, 85.4),
    buildTarget(user.id, shiftDate(end, -21), 3170, 86.8),
  ]

  // --- TDEE estimates (weekly recompute over a 21-day window) ---------------
  const tdeeEstimates: TdeeEstimate[] = []
  for (let weeksAgo = 9; weeksAgo >= 0; weeksAgo--) {
    const estimateDate = shiftDate(end, -weeksAgo * 7)
    // Window ends the day before: the current day is still being logged and
    // would drag the average intake down.
    const windowDates = dateRange(shiftDate(estimateDate, -21), shiftDate(estimateDate, -1))
    const rawWeights = windowDates.map((d) => weightByDate.get(d) ?? null)
    const smoothed = ema(rawWeights)
    const calories = windowDates.map((d) => caloriesByDate.get(d) ?? null)
    const result = estimateTdee({ trendWeights: smoothed, calories })
    if (!result) continue
    tdeeEstimates.push({
      id: id('tdee'),
      user_id: user.id,
      estimate_date: estimateDate,
      estimated_tdee: result.estimated_tdee,
      weight_trend_kg: result.weight_trend_kg,
      confidence: result.confidence,
    })
  }

  return {
    users: [user],
    credentials: { [DEMO_EMAIL]: DEMO_PASSWORD },
    exercises,
    routines,
    routineExercises,
    sessions,
    sets,
    foods,
    foodLogs,
    nutritionTargets,
    tdeeEstimates,
    bodyMetrics,
    dismissedSuggestions: [],
  }
}

const SESSION_NOTES = [
  'Felt strong today, sleep was on point.',
  'Low energy — cut the last accessory short.',
  'Gym was packed, had to switch the leg press order.',
  'Elbow slightly cranky on pressing, kept reps controlled.',
]

const SET_NOTES = [
  'Grinder, bar slowed badly',
  'Clean, could have had 2 more',
  'Slight form breakdown on the last rep',
  'Straps used',
]

function buildTarget(
  userId: string,
  effectiveDate: string,
  calories: number,
  weightKg: number,
): NutritionTarget {
  const macros = macrosFromCalories(calories, weightKg, 'bulk')
  return {
    id: id('nt'),
    user_id: userId,
    effective_date: effectiveDate,
    calories: macros.calories,
    protein_g: macros.protein_g,
    carbs_g: macros.carbs_g,
    fat_g: macros.fat_g,
    source: 'adaptive',
  }
}

function dateDiff(from: string, to: string): number {
  return Math.round(
    (fromIsoDate(to).getTime() - fromIsoDate(from).getTime()) / (1000 * 60 * 60 * 24),
  )
}

/**
 * Chronological PR pass — identical to what the backend does on set insert:
 * only qualifying sets count, and estimated 1RM (Epley) is the comparator.
 */
export function markPersonalRecords(sets: WorkoutSet[], sessions: WorkoutSession[]): void {
  const dateBySession = new Map(sessions.map((s) => [s.id, s.session_date]))
  const ordered = [...sets].sort((a, b) => {
    const da = dateBySession.get(a.session_id) ?? ''
    const db = dateBySession.get(b.session_id) ?? ''
    if (da !== db) return da.localeCompare(db)
    return a.set_number - b.set_number
  })

  const best = new Map<string, { e1rm: number; weight: number }>()
  for (const set of ordered) {
    if (!isQualifying(set) || !set.weight_kg || !set.reps) {
      set.is_pr = false
      continue
    }
    const current = best.get(set.exercise_id) ?? { e1rm: 0, weight: 0 }
    const e1rm = estimated1RM(set.weight_kg, set.reps)
    const isPr = e1rm > current.e1rm + 0.01 || set.weight_kg > current.weight + 0.01
    set.is_pr = isPr
    if (isPr) {
      best.set(set.exercise_id, {
        e1rm: Math.max(current.e1rm, e1rm),
        weight: Math.max(current.weight, set.weight_kg),
      })
    }
  }
}

/** A brand-new account: no history, just the starting weigh-in and a baseline target. */
export function createNewUserData(
  user: User,
  startingWeightKg: number,
  baselineTdee: number,
): { bodyMetric: BodyMetric; target: NutritionTarget } {
  const date = today()
  const targetCalories =
    Math.round((baselineTdee + (user.goal_rate_kg_week * 7700) / 7) / 10) * 10
  const macros = macrosFromCalories(targetCalories, startingWeightKg, user.goal)
  return {
    bodyMetric: {
      id: id('bm'),
      user_id: user.id,
      log_date: date,
      weight_kg: startingWeightKg,
      waist_cm: null,
      chest_cm: null,
      arm_cm: null,
      photo_url: null,
    },
    target: {
      id: id('nt'),
      user_id: user.id,
      effective_date: date,
      calories: macros.calories,
      protein_g: macros.protein_g,
      carbs_g: macros.carbs_g,
      fat_g: macros.fat_g,
      // System-generated baseline, not a user override — the adaptive engine
      // is free to replace it once there is enough data.
      source: 'adaptive',
    },
  }
}

export { id as generateId, toIsoDate }
