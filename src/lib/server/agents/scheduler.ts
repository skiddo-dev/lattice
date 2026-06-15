import { listAgents } from './store'
import { isDue } from './schedule'
import { runAgent } from './run'

// In-process scheduler. A single interval ticks every ~30s, checks each enabled
// agent's schedule, and fires the due ones. Kept idempotent + HMR-safe via a
// globalThis guard so Vite reloading the server module doesn't stack intervals.

const TICK_MS = 30_000
const running = new Set<string>()

async function tick(): Promise<void> {
  let agents
  try {
    agents = await listAgents()
  } catch {
    return
  }
  const now = Date.now()
  for (const a of agents) {
    if (!a.enabled || a.schedule.kind === 'manual') continue
    if (running.has(a.id)) continue
    if (isDue(a.schedule, a.lastRunAt, a.createdAt, now)) {
      running.add(a.id)
      runAgent(a.id, 'schedule')
        .catch(() => {
          /* runAgent records its own error run; nothing to do here */
        })
        .finally(() => running.delete(a.id))
    }
  }
}

export function startScheduler(): void {
  const g = globalThis as unknown as { __latticeScheduler?: ReturnType<typeof setInterval> }
  if (g.__latticeScheduler) return
  g.__latticeScheduler = setInterval(() => void tick(), TICK_MS)
  // A short kick after boot so a due job doesn't wait a full tick.
  setTimeout(() => void tick(), 3_000)
}
