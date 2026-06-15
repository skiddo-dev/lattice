import { describe, it, expect, beforeEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'

// Point the store at a throwaway temp dir BEFORE importing it, so its
// $env/dynamic/private read of DATA_DIR resolves to our temp path. (Vitest
// isolates modules per test file, so this snapshot is local to this file.)
const dir = mkdtempSync(join(tmpdir(), 'lattice-agents-'))
process.env.DATA_DIR = dir

const store = await import('./store')
import type { AgentRun } from './store'

function fakeRun(id: string): AgentRun {
  return {
    id,
    at: new Date().toISOString(),
    ok: true,
    backend: 'local',
    model: 'm',
    output: 'o',
    metrics: { ttftMs: 1, tokensPerSec: 1, completionTokens: 1, durationMs: 1 },
    trigger: 'manual',
  }
}

describe('agent store', () => {
  beforeEach(() => store._resetCache())

  it('creates, lists, gets, updates, and deletes', async () => {
    const a = await store.createAgent({ name: 'A', prompt: 'hi', mode: 'auto', schedule: { kind: 'manual' } })
    expect(a.id).toBeTruthy()
    expect(a.enabled).toBe(true)

    expect((await store.listAgents()).map((x) => x.name)).toContain('A')

    const upd = await store.updateAgent(a.id, { name: 'B', enabled: false })
    expect(upd?.name).toBe('B')
    expect(upd?.enabled).toBe(false)

    expect(await store.deleteAgent(a.id)).toBe(true)
    expect(await store.getAgent(a.id)).toBeNull()
    expect(await store.deleteAgent(a.id)).toBe(false)
  })

  it('persists to disk across a cache reset', async () => {
    const a = await store.createAgent({
      name: 'Persisted',
      prompt: 'p',
      mode: 'local',
      schedule: { kind: 'interval', everyMinutes: 5 },
    })
    store._resetCache() // force a re-read from the file
    const got = await store.getAgent(a.id)
    expect(got?.name).toBe('Persisted')
    expect(got?.schedule).toEqual({ kind: 'interval', everyMinutes: 5 })
  })

  it('caps run history at 50 and keeps the newest, stamping lastRun', async () => {
    const a = await store.createAgent({ name: 'R', prompt: 'p', mode: 'auto', schedule: { kind: 'manual' } })
    for (let i = 0; i < 60; i++) await store.recordRun(a.id, fakeRun(`r${i}`))
    const got = await store.getAgent(a.id)
    expect(got?.runs.length).toBe(50)
    expect(got?.runs.at(-1)?.id).toBe('r59')
    expect(got?.runs[0]?.id).toBe('r10')
    expect(got?.lastStatus).toBe('ok')
  })
})
