import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { localConfig, cloudConfig } from '$lib/server/config'
import { probeHealth } from '$lib/server/llm'

// A short curated cloud list for the picker. Cloud /models is large and noisy
// (embeddings, audio, deprecated snapshots), so we don't proxy it — these are
// the chat models worth offering. The configured default is always surfaced first.
const CLOUD_CHAT_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'o4-mini']

/** Populates the backend/model picker: live local models + a curated cloud list.
 *  Each backend degrades independently. */
export const GET: RequestHandler = async () => {
  const local = localConfig()
  const cloud = cloudConfig()

  let localOut: { configured: boolean; healthy: boolean; models: string[]; error?: string }
  if (!local.configured) {
    localOut = { configured: false, healthy: false, models: [] }
  } else {
    const h = await probeHealth('local')
    localOut = h.healthy
      ? { configured: true, healthy: true, models: h.models }
      : { configured: true, healthy: false, models: [], error: h.error ?? 'unreachable' }
  }

  const cloudOut = cloud.configured
    ? {
        configured: true,
        models: [
          cloud.defaultModel ?? 'gpt-4o-mini',
          ...CLOUD_CHAT_MODELS.filter((m) => m !== cloud.defaultModel),
        ].filter((m): m is string => !!m),
      }
    : { configured: false, models: [] as string[] }

  return json({ local: localOut, cloud: cloudOut })
}
