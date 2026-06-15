import { describe, it, expect } from 'vitest'
import { resolveBackend, pickModel } from './llm'
import type { BackendConfig } from './config'

describe('resolveBackend', () => {
  const both = { local: { configured: true, healthy: true }, cloud: { configured: true } }

  it('auto prefers local when configured AND healthy', () => {
    expect(resolveBackend('auto', both)).toBe('local')
  })

  it('auto falls back to cloud when local is configured but unhealthy', () => {
    expect(
      resolveBackend('auto', { local: { configured: true, healthy: false }, cloud: { configured: true } }),
    ).toBe('cloud')
  })

  it('auto uses local as a last resort when cloud is not configured, even if the probe failed', () => {
    expect(
      resolveBackend('auto', { local: { configured: true, healthy: false }, cloud: { configured: false } }),
    ).toBe('local')
  })

  it('auto returns null only when nothing is configured', () => {
    expect(
      resolveBackend('auto', { local: { configured: false, healthy: false }, cloud: { configured: false } }),
    ).toBeNull()
  })

  it('forced local requires local configured', () => {
    expect(resolveBackend('local', both)).toBe('local')
    expect(
      resolveBackend('local', { local: { configured: false, healthy: false }, cloud: { configured: true } }),
    ).toBeNull()
  })

  it('forced cloud requires cloud configured (never silently uses local)', () => {
    expect(resolveBackend('cloud', both)).toBe('cloud')
    expect(
      resolveBackend('cloud', { local: { configured: true, healthy: true }, cloud: { configured: false } }),
    ).toBeNull()
  })
})

describe('pickModel', () => {
  const local: BackendConfig = {
    id: 'local',
    label: 'Local',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'x',
    defaultModel: null,
    configured: true,
  }

  it('honors an explicit request over everything', () => {
    expect(pickModel(local, 'qwen2.5-coder:32b', ['llama3.1:8b'])).toBe('qwen2.5-coder:32b')
  })

  it('uses the configured default when there is no explicit request', () => {
    expect(pickModel({ ...local, defaultModel: 'my-default' }, undefined, ['llama3.1:8b'])).toBe('my-default')
  })

  it('uses the first installed local model when there is no default', () => {
    expect(pickModel(local, undefined, ['llama3.1:8b', 'other'])).toBe('llama3.1:8b')
  })

  it('falls back to a safe default when local has no models', () => {
    expect(pickModel(local, undefined, [])).toBe('llama3.1:8b')
  })
})
