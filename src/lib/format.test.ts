import { describe, it, expect } from 'vitest'
import { fmtBytes, fmtMs, fmtTokPerSec, fmtInt, fmtRelTime } from './format'

describe('fmtBytes', () => {
  it('scales through units', () => {
    expect(fmtBytes(0)).toBe('0 B')
    expect(fmtBytes(512)).toBe('512 B')
    expect(fmtBytes(1024)).toBe('1.0 KB')
    expect(fmtBytes(5 * 1024 ** 3)).toBe('5.0 GB')
  })
})

describe('fmtMs', () => {
  it('renders ms then seconds', () => {
    expect(fmtMs(250)).toBe('250 ms')
    expect(fmtMs(1500)).toBe('1.50 s')
    expect(fmtMs(null)).toBe('—')
  })
})

describe('fmtTokPerSec / fmtInt', () => {
  it('formats throughput and integers', () => {
    expect(fmtTokPerSec(42.345)).toBe('42.3 tok/s')
    expect(fmtTokPerSec(null)).toBe('—')
    expect(fmtInt(null)).toBe('—')
    expect(fmtInt(1234)).toBe((1234).toLocaleString())
  })
})

describe('fmtRelTime', () => {
  const now = Date.parse('2026-06-15T12:00:00Z')
  it('buckets into just now / s / m / h', () => {
    expect(fmtRelTime('2026-06-15T11:59:58Z', now)).toBe('just now')
    expect(fmtRelTime('2026-06-15T11:59:30Z', now)).toBe('30s ago')
    expect(fmtRelTime('2026-06-15T11:59:00Z', now)).toBe('1m ago')
    expect(fmtRelTime('2026-06-15T11:00:00Z', now)).toBe('1h ago')
  })
  it('handles bad input', () => {
    expect(fmtRelTime('not-a-date', now)).toBe('—')
  })
})
