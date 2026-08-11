import type { Goal, MuscleGroup, SetType, MealType, Confidence, Equipment } from '@/types'

export function kg(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${trim(value, digits)} kg`
}

export function cm(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${trim(value, digits)} cm`
}

export function kcal(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${Math.round(value).toLocaleString('en-GB')} kcal`
}

export function grams(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${trim(value, digits)} g`
}

export function num(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return trim(value, digits)
}

/** 12 480 kg -> "12.5t" so volume numbers stay readable in tight cards. */
export function volume(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  if (value >= 10000) return `${trim(value / 1000, 1)} t`
  return `${Math.round(value).toLocaleString('en-GB')} kg`
}

export function signed(value: number | null | undefined, digits = 1, unit = ''): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${trim(Math.abs(value), digits)}${unit ? ` ${unit}` : ''}`
}

export function percent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${trim(value, digits)}%`
}

function trim(value: number, digits: number): string {
  const fixed = value.toFixed(digits)
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export const GOAL_LABEL: Record<Goal, string> = {
  bulk: 'Bulk',
  cut: 'Cut',
  maintain: 'Maintain',
}

export const GOAL_DESCRIPTION: Record<Goal, string> = {
  bulk: 'Gain weight steadily while training hard',
  cut: 'Lose fat while keeping strength and muscle',
  maintain: 'Hold weight and keep progressing in the gym',
}

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  legs: 'Legs',
  shoulders: 'Shoulders',
  arms: 'Arms',
  core: 'Core',
}

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  bodyweight: 'Bodyweight',
}

export const SET_TYPE_LABEL: Record<SetType, string> = {
  warmup: 'Warm-up',
  normal: 'Working',
  drop: 'Drop set',
  failure: 'To failure',
}

export const SET_TYPE_SHORT: Record<SetType, string> = {
  warmup: 'W',
  normal: '',
  drop: 'D',
  failure: 'F',
}

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: 'Low confidence',
  medium: 'Medium confidence',
  high: 'High confidence',
}

/** Chart + badge colour per muscle group. Kept stable across the whole app. */
export const MUSCLE_COLOR: Record<MuscleGroup, string> = {
  chest: '#38bdf8',
  back: '#ccf656',
  legs: '#c084fc',
  shoulders: '#fbbf24',
  arms: '#fb7185',
  core: '#2dd4bf',
}

export const MACRO_COLOR = {
  protein: 'var(--color-protein)',
  carbs: 'var(--color-carbs)',
  fat: 'var(--color-fat)',
} as const
