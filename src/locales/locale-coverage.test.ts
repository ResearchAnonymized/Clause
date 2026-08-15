import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import en from "@/locales/en";
import fi from "@/locales/fi";
import sv from "@/locales/sv";

function flatten(obj: unknown, prefix = "", out: Record<string, string> = {}) {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else if (typeof obj === "string") {
    out[prefix] = obj;
  }
  return out;
}

describe("locale coverage", () => {
  it("FI and SV cover all EN leaf keys", () => {
    const E = flatten(en);
    const F = flatten(fi);
    const S = flatten(sv);
    const missFi = Object.keys(E).filter((k) => !(k in F));
    const missSv = Object.keys(E).filter((k) => !(k in S));
    writeFileSync(
      "/tmp/locale-missing.json",
      JSON.stringify(
        {
          missFi,
          missSv,
          enValues: Object.fromEntries(missFi.map((k) => [k, E[k]])),
        },
        null,
        2,
      ),
    );
    expect(missFi, `FI missing ${missFi.length} keys`).toEqual([]);
    expect(missSv, `SV missing ${missSv.length} keys`).toEqual([]);
  });
});
