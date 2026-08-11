import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/types'

/** Extract a human message from anything a service can throw. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * Loads data from a service on mount (and whenever `deps` change) with
 * loading / error states. `reload` re-runs the loader without changing deps.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fnRef.current().then(
      (result) => {
        if (cancelled) return
        setData(result)
        setLoading(false)
      },
      (err: unknown) => {
        if (cancelled) return
        setError(errorMessage(err))
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])

  return { data, loading, error, reload }
}

interface ActionState<TArgs extends unknown[], TResult> {
  run: (...args: TArgs) => Promise<TResult | null>
  loading: boolean
  error: string | null
  data: TResult | null
}

/**
 * Wraps a mutation. `run` resolves with the service result (or null on error)
 * and surfaces the error on `error` for inline display.
 */
export function useAction<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
): ActionState<TArgs, TResult> {
  const [data, setData] = useState<TResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const run = useCallback(async (...args: TArgs) => {
    setLoading(true)
    setError(null)
    try {
      const result = await fnRef.current(...args)
      setData(result)
      setLoading(false)
      return result
    } catch (err) {
      setError(errorMessage(err))
      setLoading(false)
      return null
    }
  }, [])

  return { run, loading, error, data }
}
