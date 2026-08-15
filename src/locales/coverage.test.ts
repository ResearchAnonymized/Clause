import { describe, it, expect } from "vitest";
import en from "./en";
import fi from "./fi";
import sv from "./sv";

type AnyObj = Record<string, unknown>;

function collectKeys(obj: AnyObj, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...collectKeys(v as AnyObj, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

function getAt(obj: AnyObj, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object") return (acc as AnyObj)[k];
    return undefined;
  }, obj);
}

const enKeys = collectKeys(en as unknown as AnyObj);

describe("translation coverage", () => {
  for (const [name, dict] of [
    ["fi", fi],
    ["sv", sv],
  ] as const) {
    describe(name, () => {
      const localeKeys = collectKeys(dict as unknown as AnyObj);

      it(`has no extra keys not present in en`, () => {
        const extra = localeKeys.filter((k) => !enKeys.includes(k));
        expect(extra).toEqual([]);
      });

      it(`has non-empty string values for keys it defines`, () => {
        const empties: string[] = [];
        for (const key of localeKeys) {
          const v = getAt(dict as unknown as AnyObj, key);
          if (typeof v === "string") {
            if (v.trim() === "") empties.push(key);
            continue;
          }
          if (Array.isArray(v)) {
            if (v.length === 0 || v.some((item) => typeof item !== "string" || item.trim() === "")) {
              empties.push(key);
            }
            continue;
          }
          empties.push(key);
        }
        expect(empties).toEqual([]);
      });


      it(`preserves interpolation placeholders from en`, () => {
        const mismatches: Array<{ key: string; en: string[]; loc: string[] }> = [];
        const re = /\{\{\s*([^}\s]+)\s*\}\}/g;
        for (const key of enKeys) {
          const enVal = getAt(en as unknown as AnyObj, key);
          const locVal = getAt(dict as unknown as AnyObj, key);
          if (typeof enVal !== "string" || typeof locVal !== "string") continue;
          const enVars = [...enVal.matchAll(re)].map((m) => m[1]).sort();
          const locVars = [...locVal.matchAll(re)].map((m) => m[1]).sort();
          if (enVars.join(",") !== locVars.join(",")) {
            mismatches.push({ key, en: enVars, loc: locVars });
          }
        }
        expect(mismatches).toEqual([]);
      });
    });
  }
});
