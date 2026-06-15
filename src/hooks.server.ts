import { startScheduler } from '$lib/server/agents/scheduler'

// Runs once when the server module loads (boot). Starts the agent scheduler so
// scheduled jobs fire even when nobody has the UI open. Idempotent + HMR-safe.
startScheduler()
