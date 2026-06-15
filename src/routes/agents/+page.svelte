<script lang="ts">
  import { onMount } from 'svelte'
  import { fmtRelTime, fmtMs, fmtTokPerSec, fmtInt } from '$lib/format'
  import type { AgentListItem, AgentDetail, Schedule, Mode, ModelsResponse } from '$lib/types'

  let agents = $state<AgentListItem[]>([])
  let models = $state<ModelsResponse | null>(null)
  let loading = $state(true)
  let listErr = $state('')

  // Create / edit form
  type SchedKind = 'manual' | 'interval' | 'daily'
  function blankForm() {
    return {
      name: '',
      system: '',
      prompt: '',
      mode: 'auto' as Mode,
      model: '',
      schedKind: 'manual' as SchedKind,
      everyMinutes: 60,
      at: '09:00',
      enabled: true,
    }
  }
  let showForm = $state(false)
  let editingId = $state<string | null>(null)
  let f = $state(blankForm())
  let formErr = $state('')
  let saving = $state(false)

  // Expanded run history
  let expandedId = $state<string | null>(null)
  let detail = $state<AgentDetail | null>(null)
  let detailLoading = $state(false)
  let runningId = $state<string | null>(null)

  onMount(() => {
    load()
    loadModels()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  })

  async function load() {
    try {
      const r = await fetch('/api/agents')
      if (r.ok) {
        agents = await r.json()
        listErr = ''
      } else listErr = `HTTP ${r.status}`
    } catch (e) {
      listErr = e instanceof Error ? e.message : String(e)
    } finally {
      loading = false
    }
  }
  async function loadModels() {
    try {
      const r = await fetch('/api/models')
      if (r.ok) models = await r.json()
    } catch {
      /* picker just falls back to free-text default */
    }
  }

  const availableModels = $derived(
    f.mode === 'cloud' ? (models?.cloud.models ?? []) : f.mode === 'local' ? (models?.local.models ?? []) : [],
  )
  const localOk = $derived(models?.local.configured ?? true)
  const cloudOk = $derived(models?.cloud.configured ?? true)

  function setFormMode(m: Mode) {
    f.mode = m
    f.model = ''
  }

  function openCreate() {
    editingId = null
    f = blankForm()
    formErr = ''
    showForm = true
  }

  async function openEdit(a: AgentListItem) {
    editingId = a.id
    formErr = ''
    f = {
      name: a.name,
      system: '',
      prompt: a.promptPreview,
      mode: a.mode,
      model: a.model ?? '',
      schedKind: a.schedule.kind,
      everyMinutes: a.schedule.kind === 'interval' ? a.schedule.everyMinutes : 60,
      at: a.schedule.kind === 'daily' ? a.schedule.at : '09:00',
      enabled: a.enabled,
    }
    showForm = true
    // Pull the full prompt/system (the list only carries a preview).
    try {
      const r = await fetch(`/api/agents/${a.id}`)
      if (r.ok) {
        const d: AgentDetail = await r.json()
        if (editingId === a.id) {
          f.prompt = d.prompt
          f.system = d.system ?? ''
        }
      }
    } catch {
      /* keep the preview */
    }
  }

  function buildSchedule(): Schedule {
    if (f.schedKind === 'interval') return { kind: 'interval', everyMinutes: Math.max(1, Math.round(f.everyMinutes)) }
    if (f.schedKind === 'daily') return { kind: 'daily', at: f.at }
    return { kind: 'manual' }
  }

  async function errText(r: Response): Promise<string> {
    try {
      const j = await r.json()
      return j?.message || `HTTP ${r.status}`
    } catch {
      return `HTTP ${r.status}`
    }
  }

  async function save() {
    formErr = ''
    if (!f.name.trim()) {
      formErr = 'Name is required'
      return
    }
    if (!f.prompt.trim()) {
      formErr = 'Prompt is required'
      return
    }
    saving = true
    const payload = {
      name: f.name,
      system: f.system || undefined,
      prompt: f.prompt,
      mode: f.mode,
      model: f.model || undefined,
      schedule: buildSchedule(),
      enabled: f.enabled,
    }
    try {
      const url = editingId ? `/api/agents/${editingId}` : '/api/agents'
      const r = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) {
        formErr = await errText(r)
        return
      }
      showForm = false
      await load()
    } catch (e) {
      formErr = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }

  async function toggleEnabled(a: AgentListItem) {
    await fetch(`/api/agents/${a.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: !a.enabled }),
    })
    await load()
  }

  async function del(a: AgentListItem) {
    if (!confirm(`Delete agent "${a.name}"? This removes its run history too.`)) return
    await fetch(`/api/agents/${a.id}`, { method: 'DELETE' })
    if (expandedId === a.id) {
      expandedId = null
      detail = null
    }
    await load()
  }

  async function runNow(a: AgentListItem) {
    runningId = a.id
    try {
      const r = await fetch(`/api/agents/${a.id}/run`, { method: 'POST' })
      if (r.ok && expandedId === a.id) await loadDetail(a.id)
      await load()
    } finally {
      runningId = null
    }
  }

  async function toggleExpand(a: AgentListItem) {
    if (expandedId === a.id) {
      expandedId = null
      detail = null
      return
    }
    expandedId = a.id
    await loadDetail(a.id)
  }
  async function loadDetail(id: string) {
    detailLoading = true
    try {
      const r = await fetch(`/api/agents/${id}`)
      detail = r.ok ? await r.json() : null
    } finally {
      detailLoading = false
    }
  }

  function scheduleDesc(s: Schedule): string {
    if (s.kind === 'manual') return 'Manual only'
    if (s.kind === 'interval') return s.everyMinutes % 60 === 0 ? `Every ${s.everyMinutes / 60}h` : `Every ${s.everyMinutes} min`
    return `Daily at ${s.at}`
  }
  function fmtDur(ms: number): string {
    const m = Math.round(ms / 60000)
    if (m < 1) return '<1m'
    if (m < 60) return `${m}m`
    const h = Math.round(m / 60)
    if (h < 24) return `${h}h`
    return `${Math.round(h / 24)}d`
  }
  function nextRunDesc(a: AgentListItem): string {
    if (!a.enabled) return 'paused'
    if (a.nextRunAt == null) return 'manual'
    const d = a.nextRunAt - Date.now()
    return d <= 0 ? 'due now' : `in ${fmtDur(d)}`
  }
</script>

<div class="wrap">
  <header class="page-head">
    <div>
      <h1>Agents</h1>
      <p class="sub">Saved prompts that run on your rig — on a schedule or on demand.</p>
    </div>
    <button class="primary" onclick={openCreate}>New agent</button>
  </header>

  {#if showForm}
    <section class="card form">
      <h2>{editingId ? 'Edit agent' : 'New agent'}</h2>
      <label class="field">
        <span class="lbl">Name</span>
        <input bind:value={f.name} placeholder="Nightly standup summary" maxlength="120" />
      </label>

      <div class="field">
        <span class="lbl">Backend</span>
        <div class="row">
          <div class="seg" role="group" aria-label="Backend">
            <button type="button" class:on={f.mode === 'auto'} onclick={() => setFormMode('auto')}>Auto</button>
            <button type="button" class:on={f.mode === 'local'} onclick={() => setFormMode('local')} disabled={!localOk}>Local</button>
            <button type="button" class:on={f.mode === 'cloud'} onclick={() => setFormMode('cloud')} disabled={!cloudOk}>Cloud</button>
          </div>
          {#if f.mode === 'auto'}
            <span class="hint">model auto-picked</span>
          {:else}
            <select bind:value={f.model} aria-label="Model">
              <option value="">Auto-pick</option>
              {#each availableModels as mdl}<option value={mdl}>{mdl}</option>{/each}
            </select>
          {/if}
        </div>
      </div>

      <label class="field">
        <span class="lbl">System <span class="opt">(optional)</span></span>
        <textarea bind:value={f.system} rows="2" placeholder="You are a concise assistant…"></textarea>
      </label>

      <label class="field">
        <span class="lbl">Prompt</span>
        <textarea bind:value={f.prompt} rows="4" placeholder="Summarize today's commits in 5 bullets."></textarea>
      </label>

      <div class="field">
        <span class="lbl">Schedule</span>
        <div class="row">
          <select bind:value={f.schedKind} aria-label="Schedule type">
            <option value="manual">Manual only</option>
            <option value="interval">Every N minutes</option>
            <option value="daily">Daily at…</option>
          </select>
          {#if f.schedKind === 'interval'}
            <label class="inline">every <input class="num" type="number" min="1" bind:value={f.everyMinutes} /> min</label>
          {:else if f.schedKind === 'daily'}
            <label class="inline">at <input type="time" bind:value={f.at} /></label>
          {/if}
        </div>
      </div>

      <label class="check">
        <input type="checkbox" bind:checked={f.enabled} />
        <span>Enabled</span>
      </label>

      {#if formErr}<p class="err">⚠ {formErr}</p>{/if}

      <div class="form-actions">
        <button class="secondary" onclick={() => (showForm = false)} disabled={saving}>Cancel</button>
        <button class="primary" onclick={save} disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create agent'}</button>
      </div>
    </section>
  {/if}

  {#if loading}
    <p class="empty">Loading…</p>
  {:else if listErr}
    <p class="empty err">⚠ {listErr}</p>
  {:else if !agents.length}
    <div class="card empty-card">
      <p class="big">No agents yet.</p>
      <p class="empty">Create one to put your idle rig to work — a nightly summary, a recurring check, anything.</p>
    </div>
  {:else}
    <div class="list">
      {#each agents as a (a.id)}
        <section class="card agent">
          <div class="agent-main">
            <button class="toggle {a.enabled ? 'on' : ''}" onclick={() => toggleEnabled(a)} title={a.enabled ? 'Enabled — click to pause' : 'Paused — click to enable'} aria-label="Toggle enabled">
              <span class="knob"></span>
            </button>
            <div class="agent-body">
              <div class="agent-top">
                <span class="name">{a.name}</span>
                <span class="route {a.mode}">{a.mode}</span>
                {#if a.model}<span class="meta mono">{a.model}</span>{/if}
              </div>
              <p class="prompt">{a.promptPreview}</p>
              <div class="metaline">
                <span class="chip-s">{scheduleDesc(a.schedule)}</span>
                <span class="dot">·</span>
                <span>next {nextRunDesc(a)}</span>
                <span class="dot">·</span>
                {#if a.lastStatus}
                  <span class="last {a.lastStatus}">last {a.lastStatus === 'ok' ? 'ran' : 'failed'} {a.lastRunAt ? fmtRelTime(new Date(a.lastRunAt).toISOString()) : ''}</span>
                {:else}
                  <span class="muted">never run</span>
                {/if}
                {#if a.runCount}<span class="dot">·</span><button class="link" onclick={() => toggleExpand(a)}>{expandedId === a.id ? 'hide' : `${a.runCount} run${a.runCount > 1 ? 's' : ''}`}</button>{/if}
              </div>
            </div>
            <div class="agent-actions">
              <button class="secondary sm" onclick={() => runNow(a)} disabled={runningId === a.id}>{runningId === a.id ? 'Running…' : 'Run now'}</button>
              <button class="ghost sm" onclick={() => openEdit(a)}>Edit</button>
              <button class="ghost sm danger" onclick={() => del(a)}>Delete</button>
            </div>
          </div>

          {#if expandedId === a.id}
            <div class="runs">
              {#if detailLoading && !detail}
                <p class="empty">Loading runs…</p>
              {:else if detail && detail.runs.length}
                {#each [...detail.runs].reverse() as run (run.id)}
                  <div class="run" class:bad={!run.ok}>
                    <div class="run-head">
                      <span class="route {run.backend ?? ''}">{run.backend ?? '—'}</span>
                      <span class="meta mono">{run.model}</span>
                      <span class="meta">{run.trigger}</span>
                      <span class="spacer"></span>
                      {#if run.ok}
                        <span class="meta">{fmtInt(run.metrics.completionTokens)} tok</span>
                        <span class="meta accent">{fmtTokPerSec(run.metrics.tokensPerSec)}</span>
                        <span class="meta">TTFT {fmtMs(run.metrics.ttftMs)}</span>
                      {/if}
                      <span class="meta">{fmtRelTime(run.at)}</span>
                    </div>
                    {#if run.ok}
                      <pre class="output">{run.output || '(empty response)'}</pre>
                    {:else}
                      <p class="err">⚠ {run.error}</p>
                    {/if}
                  </div>
                {/each}
              {:else}
                <p class="empty">No runs recorded yet.</p>
              {/if}
            </div>
          {/if}
        </section>
      {/each}
    </div>
  {/if}
</div>

<style>
  .wrap { width: 100%; max-width: 880px; margin: 0 auto; padding: 18px; }
  .page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .page-head h1 { font-size: var(--font-2xl); }
  .page-head .sub { color: var(--text-muted); font-size: var(--font-sm); margin-top: 2px; }

  .form { padding: 18px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 14px; }
  .form h2 { font-size: var(--font-lg); }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .lbl { font-size: var(--font-sm); font-weight: 600; color: var(--text-soft); }
  .opt { color: var(--text-faint); font-weight: 400; }
  .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .hint { font-size: var(--font-xs); color: var(--text-faint); }
  .inline { display: inline-flex; align-items: center; gap: 6px; font-size: var(--font-sm); color: var(--text-muted); }
  .num { width: 76px; }
  .check { display: inline-flex; align-items: center; gap: 8px; font-size: var(--font-sm); }
  .check input { width: 16px; height: 16px; }
  .form-actions { display: flex; justify-content: flex-end; gap: 8px; }

  .seg { display: inline-flex; background: var(--border-soft); border-radius: var(--radius-md); padding: 2px; gap: 2px; }
  .seg button { padding: 5px 14px; font-size: var(--font-sm); font-weight: 600; background: transparent; border: none; color: var(--text-muted); border-radius: var(--radius-sm); }
  .seg button.on { background: var(--card-bg); color: var(--primary-text); box-shadow: var(--shadow); }
  .seg button:disabled { opacity: 0.4; }

  .list { display: flex; flex-direction: column; gap: 12px; }
  .agent { padding: 14px 16px; }
  .agent-main { display: flex; gap: 12px; align-items: flex-start; }
  .agent-body { flex: 1; min-width: 0; }
  .agent-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .name { font-weight: 700; font-size: var(--font-md); }
  .prompt { color: var(--text-muted); font-size: var(--font-sm); margin: 4px 0 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .metaline { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; font-size: var(--font-xs); color: var(--text-muted); }
  .chip-s { font-weight: 600; color: var(--text-body); }
  .dot { color: var(--text-faint); }
  .last.ok { color: var(--success); }
  .last.error { color: var(--danger); }
  .link { background: none; border: none; padding: 0; color: var(--link); font-size: var(--font-xs); font-weight: 600; text-decoration: underline; }

  .agent-actions { display: flex; flex-direction: column; gap: 6px; flex: none; }
  .sm { padding: 4px 11px; font-size: var(--font-xs); }
  .danger { color: var(--danger); }
  .danger:hover { background: var(--danger-bg-subtle); }

  /* Toggle switch */
  .toggle { flex: none; width: 38px; height: 22px; border-radius: var(--radius-pill); background: var(--border); border: none; padding: 2px; transition: background var(--speed) ease; margin-top: 2px; }
  .toggle.on { background: var(--success-vivid); }
  .toggle .knob { display: block; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: var(--shadow); transition: transform var(--speed) ease; }
  .toggle.on .knob { transform: translateX(16px); }

  .route { font-size: var(--font-2xs); font-weight: 700; padding: 1px 8px; border-radius: var(--radius-pill); background: var(--chip-bg); color: var(--primary-text); text-transform: uppercase; }
  .route.local { background: var(--success-bg); color: var(--success); }
  .route.cloud { background: var(--info-bg); color: var(--info); }
  .meta { color: var(--text-muted); font-size: var(--font-xs); }
  .meta.accent { color: var(--success); font-weight: 700; }

  .runs { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-soft); display: flex; flex-direction: column; gap: 10px; }
  .run { border: 1px solid var(--border-soft); border-radius: var(--radius-md); padding: 9px 11px; }
  .run.bad { border-color: var(--danger-border); background: var(--danger-bg-subtle); }
  .run-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
  .spacer { flex: 1; }
  .output { white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: var(--font-xs); color: var(--text-body); background: var(--bg); border-radius: var(--radius-sm); padding: 8px 10px; max-height: 240px; overflow: auto; }

  .empty { color: var(--text-muted); font-size: var(--font-sm); padding: 6px 0; }
  .empty-card { padding: 28px; text-align: center; }
  .big { font-size: var(--font-lg); font-weight: 600; margin-bottom: 6px; }
  .err { color: var(--danger); font-size: var(--font-sm); }

  @media (max-width: 620px) {
    .agent-main { flex-wrap: wrap; }
    .agent-actions { flex-direction: row; width: 100%; }
  }
</style>
