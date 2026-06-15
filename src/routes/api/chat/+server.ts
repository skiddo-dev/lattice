import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { localConfig, cloudConfig } from '$lib/server/config'
import { resolveBackend, backendConfig, clientFor, probeHealth, pickModel, type Mode } from '$lib/server/llm'
import { computeMetrics, type Usage } from '$lib/server/metrics'
import { recordRequest } from '$lib/server/telemetry/history'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
interface ChatBody {
  messages: ChatMessage[]
  mode?: Mode
  model?: string
}

/**
 * Streams a chat completion from the routed backend as NDJSON: one JSON object
 * per line — {type:'start'}, many {type:'delta',text}, then {type:'metrics'}
 * (or {type:'error'}), then {type:'done'}. NDJSON keeps the client parser a
 * one-liner (split on '\n') versus full SSE framing. While proxying we meter
 * TTFT / tokens / tokens-per-sec and push the result into the history buffer.
 */
export const POST: RequestHandler = async ({ request }) => {
  let body: ChatBody
  try {
    body = (await request.json()) as ChatBody
  } catch {
    throw error(400, 'invalid JSON body')
  }
  const messages = Array.isArray(body.messages) ? body.messages : []
  if (!messages.length) throw error(400, 'messages required')
  const mode: Mode = body.mode === 'local' || body.mode === 'cloud' ? body.mode : 'auto'

  const local = localConfig()
  const cloud = cloudConfig()
  // Probe local only when auto-routing might pick it (forced 'cloud' skips it).
  const localHealth = mode === 'cloud' ? null : await probeHealth('local')
  const chosen = resolveBackend(mode, {
    local: { configured: local.configured, healthy: localHealth?.healthy ?? false },
    cloud: { configured: cloud.configured },
  })
  if (!chosen) {
    throw error(400, 'No backend configured — set LOCAL_LLM_BASE_URL or OPENAI_API_KEY.')
  }

  const cfg = backendConfig(chosen)
  const localModels = chosen === 'local' ? (localHealth ?? (await probeHealth('local'))).models : []
  const model = pickModel(cfg, body.model, localModels)
  const client = clientFor(cfg)

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      send({ type: 'start', backend: chosen, model })

      const start = Date.now()
      let firstAt: number | null = null
      let last = start
      let chunks = 0
      let usage: Usage | null = null
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
            send({ type: 'delta', text: delta })
          }
        }
        const metrics = computeMetrics({ start, firstAt, last, chunks }, usage, chosen, model)
        recordRequest({ ...metrics, at: new Date().toISOString(), ok: true })
        send({ type: 'metrics', metrics })
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        const metrics = computeMetrics({ start, firstAt, last: Date.now(), chunks }, usage, chosen, model)
        recordRequest({ ...metrics, at: new Date().toISOString(), ok: false, error: message })
        send({ type: 'error', message })
      } finally {
        send({ type: 'done' })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
