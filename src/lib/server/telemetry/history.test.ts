import { describe, it, expect, beforeEach } from 'vitest'
import { recordRequest, recentRequests, clearHistory, historySize } from './history'
import type { RequestRecord } from './history'

function rec(model: string): RequestRecord {
  return {
    backend: 'local',
    model,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    ttftMs: null,
    durationMs: 1,
    tokensPerSec: null,
    at: new Date().toISOString(),
    ok: true,
  }
}

describe('history ring buffer', () => {
  beforeEach(clearHistory)

  it('returns most-recent-first', () => {
    recordRequest(rec('a'))
    recordRequest(rec('b'))
    expect(recentRequests().map((r) => r.model)).toEqual(['b', 'a'])
  })

  it('caps at 100 and keeps the newest', () => {
    for (let i = 0; i < 150; i++) recordRequest(rec(`m${i}`))
    expect(historySize()).toBe(100)
    expect(recentRequests(1)[0].model).toBe('m149')
    expect(recentRequests(200)).toHaveLength(100)
  })
})
