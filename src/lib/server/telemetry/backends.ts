import { localConfig, cloudConfig } from '../config'
import { probeHealth } from '../llm'
import type { TelemetryCard } from './types'

export interface BackendStatus {
  id: 'local' | 'cloud'
  label: string
  configured: boolean
  healthy?: boolean
  latencyMs?: number | null
  models?: number
  error?: string
}

/** Reachability + latency for each backend, so you can see at a glance whether
 *  Auto will route local or fall back to cloud. Reuses the ~10s-cached health
 *  probe, so a 2s telemetry poll mostly hits cache rather than the backends. */
export async function fetchBackendsCard(): Promise<TelemetryCard> {
  const local = localConfig()
  const cloud = cloudConfig()
  const backends: BackendStatus[] = []

  if (local.configured) {
    const h = await probeHealth('local')
    backends.push({
      id: 'local',
      label: 'Local',
      configured: true,
      healthy: h.healthy,
      latencyMs: h.latencyMs,
      models: h.models.length,
      error: h.error,
    })
  } else {
    backends.push({ id: 'local', label: 'Local', configured: false })
  }

  if (cloud.configured) {
    const h = await probeHealth('cloud')
    backends.push({
      id: 'cloud',
      label: 'Cloud',
      configured: true,
      healthy: h.healthy,
      latencyMs: h.latencyMs,
      error: h.error,
    })
  } else {
    backends.push({ id: 'cloud', label: 'Cloud', configured: false })
  }

  const anyConfigured = local.configured || cloud.configured
  return {
    id: 'backends',
    label: 'Backends',
    status: anyConfigured ? 'ok' : 'not_configured',
    detail: anyConfigured ? undefined : 'Set LOCAL_LLM_BASE_URL or OPENAI_API_KEY.',
    data: { backends },
  }
}
