# Clause (local)

Multi-agent contract intelligence for 2M-IT — self-hosted, Supabase/Lovable free.

## Stack

- **App:** React 19 + TanStack Start/Router/Query
- **DB:** PostgreSQL 16 + pgvector
- **Auth:** Cookie sessions (`users` / `sessions`)
- **Files:** Local filesystem (`storage/`) or MinIO
- **AI:** OpenAI-compatible API (`AI_BASE_URL` + `AI_API_KEY`)
- **Worker (optional):** Python FastAPI + LangGraph

## Quick start

```bash
# 1) Start Postgres (+ optional MinIO)
docker compose up -d db

# 2) Install & run the app (pnpm recommended; npm 10 can fail on peer resolution)
cp .env.example .env   # if needed
pnpm install
pnpm run dev
```

Open http://localhost:3000 — sign up with email/password. The **first user becomes admin** and gets a personal workspace.

## Environment

See `.env.example`. Important keys:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection |
| `SESSION_SECRET` | Session hardening (set a long random value) |
| `STORAGE_DRIVER` | `fs` (default) or `s3` for MinIO |
| `AI_API_KEY` | Required for inline analysis / embeddings |
| `WORKER_URL` | Optional external analysis worker |

## Worker

```bash
cd worker
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn worker.main:app --reload --port 8080
```

Set `WORKER_URL=http://localhost:8080` in the app `.env`.

## Notes

- Browser data access is proxied through `/api/db` (authenticated).
- Realtime run updates use short polling.
- Live database schema: `db/schema.sql` plus additive `db/migrate-*.sql`.

## Demo hosting (Hetzner EU)

For private sensitive demos, see **[`deploy/README.md`](./deploy/README.md)** — Helsinki VM, Docker DB/MinIO, Caddy TLS, invite-only orgs.
