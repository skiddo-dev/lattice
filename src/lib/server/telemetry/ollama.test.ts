import { describe, it, expect } from 'vitest'
import { normalizeOllamaPs } from './ollama'

describe('normalizeOllamaPs', () => {
  it('maps loaded models including resident VRAM', () => {
    const out = normalizeOllamaPs({
      models: [
        { name: 'llama3.1:8b', size: 5_000_000_000, size_vram: 5_000_000_000, expires_at: '2026-06-15T00:00:00Z' },
      ],
    })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ name: 'llama3.1:8b', sizeVram: 5_000_000_000, expiresAt: '2026-06-15T00:00:00Z' })
  })

  it('tolerates the name/model field drift and missing sizes', () => {
    expect(normalizeOllamaPs({ models: [{ model: 'x' }] })[0]).toMatchObject({
      name: 'x',
      sizeBytes: 0,
      sizeVram: 0,
      expiresAt: null,
    })
  })

  it('returns [] for non-array / null payloads', () => {
    expect(normalizeOllamaPs(null)).toEqual([])
    expect(normalizeOllamaPs({})).toEqual([])
    expect(normalizeOllamaPs({ models: 'nope' })).toEqual([])
  })
})
