import { withTimeout } from '../util'
import { recentRequests } from './history'
import { fetchBackendsCard } from './backends'
import { fetchOllamaCard } from './ollama'
import { fetchGpuCard } from './gpu'
import type { TelemetryCard, TelemetrySnapshot } from './types'

export type { TelemetryCard, TelemetrySnapshot, CardStatus } from './types'

// Orchestrates the telemetry providers into one snapshot — the same shape as
// Blueprint's infra orchestrator: each provider is bounded by a timeout and
// settled independently, so one dead provider degrades to an error card and
// never hangs the dashboard. No heavy caching: this is local/tailnet and the
// client polls it live.

const PROVIDER_TIMEOUT_MS = 8_000

const PROVIDERS: { id: string; label: string; run: () => Promise<TelemetryCard> }[] = [
  { id: 'backends', label: 'Backends', run: fetchBackendsCard },
  { id: 'ollama', label: 'Ollama runtime', run: fetchOllamaCard },
  { id: 'gpu', label: 'GPU', run: fetchGpuCard },
]

/** Pure: turn settled provider results into cards. Providers catch their own
 *  errors, so a rejection here is unexpected (e.g. the timeout) — it still
 *  yields a visible error card rather than sinking the snapshot. */
export function buildCardsFromSettled(results: PromiseSettledResult<TelemetryCard>[]): TelemetryCard[] {
  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value
    const { id, label } = PROVIDERS[i]
    return {
      id,
      label,
      status: 'unavailable',
      detail: r.reason instanceof Error ? r.reason.message : String(r.reason),
    }
  })
}

export async function getTelemetry(): Promise<TelemetrySnapshot> {
  const settled = await Promise.allSettled(
    PROVIDERS.map((p) => withTimeout(p.run(), PROVIDER_TIMEOUT_MS, `${p.label} telemetry`)),
  )
  return {
    cards: buildCardsFromSettled(settled),
    recent: recentRequests(50),
    refreshedAt: new Date().toISOString(),
  }
}
