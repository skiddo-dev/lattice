import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { listAgents, createAgent } from '$lib/server/agents/store'
import { toListItem, parseCreate } from '$lib/server/agents/dto'

export const GET: RequestHandler = async () => {
  const agents = await listAgents()
  return json(agents.map(toListItem))
}

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw error(400, 'invalid JSON body')
  }
  const input = parseCreate(body)
  if (typeof input === 'string') throw error(400, input)
  const created = await createAgent(input)
  return json(toListItem(created), { status: 201 })
}
