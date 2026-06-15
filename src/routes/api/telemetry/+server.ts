import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getTelemetry } from '$lib/server/telemetry'

/** Live telemetry snapshot. The client polls this ~2s; providers are bounded
 *  and degrade independently, so it always returns quickly. */
export const GET: RequestHandler = async () => {
  return json(await getTelemetry(), { headers: { 'cache-control': 'no-store' } })
}
