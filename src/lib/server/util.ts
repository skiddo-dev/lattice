/** Reject if `p` doesn't settle within `ms`. Clears its timer when `p` wins so a
 *  resolved fetch can't keep the process alive. The losing fetch is left to
 *  settle and be GC'd on its own. Lifted from Blueprint's infra orchestrator —
 *  one slow/unreachable backend must degrade to an error card, never hang a page. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

/** fetch() with an AbortController-backed timeout. Returns the Response; throws
 *  on network error or timeout (callers turn that into a graceful card). */
export async function fetchWithTimeout(url: string, ms: number, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}
