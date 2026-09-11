#!/usr/bin/env bash
# Build a self-contained tarball for the Hetzner VM (no node_modules, no secrets).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d)"
OUT_DIR="$ROOT/deploy/dist"
NAME="counterpart-deploy-$STAMP"
OUT="$OUT_DIR/$NAME.tar.gz"

mkdir -p "$OUT_DIR"

tar -C "$ROOT" -czf "$OUT" \
  --exclude './.git' \
  --exclude './.cursor' \
  --exclude './node_modules' \
  --exclude './.output' \
  --exclude './dist' \
  --exclude './.nitro' \
  --exclude './.tanstack' \
  --exclude './storage' \
  --exclude './.env' \
  --exclude './.env.local' \
  --exclude './.env.development' \
  --exclude './.env.production' \
  --exclude './.env*.local' \
  --exclude './deploy/dist' \
  --exclude './coverage' \
  --exclude './agent-transcripts' \
  --exclude '*.pdf' \
  --exclude '.DS_Store' \
  --exclude '._*' \
  .

echo "Wrote $OUT"
echo "Size: $(du -h "$OUT" | cut -f1)"
echo
echo "On the server:"
echo "  mkdir -p /opt/counterpart && tar -xzf $NAME.tar.gz -C /opt/counterpart"
echo "  cd /opt/counterpart"
echo "  cp deploy/env.production.example .env && nano .env"
echo "  docker compose -f docker-compose.prod.yml up -d --build"
