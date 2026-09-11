# Counterpart — production deploy

Private EU demo: **one Hetzner Cloud VM** (Helsinki), Docker Compose for the app, Postgres, MinIO, and Caddy (HTTPS).

Typical cost: **€5–15/month** + OpenRouter usage. Delete the VM when idle.

## What you ship

| File | Purpose |
|------|---------|
| `docker-compose.prod.yml` | App + Postgres + MinIO + Caddy |
| `Dockerfile` | Production Node image |
| `deploy/env.production.example` | Secrets template → copy to `.env` |
| `deploy/Caddyfile.prod` | TLS reverse proxy |
| `deploy/bootstrap-server.sh` | First-boot on Ubuntu 24.04 |
| `deploy/package.sh` | Builds `deploy/dist/counterpart-deploy-YYYYMMDD.tar.gz` |
| `deploy/apply-migrations.sh` | Re-run `db/migrate-*.sql` (idempotent) |

`deploy/clause-app.service` is an optional **non-Docker** app runner. Prefer Compose.

## 1. Build the tarball (laptop)

```bash
pnpm test
chmod +x deploy/package.sh deploy/bootstrap-server.sh deploy/apply-migrations.sh
pnpm run deploy:package
```

Copy `deploy/dist/counterpart-deploy-*.tar.gz` to the server. Do **not** include `.env`.

## 2. Create the server

1. [Hetzner Cloud Console](https://console.hetzner.cloud) → project e.g. `counterpart-demo`
2. Location **Helsinki** (or Falkenstein), **Ubuntu 24.04**, CX22 (≥4 GB) or CX32
3. SSH key; firewall TCP **22, 80, 443** only (never 5432 / 9000)

```bash
ssh root@YOUR_SERVER_IP
# paste bootstrap-server.sh or:
curl -fsSL https://get.docker.com | sh
```

Or copy `deploy/bootstrap-server.sh` and run it as root.

## 3. Unpack and configure

```bash
mkdir -p /opt/counterpart
tar -xzf counterpart-deploy-*.tar.gz -C /opt/counterpart
cd /opt/counterpart
cp deploy/env.production.example .env
nano .env
```

Required in `.env`:

- `APP_HOST` — hostname only, e.g. `demo.example.com` (no `https://`)
- `APP_URL` — `https://` + that host
- `SESSION_SECRET` — long random string (`openssl rand -hex 32`)
- `POSTGRES_PASSWORD` / `STORAGE_SECRET_KEY` — strong passwords
- `AI_API_KEY` — OpenRouter (or compatible) key

DNS **A record:** `APP_HOST` → server IP **before** (or just after) `compose up`, so Caddy can issue TLS.

## 4. Start the stack

```bash
cd /opt/counterpart
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
curl -sS https://YOUR_HOST/api/public/health
```

First signup on an empty instance is **platform admin**. Then invite-only (`AUTH_SIGNUP_MODE=invite-only`).

## 5. After the demo

```bash
docker compose -f docker-compose.prod.yml down -v   # destroys data volumes
rm -rf /opt/counterpart
```

Or delete the Hetzner project.

## Hetzner CX22 (~€4–5/month)

4 GB RAM: use **`docker-compose.cx22.yml`** (Postgres + app + Caddy, files on disk, no MinIO). A heavy analysis may still run out of memory; upgrade to CX32 if that happens.

```bash
docker compose -f docker-compose.cx22.yml up -d --build
```

## Local check (this repo)

Frontend + API are the same Vite/Nitro process:

```bash
docker compose up -d db
cp .env.example .env   # set AI_API_KEY
pnpm install
pnpm test
pnpm dev               # http://localhost:3000
# GET /api/public/health  → {"status":"ok","db":"ok",...}
```

Production image (optional, needs Docker + free ports 80/443):

```bash
cp deploy/env.production.example .env
# fill secrets; for a laptop smoke test use APP_HOST=localhost and map 3000
docker compose -f docker-compose.prod.yml build app
```

## Notes

- Internals may still say `clause` (cookie `clause_session`, Docker user). Product name is Counterpart.
- Legal pages stay generic until `OPERATOR_LEGAL_NAME` / `PRIVACY_EMAIL` / `SECURITY_EMAIL` are set.
- Postgres and MinIO listen only on the Compose network, not the public internet.

## OpenShift / Kubernetes (TCSC)

Compose remains the local and Hetzner path. Cluster manifests live in **[`openshift/README.md`](./openshift/README.md)** and do not replace this playbook.

Phase 1 on the cluster: app (UI+API) + Postgres + MinIO + Route, then an optional GPU `inference` component (vLLM). Secrets stay in `openshift/secret.yaml` (not committed).
