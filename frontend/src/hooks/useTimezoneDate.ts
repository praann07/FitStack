import { useAuthStore } from '@/stores/authStore'
import { getTodayInTimezone, getTodayInTimezone as getTodayInTz, dateInTimezoneToUtc } from '@/lib/date'
import type { IsoDate } from '@/lib/date'

/**
 * Provides timezone-aware date functions based on the current user's timezone.
 * Use this instead of calling `today()` directly when the user's timezone matters
 * (e.g., streak calculations, TDEE correlation).
 *
 * Falls back to browser timezone if user is not authenticated.
 */
export function useTimezoneDate() {
  const user = useAuthStore((s) => s.user)
  const timezone = user?.timezone ?? 'UTC'

  return {
    /** Get today's date in the user's timezone. */
    today: (): IsoDate => getTodayInTz(timezone),

    /** Convert a local date string (in user's timezone) to UTC. */
    toUtc: (isoDate: IsoDate): Date => dateInTimezoneToUtc(isoDate, timezone),

    /** The user's IANA timezone string. */
    timezone,
  }
}
