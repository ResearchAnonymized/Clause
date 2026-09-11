#!/usr/bin/env bash
# Apply additive db/migrate-*.sql files. Safe to re-run (IF NOT EXISTS).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

apply_psql() {
  local conn="$1"
  for f in db/migrate-*.sql; do
    [[ -f "$f" ]] || continue
    echo "Applying $f …"
    psql "$conn" -v ON_ERROR_STOP=0 -f "$f"
  done
}

if [[ -n "${DATABASE_URL:-}" ]] && command -v psql >/dev/null 2>&1; then
  echo "Using DATABASE_URL"
  apply_psql "$DATABASE_URL"
  echo "Migrations done."
  exit 0
fi

COMPOSE=(docker compose)
if docker compose ls --format json 2>/dev/null | grep -q 'docker-compose.cx22.yml'; then
  COMPOSE=(docker compose -f docker-compose.cx22.yml)
elif [[ -f docker-compose.prod.yml ]]; then
  COMPOSE=(docker compose -f docker-compose.prod.yml)
elif [[ -f deploy/docker-compose.demo.yml ]]; then
  COMPOSE=(docker compose -f docker-compose.yml -f deploy/docker-compose.demo.yml)
fi

echo "Waiting for Postgres…"
for i in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T db pg_isready -U clause -d clause >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

for f in db/migrate-*.sql; do
  [[ -f "$f" ]] || continue
  echo "Applying $f …"
  "${COMPOSE[@]}" exec -T db psql -U clause -d clause < "$f"
done

echo "Migrations done."
