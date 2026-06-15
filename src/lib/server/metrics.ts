import type { BackendId } from './config'

// Pure metric helpers for a streamed completion. Kept DOM/IO-free so they're
// trivially unit-testable; the chat endpoint feeds them raw timestamps + usage.

export interface ChatMetrics {
  backend: BackendId
  model: string
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  /** Time to first token (ms). null if the stream produced nothing. */
  ttftMs: number | null
  /** Total wall time of the request (ms). */
  durationMs: number
  /** Completion tokens per second over the generation phase. null if unknown. */
  tokensPerSec: number | null
}

export interface StreamTiming {
  /** Date.now() when the request was dispatched. */
  start: number
  /** Date.now() of the first content token, or null if none arrived. */
  firstAt: number | null
  /** Date.now() of the last content token (or start if none). */
  last: number
  /** Count of content chunks seen (fallback token estimate when usage is absent). */
  chunks: number
}

export interface Usage {
  prompt_tokens?: number | null
  completion_tokens?: number | null
  total_tokens?: number | null
}

/** completion tokens / generation-window seconds. Generation window is
 *  first-token → last-token; if only one token arrived, fall back to the whole
 *  request. Returns null when it can't be computed honestly. */
export function tokensPerSecond(completionTokens: number | null, genMs: number): number | null {
  if (!completionTokens || completionTokens <= 0) return null
  if (!Number.isFinite(genMs) || genMs <= 0) return null
  return Math.round((completionTokens / genMs) * 1000 * 10) / 10
}

/** Fold raw stream timing + optional server-reported usage into ChatMetrics.
 *  Prefers real usage.completion_tokens; falls back to the chunk count (≈1
 *  token/chunk for OpenAI-compatible streams) so the number is never blank
 *  just because a local server omitted usage. */
export function computeMetrics(
  timing: StreamTiming,
  usage: Usage | null,
  backend: BackendId,
  model: string,
): ChatMetrics {
  const durationMs = Math.max(0, timing.last - timing.start)
  const ttftMs = timing.firstAt != null ? Math.max(0, timing.firstAt - timing.start) : null
  const genMs = timing.firstAt != null ? Math.max(1, timing.last - timing.firstAt) : durationMs

  const completionTokens = usage?.completion_tokens ?? (timing.chunks > 0 ? timing.chunks : null)
  const promptTokens = usage?.prompt_tokens ?? null
  const totalTokens =
    usage?.total_tokens ?? (completionTokens != null ? completionTokens + (promptTokens ?? 0) : null)

  return {
    backend,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    ttftMs,
    durationMs,
    tokensPerSec: tokensPerSecond(completionTokens, genMs),
  }
}
