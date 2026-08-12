import { ApiError } from '@/types'

/**
 * Real HTTP transport (Phase 2).
 *
 * The access token lives in memory only; the refresh token is an httpOnly
 * cookie the browser attaches automatically (`credentials: 'include'`). A
 * 401 on an authenticated call triggers one silent refresh-and-retry; if
 * that also fails, `onSessionExpired` fires so the auth store can drop back
 * to the login screen.
 */

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000/api/v1'

let accessToken: string | null = null
let onSessionExpired: () => void = () => {}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

export function setSessionExpiredHandler(fn: () => void): void {
  onSessionExpired = fn
}

type QueryValue = string | number | boolean | undefined | null

interface RequestOptions {
  /** Don't attach the Authorization header (login/register/refresh). */
  skipAuth?: boolean
  /** Don't attempt a refresh-and-retry on 401 (used by the refresh call itself). */
  skipRefresh?: boolean
  query?: Record<string, QueryValue>
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(API_BASE_URL.replace(/\/$/, '') + path, window.location.origin)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

async function rawFetch(method: string, path: string, body: unknown, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (!opts.skipAuth && accessToken) headers.Authorization = `Bearer ${accessToken}`

  return fetch(buildUrl(path, opts.query), {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function extractMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = (payload as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string; loc?: unknown[] }
      const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : undefined
      return first.msg ? `${field ? `${String(field)}: ` : ''}${first.msg}` : fallback
    }
  }
  return fallback
}

async function toApiError(res: Response): Promise<ApiError> {
  let payload: unknown = null
  try {
    payload = await res.json()
  } catch {
    // Empty or non-JSON body — fall through to the generic message.
  }
  const message = extractMessage(payload, `Request failed (${res.status})`)
  return new ApiError(message, res.status)
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

let refreshInFlight: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await rawFetch('POST', '/auth/refresh', undefined, { skipAuth: true, skipRefresh: true })
      if (!res.ok) return false
      const data = await parseResponse<{ access_token: string }>(res)
      setAccessToken(data.access_token)
      return true
    } catch {
      return false
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  let res: Response
  try {
    res = await rawFetch(method, path, body, opts)
  } catch {
    throw new ApiError(`Could not reach the server (${method} ${path}). Check your connection and try again.`, 503)
  }

  if (res.status === 401 && !opts.skipAuth && !opts.skipRefresh) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      try {
        res = await rawFetch(method, path, body, opts)
      } catch {
        throw new ApiError(`Could not reach the server (${method} ${path}). Check your connection and try again.`, 503)
      }
    } else {
      setAccessToken(null)
      onSessionExpired()
    }
  }

  if (!res.ok) throw await toApiError(res)
  return parseResponse<T>(res)
}
