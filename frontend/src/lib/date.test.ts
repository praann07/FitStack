import { describe, expect, it } from 'vitest'
import { dateRange, daysBetween, durationLabel, shiftDate, weekStart } from './date'

describe('shiftDate', () => {
  it('adds and subtracts days', () => {
    expect(shiftDate('2026-01-10', 1)).toBe('2026-01-11')
    expect(shiftDate('2026-01-10', -1)).toBe('2026-01-09')
  })

  it('crosses month and year boundaries', () => {
    expect(shiftDate('2026-01-31', 1)).toBe('2026-02-01')
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('weekStart', () => {
  it('is Monday-based', () => {
    // Sunday 2026-01-11 -> Monday 2026-01-05
    expect(weekStart('2026-01-11')).toBe('2026-01-05')
    // Monday stays itself
    expect(weekStart('2026-01-05')).toBe('2026-01-05')
  })
})

describe('daysBetween', () => {
  it('is the calendar-day difference between two dates', () => {
    expect(daysBetween('2026-01-01', '2026-01-10')).toBe(9)
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31)
  })
})

describe('dateRange', () => {
  it('returns an inclusive range', () => {
    expect(dateRange('2026-01-29', '2026-02-02')).toEqual([
      '2026-01-29',
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ])
  })

  it('returns a single element for a same-day range', () => {
    expect(dateRange('2026-05-01', '2026-05-01')).toEqual(['2026-05-01'])
  })
})

describe('durationLabel', () => {
  it('formats hours and zero-padded minutes', () => {
    expect(durationLabel(65)).toBe('1h 05m')
    expect(durationLabel(125)).toBe('2h 05m')
  })

  it('shows minutes only under an hour', () => {
    expect(durationLabel(42)).toBe('42m')
    expect(durationLabel(0)).toBe('0m')
  })

  it('handles null and NaN as an em dash', () => {
    expect(durationLabel(null)).toBe('—')
    expect(durationLabel(Number.NaN)).toBe('—')
  })
})
