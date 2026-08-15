import { getRequestHeader } from "@tanstack/react-start/server";
import { getAdminDb } from "@/db/client.server";

/** Best-effort caller IP, falling back to "unknown". */
export function callerIp(): string {
  const xff = getRequestHeader("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return (
    getRequestHeader("cf-connecting-ip") ||
    getRequestHeader("x-real-ip") ||
    "unknown"
  );
}

export async function checkRateLimit(opts: {
  bucket: string;
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<boolean> {
  try {
    const { data, error } = await getAdminDb().rpc("check_rate_limit", {
      _bucket: opts.bucket,
      _key: opts.key,
      _limit: opts.limit,
      _window_seconds: opts.windowSeconds,
    });
    if (error) {
      console.error("[rate-limit] rpc failed, fail-open:", error.message);
      return true;
    }
    return data !== false;
  } catch (e) {
    console.error("[rate-limit] threw, fail-open:", e);
    return true;
  }
}

/** Throw a 429-shaped error when the limit is exceeded. */
export async function enforceRateLimit(opts: {
  bucket: string;
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<void> {
  const allowed = await checkRateLimit(opts);
  if (!allowed) {
    const err = new Error("Too many requests. Please try again later.");
    (err as any).status = 429;
    throw err;
  }
}
