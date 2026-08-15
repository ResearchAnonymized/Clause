import { getRequest } from "@tanstack/react-start/server";

export function readCookie(name: string): string | undefined {
  try {
    const req = getRequest();
    const header = req.headers.get("cookie") ?? "";
    const parts = header.split(";").map((p) => p.trim());
    for (const part of parts) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      const key = part.slice(0, eq);
      if (key === name) return decodeURIComponent(part.slice(eq + 1));
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function buildSetCookie(
  name: string,
  value: string,
  opts: { expires?: Date; maxAge?: number; httpOnly?: boolean; path?: string; sameSite?: "lax" | "strict" | "none"; secure?: boolean },
) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path ?? "/"}`);
  if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`);
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  parts.push(`SameSite=${opts.sameSite ?? "Lax"}`);
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearCookie(name: string) {
  return buildSetCookie(name, "", { expires: new Date(0), maxAge: 0 });
}
