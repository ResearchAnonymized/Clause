"""Load test: fire N concurrent analyses at the real worker.

Reports latency (p50/p95/p99), throughput, and error rate.

Usage:
    python worker/tests/load_test.py --runs 12 --timeout 600
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import statistics
import sys
import time
from pathlib import Path

from _common import (
    create_run,
    enqueue,
    env,
    get_supabase,
    upload_document,
    wait_for_run,
)


def one_run(idx: int, timeout_s: int) -> dict:
    sb = get_supabase()
    workspace_id = env("TEST_WORKSPACE_ID")
    criteria_set_id = env("TEST_CRITERIA_SET_ID")
    worker_url = env("WORKER_URL")
    secret = env("WORKER_HMAC_SECRET")
    customer = Path(env("SAMPLE_CUSTOMER_PATH"))
    supplier = Path(env("SAMPLE_SUPPLIER_PATH"))

    started = time.monotonic()
    result: dict = {"idx": idx, "ok": False, "error": None}
    try:
        run_id = create_run(sb, workspace_id, criteria_set_id, f"Load #{idx}")
        upload_document(sb, workspace_id, run_id, customer, "customer")
        upload_document(sb, workspace_id, run_id, supplier, "supplier")
        r = enqueue(worker_url, secret, run_id, criteria_set_id)
        if r.status_code != 202:
            raise RuntimeError(f"enqueue {r.status_code}: {r.text}")
        enqueue_at = time.monotonic()
        final = wait_for_run(sb, run_id, timeout_s=timeout_s)
        finished_at = time.monotonic()

        result.update(
            {
                "run_id": run_id,
                "status": final.get("status"),
                "timed_out": bool(final.get("_timed_out")),
                "enqueue_latency_s": round(enqueue_at - started, 2),
                "processing_latency_s": round(finished_at - enqueue_at, 2),
                "total_latency_s": round(finished_at - started, 2),
                "ok": final.get("status") == "completed",
            }
        )
    except Exception as e:  # noqa: BLE001
        result["error"] = str(e)
        result["total_latency_s"] = round(time.monotonic() - started, 2)
    return result


def pct(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    values = sorted(values)
    k = min(len(values) - 1, int(round((q / 100.0) * (len(values) - 1))))
    return round(values[k], 2)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=12)
    ap.add_argument("--timeout", type=int, default=600, help="per-run timeout (s)")
    ap.add_argument("--concurrency", type=int, default=0, help="0 = same as --runs")
    args = ap.parse_args()

    concurrency = args.concurrency or args.runs
    print(f"[..] firing {args.runs} runs, concurrency={concurrency}, per-run timeout={args.timeout}s")

    wall_start = time.monotonic()
    with cf.ThreadPoolExecutor(max_workers=concurrency) as ex:
        futures = [ex.submit(one_run, i, args.timeout) for i in range(args.runs)]
        results = [f.result() for f in cf.as_completed(futures)]
    wall_s = time.monotonic() - wall_start

    ok = [r for r in results if r["ok"]]
    err = [r for r in results if not r["ok"]]
    latencies = [r["total_latency_s"] for r in ok]

    report = {
        "runs": args.runs,
        "concurrency": concurrency,
        "wall_time_s": round(wall_s, 2),
        "throughput_runs_per_min": round(args.runs / (wall_s / 60), 2) if wall_s else 0,
        "success": len(ok),
        "errors": len(err),
        "error_rate_pct": round(100 * len(err) / args.runs, 2),
        "latency_s": {
            "min": round(min(latencies), 2) if latencies else 0,
            "p50": pct(latencies, 50),
            "p95": pct(latencies, 95),
            "p99": pct(latencies, 99),
            "max": round(max(latencies), 2) if latencies else 0,
            "mean": round(statistics.mean(latencies), 2) if latencies else 0,
        },
        "failures": [{"idx": r["idx"], "error": r.get("error"), "status": r.get("status")} for r in err],
    }

    out = Path(__file__).parent / "last-load-report.json"
    out.write_text(json.dumps({"summary": report, "detail": results}, indent=2, default=str))

    print("\n=== LOAD REPORT ===")
    print(json.dumps(report, indent=2))
    print(f"\nfull detail -> {out}")
    return 0 if report["error_rate_pct"] < 20 else 1


if __name__ == "__main__":
    sys.exit(main())
