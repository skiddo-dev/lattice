<script lang="ts">
  import { onMount } from 'svelte'
  import Chart from '$lib/components/Chart.svelte'
  import { fmtBytes, fmtMs, fmtTokPerSec, fmtInt, fmtRelTime } from '$lib/format'
  import type { TelemetrySnapshot, TelemetryCard } from '$lib/types'
  import type { ChartData, ChartOptions } from 'chart.js'

  let snap = $state<TelemetrySnapshot | null>(null)
  let err = $state('')

  async function poll() {
    try {
      const r = await fetch('/api/telemetry')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      snap = await r.json()
      err = ''
    } catch (e) {
      err = e instanceof Error ? e.message : String(e)
    }
  }

  onMount(() => {
    poll()
    const t = setInterval(poll, 2000)
    return () => clearInterval(t)
  })

  function card(id: string): TelemetryCard | undefined {
    return snap?.cards.find((c) => c.id === id)
  }

  const backends = $derived(
    (card('backends')?.data?.backends as
      | { id: string; label: string; configured: boolean; healthy?: boolean; latencyMs?: number | null; models?: number; error?: string }[]
      | undefined) ?? [],
  )

  const ollama = $derived(card('ollama'))
  const loaded = $derived((ollama?.data?.loaded as { name: string; sizeBytes: number; sizeVram: number }[] | undefined) ?? [])
  const installed = $derived((ollama?.data?.installed as number | undefined) ?? 0)

  const gpu = $derived(card('gpu'))
  const gpus = $derived((gpu?.data?.gpus as { name: string; utilization: number | null; memUsedMb: number | null; memTotalMb: number | null; tempC: number | null }[] | undefined) ?? [])

  // VRAM bar denominator: real GPU total if we have it, else the largest loaded model.
  const vramDenom = $derived(
    gpus[0]?.memTotalMb ? gpus[0].memTotalMb * 1024 * 1024 : Math.max(1, ...loaded.map((m) => m.sizeVram || 0)),
  )

  // tokens/sec across recent OK requests, oldest → newest for the trend line.
  const tps = $derived((snap?.recent ?? []).filter((r) => r.ok && r.tokensPerSec != null).slice().reverse())
  const chartData = $derived<ChartData<'line', number[], string>>({
    labels: tps.map((_, i) => `#${i + 1}`),
    datasets: [
      {
        label: 'tokens/sec',
        data: tps.map((r) => r.tokensPerSec as number),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.12)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: tps.map((r) => (r.backend === 'local' ? '#10b981' : '#1d4ed8')),
      },
    ],
  })
  // Chart.svelte re-applies themed axis/grid ink on a light/dark toggle, so these
  // options are theme-independent.
  const chartOpts = $derived<ChartOptions<'line'>>({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${(c.parsed.y as number).toFixed(1)} tok/s — ${tps[c.dataIndex]?.backend ?? ''} · ${tps[c.dataIndex]?.model ?? ''}` } } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: { beginAtZero: true, ticks: { font: { size: 10 } } },
    },
  })

  function statusWord(c: TelemetryCard | undefined): string {
    if (!c) return '…'
    return c.status === 'ok' ? 'live' : c.status === 'not_configured' ? 'not set' : 'unreachable'
  }
</script>

<div class="wrap">
  <header class="page-head">
    <div>
      <h1>Telemetry</h1>
      <p class="sub">Your rig, live. Updates every 2 seconds.</p>
    </div>
    <span class="refreshed">
      {#if err}<span class="bad">⚠ {err}</span>{:else if snap}updated {fmtRelTime(snap.refreshedAt)}{:else}connecting…{/if}
    </span>
  </header>

  <div class="grid">
    <!-- Backends -->
    <section class="card pad">
      <div class="card-head"><h2>Backends</h2><span class="pill st-{card('backends')?.status ?? ''}">{statusWord(card('backends'))}</span></div>
      <div class="backends">
        {#each backends as b}
          <div class="backend">
            <span class="lamp {b.configured ? (b.healthy ? 'up' : 'down') : 'off'}"></span>
            <span class="bname">{b.label}</span>
            {#if !b.configured}
              <span class="bmeta">not configured</span>
            {:else if b.healthy}
              <span class="bmeta">{fmtMs(b.latencyMs)}{#if b.models != null} · {b.models} models{/if}</span>
            {:else}
              <span class="bmeta bad">{b.error ?? 'unreachable'}</span>
            {/if}
          </div>
        {/each}
        {#if !backends.length}<p class="empty">No backends configured.</p>{/if}
      </div>
    </section>

    <!-- Ollama runtime -->
    <section class="card pad">
      <div class="card-head"><h2>Ollama runtime</h2><span class="pill st-{ollama?.status ?? ''}">{statusWord(ollama)}</span></div>
      {#if ollama?.status === 'ok'}
        <p class="rt-meta">{loaded.length} resident · {installed} installed</p>
        {#if loaded.length}
          <div class="bars">
            {#each loaded as m}
              <div class="bar-row">
                <div class="bar-top"><span class="mono name">{m.name}</span><span class="vram mono">{fmtBytes(m.sizeVram || m.sizeBytes)}</span></div>
                <div class="track"><div class="fill" style:width="{Math.min(100, ((m.sizeVram || m.sizeBytes) / vramDenom) * 100)}%"></div></div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="empty">Idle — no model resident. Send a chat to load one.</p>
        {/if}
      {:else}
        <p class="empty">{ollama?.detail ?? 'unavailable'}</p>
      {/if}
    </section>

    <!-- GPU -->
    <section class="card pad">
      <div class="card-head"><h2>GPU</h2><span class="pill st-{gpu?.status ?? ''}">{statusWord(gpu)}</span></div>
      {#if gpu?.status === 'ok' && gpus.length}
        {#each gpus as g}
          <div class="gpu">
            <div class="bar-top"><span class="name">{g.name}</span>{#if g.tempC != null}<span class="vram">{g.tempC}°C</span>{/if}</div>
            {#if g.utilization != null}
              <div class="gpu-line"><span class="glabel">util</span><div class="track"><div class="fill gpu-fill" style:width="{g.utilization}%"></div></div><span class="gval mono">{g.utilization}%</span></div>
            {/if}
            {#if g.memUsedMb != null && g.memTotalMb != null}
              <div class="gpu-line"><span class="glabel">vram</span><div class="track"><div class="fill" style:width="{(g.memUsedMb / g.memTotalMb) * 100}%"></div></div><span class="gval mono">{fmtBytes(g.memUsedMb * 1024 * 1024)} / {fmtBytes(g.memTotalMb * 1024 * 1024)}</span></div>
            {/if}
          </div>
        {/each}
      {:else}
        <p class="empty">{gpu?.detail ?? 'unavailable'}</p>
      {/if}
    </section>

    <!-- Throughput chart -->
    <section class="card pad span2">
      <div class="card-head"><h2>Throughput</h2><span class="muted small">last {tps.length} request{tps.length === 1 ? '' : 's'}</span></div>
      {#if tps.length}
        <div class="canvas"><Chart type="line" data={chartData} options={chartOpts} /></div>
      {:else}
        <p class="empty">No requests yet — send a message on the <a href="/">Chat</a> tab and the throughput trend appears here.</p>
      {/if}
    </section>

    <!-- Recent requests -->
    <section class="card pad span2">
      <div class="card-head"><h2>Recent requests</h2></div>
      {#if snap?.recent?.length}
        <div class="table-wrap">
          <table>
            <thead><tr><th>when</th><th>route</th><th>model</th><th class="num">tok</th><th class="num">tok/s</th><th class="num">TTFT</th><th class="num">total</th></tr></thead>
            <tbody>
              {#each snap.recent as r}
                <tr class:rowerr={!r.ok}>
                  <td>{fmtRelTime(r.at)}</td>
                  <td><span class="route {r.backend}">{r.backend}</span></td>
                  <td class="mono modelcell">{r.model}{#if !r.ok}<span class="bad"> · failed</span>{/if}</td>
                  <td class="num">{fmtInt(r.completionTokens)}</td>
                  <td class="num accent">{fmtTokPerSec(r.tokensPerSec)}</td>
                  <td class="num">{fmtMs(r.ttftMs)}</td>
                  <td class="num">{fmtMs(r.durationMs)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="empty">No requests recorded yet.</p>
      {/if}
    </section>
  </div>
</div>

<style>
  .wrap { width: 100%; max-width: 1040px; margin: 0 auto; padding: 18px; }
  .page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .page-head h1 { font-size: var(--font-2xl); }
  .page-head .sub { color: var(--text-muted); font-size: var(--font-sm); margin-top: 2px; }
  .refreshed { font-size: var(--font-xs); color: var(--text-faint); white-space: nowrap; padding-top: 6px; }

  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
  .span2 { grid-column: 1 / -1; }
  .pad { padding: 16px; }
  .card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .card-head h2 { font-size: var(--font-lg); }

  .pill { text-transform: uppercase; letter-spacing: 0.04em; font-size: var(--font-2xs); }
  .st-ok { background: var(--success-bg); color: var(--success); }
  .st-unavailable { background: var(--danger-bg); color: var(--danger); }
  .st-not_configured { background: var(--warning-bg); color: var(--warning); }

  .backends { display: flex; flex-direction: column; gap: 10px; }
  .backend { display: flex; align-items: center; gap: 10px; }
  .lamp { width: 9px; height: 9px; border-radius: 50%; flex: none; }
  .lamp.up { background: var(--success-vivid); box-shadow: 0 0 0 3px color-mix(in srgb, var(--success-vivid) 18%, transparent); }
  .lamp.down { background: var(--danger); }
  .lamp.off { background: var(--text-faint); }
  .bname { font-weight: 600; }
  .bmeta { color: var(--text-muted); font-size: var(--font-sm); margin-left: auto; }
  .bad { color: var(--danger); }

  .rt-meta { color: var(--text-muted); font-size: var(--font-sm); margin-bottom: 12px; }
  .bars, .gpu { display: flex; flex-direction: column; gap: 12px; }
  .bar-top { display: flex; justify-content: space-between; gap: 8px; font-size: var(--font-sm); margin-bottom: 4px; }
  .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vram { color: var(--text-muted); flex: none; }
  .track { height: 8px; border-radius: var(--radius-pill); background: var(--border-soft); overflow: hidden; }
  .fill { height: 100%; border-radius: var(--radius-pill); background: var(--mesh); transition: width var(--speed-slow) ease; }
  .gpu-fill { background: linear-gradient(90deg, var(--success-vivid), var(--warning)); }
  .gpu-line { display: grid; grid-template-columns: 36px 1fr auto; align-items: center; gap: 8px; }
  .glabel { font-size: var(--font-2xs); text-transform: uppercase; color: var(--text-faint); font-weight: 700; }
  .gval { font-size: var(--font-xs); color: var(--text-muted); white-space: nowrap; }

  .canvas { height: 240px; }

  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: var(--font-sm); }
  th { text-align: left; color: var(--text-faint); font-size: var(--font-2xs); text-transform: uppercase; letter-spacing: 0.04em; padding: 4px 8px; border-bottom: 1px solid var(--border); }
  td { padding: 7px 8px; border-bottom: 1px solid var(--border-soft); color: var(--text-body); }
  .num { text-align: right; white-space: nowrap; }
  .accent { color: var(--success); font-weight: 600; }
  .modelcell { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rowerr td { opacity: 0.7; }
  .route { font-size: var(--font-2xs); font-weight: 700; padding: 1px 7px; border-radius: var(--radius-pill); background: var(--chip-bg); color: var(--primary-text); text-transform: uppercase; }
  .route.local { background: var(--success-bg); color: var(--success); }
  .route.cloud { background: var(--info-bg); color: var(--info); }

  .empty { color: var(--text-muted); font-size: var(--font-sm); padding: 6px 0; }
  .small { font-size: var(--font-xs); }

  @media (max-width: 720px) {
    .grid { grid-template-columns: 1fr; }
    .span2 { grid-column: auto; }
  }
</style>
