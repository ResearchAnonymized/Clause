#!/usr/bin/env bash
# Apply additive migrations against the local Docker Postgres.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Waiting for Postgres…"
for i in {1..30}; do
  if docker compose -f docker-compose.yml -f deploy/docker-compose.demo.yml exec -T db pg_isready -U clause -d clause >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

for f in \
  db/migrate-mvp-gaps.sql \
  db/migrate-pack-metadata.sql \
  db/migrate-run-packs.sql \
  db/migrate-mapping-decision.sql \
  db/migrate-platform-ledgers.sql \
  db/migrate-organizations.sql
do
  if [[ -f "$f" ]]; then
    echo "Applying $f …"
    docker compose -f docker-compose.yml -f deploy/docker-compose.demo.yml exec -T db \
      psql -U clause -d clause < "$f"
  fi
done

echo "Migrations done."
