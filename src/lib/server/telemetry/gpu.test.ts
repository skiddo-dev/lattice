import { describe, it, expect } from 'vitest'
import { parseNvidiaSmiCsv, normalizeExporterGpu } from './gpu'

describe('parseNvidiaSmiCsv', () => {
  it('parses a standard row', () => {
    expect(parseNvidiaSmiCsv('NVIDIA GeForce RTX 3090, 14, 1024, 24576, 45')).toEqual({
      name: 'NVIDIA GeForce RTX 3090',
      utilization: 14,
      memUsedMb: 1024,
      memTotalMb: 24576,
      tempC: 45,
    })
  })

  it('coerces non-numeric fields (e.g. [N/A]) to null', () => {
    const r = parseNvidiaSmiCsv('GPU, [N/A], 1, 2, 3')
    expect(r?.utilization).toBeNull()
  })

  it('rejects short or empty rows', () => {
    expect(parseNvidiaSmiCsv('foo, 1')).toBeNull()
    expect(parseNvidiaSmiCsv('')).toBeNull()
  })
})

describe('normalizeExporterGpu', () => {
  it('accepts a { gpus: [...] } envelope', () => {
    expect(normalizeExporterGpu({ gpus: [{ name: 'g', utilization: 50 }] })[0]).toMatchObject({ name: 'g', utilization: 50 })
  })

  it('accepts a bare array and alternate key spellings', () => {
    expect(normalizeExporterGpu([{ name: 'g', util: 30, mem_used: 1, mem_total: 2 }])[0]).toMatchObject({
      utilization: 30,
      memUsedMb: 1,
      memTotalMb: 2,
    })
  })

  it('wraps a single object and defaults a missing name', () => {
    const out = normalizeExporterGpu({ utilization: 5 })
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('GPU')
  })

  it('returns [] for junk', () => {
    expect(normalizeExporterGpu(null)).toEqual([])
    expect(normalizeExporterGpu(42)).toEqual([])
  })
})
