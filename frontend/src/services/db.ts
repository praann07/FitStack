import { createSeedDatabase } from '@/mock/seed'
import type { Database } from '@/mock/seed'

/**
 * Local persistence for the mock backend.
 *
 * The whole "database" lives in localStorage so a page refresh keeps the state
 * a user has built up while reviewing the app. Phase 2 deletes this file.
 */

const STORAGE_KEY = 'fitstack.db.v4'

let cache: Database | null = null

export function getDb(): Database {
  if (cache) return cache
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  if (raw) {
    try {
      cache = JSON.parse(raw) as Database
      return cache
    } catch {
      // Corrupt payload — fall through and reseed rather than crash the app.
    }
  }
  cache = createSeedDatabase()
  persist()
  return cache
}

function persist(): void {
  if (!cache || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // Quota exceeded — the in-memory copy still works for this session.
  }
}

/** Run a mutation against the store and persist the result. */
export function mutate<T>(fn: (db: Database) => T): T {
  const db = getDb()
  const result = fn(db)
  persist()
  return result
}

export function resetDb(): void {
  cache = createSeedDatabase()
  persist()
}

export type { Database }
