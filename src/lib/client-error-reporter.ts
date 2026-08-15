import { logError } from "@/lib/error-log.functions";

/**
 * Wire browser-side unhandled errors + promise rejections to the server
 * error-ingest endpoint. Debounced by identical message+stack fingerprint
 * so a broken component doesn't hammer the API.
 */
const seen = new Map<string, number>();
const DEDUPE_MS = 60_000;

function fingerprint(message: string, stack?: string | null) {
  return `${message}::${(stack ?? "").split("\n").slice(0, 3).join("|")}`;
}

async function report(message: string, stack?: string | null, extra?: Record<string, unknown>) {
  const fp = fingerprint(message, stack);
  const now = Date.now();
  const last = seen.get(fp) ?? 0;
  if (now - last < DEDUPE_MS) return;
  seen.set(fp, now);
  try {
    await logError({
      data: {
        source: "client",
        level: "error",
        message,
        stack: stack ?? null,
        url: typeof window !== "undefined" ? window.location.href : null,
        context: extra ?? {},
      },
    });
  } catch {
    /* swallow — logging must not throw */
  }
}

let installed = false;
export function installClientErrorReporter() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (ev) => {
    const err = ev.error as Error | undefined;
    report(err?.message ?? ev.message ?? "window.onerror", err?.stack ?? null, {
      filename: ev.filename,
      lineno: ev.lineno,
      colno: ev.colno,
    });
  });

  window.addEventListener("unhandledrejection", (ev) => {
    const r = ev.reason as any;
    const message = typeof r === "string" ? r : r?.message ?? "unhandledrejection";
    report(message, r?.stack ?? null, { kind: "unhandledrejection" });
  });
}
