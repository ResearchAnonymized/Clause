#!/usr/bin/env bash
# Apply Counterpart phase-1 (app + Postgres + MinIO + Route). Secrets are never generated here.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$(cd "$(dirname "$0")" && pwd)"
NS=counterpart
K=(kubectl)
if command -v oc >/dev/null 2>&1; then
  K=(oc)
fi

if [[ ! -f "$DIR/secret.yaml" ]]; then
  echo "Create $DIR/secret.yaml from secret.example.yaml and fill values." >&2
  exit 1
fi

"${K[@]}" apply -f "$DIR/base/namespace.yaml"
"${K[@]}" apply -f "$DIR/secret.yaml"

"${K[@]}" -n "$NS" create configmap counterpart-db-init \
  --from-file=01-schema.sql="$ROOT/db/schema.sql" \
  --from-file=02-seed.sql="$ROOT/db/seed.sql" \
  --dry-run=client -o yaml | "${K[@]}" apply -f -

migrate_args=()
for f in "$ROOT"/db/migrate-*.sql; do
  migrate_args+=(--from-file="$(basename "$f")=$f")
done
"${K[@]}" -n "$NS" create configmap counterpart-db-migrate \
  "${migrate_args[@]}" \
  --dry-run=client -o yaml | "${K[@]}" apply -f -

"${K[@]}" apply -k "$DIR"

echo
echo "Next:"
echo "  ${K[*]} -n $NS rollout status deploy/counterpart-app"
echo "  ${K[*]} -n $NS get route counterpart"
echo "  curl -sS https://\$ROUTE/api/public/health"
echo
echo "Optional GPU inference:"
echo "  ${K[*]} apply -k $DIR/components/inference"
