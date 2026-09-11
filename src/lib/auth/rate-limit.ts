type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || cur.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.count >= max) return false;
  cur.count += 1;
  return true;
}

export function clientKey(request: Request, extra = "") {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = fwd || request.headers.get("x-real-ip") || "local";
  return extra ? `${ip}:${extra}` : ip;
}
