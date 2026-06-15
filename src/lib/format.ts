// Pure display formatters — shared by the chat + telemetry UI and unit-tested.

export function fmtBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i === 0 || n >= 100 ? 0 : 1)} ${units[i]}`
}

export function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`
}

export function fmtTokPerSec(t: number | null | undefined): string {
  return t == null ? '—' : `${t.toFixed(1)} tok/s`
}

export function fmtInt(n: number | null | undefined): string {
  return n == null ? '—' : Math.round(n).toLocaleString()
}

/** Compact relative time ("just now", "3m ago", "2h ago"). */
export function fmtRelTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return '—'
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}
