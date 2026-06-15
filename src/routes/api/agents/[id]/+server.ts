import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getAgent, updateAgent, deleteAgent } from '$lib/server/agents/store'
import { toDetail, parsePatch } from '$lib/server/agents/dto'

export const GET: RequestHandler = async ({ params }) => {
  const agent = await getAgent(params.id)
  if (!agent) throw error(404, 'agent not found')
  return json(toDetail(agent))
}

export const PATCH: RequestHandler = async ({ params, request }) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw error(400, 'invalid JSON body')
  }
  const patch = parsePatch(body)
  if (typeof patch === 'string') throw error(400, patch)
  const updated = await updateAgent(params.id, patch)
  if (!updated) throw error(404, 'agent not found')
  return json(toDetail(updated))
}

export const DELETE: RequestHandler = async ({ params }) => {
  const ok = await deleteAgent(params.id)
  if (!ok) throw error(404, 'agent not found')
  return json({ ok: true })
}
