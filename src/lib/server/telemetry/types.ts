import type { RequestRecord } from './history'

// A telemetry provider always resolves to a card — never throws past the
// orchestrator. 'not_configured' means the operator hasn't wired it up (show a
// hint, not an error); 'unavailable' means it's configured but unreachable.
export type CardStatus = 'ok' | 'unavailable' | 'not_configured'

export interface TelemetryCard {
  id: string
  label: string
  status: CardStatus
  /** Human one-liner: a hint when not_configured, an error when unavailable. */
  detail?: string
  data?: Record<string, unknown>
}

export interface TelemetrySnapshot {
  cards: TelemetryCard[]
  recent: RequestRecord[]
  refreshedAt: string
}
