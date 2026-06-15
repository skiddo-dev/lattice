<script lang="ts">
  import { onMount, tick } from 'svelte'
  import LiveStrip from '$lib/components/LiveStrip.svelte'
  import { fmtMs, fmtTokPerSec, fmtInt } from '$lib/format'
  import type { ChatFrame, ChatMetrics, ModelsResponse, Mode, BackendId } from '$lib/types'

  interface UiMsg {
    role: 'user' | 'assistant'
    content: string
    backend?: BackendId
    model?: string
    metrics?: ChatMetrics
    error?: string
    streaming?: boolean
  }

  let messages = $state<UiMsg[]>([])
  let input = $state('')
  let mode = $state<Mode>('auto')
  let model = $state('')
  let sending = $state(false)
  let models = $state<ModelsResponse | null>(null)
  let thread: HTMLDivElement

  const EXAMPLES = [
    'Explain what makes a control plane different from a data plane.',
    'Write a haiku about a GPU that finally has something to do.',
    'Summarize the tradeoffs of running models locally vs. in the cloud.',
  ]

  onMount(loadModels)

  async function loadModels() {
    try {
      const r = await fetch('/api/models')
      if (r.ok) models = await r.json()
    } catch {
      /* the banner already covers an unconfigured backend */
    }
  }

  const availableModels = $derived(
    mode === 'cloud'
      ? (models?.cloud.models ?? [])
      : mode === 'local'
        ? (models?.local.models ?? [])
        : [],
  )
  const localOk = $derived(models?.local.configured ?? true)
  const cloudOk = $derived(models?.cloud.configured ?? true)

  function setMode(m: Mode) {
    mode = m
    model = '' // model lists differ per backend; fall back to auto-pick
  }

  async function scrollToBottom() {
    await tick()
    if (thread) thread.scrollTop = thread.scrollHeight
  }

  async function send(promptText?: string) {
    const text = (promptText ?? input).trim()
    if (!text || sending) return
    input = ''

    const outgoing = messages
      .filter((m) => m.content && !m.error)
      .map((m) => ({ role: m.role, content: m.content }))
    outgoing.push({ role: 'user', content: text })

    messages.push({ role: 'user', content: text })
    // Push the placeholder, then mutate THROUGH the $state array (messages[idx]).
    // Holding the raw object reference and mutating `asst.x` would bypass Svelte
    // 5's proxy set-trap, so streamed deltas wouldn't trigger a re-render.
    messages.push({ role: 'assistant', content: '', streaming: true })
    const idx = messages.length - 1
    sending = true
    await scrollToBottom()

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: outgoing, mode, model: model || undefined }),
      })
      if (!res.ok || !res.body) {
        let msg = `HTTP ${res.status}`
        try {
          const j = await res.json()
          if (j?.message) msg = j.message
        } catch {
          /* keep the status line */
        }
        messages[idx].error = msg
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          let frame: ChatFrame
          try {
            frame = JSON.parse(line) as ChatFrame
          } catch {
            continue
          }
          if (frame.type === 'start') {
            messages[idx].backend = frame.backend
            messages[idx].model = frame.model
          } else if (frame.type === 'delta') {
            messages[idx].content += frame.text
            await scrollToBottom()
          } else if (frame.type === 'metrics') {
            messages[idx].metrics = frame.metrics
          } else if (frame.type === 'error') {
            messages[idx].error = frame.message
          }
        }
      }
    } catch (e) {
      messages[idx].error = e instanceof Error ? e.message : String(e)
    } finally {
      messages[idx].streaming = false
      sending = false
      await scrollToBottom()
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function newChat() {
    if (sending) return
    messages = []
  }
</script>

<div class="chat">
  <div class="topbar">
    <LiveStrip />
    {#if messages.length}
      <button class="ghost newchat" onclick={newChat} disabled={sending}>New chat</button>
    {/if}
  </div>

  <div class="thread" bind:this={thread}>
    {#if !messages.length}
      <div class="hero">
        <div class="hero-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="40" height="40">
            <g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
              <path d="M5 5h14M5 12h14M5 19h14M5 5v14M12 5v14M19 5v14" opacity="0.5" />
            </g>
            <g fill="currentColor">
              <circle cx="5" cy="5" r="1.8" /><circle cx="19" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
            </g>
          </svg>
        </div>
        <h1>Talk to your rig</h1>
        <p class="sub">
          Lattice routes each message to your local model when it's up, and falls back to the cloud
          when it isn't. Watch which backend answers — and how fast — in real time.
        </p>
        <div class="examples">
          {#each EXAMPLES as ex}
            <button class="example" onclick={() => send(ex)}>{ex}</button>
          {/each}
        </div>
      </div>
    {:else}
      {#each messages as m (m)}
        <div class="msg {m.role}">
          <div class="bubble" class:err={!!m.error}>
            {#if m.content}<div class="content">{m.content}</div>{/if}
            {#if m.streaming && !m.content}<span class="typing"><span></span><span></span><span></span></span>{/if}
            {#if m.error}<div class="err-text">⚠ {m.error}</div>{/if}
          </div>
          {#if m.role === 'assistant' && (m.metrics || m.backend)}
            <div class="chiprow">
              <span class="route {m.backend ?? ''}">{m.backend === 'local' ? '⌂ local' : m.backend === 'cloud' ? '☁ cloud' : 'routed'}</span>
              {#if m.model}<span class="meta mono">{m.model}</span>{/if}
              {#if m.metrics}
                {#if m.metrics.completionTokens != null}<span class="meta">{fmtInt(m.metrics.completionTokens)} tok</span>{/if}
                <span class="meta accent">{fmtTokPerSec(m.metrics.tokensPerSec)}</span>
                <span class="meta">TTFT {fmtMs(m.metrics.ttftMs)}</span>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <div class="composer">
    <div class="controls">
      <div class="seg" role="group" aria-label="Routing mode">
        <button class:on={mode === 'auto'} onclick={() => setMode('auto')}>Auto</button>
        <button class:on={mode === 'local'} onclick={() => setMode('local')} disabled={!localOk} title={localOk ? '' : 'Set LOCAL_LLM_BASE_URL'}>Local</button>
        <button class:on={mode === 'cloud'} onclick={() => setMode('cloud')} disabled={!cloudOk} title={cloudOk ? '' : 'Set OPENAI_API_KEY'}>Cloud</button>
      </div>
      {#if mode === 'auto'}
        <span class="auto-note">model auto-picked</span>
      {:else}
        <select bind:value={model} aria-label="Model">
          <option value="">Auto-pick</option>
          {#each availableModels as mdl}
            <option value={mdl}>{mdl}</option>
          {/each}
        </select>
      {/if}
    </div>
    <div class="inputrow">
      <textarea
        bind:value={input}
        onkeydown={onKeydown}
        rows="1"
        placeholder="Message your models…  (Enter to send, Shift+Enter for newline)"
      ></textarea>
      <button class="primary send" onclick={() => send()} disabled={sending || !input.trim()}>
        {sending ? '…' : 'Send'}
      </button>
    </div>
  </div>
</div>

<style>
  .chat { flex: 1; min-height: 0; display: flex; flex-direction: column; max-width: 860px; width: 100%; margin: 0 auto; }

  .topbar { display: flex; align-items: center; gap: 10px; padding: 12px 18px 4px; }
  .topbar :global(.strip) { flex: 1; }
  .newchat { flex: none; font-size: var(--font-sm); color: var(--text-muted); }

  .thread { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 18px 8px; display: flex; flex-direction: column; gap: 16px; }

  /* Empty-state hero */
  .hero { margin: auto; text-align: center; max-width: 560px; padding: 24px 0; }
  .hero-mark { display: grid; place-items: center; width: 72px; height: 72px; margin: 0 auto 14px; border-radius: var(--radius-xl); color: #fff; background: var(--mesh); box-shadow: var(--glow-primary); }
  .hero h1 { font-size: var(--font-2xl); margin-bottom: 8px; }
  .hero .sub { color: var(--text-muted); font-size: var(--font-md); line-height: 1.55; margin-bottom: 22px; }
  .examples { display: flex; flex-direction: column; gap: 8px; }
  .example { text-align: left; background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 11px 14px; color: var(--text-body); font-weight: 500; transition: all var(--speed) ease; }
  .example:hover { border-color: var(--primary-border); background: var(--primary-bg); color: var(--primary-text); }

  /* Messages */
  .msg { display: flex; flex-direction: column; gap: 6px; }
  .msg.user { align-items: flex-end; }
  .bubble { max-width: 84%; border-radius: var(--radius-lg); padding: 11px 14px; font-size: var(--font-md); line-height: 1.55; }
  .msg.user .bubble { background: linear-gradient(135deg, var(--primary-dark), var(--primary)); color: #fff; border-bottom-right-radius: var(--radius-sm); }
  .msg.assistant .bubble { background: var(--card-bg); border: 1px solid var(--border-card); color: var(--text-body); border-bottom-left-radius: var(--radius-sm); max-width: 100%; }
  .bubble.err { border-color: var(--danger-border); background: var(--danger-bg-subtle); }
  .content { white-space: pre-wrap; word-break: break-word; }
  .err-text { color: var(--danger); font-size: var(--font-sm); }

  .typing { display: inline-flex; gap: 4px; padding: 2px 0; }
  .typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--text-faint); animation: blink 1.2s infinite ease-in-out; }
  .typing span:nth-child(2) { animation-delay: 0.2s; }
  .typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }

  .chiprow { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-left: 2px; font-size: var(--font-xs); }
  .route { font-weight: 700; padding: 2px 9px; border-radius: var(--radius-pill); background: var(--chip-bg); color: var(--primary-text); }
  .route.local { background: var(--success-bg); color: var(--success); }
  .route.cloud { background: var(--info-bg); color: var(--info); }
  .meta { color: var(--text-muted); }
  .meta.accent { color: var(--success); font-weight: 700; }

  /* Composer */
  .composer { padding: 8px 18px 16px; border-top: 1px solid var(--border-soft); background: var(--bg); }
  .controls { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .seg { display: inline-flex; background: var(--border-soft); border-radius: var(--radius-md); padding: 2px; gap: 2px; }
  .seg button { padding: 4px 12px; font-size: var(--font-sm); font-weight: 600; background: transparent; border: none; color: var(--text-muted); border-radius: var(--radius-sm); }
  .seg button.on { background: var(--card-bg); color: var(--primary-text); box-shadow: var(--shadow); }
  .seg button:disabled { opacity: 0.4; }
  .auto-note { font-size: var(--font-xs); color: var(--text-faint); }
  .controls select { font-size: var(--font-sm); padding: 5px 8px; max-width: 220px; }

  .inputrow { display: flex; gap: 8px; align-items: flex-end; }
  textarea { flex: 1; resize: none; max-height: 180px; min-height: 42px; line-height: 1.5; font-size: var(--font-md); }
  .send { flex: none; height: 42px; padding: 0 20px; }

  @media (max-width: 560px) {
    .thread, .composer, .topbar { padding-left: 12px; padding-right: 12px; }
    .bubble { max-width: 92%; }
  }
</style>
