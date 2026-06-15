import { dueAt, normalizeSchedule } from './schedule'
import type { Agent, AgentInput } from './store'
import type { Mode } from '../llm'

// Shared serialization + input validation for the agents API. Keeps the route
// handlers thin and the create/patch parsing in one place.

export function nextRun(a: Agent): number | null {
  return a.enabled ? dueAt(a.schedule, a.lastRunAt, a.createdAt) : null
}

/** List view: everything but the (potentially large) run outputs. */
export function toListItem(a: Agent) {
  return {
    id: a.id,
    name: a.name,
    mode: a.mode,
    model: a.model ?? null,
    schedule: a.schedule,
    enabled: a.enabled,
    createdAt: a.createdAt,
    lastRunAt: a.lastRunAt,
    lastStatus: a.lastStatus,
    nextRunAt: nextRun(a),
    runCount: a.runs.length,
    promptPreview: a.prompt.length > 140 ? `${a.prompt.slice(0, 140)}…` : a.prompt,
  }
}

/** Detail view: the full agent (incl. run history) plus the computed next run. */
export function toDetail(a: Agent) {
  return { ...a, nextRunAt: nextRun(a) }
}

function parseMode(v: unknown): Mode {
  return v === 'local' || v === 'cloud' ? v : 'auto'
}

export function parseCreate(body: unknown): AgentInput | string {
  const b = (body ?? {}) as Record<string, unknown>
  const name = String(b.name ?? '').trim()
  if (!name) return 'name is required'
  const prompt = String(b.prompt ?? '').trim()
  if (!prompt) return 'prompt is required'
  const schedule = normalizeSchedule(b.schedule)
  if (!schedule) return 'invalid schedule'
  return {
    name: name.slice(0, 120),
    prompt,
    system: b.system ? String(b.system) : undefined,
    model: b.model ? String(b.model) : undefined,
    mode: parseMode(b.mode),
    schedule,
    enabled: b.enabled !== false,
  }
}

export function parsePatch(body: unknown): Partial<AgentInput> | string {
  const b = (body ?? {}) as Record<string, unknown>
  const patch: Partial<AgentInput> = {}
  if (b.name !== undefined) {
    const name = String(b.name).trim()
    if (!name) return 'name cannot be empty'
    patch.name = name.slice(0, 120)
  }
  if (b.prompt !== undefined) {
    const prompt = String(b.prompt).trim()
    if (!prompt) return 'prompt cannot be empty'
    patch.prompt = prompt
  }
  if (b.system !== undefined) patch.system = b.system ? String(b.system) : undefined
  if (b.model !== undefined) patch.model = b.model ? String(b.model) : undefined
  if (b.mode !== undefined) patch.mode = parseMode(b.mode)
  if (b.schedule !== undefined) {
    const s = normalizeSchedule(b.schedule)
    if (!s) return 'invalid schedule'
    patch.schedule = s
  }
  if (b.enabled !== undefined) patch.enabled = !!b.enabled
  return patch
}
