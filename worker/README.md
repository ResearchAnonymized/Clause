# Clause Worker — Python + LangGraph

Real agentic backend for Clause. Replaces `src/lib/mock-analysis.ts` with LLM-driven
contract analysis using the **same database contract** — the UI does not change.

## Architecture

```
Lovable UI  ──insert run──►  Postgres (runs.status = 'queued')
     │
     └── server fn `enqueueRun` ──POST /enqueue──►  FastAPI worker
                                                         │
                                            LangGraph orchestrator
                                                         │
                                       ┌──────┬──────┬──┴───┬──────┬──────┐
                                       SLA   DPA  InfoSec Notice Pricing Generic
                                       │      │     │      │      │      │
                                       └──────┴──►  Reviewer (final synthesis)
                                                         │
                                       insert findings + agent_events (service role)
                                                         │
                                              runs.status = 'completed'
                                                         │
                                       UI streams via Supabase realtime (unchanged)
```

## Stack

- **FastAPI** — `/enqueue` endpoint, HMAC-authenticated
- **LangGraph** — deterministic DAG of specialist agents
- **LiteLLM** — single client, any provider (OpenAI, Anthropic, Groq, local Ollama)
- **unstructured** — .pdf / .docx / .doc / .txt → clause-level chunks
- **supabase-py** — service-role writes to `findings`, `agent_events`, `run_documents`

## Local run

```bash
cd worker
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # fill SUPABASE_URL, SERVICE_ROLE, OPENAI_API_KEY, WORKER_SHARED_SECRET
uvicorn worker.main:app --reload --port 8787
```

## Deploy — Fly.io (recommended)

```bash
fly launch --no-deploy --name clause-worker
fly secrets set \
  SUPABASE_URL="https://<ref>.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="..." \
  OPENAI_API_KEY="sk-..." \
  WORKER_SHARED_SECRET="$(openssl rand -hex 32)" \
  DEFAULT_MODEL="openai/gpt-4o-mini"
fly deploy
```

Then in **Lovable → Backend → Secrets** set:

- `WORKER_URL` = `https://clause-worker.fly.dev`
- `WORKER_SHARED_SECRET` = *same value you passed to `fly secrets`*

The Lovable server function `enqueueRun` uses these to dispatch runs. If either is
missing, it falls back to the in-browser mock, so the UI keeps working during setup.

## Deploy — Render / Railway

Any container host works. Expose port `8787`, set the same env vars.

## Endpoints

- `POST /enqueue` — body `{ run_id, criteria_set_id }`, header `X-Worker-Secret`.
  Returns 202 immediately; processing runs in a background task.
- `GET  /health` — liveness probe.

## Environment

| Var | Purpose |
|---|---|
| `SUPABASE_URL` | Your Lovable Cloud project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role — bypasses RLS, needed to write findings across tenants |
| `WORKER_SHARED_SECRET` | HMAC between Lovable server fn and this worker |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / … | LiteLLM picks up any provider key |
| `DEFAULT_MODEL` | Fallback when a criterion has no `model` set. Default `openai/gpt-4o-mini` |
| `MAX_CONCURRENCY` | Parallel criteria per run (default `4`) |

## Model selection

Each `public.criteria` row has a `model` column (e.g. `openai/gpt-4o-mini`,
`anthropic/claude-3-5-sonnet-20241022`, `ollama/llama3`). The specialist agent
passes it straight to LiteLLM — swap models per-criterion from the UI without
touching worker code.
