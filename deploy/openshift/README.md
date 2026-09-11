# Counterpart on OpenShift / Kubernetes

Additive deploy path for the **Tampere University TCSC / GPT-Lab OpenShift** cluster. Docker Compose is unchanged: local and Hetzner still use `docker-compose.yml` / `docker-compose.prod.yml`.

Public TCSC pages describe **Narvi + SLURM**. These manifests assume the **OpenShift/Kubernetes** environment you named (GPT-Lab). If you only have SLURM, do not apply this folder.

## Architecture (current product)

Counterpart is **one Node process** (TanStack Start + Nitro). The browser UI and `/api/*` live in the same container. Analysis runs **in-process**; there is no separate worker queue. LLMs are called over an **OpenAI-compatible HTTP API** (`AI_BASE_URL` + `AI_API_KEY`).

Do not split “frontend” and “backend” into two Deployments unless we later extract a real API service.

### Compose services → classification

| Compose / process | Class | OpenShift resource | CPU / GPU |
| --- | --- | --- | --- |
| `app` (UI + API + analysis pipeline) | frontend **and** backend/API | `Deployment/counterpart-app` + `Service` + `Route` | **CPU only** |
| `db` | database (Postgres + pgvector) | `StatefulSet/postgres` + PVC | **CPU only** |
| `migrate` | one-shot schema extras | `Job/counterpart-migrate` | **CPU only** |
| `minio` + `minio-init` | object storage (uploads) | `Deployment/minio` + PVC + `Job/minio-init` | **CPU only** |
| `caddy` | TLS reverse proxy | **not used** — OpenShift `Route` (or Ingress) | — |
| OpenRouter / any OpenAI-compatible URL | AI/LLM (today, external) | Config/Secret `AI_BASE_URL` | no cluster GPU |
| optional `components/inference` | AI/LLM inference (vLLM) | `Deployment/inference` + PVC | **GPU** (`nvidia.com/gpu: 1`) |
| `/api/public/cron/schedules` | scheduled re-runs (HTTP cron) | same app pod + `CRON_SECRET` | **CPU only** |

There is **no GPU requirement** to run Counterpart itself. GPUs are only for a local model server.

### Phase 1 slice (this folder)

**App → Postgres → MinIO → LLM HTTP endpoint**

1. Apply CPU stack (`kustomization.yaml`).
2. Point `AI_BASE_URL` at either:
   - in-cluster `http://inference:8000/v1` after enabling `components/inference`, or
   - an existing cluster model route, or
   - an external gateway (needs egress).
3. Confirm `GET /api/public/health`, sign up (first user = platform admin), run one analysis.

Later GPT-Lab services go under `gptlab/` and are listed in `kustomization.yaml`. Counterpart keeps calling them via env URLs.

## Persistent storage

| PVC / volume | Purpose |
| --- | --- |
| `postgres` `volumeClaimTemplates` `data` (20Gi) | database |
| `minio-data` (50Gi) | uploaded contract packs |
| `inference-models` (100Gi, optional) | Hugging Face / vLLM model cache |

Schema + seed run only on an **empty** Postgres volume (`/docker-entrypoint-initdb.d`). Additive `db/migrate-*.sql` run via the migrate Job.

## Secrets

Never commit filled secrets. Copy `secret.example.yaml` → `secret.yaml` (gitignored).

Required keys: `SESSION_SECRET`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `STORAGE_SECRET_KEY`, `AI_API_KEY`, `CRON_SECRET`, `APP_URL`.

After the Route exists, set `APP_URL` to `https://<host>` and re-apply the Secret.

## Build the app image

Same `Dockerfile` as Compose. On OpenShift:

```bash
oc -n counterpart new-build --strategy=docker --binary --name=counterpart-app
oc -n counterpart start-build counterpart-app --from-dir=. --follow
```

Then point the overlay at the ImageStream (`overlays/tcsc`).

## Apply

```bash
cp deploy/openshift/secret.example.yaml deploy/openshift/secret.yaml
# fill secret.yaml — no real keys in git
chmod +x deploy/openshift/apply.sh
./deploy/openshift/apply.sh
```

`apply.sh` also creates ConfigMaps from `db/schema.sql`, `db/seed.sql`, and `db/migrate-*.sql` (kustomize cannot reach those files). If you apply YAML by hand, create those ConfigMaps first.

GPU inference (optional, after the CPU stack is healthy):

```bash
oc apply -k deploy/openshift/components/inference
```

TCSC ImageStream name (after `oc new-build`):

```bash
oc apply -k deploy/openshift/overlays/tcsc
```

Then set ConfigMap `AI_DEFAULT_MODEL` (and embeddings model) to the **served model id**. Chat and embeddings can be split with `AI_EMBEDDING_BASE_URL` / `AI_EMBEDDING_API_KEY` if the GPU server has no `/v1/embeddings`.

### OpenShift notes

- Postgres uses `pgvector/pgvector:pg16` (same as Compose). If the pod cannot start under a random UID, grant `anyuid` to the postgres service account for this project only.
- `runtimeClassName` is omitted; request `nvidia.com/gpu` and use whatever GPU Operator the cluster provides. Drop the GPU limits if the node uses a different resource name.
- Do not publish Postgres or MinIO on a Route.

## Local Compose (unchanged)

```bash
docker compose up -d db
pnpm dev          # http://localhost:3000
# or
docker compose -f docker-compose.prod.yml up -d
```
