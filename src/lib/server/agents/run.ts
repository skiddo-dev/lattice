import { randomUUID } from 'node:crypto'
import { localConfig, cloudConfig } from '../config'
import { resolveBackend, backendConfig, clientFor, probeHealth, pickModel } from '../llm'
import { computeMetrics, type Usage } from '../metrics'
import { recordRequest } from '../telemetry/history'
import { getAgent, recordRun, OUTPUT_CAP, type AgentRun, type RunTrigger } from './store'

// Executes an agent against the routed backend, reusing the exact routing +
// metering engine the chat console uses. The run is recorded to the agent's
// history AND pushed into the telemetry ring buffer (tagged with the agent name)
// so scheduled work shows up in /telemetry alongside interactive chats.

export async function runAgent(id: string, trigger: RunTrigger): Promise<AgentRun> {
  const agent = await getAgent(id)
  if (!agent) throw new Error('agent not found')

  const ranAt = new Date().toISOString()
  const local = localConfig()
  const cloud = cloudConfig()
  const localHealth = agent.mode === 'cloud' ? null : await probeHealth('local')
  const chosen = resolveBackend(agent.mode, {
    local: { configured: local.configured, healthy: localHealth?.healthy ?? false },
    cloud: { configured: cloud.configured },
  })

  if (!chosen) {
    const run: AgentRun = {
      id: randomUUID(),
      at: ranAt,
      ok: false,
      backend: null,
      model: agent.model ?? '',
      output: '',
      error: 'No backend configured',
      metrics: { ttftMs: null, tokensPerSec: null, completionTokens: null, durationMs: 0 },
      trigger,
    }
    await recordRun(id, run)
    return run
  }

  const cfg = backendConfig(chosen)
  const localModels = chosen === 'local' ? (localHealth ?? (await probeHealth('local'))).models : []
  const model = pickModel(cfg, agent.model, localModels)
  const messages = [
    ...(agent.system ? [{ role: 'system' as const, content: agent.system }] : []),
    { role: 'user' as const, content: agent.prompt },
  ]
  const client = clientFor(cfg)

  const start = Date.now()
  let firstAt: number | null = null
  let last = start
  let chunks = 0
  let usage: Usage | null = null
  let output = ''

  try {
    const completion = await client.chat.completions.create({
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    })
    for await (const part of completion) {
      if (part.usage) usage = part.usage as Usage
      const delta = part.choices?.[0]?.delta?.content
      if (delta) {
        if (firstAt === null) firstAt = Date.now()
        last = Date.now()
        chunks++
        output += delta
      }
    }
    const m = computeMetrics({ start, firstAt, last, chunks }, usage, chosen, model)
    recordRequest({ ...m, at: ranAt, ok: true, agent: agent.name })
    const run: AgentRun = {
      id: randomUUID(),
      at: ranAt,
      ok: true,
      backend: chosen,
      model,
      output: output.slice(0, OUTPUT_CAP),
      metrics: { ttftMs: m.ttftMs, tokensPerSec: m.tokensPerSec, completionTokens: m.completionTokens, durationMs: m.durationMs },
      trigger,
    }
    await recordRun(id, run)
    return run
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const m = computeMetrics({ start, firstAt, last: Date.now(), chunks }, usage, chosen, model)
    recordRequest({ ...m, at: ranAt, ok: false, agent: agent.name, error: message })
    const run: AgentRun = {
      id: randomUUID(),
      at: ranAt,
      ok: false,
      backend: chosen,
      model,
      output: output.slice(0, OUTPUT_CAP),
      error: message,
      metrics: { ttftMs: m.ttftMs, tokensPerSec: m.tokensPerSec, completionTokens: m.completionTokens, durationMs: m.durationMs },
      trigger,
    }
    await recordRun(id, run)
    return run
  }
}
