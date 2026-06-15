import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { gpuExporterUrl } from '../config'
import { fetchWithTimeout } from '../util'
import type { TelemetryCard } from './types'

const execFileP = promisify(execFile)
const TIMEOUT_MS = 4_000

export interface GpuStat {
  name: string
  utilization: number | null // %
  memUsedMb: number | null
  memTotalMb: number | null
  tempC: number | null
}

/** Pure: parse one CSV row from
 *  `nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits`. */
export function parseNvidiaSmiCsv(line: string): GpuStat | null {
  const parts = line.split(',').map((s) => s.trim())
  if (parts.length < 5 || !parts[0]) return null
  const num = (s: string) => {
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  return {
    name: parts[0],
    utilization: num(parts[1]),
    memUsedMb: num(parts[2]),
    memTotalMb: num(parts[3]),
    tempC: num(parts[4]),
  }
}

/** Pure: normalize a GPU exporter's JSON. Accepts `{gpus:[...]}`, a bare array,
 *  or a single object, and tolerates a few common key spellings. */
export function normalizeExporterGpu(json: unknown): GpuStat[] {
  const arr: unknown[] = Array.isArray(json)
    ? json
    : Array.isArray((json as { gpus?: unknown[] } | null)?.gpus)
      ? (json as { gpus: unknown[] }).gpus
      : json && typeof json === 'object'
        ? [json]
        : []
  const pick = (o: Record<string, unknown>, keys: string[]): number | null => {
    for (const k of keys) {
      const v = o[k]
      if (typeof v === 'number' && Number.isFinite(v)) return v
    }
    return null
  }
  return arr.map((g) => {
    const o = (g ?? {}) as Record<string, unknown>
    return {
      name: typeof o.name === 'string' ? o.name : 'GPU',
      utilization: pick(o, ['utilization', 'util', 'gpu_util', 'utilization_gpu']),
      memUsedMb: pick(o, ['memUsedMb', 'mem_used', 'memory_used', 'memUsed']),
      memTotalMb: pick(o, ['memTotalMb', 'mem_total', 'memory_total', 'memTotal']),
      tempC: pick(o, ['tempC', 'temperature', 'temp', 'temperature_gpu']),
    }
  })
}

/** GPU card. Prefers a configured exporter (works over Tailscale to the rig);
 *  falls back to local nvidia-smi when Lattice runs on the GPU host; otherwise
 *  reports honestly that it isn't configured — never fabricates numbers. */
export async function fetchGpuCard(): Promise<TelemetryCard> {
  const url = gpuExporterUrl()
  if (url) {
    try {
      const res = await fetchWithTimeout(url, TIMEOUT_MS)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const gpus = normalizeExporterGpu(await res.json())
      return {
        id: 'gpu',
        label: 'GPU',
        status: 'ok',
        detail: `${gpus.length} GPU${gpus.length === 1 ? '' : 's'} · exporter`,
        data: { gpus, source: 'exporter' },
      }
    } catch (e) {
      return { id: 'gpu', label: 'GPU', status: 'unavailable', detail: e instanceof Error ? e.message : String(e) }
    }
  }

  try {
    const { stdout } = await execFileP(
      'nvidia-smi',
      [
        '--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu',
        '--format=csv,noheader,nounits',
      ],
      { timeout: TIMEOUT_MS },
    )
    const gpus = stdout
      .trim()
      .split('\n')
      .map(parseNvidiaSmiCsv)
      .filter((g): g is GpuStat => g !== null)
    if (!gpus.length) throw new Error('no GPU rows')
    return {
      id: 'gpu',
      label: 'GPU',
      status: 'ok',
      detail: `${gpus.length} GPU${gpus.length === 1 ? '' : 's'} · nvidia-smi`,
      data: { gpus, source: 'nvidia-smi' },
    }
  } catch {
    return {
      id: 'gpu',
      label: 'GPU',
      status: 'not_configured',
      detail: 'Set GPU_EXPORTER_URL, or run Lattice on a host with nvidia-smi.',
    }
  }
}
