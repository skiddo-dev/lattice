import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getAgent } from '$lib/server/agents/store'
import { runAgent } from '$lib/server/agents/run'

/** Run an agent immediately and return the resulting run (output + metrics).
 *  Holds the connection for the duration of the completion. */
export const POST: RequestHandler = async ({ params }) => {
  const agent = await getAgent(params.id)
  if (!agent) throw error(404, 'agent not found')
  const run = await runAgent(params.id, 'manual')
  return json(run)
}
