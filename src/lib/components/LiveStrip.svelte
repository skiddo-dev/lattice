<script lang="ts">
  import { onMount } from 'svelte'
  import type { TelemetrySnapshot } from '$lib/types'
  import { fmtBytes, fmtTokPerSec } from '$lib/format'

  // Polls the telemetry endpoint ~2s and shows a glanceable live readout above
  // the chat: what's loaded on the rig, VRAM resident, last throughput, GPU%.
  let snap = $state<TelemetrySnapshot | null>(null)
  let live = $state(false)

  async function poll() {
    try {
      const r = await fetch('/api/telemetry')
      if (r.ok) {
        snap = await r.json()
        live = true
      } else {
        live = false
      }
    } catch {
      live = false
    }
  }

  onMount(() => {
    poll()
    const t = setInterval(poll, 2000)
    return () => clearInterval(t)
  })

  const ollama = $derived(snap?.cards.find((c) => c.id === 'ollama'))
  const loaded = $derived((ollama?.data?.loaded as { name: string; sizeVram: number }[] | undefined) ?? [])
  const vram = $derived((ollama?.data?.vramBytes as number | undefined) ?? 0)
  const gpu = $derived(snap?.cards.find((c) => c.id === 'gpu'))
  const gpuStat = $derived((gpu?.data?.gpus as { utilization: number | null }[] | undefined)?.[0] ?? null)
  const lastTps = $derived(
    snap?.recent?.find((r) => r.ok && r.tokensPerSec != null)?.tokensPerSec ?? null,
  )
</script>

<div class="strip" class:live>
  <span class="lamp" aria-hidden="true"></span>
  {#if loaded.length}
    <span class="chip"><span class="k">loaded</span> <span class="mono v">{loaded[0].name}</span>{#if loaded.length > 1}<span class="more">+{loaded.length - 1}</span>{/if}</span>
    <span class="chip"><span class="k">vram</span> <span class="mono v">{fmtBytes(vram)}</span></span>
  {:else if ollama?.status === 'ok'}
    <span class="chip idle">rig idle · no model resident</span>
  {:else}
    <span class="chip idle">{ollama?.status === 'not_configured' ? 'local backend not set' : 'rig unreachable'}</span>
  {/if}

  <span class="chip"><span class="k">last</span> <span class="mono v">{fmtTokPerSec(lastTps)}</span></span>

  {#if gpuStat?.utilization != null}
    <span class="chip"><span class="k">gpu</span> <span class="mono v">{gpuStat.utilization}%</span></span>
  {:else}
    <span class="chip idle" title={gpu?.detail}>gpu —</span>
  {/if}
</div>

<style>
  .strip {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 7px 12px;
    border: 1px solid var(--border-card);
    border-radius: var(--radius-pill);
    background: var(--card-bg);
    box-shadow: var(--shadow);
    font-size: var(--font-xs);
  }
  .lamp {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--text-faint);
    flex: none;
    transition: background var(--speed) ease;
  }
  .strip.live .lamp {
    background: var(--success-vivid);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--success-vivid) 60%, transparent);
    animation: pulse 2s ease-out infinite;
  }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--success-vivid) 55%, transparent); }
    70% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--success-vivid) 0%, transparent); }
    100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--success-vivid) 0%, transparent); }
  }
  .chip { display: inline-flex; align-items: center; gap: 5px; color: var(--text-body); }
  .chip .k { color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.04em; font-size: var(--font-2xs); font-weight: 700; }
  .chip .v { font-weight: 600; }
  .chip.idle { color: var(--text-muted); }
  .more { color: var(--text-faint); font-weight: 600; }
</style>
