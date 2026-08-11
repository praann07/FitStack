/**
 * Tiny validation kit. Rules are plain functions returning an error message or
 * null, composed per field. Keeps client-side validation co-located with the
 * form and mirrors what Pydantic will reject server-side in Phase 2.
 */

export type Rule<T = string> = (value: T) => string | null

export function required(label = 'This field'): Rule<string> {
  return (v) => (v.trim().length === 0 ? `${label} is required` : null)
}

export function email(): Rule<string> {
  return (v) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? null : 'Enter a valid email address'
}

export function minLength(n: number, label = 'This field'): Rule<string> {
  return (v) => (v.length < n ? `${label} must be at least ${n} characters` : null)
}

export function maxLength(n: number, label = 'This field'): Rule<string> {
  return (v) => (v.length > n ? `${label} must be under ${n} characters` : null)
}

export function isNumber(label = 'This field'): Rule<string> {
  return (v) => (v.trim() !== '' && Number.isNaN(Number(v)) ? `${label} must be a number` : null)
}

export function range(min: number, max: number, label = 'This field', unit = ''): Rule<string> {
  return (v) => {
    if (v.trim() === '') return null
    const n = Number(v)
    if (Number.isNaN(n)) return `${label} must be a number`
    if (n < min || n > max) return `${label} must be between ${min} and ${max}${unit ? ` ${unit}` : ''}`
    return null
  }
}

export function positive(label = 'This field'): Rule<string> {
  return (v) => {
    if (v.trim() === '') return null
    const n = Number(v)
    if (Number.isNaN(n)) return `${label} must be a number`
    return n <= 0 ? `${label} must be greater than 0` : null
  }
}

export function matches(other: () => string, message: string): Rule<string> {
  return (v) => (v === other() ? null : message)
}

export function compose(...rules: Rule<string>[]): Rule<string> {
  return (value) => {
    for (const rule of rules) {
      const error = rule(value)
      if (error) return error
    }
    return null
  }
}

/** Password strength used by the register screen's meter. */
export function passwordScore(value: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0
  if (value.length >= 8) score++
  if (value.length >= 12) score++
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++
  if (/\d/.test(value) || /[^A-Za-z0-9]/.test(value)) score++
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong']
  return { score: Math.min(score, 4) as 0 | 1 | 2 | 3 | 4, label: labels[Math.min(score, 4)] }
}
