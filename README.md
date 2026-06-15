# Lattice

A local-first AI control plane for your own lab. Lattice sits in front of your
rig: it routes each request to a **local model** (Ollama / LM Studio) when it's
up and **falls back to the cloud** when it isn't, streams the reply, and shows
you which backend answered — plus tokens/sec, time-to-first-token, the model
loaded on the GPU, and VRAM — live.

It's built to run on your network and be reached from your phone over Tailscale.
The tailnet is the trust boundary, so there's **no login** — anyone who can
reach it is you.

> Status: **MVP** — routing chat console + live telemetry. See [Roadmap](#roadmap).

## Quick start

```bash
npm install
cp .env.example .env   # edit to taste — every key is optional
npm run dev            # http://localhost:8770
```

Lattice boots with **nothing configured** and tells you what to set. With Ollama
running locally you get the full experience out of the box (the default
`.env.example` points at `http://localhost:11434/v1`).

- **Chat** (`/`) — talk to your models. Pick `Auto` (route local, fall back to
  cloud), or force `Local` / `Cloud` and choose a model. Every reply is tagged
  with its backend, model, token count, throughput, and TTFT.
- **Telemetry** (`/telemetry`) — backend health + latency, Ollama's loaded
  models and VRAM, GPU utilization, a throughput trend, and recent requests.
  Refreshes every 2s.
- **Agents** (`/agents`) — saved prompts that run on your rig on demand or on a
  schedule (`manual`, every N minutes, or daily at HH:MM). Each agent keeps a
  run history with full metrics, and scheduled runs show up in telemetry tagged
  with the agent name. An in-process scheduler fires due jobs even with no UI open.

## Configuration

Everything is optional — a missing key just makes that capability report "not
configured" in the UI.

| Variable | Purpose |
| --- | --- |
| `LOCAL_LLM_BASE_URL` | Local OpenAI-compatible `/v1` base (Ollama `…:11434/v1`, LM Studio `…:1234/v1`). Over Tailscale, your rig's tailnet host. |
| `LOCAL_LLM_API_KEY` | Usually ignored by local servers; placeholder for ones that want a key. |
| `LOCAL_LLM_MODEL` | Force a default local model (else the first installed model is used). |
| `OLLAMA_URL` | Native Ollama base for runtime telemetry (`/api/ps`, `/api/tags`). Defaults to `LOCAL_LLM_BASE_URL` minus `/v1`. |
| `OPENAI_API_KEY` | Enables the cloud fallback. |
| `OPENAI_MODEL` | Cloud default model (`gpt-4o-mini`). |
| `OPENAI_BASE_URL` | Point the "cloud" backend at any OpenAI-compatible API. |
| `GPU_EXPORTER_URL` | Optional JSON GPU-stats endpoint on the rig. If unset, Lattice tries local `nvidia-smi`, else shows "not configured". |
| `DATA_DIR` | Where agent definitions + run history persist (default `./data`). |
| `PORT` | Server port (default `8770`). |

## Exposing over Tailscale

Run Lattice on a host in your tailnet (the rig, or anything that can reach it),
then either rely on tailnet ACLs or front it with `tailscale serve`:

```bash
tailscale serve --bg 8770    # https on your tailnet, no login needed
```

Reach it from your phone at `https://<host>.<tailnet>.ts.net`.

## How it routes

`resolveBackend` is the one decision at the core:

- `Local` / `Cloud` force that backend.
- `Auto` prefers local when it's configured **and** a cached health probe is
  green; otherwise falls back to cloud; and if cloud isn't configured either,
  tries local as a last resort. It only refuses when nothing is configured.

Both Ollama/LM Studio and OpenAI speak the same `/v1/chat/completions`, so one
streaming path serves both.

## Stack

SvelteKit 2 + Svelte 5, `@sveltejs/adapter-node`, the `openai` SDK (pointed at
either backend), Chart.js, Vitest. Node ≥ 22. The design system mirrors the
Blueprint token vocabulary.

## Roadmap

Shipped: routing chat console · live telemetry · scheduled agents.

Next: one-command Tailscale packaging · cloud spend telemetry · a GPU-exporter
recipe · a routing-rules engine (by model / size / cost) · optional
shared-secret gate.
