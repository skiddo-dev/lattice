import { describe, it, expect } from 'vitest'
import { buildCardsFromSettled } from './index'
import type { TelemetryCard } from './types'

describe('buildCardsFromSettled', () => {
  it('passes fulfilled cards through and turns rejections into labelled error cards', () => {
    const cards = buildCardsFromSettled([
      { status: 'fulfilled', value: { id: 'backends', label: 'Backends', status: 'ok' } },
      { status: 'rejected', reason: new Error('timed out') },
      { status: 'rejected', reason: 'boom' },
    ] as PromiseSettledResult<TelemetryCard>[])

    expect(cards[0]).toMatchObject({ id: 'backends', status: 'ok' })
    // Index 1 → the ollama provider; an Error reason surfaces its message.
    expect(cards[1]).toMatchObject({ id: 'ollama', status: 'unavailable', detail: 'timed out' })
    // Index 2 → the gpu provider; a non-Error reason is stringified.
    expect(cards[2]).toMatchObject({ id: 'gpu', status: 'unavailable', detail: 'boom' })
  })
})
