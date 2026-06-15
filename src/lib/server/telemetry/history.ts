import type { ChatMetrics } from '../metrics'

// In-memory ring buffer of recent requests. Process-local and intentionally
// ephemeral — Lattice is a single self-hosted instance, and "recent activity"
// is a live readout, not durable history. (Phase 2 could persist this.)

export interface RequestRecord extends ChatMetrics {
  /** ISO timestamp the request completed. */
  at: string
  ok: boolean
  error?: string
}

const MAX = 100
let buf: RequestRecord[] = []

export function recordRequest(r: RequestRecord): void {
  buf.push(r)
  if (buf.length > MAX) buf = buf.slice(buf.length - MAX)
}

/** Most-recent-first, capped at `limit`. */
export function recentRequests(limit = 50): RequestRecord[] {
  return buf.slice(-limit).reverse()
}

export function historySize(): number {
  return buf.length
}

/** Test seam. */
export function clearHistory(): void {
  buf = []
}
