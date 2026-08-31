import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { dedupe as DedupeFn } from './queries'

let dedupe: typeof DedupeFn
let invalidateBulkCache: (typeof import('./queries'))['invalidateBulkCache']
let fetchSessions: (typeof import('./queries'))['fetchSessions']
let fetchBodyMetrics: (typeof import('./queries'))['fetchBodyMetrics']

// `bulkCache` is a module-level singleton, so each test must get a fresh module
// instance to avoid cache state leaking between cases.
async function freshModule() {
  vi.resetModules()
  const mod = await import('./queries')
  dedupe = mod.dedupe
  invalidateBulkCache = mod.invalidateBulkCache
  fetchSessions = mod.fetchSessions
  fetchBodyMetrics = mod.fetchBodyMetrics
}

describe('dedupe', () => {
  beforeEach(async () => {
    await freshModule()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('deduplicates concurrent calls with the same key into a single loader invocation', async () => {
    const loader = vi.fn(async () => 'value')
    const a = dedupe('k', loader)
    const b = dedupe('k', loader)
    await vi.runAllTimersAsync()
    expect(loader).toHaveBeenCalledTimes(1)
    await expect(a).resolves.toBe('value')
    await expect(b).resolves.toBe('value')
  })

  it('returns the cached value for a later call within the TTL window', async () => {
    const loader = vi.fn(async () => 'value')
    await dedupe('k', loader)
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z')) // 1s later, still cached
    await dedupe('k', loader)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('refetches once the TTL window has elapsed', async () => {
    const loader = vi.fn(async () => 'value')
    await dedupe('k', loader)
    vi.setSystemTime(new Date('2026-01-01T00:00:04.000Z')) // 4s later, past 3s TTL
    await dedupe('k', loader)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('keeps different keys independent', async () => {
    const loader = vi.fn(async (id: string) => id)
    const a = dedupe('a', async () => loader('a'))
    const b = dedupe('b', async () => loader('b'))
    await vi.runAllTimersAsync()
    expect(loader).toHaveBeenCalledTimes(2)
    await expect(a).resolves.toBe('a')
    await expect(b).resolves.toBe('b')
  })

  it('serves stale data on a write path if the write is not invalidated', async () => {
    // Proves the pre-fix hazard: a bulk read cached at T0 is returned verbatim
    // for calls within the TTL, even after the underlying rows changed.
    let rows = [{ id: 's1', is_pr: false }]
    const loader = vi.fn(async () => rows)
    await dedupe('sets', loader)
    // "Write" happens: the set now exists in the DB, but the cache is untouched.
    rows = [{ id: 's1', is_pr: false }, { id: 's2', is_pr: false }]
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z')) // 1s later, still cached
    const stale = await dedupe('sets', loader)
    expect(stale).toHaveLength(1) // stale -- 's2' is invisible to the recompute
  })

  it('refetches after invalidateBulkCache even within the TTL window', async () => {
    let rows = [{ id: 's1', is_pr: false }]
    const loader = vi.fn(async () => rows)
    await dedupe('sets', loader)
    rows = [{ id: 's1', is_pr: false }, { id: 's2', is_pr: false }]
    invalidateBulkCache()
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z')) // still would-be cached
    const fresh = await dedupe('sets', loader)
    expect(loader).toHaveBeenCalledTimes(2)
    expect(fresh).toHaveLength(2) // sees the newly-written set
  })
})

// Verifies the cache keys each wrapper derives from its arguments, so two
// different fetch scopes never share a cached result (and identical scopes do).
vi.mock('@/lib/supabase', () => {
  // Counts how many times a query actually reaches .select() — i.e. how many
  // times dedupe let a loader run, which is a proxy for distinct cache keys.
  const selectCount = { value: 0 }
  const builder = {
    select: () => {
      selectCount.value++
      return builder
    },
    order: () => builder,
    not: () => builder,
    gte: () => builder,
    lte: () => builder,
    then: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(onFulfilled),
  }
  return {
    supabase: {
      from: () => builder,
      selectCount,
    },
  }
})

describe('dedupe key composition', () => {
  let supabase: { selectCount: { value: number } }

  beforeEach(async () => {
    await freshModule()
    // The module mock replaces supabase with `{ from, selectCount }`; cast past
    // the real SupabaseClient type so the counter is reachable in assertions.
    supabase = (await import('@/lib/supabase')).supabase as unknown as {
      selectCount: { value: number }
    }
    // Fresh module => fresh mock counter.
    supabase.selectCount.value = 0
  })

  it('namespaces session keys by the finished flag', async () => {
    await fetchSessions({ onlyFinished: true })
    await fetchSessions({ onlyFinished: true })
    expect(supabase.selectCount.value).toBe(1)

    // A different scope must not hit the same cache entry.
    await fetchSessions({ onlyFinished: false })
    expect(supabase.selectCount.value).toBe(2)
  })

  it('namespaces body-metric keys by both filter bounds', async () => {
    await fetchBodyMetrics({ from: '2026-01-01', to: '2026-01-31' })
    await fetchBodyMetrics({ from: '2026-01-01', to: '2026-01-31' })
    expect(supabase.selectCount.value).toBe(1)

    // Widening the range must fetch fresh, not reuse the narrower scope.
    await fetchBodyMetrics({ from: '2026-01-01' })
    expect(supabase.selectCount.value).toBe(2)
  })
})
