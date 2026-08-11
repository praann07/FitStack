import { ApiError } from '@/types'

/**
 * Mock transport.
 *
 * Every service call goes through `apiCall`, tagged with the REST endpoint it
 * will hit in Phase 2. That gives us realistic latency, cancellation-free
 * promises, and a single seam to replace: swap the body of `apiCall` for
 * `fetch(BASE_URL + endpoint, ...)` and the rest of the app is unchanged.
 */

export const API_BASE_URL = '/api/v1'

export type LatencyMode = 'fast' | 'realistic' | 'slow'

const LATENCY: Record<LatencyMode, [number, number]> = {
  fast: [40, 90],
  realistic: [160, 380],
  slow: [1200, 2200],
}

interface TransportState {
  latency: LatencyMode
  failNext: number
}

const state: TransportState = { latency: 'realistic', failNext: 0 }

const listeners = new Set<(s: TransportState) => void>()

export function getTransportState(): TransportState {
  return { ...state }
}

export function setLatencyMode(mode: LatencyMode): void {
  state.latency = mode
  listeners.forEach((l) => l({ ...state }))
}

/** Queue up N failing requests — used by the demo controls to exercise error states. */
export function failNextRequests(count: number): void {
  state.failNext = count
  listeners.forEach((l) => l({ ...state }))
}

export function subscribeTransport(listener: (s: TransportState) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export async function apiCall<T>(endpoint: string, resolver: () => T): Promise<T> {
  const [min, max] = LATENCY[state.latency]
  await delay(min + Math.random() * (max - min))

  if (state.failNext > 0) {
    state.failNext -= 1
    listeners.forEach((l) => l({ ...state }))
    throw new ApiError(
      `Could not reach the server (${endpoint}). Check your connection and try again.`,
      503,
    )
  }

  return resolver()
}
