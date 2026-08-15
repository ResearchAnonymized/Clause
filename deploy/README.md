# Clause — Hetzner demo hosting

Private EU demo setup for sensitive contract reviews.

**Recommended server:** Hetzner Cloud · **Helsinki** · Ubuntu 24.04 · Shared vCPU · **CX22 (≥4 GB)** or **CX32 (8 GB)** · Firewall: **22, 80, 443** only.

## 1. Create the server

1. [Hetzner Cloud Console](https://console.hetzner.cloud) → new project `clause-demo`
2. Add server:
   - Location: **Helsinki** (or Falkenstein)
   - Image: **Ubuntu 24.04**
   - Type: Shared vCPU CX22 or CX32
   - SSH key: yours
3. Cloud Firewall: allow TCP **22**, **80**, **443** only (block 5432 / 9000)

## 2. First login

```bash
ssh root@YOUR_SERVER_IP
```

```bash
apt update && apt upgrade -y
apt install -y docker.io docker-compose-v2 git ufw curl ca-certificates
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Node 22 + pnpm
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
corepack enable && corepack prepare pnpm@latest --activate

# Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

## 3. Deploy the app

```bash
mkdir -p /opt/clause && cd /opt/clause
git clone YOUR_REPO_URL .
# or: rsync -avz --exclude node_modules --exclude .git ./ user@server:/opt/clause/

cp deploy/env.production.example .env
nano .env   # fill APP_URL, secrets, AI_API_KEY, strong DB/MinIO passwords
```

Update `docker-compose.yml` Postgres/MinIO passwords to match `.env`, **or** keep compose defaults only for throwaway demos.

```bash
# DB + MinIO (ports bound to localhost in production compose override)
docker compose -f docker-compose.yml -f deploy/docker-compose.demo.yml up -d db minio minio-init

# Wait for healthy DB, then migrations
./deploy/apply-migrations.sh

pnpm install
pnpm run build
```

## 4. Run the app (systemd)

```bash
cp deploy/clause-app.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now clause-app
systemctl status clause-app
```

App listens on `127.0.0.1:3000` only.

## 5. HTTPS (Caddy)

DNS **A record:** `demo.yourdomain.com` → server IP

```bash
cp deploy/Caddyfile.example /etc/caddy/Caddyfile
# edit the domain name
systemctl reload caddy
```

Open `https://demo.yourdomain.com`.

## 6. Sensitive-demo checklist

1. First signup → **platform admin**
2. Create/use an **organization** for that customer
3. Invite only their emails (Settings → Organization)
4. Do not advertise a public signup URL
5. After demo: wipe or destroy the Hetzner project if required

```bash
# Optional full wipe of app data (destructive)
docker compose -f docker-compose.yml -f deploy/docker-compose.demo.yml down -v
rm -rf /opt/clause
```

## Cost

Typically **€5–15/mo** for the VM + OpenRouter usage during demos. Delete the server when idle (per-minute billing).

## Support files in this folder

| File | Purpose |
|------|---------|
| `env.production.example` | Production env template |
| `docker-compose.demo.yml` | Bind DB/MinIO to localhost only |
| `Caddyfile.example` | TLS reverse proxy |
| `clause-app.service` | systemd unit for the Node app |
| `apply-migrations.sh` | Apply `db/migrate-*.sql` in order |
