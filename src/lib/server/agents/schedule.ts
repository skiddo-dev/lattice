// Schedule model for agents — pure, DOM/IO-free, fully unit-tested.
// Three kinds keep it dependency-free (no cron parser) while covering the real
// cases: a manual-only job, a fixed interval, and a daily time. The scheduler
// ticks every ~30s and asks isDue(); the UI shows dueAt() as "next run".

export type Schedule =
  | { kind: 'manual' }
  | { kind: 'interval'; everyMinutes: number }
  | { kind: 'daily'; at: string } // 'HH:MM', server local time

const MAX_INTERVAL_MIN = 7 * 24 * 60 // a week

function parseHHMM(at: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(at.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return [h, min]
}

/** Next timestamp matching HH:MM (server local time) strictly after `afterMs`. */
export function nextDailyMs(at: string, afterMs: number): number | null {
  const hhmm = parseHHMM(at)
  if (!hhmm) return null
  const d = new Date(afterMs)
  d.setHours(hhmm[0], hhmm[1], 0, 0)
  if (d.getTime() <= afterMs) d.setDate(d.getDate() + 1)
  return d.getTime()
}

/** When this schedule is next due, anchored on the last run (or creation if it
 *  has never run). null = never auto-fires (manual). */
export function dueAt(schedule: Schedule, lastRunMs: number | null, createdMs: number): number | null {
  const anchor = lastRunMs ?? createdMs
  switch (schedule.kind) {
    case 'manual':
      return null
    case 'interval':
      return anchor + Math.max(1, schedule.everyMinutes) * 60_000
    case 'daily':
      return nextDailyMs(schedule.at, anchor)
  }
}

export function isDue(
  schedule: Schedule,
  lastRunMs: number | null,
  createdMs: number,
  nowMs: number,
): boolean {
  const at = dueAt(schedule, lastRunMs, createdMs)
  return at != null && nowMs >= at
}

export function describeSchedule(s: Schedule): string {
  switch (s.kind) {
    case 'manual':
      return 'Manual only'
    case 'interval':
      return s.everyMinutes % 60 === 0
        ? `Every ${s.everyMinutes / 60}h`
        : `Every ${s.everyMinutes} min`
    case 'daily':
      return `Daily at ${s.at}`
  }
}

/** Coerce untrusted input into a valid Schedule, or null if it isn't one. */
export function normalizeSchedule(input: unknown): Schedule | null {
  if (!input || typeof input !== 'object') return null
  const o = input as Record<string, unknown>
  if (o.kind === 'manual') return { kind: 'manual' }
  if (o.kind === 'interval') {
    const n = Math.round(Number(o.everyMinutes))
    if (!Number.isFinite(n) || n < 1) return null
    return { kind: 'interval', everyMinutes: Math.min(n, MAX_INTERVAL_MIN) }
  }
  if (o.kind === 'daily') {
    const hhmm = parseHHMM(String(o.at ?? ''))
    if (!hhmm) return null
    return { kind: 'daily', at: `${String(hhmm[0]).padStart(2, '0')}:${String(hhmm[1]).padStart(2, '0')}` }
  }
  return null
}
