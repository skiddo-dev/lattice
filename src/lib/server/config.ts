import { env } from '$env/dynamic/private'

// Every key is optional. A missing key doesn't throw — it just makes the
// corresponding backend report "not configured", and Lattice surfaces that in
// the UI instead of crashing. Read via $env/dynamic/private (NOT process.env,
// which is empty under Vite SSR) so values resolve at runtime.

export type BackendId = 'local' | 'cloud'

export interface BackendConfig {
  id: BackendId
  label: string
  /** OpenAI-compatible base, ending in /v1. null when unconfigured. */
  baseUrl: string | null
  apiKey: string
  /** Preferred model; may be null for local (we then pick the first installed). */
  defaultModel: string | null
  configured: boolean
}

function clean(v: string | undefined): string {
  return (v ?? '').trim()
}

/** Local backend — Ollama or LM Studio, both OpenAI-compatible at /v1. */
export function localConfig(): BackendConfig {
  const baseUrl = clean(env.LOCAL_LLM_BASE_URL) || null
  return {
    id: 'local',
    label: 'Local',
    baseUrl,
    // Ollama/LM Studio ignore the key, but the OpenAI SDK demands a non-empty string.
    apiKey: clean(env.LOCAL_LLM_API_KEY) || 'lattice-local',
    defaultModel: clean(env.LOCAL_LLM_MODEL) || null,
    configured: !!baseUrl,
  }
}

/** Cloud fallback — OpenAI (or any OpenAI-compatible cloud via OPENAI_BASE_URL). */
export function cloudConfig(): BackendConfig {
  const apiKey = clean(env.OPENAI_API_KEY)
  return {
    id: 'cloud',
    label: 'Cloud',
    baseUrl: clean(env.OPENAI_BASE_URL) || 'https://api.openai.com/v1',
    apiKey,
    defaultModel: clean(env.OPENAI_MODEL) || 'gpt-4o-mini',
    configured: !!apiKey,
  }
}

/** Native Ollama base (for /api/ps + /api/tags runtime telemetry). Defaults to
 *  the local /v1 base with the trailing /v1 stripped. null when no local base. */
export function ollamaBase(): string | null {
  const explicit = clean(env.OLLAMA_URL)
  if (explicit) return explicit.replace(/\/+$/, '')
  const v1 = clean(env.LOCAL_LLM_BASE_URL)
  if (!v1) return null
  return v1.replace(/\/+$/, '').replace(/\/v1$/, '')
}

export function gpuExporterUrl(): string | null {
  return clean(env.GPU_EXPORTER_URL) || null
}

/** A scannable "what's wired up" summary for the UI banner. */
export function configStatus() {
  const local = localConfig()
  const cloud = cloudConfig()
  return {
    local: local.configured,
    cloud: cloud.configured,
    ollama: !!ollamaBase(),
    gpu: !!gpuExporterUrl(),
  }
}
