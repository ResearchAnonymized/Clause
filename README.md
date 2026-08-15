# Clause

Multi-agent contract intelligence — self-hosted TanStack Start + Postgres + MinIO.

## Stack

- **App:** React 19 + TanStack Start / Router / Query
- **DB:** PostgreSQL 16 + pgvector
- **Auth:** Cookie sessions (`clause_session`)
- **Files:** MinIO (S3) or local filesystem
- **AI:** OpenAI-compatible API (`AI_BASE_URL` + `AI_API_KEY`) — analysis runs inline in the app

## Quick start

```bash
# 1) Start Postgres (+ optional MinIO)
docker compose up -d db minio minio-init

# 2) Install & run
cp .env.example .env
pnpm install
pnpm run dev
```

Open http://localhost:3000 — sign up with email/password. The **first user becomes platform admin** and gets a personal workspace/organization.

## Environment

See `.env.example`. Important keys:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection |
| `SESSION_SECRET` | Session hardening (long random value) |
| `STORAGE_*` | MinIO / S3 settings |
| `AI_API_KEY` | Required for analysis / embeddings |

Apply schema with `db/schema.sql` and additive `db/migrate-*.sql` (see `deploy/apply-migrations.sh`).

## Notes

- Browser data access is proxied through `/api/db` (authenticated).
- Realtime run updates use short polling.
- Do not commit `.env` or secrets.

## Demo hosting (Hetzner EU)

For private sensitive demos, see **[`deploy/README.md`](./deploy/README.md)** — Helsinki VM, Docker DB/MinIO, Caddy TLS, invite-only orgs.
