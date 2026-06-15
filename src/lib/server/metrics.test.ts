import { describe, it, expect } from 'vitest'
import { tokensPerSecond, computeMetrics } from './metrics'

describe('tokensPerSecond', () => {
  it('computes tokens over the generation window in ms', () => {
    expect(tokensPerSecond(100, 1000)).toBe(100)
    expect(tokensPerSecond(50, 2000)).toBe(25)
  })

  it('returns null when it cannot be computed honestly', () => {
    expect(tokensPerSecond(null, 1000)).toBeNull()
    expect(tokensPerSecond(0, 1000)).toBeNull()
    expect(tokensPerSecond(100, 0)).toBeNull()
  })
})

describe('computeMetrics', () => {
  it('prefers server-reported usage when present', () => {
    const m = computeMetrics(
      { start: 1000, firstAt: 1200, last: 2200, chunks: 40 },
      { prompt_tokens: 10, completion_tokens: 50, total_tokens: 60 },
      'local',
      'llama3.1:8b',
    )
    expect(m.ttftMs).toBe(200)
    expect(m.durationMs).toBe(1200)
    expect(m.completionTokens).toBe(50)
    expect(m.totalTokens).toBe(60)
    expect(m.tokensPerSec).toBe(50) // 50 tokens over the 1000ms generation window
  })

  it('falls back to chunk count when usage is absent', () => {
    const m = computeMetrics({ start: 0, firstAt: 100, last: 1100, chunks: 30 }, null, 'cloud', 'gpt-4o-mini')
    expect(m.completionTokens).toBe(30)
    expect(m.tokensPerSec).toBe(30)
  })

  it('handles an empty stream without inventing numbers', () => {
    const m = computeMetrics({ start: 0, firstAt: null, last: 500, chunks: 0 }, null, 'local', 'x')
    expect(m.ttftMs).toBeNull()
    expect(m.completionTokens).toBeNull()
    expect(m.tokensPerSec).toBeNull()
    expect(m.durationMs).toBe(500)
  })
})
