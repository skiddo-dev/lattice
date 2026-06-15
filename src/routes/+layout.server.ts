import type { LayoutServerLoad } from './$types'
import { configStatus } from '$lib/server/config'

// Surface what's wired up so the layout can show a "what to set" banner instead
// of letting an unconfigured backend fail silently.
export const load: LayoutServerLoad = async () => ({ config: configStatus() })
