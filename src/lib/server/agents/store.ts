import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { env } from '$env/dynamic/private'
import type { BackendId } from '../config'
import type { Mode } from '../llm'
import type { Schedule } from './schedule'

// Agents persist to a single JSON file (DATA_DIR/agents.json) — Lattice is one
// self-hosted instance, so a file beats standing up a database. Writes are
// atomic (tmp + rename). A process-shared in-memory cache keeps the scheduler
// and the API consistent within the one server process.

export type RunTrigger = 'manual' | 'schedule'

export interface RunMetrics {
  ttftMs: number | null
  tokensPerSec: number | null
  completionTokens: number | null
  durationMs: number
}

export interface AgentRun {
  id: string
  at: string // ISO
  ok: boolean
  backend: BackendId | null
  model: string
  output: string
  error?: string
  metrics: RunMetrics
  trigger: RunTrigger
}

export interface Agent {
  id: string
  name: string
  prompt: string
  system?: string
  mode: Mode
  model?: string
  schedule: Schedule
  enabled: boolean
  createdAt: number
  lastRunAt: number | null
  lastStatus: 'ok' | 'error' | null
  runs: AgentRun[]
}

export interface AgentInput {
  name: string
  prompt: string
  system?: string
  mode: Mode
  model?: string
  schedule: Schedule
  enabled?: boolean
}

const MAX_RUNS = 50
export const OUTPUT_CAP = 8_000

function dataDir(): string {
  return env.DATA_DIR?.trim() || join(process.cwd(), 'data')
}
function filePath(): string {
  return join(dataDir(), 'agents.json')
}

let cache: Agent[] | null = null

async function readAll(): Promise<Agent[]> {
  if (cache) return cache
  try {
    const parsed = JSON.parse(await readFile(filePath(), 'utf8')) as { agents?: Agent[] }
    cache = Array.isArray(parsed.agents) ? parsed.agents : []
  } catch {
    cache = []
  }
  return cache
}

async function writeAll(agents: Agent[]): Promise<void> {
  cache = agents
  await mkdir(dataDir(), { recursive: true })
  const tmp = `${filePath()}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify({ agents }, null, 2), 'utf8')
  await rename(tmp, filePath())
}

export async function listAgents(): Promise<Agent[]> {
  return structuredClone(await readAll())
}

export async function getAgent(id: string): Promise<Agent | null> {
  const a = (await readAll()).find((x) => x.id === id)
  return a ? structuredClone(a) : null
}

export async function createAgent(input: AgentInput): Promise<Agent> {
  const agents = await readAll()
  const agent: Agent = {
    id: randomUUID(),
    name: input.name,
    prompt: input.prompt,
    system: input.system,
    mode: input.mode,
    model: input.model,
    schedule: input.schedule,
    enabled: input.enabled ?? true,
    createdAt: Date.now(),
    lastRunAt: null,
    lastStatus: null,
    runs: [],
  }
  await writeAll([...agents, agent])
  return structuredClone(agent)
}

export async function updateAgent(id: string, patch: Partial<AgentInput>): Promise<Agent | null> {
  const agents = await readAll()
  const i = agents.findIndex((a) => a.id === id)
  if (i < 0) return null
  const next = { ...agents[i] }
  if (patch.name !== undefined) next.name = patch.name
  if (patch.prompt !== undefined) next.prompt = patch.prompt
  if (patch.system !== undefined) next.system = patch.system
  if (patch.mode !== undefined) next.mode = patch.mode
  if (patch.model !== undefined) next.model = patch.model
  if (patch.schedule !== undefined) next.schedule = patch.schedule
  if (patch.enabled !== undefined) next.enabled = patch.enabled
  const copy = [...agents]
  copy[i] = next
  await writeAll(copy)
  return structuredClone(next)
}

export async function deleteAgent(id: string): Promise<boolean> {
  const agents = await readAll()
  const copy = agents.filter((a) => a.id !== id)
  if (copy.length === agents.length) return false
  await writeAll(copy)
  return true
}

/** Append a run (newest last), cap history, and stamp lastRunAt/lastStatus. */
export async function recordRun(id: string, run: AgentRun): Promise<void> {
  const agents = await readAll()
  const i = agents.findIndex((a) => a.id === id)
  if (i < 0) return
  const a = agents[i]
  const runs = [...a.runs, run].slice(-MAX_RUNS)
  const copy = [...agents]
  copy[i] = { ...a, runs, lastRunAt: Date.parse(run.at), lastStatus: run.ok ? 'ok' : 'error' }
  await writeAll(copy)
}

/** Test seam: reset the in-memory cache so a fresh DATA_DIR is re-read. */
export function _resetCache(): void {
  cache = null
}
