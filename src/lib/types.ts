// Client-facing shapes for the NDJSON chat stream and the telemetry/models
// endpoints. Kept out of $lib/server so .svelte components can import them
// without tripping SvelteKit's server-only import guard. These intentionally
// mirror the server types (metrics.ts, telemetry/*).

export type BackendId = 'local' | 'cloud'
export type Mode = 'auto' | 'local' | 'cloud'

export interface ChatMetrics {
  backend: BackendId
  model: string
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  ttftMs: number | null
  durationMs: number
  tokensPerSec: number | null
}

/** One NDJSON line from POST /api/chat. */
export type ChatFrame =
  | { type: 'start'; backend: BackendId; model: string }
  | { type: 'delta'; text: string }
  | { type: 'metrics'; metrics: ChatMetrics }
  | { type: 'error'; message: string }
  | { type: 'done' }

export interface ModelsResponse {
  local: { configured: boolean; healthy: boolean; models: string[]; error?: string }
  cloud: { configured: boolean; models: string[] }
}

export type CardStatus = 'ok' | 'unavailable' | 'not_configured'

export interface TelemetryCard {
  id: string
  label: string
  status: CardStatus
  detail?: string
  data?: Record<string, unknown>
}

export interface RequestRecord extends ChatMetrics {
  at: string
  ok: boolean
  error?: string
}

export interface TelemetrySnapshot {
  cards: TelemetryCard[]
  recent: RequestRecord[]
  refreshedAt: string
}
