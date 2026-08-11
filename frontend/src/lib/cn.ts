import clsx from 'clsx'
import type { ClassValue } from 'clsx'

/** Conditional className helper used by every component. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}
