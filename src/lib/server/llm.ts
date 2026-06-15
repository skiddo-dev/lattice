import OpenAI from 'openai'
import { localConfig, cloudConfig, type BackendConfig, type BackendId } from './config'
import { fetchWithTimeout } from './util'

export type Mode = 'auto' | 'local' | 'cloud'

export interface RouteState {
  local: { configured: boolean; healthy: boolean }
  cloud: { configured: boolean }
}

/**
 * Pure routing decision — the heart of Lattice. Given what's configured and
 * whether local is currently reachable, pick the backend for a request.
 *
 *  - 'local' / 'cloud' force that backend (null if it isn't configured).
 *  - 'auto' prefers local when it's configured AND healthy; otherwise falls back
 *    to cloud; and if cloud isn't configured either, tries local as a last
 *    resort (configured-but-probe-failed beats refusing to answer). null only
 *    when nothing is configured at all.
 */
export function resolveBackend(mode: Mode, state: RouteState): BackendId | null {
  if (mode === 'local') return state.local.configured ? 'local' : null
  if (mode === 'cloud') return state.cloud.configured ? 'cloud' : null
  if (state.local.configured && state.local.healthy) return 'local'
  if (state.cloud.configured) return 'cloud'
  if (state.local.configured) return 'local'
  return null
}

export function backendConfig(id: BackendId): BackendConfig {
  return id === 'local' ? localConfig() : cloudConfig()
}

/** OpenAI SDK client pointed at the chosen backend. Both Ollama/LM Studio and
 *  OpenAI speak the same /v1 protocol, so one client type serves both. */
export function clientFor(cfg: BackendConfig): OpenAI {
  return new OpenAI({ baseURL: cfg.baseUrl ?? undefined, apiKey: cfg.apiKey })
}

// --- Health probe (cached) -------------------------------------------------

export interface HealthResult {
  configured: boolean
  healthy: boolean
  latencyMs: number | null
  models: string[]
  error?: string
  checkedAt: number
}

const HEALTH_TTL_MS = 10_000
const PROBE_TIMEOUT_MS = 4_000
const cache = new Map<string, HealthResult>()

function notConfigured(): HealthResult {
  return { configured: false, healthy: false, latencyMs: null, models: [], checkedAt: Date.now() }
}

/** Probe a backend's /models endpoint, caching the result ~10s so repeated
 *  routing decisions and telemetry polls don't hammer it. */
export async function probeHealth(id: BackendId, now = Date.now()): Promise<HealthResult> {
  const cfg = backendConfig(id)
  if (!cfg.configured || !cfg.baseUrl) return notConfigured()

  const key = `${id}:${cfg.baseUrl}`
  const hit = cache.get(key)
  if (hit && now - hit.checkedAt < HEALTH_TTL_MS) return hit

  const started = Date.now()
  let result: HealthResult
  try {
    const headers: Record<string, string> = {}
    if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`
    const res = await fetchWithTimeout(`${cfg.baseUrl}/models`, PROBE_TIMEOUT_MS, { headers })
    const latencyMs = Date.now() - started
    if (!res.ok) {
      result = { configured: true, healthy: false, latencyMs, models: [], error: `HTTP ${res.status}`, checkedAt: now }
    } else {
      const body = (await res.json()) as { data?: { id?: string }[] }
      const models = (body.data ?? []).map((m) => m.id).filter((m): m is string => !!m)
      result = { configured: true, healthy: true, latencyMs, models, checkedAt: now }
    }
  } catch (e) {
    result = {
      configured: true,
      healthy: false,
      latencyMs: null,
      models: [],
      error: e instanceof Error ? e.message : String(e),
      checkedAt: now,
    }
  }
  cache.set(key, result)
  return result
}

/** Resolve the model to use for a request: explicit pick → backend default →
 *  first healthy local model → a safe fallback. */
export function pickModel(cfg: BackendConfig, requested: string | undefined, localModels: string[]): string {
  const want = (requested ?? '').trim()
  if (want) return want
  if (cfg.defaultModel) return cfg.defaultModel
  if (cfg.id === 'local' && localModels.length) return localModels[0]
  return cfg.id === 'local' ? 'llama3.1:8b' : 'gpt-4o-mini'
}

/** Test seam: drop the health cache. */
export function _clearHealthCache(): void {
  cache.clear()
}
