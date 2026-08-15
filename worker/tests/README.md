# Worker integration tests

Two scripts that exercise the deployed Python worker end-to-end against real
Supabase data. Both need the worker running (locally on `:8000` or deployed on
Fly/Render) and the same environment the worker uses.

## Required env vars

```
SUPABASE_URL=...                # same as worker
SUPABASE_SERVICE_ROLE_KEY=...   # service-role key; tests insert runs directly
SUPABASE_PUBLISHABLE_KEY=...    # anon/publishable key; UI-parity check
WORKER_URL=https://clause-worker.fly.dev
WORKER_HMAC_SECRET=...          # matches worker WORKER_SHARED_SECRET
TEST_WORKSPACE_ID=<uuid>        # existing workspace to attach runs to
TEST_CRITERIA_SET_ID=<uuid>     # existing criteria set (seeded Cases 1-5)
TEST_USER_EMAIL=...             # workspace member; UI-parity check (optional)
TEST_USER_PASSWORD=...          # matching password (optional)
SAMPLE_CUSTOMER_PATH=./fixtures/2m-it-customer.pdf
SAMPLE_SUPPLIER_PATH=./fixtures/2m-it-supplier.pdf
```

## GitHub Actions

`.github/workflows/worker-integration.yml` runs both scripts on every `main`
push (and manually via workflow_dispatch). Configure the same env values as
GitHub Actions secrets — `WORKER_URL`, `WORKER_HMAC_SECRET`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `TEST_WORKSPACE_ID`,
`TEST_CRITERIA_SET_ID`, and (optional) `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`
for the UI-parity check. Fixture PDFs must be committed under
`worker/tests/fixtures/`.

Install deps once:

```
pip install httpx supabase python-dotenv
```

## 1. End-to-end test (`e2e_2mit.py`)

Uploads the 2M-IT sample contract pair, inserts a `run` row + `run_documents`,
POSTs to `/enqueue`, polls until the run is `completed` (or fails after 5 min),
then asserts:

- run.status == 'completed'
- findings.count > 0
- at least one finding per specialist agent that fired
- token_usage populated
- findings visible via the same anon-key query the UI uses

```
python worker/tests/e2e_2mit.py
```

Exit code 0 = pass, 1 = failure with a diff of what was missing.

## 2. Load test (`load_test.py`)

Spawns N concurrent analyses (default 12) against the worker, measures:

- per-run latency (enqueue -> completed)
- throughput (runs/min)
- error rate (failed + timed-out / total)
- p50 / p95 / p99 latency

```
python worker/tests/load_test.py --runs 12 --timeout 600
```

Prints a summary table and writes `worker/tests/last-load-report.json`.

## 3. Clause-Mapping + Gap-Analysis regression (`regression_mapping_gap.py`)

Runs the pipeline against multiple document pairs across one or more
workspaces and asserts that every run produced:

- a `Clause Mapping Agent` event with a non-zero mapped-pair count
- a `Gap Analysis Agent` event
- at least one `category = 'Gap Analysis'` finding (with `criterion_id = NULL`)
- at least one specialist finding (so mapping didn't crowd them out)
- the same rows visible through the publishable-key UI query

Provide the matrix via `REGRESSION_MATRIX_JSON` (JSON list of
`{workspace_id, criteria_set_id, customer_path, supplier_path, label}`).
Falls back to the single `TEST_WORKSPACE_ID` / `SAMPLE_*` case when unset.

```
export REGRESSION_MATRIX_JSON='[{"workspace_id":"…","criteria_set_id":"…","customer_path":"worker/tests/fixtures/customer_a.pdf","supplier_path":"worker/tests/fixtures/supplier_a.pdf","label":"WS-A vs Supplier A"}, …]'
python worker/tests/regression_mapping_gap.py
```

Writes `worker/tests/last-regression-report.json` and exits non-zero on
any assertion failure.
