<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  import { page } from '$app/stores'
  import { theme, initTheme, cycleTheme } from '$lib/theme.svelte'
  import type { LayoutData } from './$types'

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props()

  let dismissed = $state(false)

  onMount(() => initTheme())

  const NAV = [
    { href: '/', label: 'Chat' },
    { href: '/telemetry', label: 'Telemetry' },
  ]

  // What's missing — drives the banner. Local is the headline; cloud is the fallback.
  const missing = $derived(
    [
      !data.config.local && { key: 'LOCAL_LLM_BASE_URL', note: 'local model (Ollama / LM Studio)' },
      !data.config.cloud && { key: 'OPENAI_API_KEY', note: 'cloud fallback' },
    ].filter(Boolean) as { key: string; note: string }[],
  )
  const noBackend = $derived(!data.config.local && !data.config.cloud)
</script>

<div class="shell">
  <header>
    <a class="brand" href="/" aria-label="Lattice home">
      <span class="mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22">
          <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M5 5h14M5 12h14M5 19h14M5 5v14M12 5v14M19 5v14" opacity="0.55" />
          </g>
          <g fill="currentColor">
            <circle cx="5" cy="5" r="1.9" /><circle cx="19" cy="12" r="1.9" /><circle cx="12" cy="19" r="1.9" />
          </g>
        </svg>
      </span>
      <span class="wordmark">Lattice</span>
    </a>

    <nav aria-label="Primary">
      {#each NAV as item}
        <a href={item.href} class="navlink" class:active={$page.url.pathname === item.href} aria-current={$page.url.pathname === item.href ? 'page' : undefined}>
          {item.label}
        </a>
      {/each}
    </nav>

    <button class="theme-toggle ghost" onclick={cycleTheme} title="Theme: {theme.pref}" aria-label="Cycle theme (current: {theme.pref})">
      {#if theme.pref === 'light'}
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.4M12 19.1v2.4M4.5 4.5l1.7 1.7M17.8 17.8l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.5 19.5l1.7-1.7M17.8 6.2l1.7-1.7" /></svg>
      {:else if theme.pref === 'dark'}
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>
      {:else}
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="12" rx="1.6" /><path d="M9 20h6M12 16.5V20" /></svg>
      {/if}
    </button>
  </header>

  {#if missing.length && !dismissed}
    <div class="banner" class:crit={noBackend} role="status">
      <span class="dot" aria-hidden="true"></span>
      <span class="banner-text">
        {#if noBackend}
          <strong>No backend configured.</strong>
        {:else}
          <strong>Heads up —</strong>
        {/if}
        set
        {#each missing as m, i}<code>{m.key}</code><span class="note"> ({m.note})</span>{#if i < missing.length - 1}, {/if}{/each}
        to enable {missing.length > 1 ? 'them' : 'it'}.
      </span>
      <button class="ghost dismiss" onclick={() => (dismissed = true)} aria-label="Dismiss">✕</button>
    </div>
  {/if}

  <main>
    {@render children()}
  </main>
</div>

<style>
  .shell { min-height: 100dvh; display: flex; flex-direction: column; }

  header {
    position: sticky;
    top: 0;
    z-index: var(--z-topbar);
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 10px 18px;
    background: color-mix(in srgb, var(--card-bg) 86%, transparent);
    backdrop-filter: saturate(1.4) blur(10px);
    border-bottom: 1px solid var(--border);
  }

  .brand { display: inline-flex; align-items: center; gap: 9px; text-decoration: none; color: var(--text); }
  .mark {
    display: grid; place-items: center;
    width: 30px; height: 30px; border-radius: var(--radius-md);
    color: #fff; background: var(--mesh);
    box-shadow: var(--glow-primary);
  }
  .wordmark { font-size: var(--font-lg); font-weight: 700; letter-spacing: -0.01em; }

  nav { display: flex; gap: 4px; margin-left: 4px; }
  .navlink {
    text-decoration: none;
    color: var(--text-muted);
    font-size: var(--font-base);
    font-weight: 600;
    padding: 6px 12px;
    border-radius: var(--radius-md);
    transition: all var(--speed) ease;
  }
  .navlink:hover { color: var(--text); background: var(--border-soft); }
  .navlink.active { color: var(--primary-text); background: var(--primary-bg); }

  .theme-toggle { margin-left: auto; display: grid; place-items: center; padding: 7px; color: var(--text-muted); }
  .theme-toggle:hover { color: var(--text); }

  .banner {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 18px;
    font-size: var(--font-sm);
    color: var(--text-body);
    background: var(--info-bg);
    border-bottom: 1px solid var(--border);
  }
  .banner.crit { background: var(--warning-bg); }
  .banner code {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: var(--font-xs);
    background: color-mix(in srgb, var(--card-bg) 70%, transparent);
    padding: 1px 6px; border-radius: var(--radius-sm);
  }
  .banner .note { color: var(--text-muted); }
  .banner .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--info); flex: none; }
  .banner.crit .dot { background: var(--warning); }
  .banner-text { flex: 1; }
  .dismiss { padding: 2px 8px; color: var(--text-muted); font-size: var(--font-sm); }

  main { flex: 1; min-height: 0; display: flex; flex-direction: column; }

  @media (max-width: 560px) {
    header { gap: 10px; padding: 9px 12px; }
    .wordmark { display: none; }
    .banner { padding: 8px 12px; }
    .banner .note { display: none; }
  }
</style>
