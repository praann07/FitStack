import {
  addDays,
  differenceInCalendarDays,
  format,
  isToday,
  isYesterday,
  parseISO,
  startOfWeek,
} from 'date-fns'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'

/** Canonical wire format for all dates: yyyy-MM-dd (matches DATE columns). */
export type IsoDate = string

export function toIsoDate(date: Date): IsoDate {
  return format(date, 'yyyy-MM-dd')
}

export function fromIsoDate(date: IsoDate): Date {
  return parseISO(date)
}

export function today(): IsoDate {
  return toIsoDate(new Date())
}

/**
 * Get today's date in a specific timezone.
 * Use this instead of today() when you have the user's timezone.
 * @param timezone IANA timezone string (e.g., 'America/New_York', 'Asia/Kolkata')
 */
export function getTodayInTimezone(timezone: string): IsoDate {
  const now = new Date()
  try {
    const zonedDate = fromZonedTime(now, timezone)
    return toIsoDate(zonedDate)
  } catch {
    // Fallback to browser timezone if IANA timezone is invalid
    return toIsoDate(now)
  }
}

/**
 * Convert a local date string (in user's timezone) to a midnight UTC Date.
 * Use this when logging data with a user-specific timezone.
 * @param isoDate Date in yyyy-MM-dd format (interpreted in user's timezone)
 * @param timezone IANA timezone string
 */
export function dateInTimezoneToUtc(isoDate: IsoDate, timezone: string): Date {
  try {
    const localDate = parseISO(isoDate)
    return toZonedTime(localDate, timezone)
  } catch {
    return fromIsoDate(isoDate)
  }
}

export function shiftDate(date: IsoDate, days: number): IsoDate {
  return toIsoDate(addDays(fromIsoDate(date), days))
}

/** Monday-based week start, matching the weekly volume aggregation. */
export function weekStart(date: IsoDate | Date): IsoDate {
  const d = typeof date === 'string' ? fromIsoDate(date) : date
  return toIsoDate(startOfWeek(d, { weekStartsOn: 1 }))
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return differenceInCalendarDays(fromIsoDate(to), fromIsoDate(from))
}

export function dateRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = []
  const total = daysBetween(from, to)
  for (let i = 0; i <= total; i++) out.push(shiftDate(from, i))
  return out
}

/** "Today" / "Yesterday" / "Mon 14 Apr" */
export function friendlyDate(date: IsoDate): string {
  const d = fromIsoDate(date)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'EEE d MMM')
}

export function longDate(date: IsoDate): string {
  return format(fromIsoDate(date), 'EEEE d MMMM yyyy')
}

export function shortDate(date: IsoDate): string {
  return format(fromIsoDate(date), 'd MMM')
}

export function timeOfDay(iso: string | null): string {
  if (!iso) return '—'
  return format(new Date(iso), 'HH:mm')
}

export function relativeDays(date: IsoDate): string {
  const diff = daysBetween(date, today())
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  if (diff < 7) return `${diff} days ago`
  if (diff < 14) return 'last week'
  if (diff < 60) return `${Math.round(diff / 7)} weeks ago`
  return `${Math.round(diff / 30)} months ago`
}

export function durationLabel(minutes: number | null): string {
  if (minutes === null || Number.isNaN(minutes)) return '—'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}
