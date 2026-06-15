import { ollamaBase } from '../config'
import { fetchWithTimeout } from '../util'
import type { TelemetryCard } from './types'

const TIMEOUT_MS = 4_000

export interface LoadedModel {
  name: string
  /** Total model size on disk (bytes). */
  sizeBytes: number
  /** Resident VRAM (bytes) — 0 when running on CPU. */
  sizeVram: number
  expiresAt: string | null
}

/** Pure: shape Ollama's /api/ps payload into loaded-model rows. Tolerates the
 *  field drift between Ollama versions (name vs model, missing size_vram). */
export function normalizeOllamaPs(json: unknown): LoadedModel[] {
  const models = (json as { models?: unknown[] } | null)?.models
  if (!Array.isArray(models)) return []
  return models.map((m) => {
    const o = (m ?? {}) as Record<string, unknown>
    return {
      name:
        typeof o.name === 'string' ? o.name : typeof o.model === 'string' ? o.model : 'unknown',
      sizeBytes: typeof o.size === 'number' ? o.size : 0,
      sizeVram: typeof o.size_vram === 'number' ? o.size_vram : 0,
      expiresAt: typeof o.expires_at === 'string' ? o.expires_at : null,
    }
  })
}

/** Native Ollama runtime card: which models are loaded + VRAM resident, plus
 *  how many are installed. Best-effort — degrades cleanly if the local backend
 *  is LM Studio (no /api/ps) or simply unreachable. */
export async function fetchOllamaCard(): Promise<TelemetryCard> {
  const base = ollamaBase()
  if (!base) {
    return {
      id: 'ollama',
      label: 'Ollama runtime',
      status: 'not_configured',
      detail: 'Set LOCAL_LLM_BASE_URL (or OLLAMA_URL) to see loaded models + VRAM.',
    }
  }
  try {
    const [psRes, tagsRes] = await Promise.all([
      fetchWithTimeout(`${base}/api/ps`, TIMEOUT_MS),
      fetchWithTimeout(`${base}/api/tags`, TIMEOUT_MS).catch(() => null),
    ])
    if (!psRes.ok) throw new Error(`HTTP ${psRes.status}`)
    const loaded = normalizeOllamaPs(await psRes.json())

    let installed = 0
    if (tagsRes && tagsRes.ok) {
      const tags = (await tagsRes.json()) as { models?: unknown[] }
      installed = Array.isArray(tags.models) ? tags.models.length : 0
    }

    const vramBytes = loaded.reduce((s, m) => s + (m.sizeVram || 0), 0)
    return {
      id: 'ollama',
      label: 'Ollama runtime',
      status: 'ok',
      detail: loaded.length
        ? `${loaded.length} model${loaded.length > 1 ? 's' : ''} loaded`
        : 'idle — no model resident',
      data: { loaded, installed, vramBytes },
    }
  } catch (e) {
    return {
      id: 'ollama',
      label: 'Ollama runtime',
      status: 'unavailable',
      detail: e instanceof Error ? e.message : String(e),
    }
  }
}
