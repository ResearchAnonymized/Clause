# Counterpart

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

## Testing

| Command | What it covers | Needs |
|---|---|---|
| `pnpm test` | Unit tests: scoring, mapping authenticity, evidence grounding, sample-pack golden cases, i18n | Nothing |
| `pnpm test:coverage` | Same, plus a coverage report under `coverage/` | Nothing |
| `pnpm test:db` | Postgres tenant isolation (orgs, invites, workspace access) | Local Postgres |
| `pnpm test:e2e` | Playwright: landing, Light/Dark/System, privacy, sign-in | App (started for you) + Postgres for `/auth` |
| `pnpm test:e2e:full` | Live analysis on the sample tender vs bidder pack | `AI_API_KEY` + several minutes |
| `pnpm test:watch` | Unit tests, re-run on save | Nothing |

```bash
# Everyday (CI runs this too)
pnpm test

# Database tests
docker compose up -d db
cp .env.example .env   # if you do not already have DATABASE_URL
pnpm test:db

# Browser smokes (first time: install Chromium)
pnpm exec playwright install chromium
pnpm test:e2e

# Optional live analysis (needs a model key in .env)
AI_API_KEY=sk-or-… PLAYWRIGHT_FULL=1 pnpm test:e2e -- e2e/analysis.spec.ts
```

`pnpm test:db` **refuses a non-local `DATABASE_URL`** so it cannot touch a hosted database by accident. Override only with `ALLOW_DB_TESTS=1`.

Test cases come from:

1. **Developer fixtures** next to the code (score math, invite parsing).
2. **The sample packs** in `public/samples/` — known SLA 99.9 vs 99.5, 24h vs 72h breach notice, EEA vs US logs. Those are the golden cases.
3. **Hallucinated quotes** that must never count as evidence (the check a live LLM result has to pass).

They do **not** come from real customer contracts. A green `pnpm test` means those helpers still match the fixtures. Use `pnpm test:e2e:full` (or a manual sample run) before you trust a live analysis.

CI runs unit tests, schema + DB tests, and the Playwright smokes. Full `tsc` is still `pnpm typecheck` locally — it is not a CI gate yet.

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

## Production

```bash
pnpm test
pnpm build          # writes .output/server/index.mjs
pnpm start          # NODE_ENV=production node server (needs .env + Postgres)

# Ship to a VM (no secrets, no node_modules):
pnpm run deploy:package
```

Tarball: `deploy/dist/counterpart-deploy-YYYYMMDD.tar.gz`. On the server, copy `deploy/env.production.example` to `.env` and run `docker compose -f docker-compose.prod.yml up -d --build`. Full playbook: **[`deploy/README.md`](./deploy/README.md)** (Hetzner Helsinki, Postgres + MinIO + Caddy TLS).

OpenShift / Kubernetes (TCSC / GPT-Lab) is a **separate** path: **[`deploy/openshift/README.md`](./deploy/openshift/README.md)**. Compose stays the local and VM default.
