#!/usr/bin/env bash
# First-boot on Ubuntu 24.04 (Hetzner). Installs Docker, then you unpack the
# Counterpart tarball and run docker compose.
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

apt-get update
apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

systemctl enable --now docker
usermod -aG docker "${SUDO_USER:-root}" || true

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo
echo "Docker is ready."
echo "1. Copy counterpart-deploy-*.tar.gz to this machine"
echo "2. mkdir -p /opt/counterpart && tar -xzf counterpart-deploy-*.tar.gz -C /opt/counterpart"
echo "3. cd /opt/counterpart && cp deploy/env.production.example .env && nano .env"
echo "4. docker compose -f docker-compose.prod.yml up -d --build"
echo "5. Point DNS A record APP_HOST → this server, then wait for Caddy TLS"
