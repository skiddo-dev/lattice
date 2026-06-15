import { describe, it, expect } from 'vitest'
import { dueAt, isDue, nextDailyMs, normalizeSchedule, describeSchedule } from './schedule'

describe('dueAt / isDue', () => {
  it('manual never auto-fires', () => {
    expect(dueAt({ kind: 'manual' }, null, 1000)).toBeNull()
    expect(isDue({ kind: 'manual' }, null, 0, 1e15)).toBe(false)
  })

  it('interval anchors on creation before the first run', () => {
    const created = 0
    expect(dueAt({ kind: 'interval', everyMinutes: 10 }, null, created)).toBe(600_000)
    expect(isDue({ kind: 'interval', everyMinutes: 10 }, null, created, 599_999)).toBe(false)
    expect(isDue({ kind: 'interval', everyMinutes: 10 }, null, created, 600_000)).toBe(true)
  })

  it('interval anchors on the last run once it has run', () => {
    expect(dueAt({ kind: 'interval', everyMinutes: 10 }, 1_000_000, 0)).toBe(1_600_000)
  })
})

describe('nextDailyMs', () => {
  it('returns today HH:MM when still ahead of the anchor', () => {
    const anchor = new Date(2026, 5, 15, 8, 0, 0, 0).getTime()
    const d = new Date(nextDailyMs('09:00', anchor)!)
    expect([d.getHours(), d.getMinutes(), d.getDate()]).toEqual([9, 0, 15])
  })

  it('rolls to tomorrow once the time has passed', () => {
    const anchor = new Date(2026, 5, 15, 10, 0, 0, 0).getTime()
    const d = new Date(nextDailyMs('09:00', anchor)!)
    expect([d.getHours(), d.getDate()]).toEqual([9, 16])
  })

  it('rejects malformed times', () => {
    expect(nextDailyMs('99:99', 0)).toBeNull()
  })
})

describe('normalizeSchedule', () => {
  it('accepts the three kinds and normalizes', () => {
    expect(normalizeSchedule({ kind: 'manual' })).toEqual({ kind: 'manual' })
    expect(normalizeSchedule({ kind: 'interval', everyMinutes: '15' })).toEqual({ kind: 'interval', everyMinutes: 15 })
    expect(normalizeSchedule({ kind: 'daily', at: '9:05' })).toEqual({ kind: 'daily', at: '09:05' })
  })

  it('caps interval at a week', () => {
    expect(normalizeSchedule({ kind: 'interval', everyMinutes: 999_999 })).toEqual({
      kind: 'interval',
      everyMinutes: 7 * 24 * 60,
    })
  })

  it('rejects junk', () => {
    expect(normalizeSchedule(null)).toBeNull()
    expect(normalizeSchedule({ kind: 'interval', everyMinutes: 0 })).toBeNull()
    expect(normalizeSchedule({ kind: 'daily', at: '25:00' })).toBeNull()
    expect(normalizeSchedule({ kind: 'whatever' })).toBeNull()
  })
})

describe('describeSchedule', () => {
  it('produces human strings', () => {
    expect(describeSchedule({ kind: 'manual' })).toBe('Manual only')
    expect(describeSchedule({ kind: 'interval', everyMinutes: 90 })).toBe('Every 90 min')
    expect(describeSchedule({ kind: 'interval', everyMinutes: 120 })).toBe('Every 2h')
    expect(describeSchedule({ kind: 'daily', at: '09:00' })).toBe('Daily at 09:00')
  })
})
