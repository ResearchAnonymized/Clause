import { findQuoteInText } from "@/lib/highlight-quote";

const STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "have", "has", "been", "must",
  "shall", "will", "any", "all", "are", "was", "were", "not", "but", "its", "their",
  "presence", "existence", "alignment", "comparison", "baseline", "mechanism",
  "appendix", "retrieved", "excerpts", "address", "criterion", "required",
  "supplier", "customer", "tender", "contract", "agreement",
]);

export type LocatorInput = {
  evidenceQuote?: string | null;
  justification?: string | null;
  criterionName?: string | null;
  category?: string | null;
};

function pushUnique(out: string[], value?: string | null) {
  const t = String(value ?? "").replace(/\s+/g, " ").trim();
  if (t.length < 8) return;
  if (out.some((x) => x.toLowerCase() === t.toLowerCase())) return;
  out.push(t);
}

function topicHints(name: string, category: string | null | undefined): string[] {
  const blob = `${category ?? ""} ${name}`.toLowerCase();
  const hints: string[] = [];
  if (/\bpric/.test(blob)) hints.push("11. Pricing", "Pricing form", "Evaluated price");
  if (/\bdpa|gdpr|personal data|processing/.test(blob)) {
    hints.push("personal data", "Data Processing", "subprocessor", "8. Security, privacy");
  }
  if (/\bsla|availability|service level/.test(blob)) {
    hints.push("9. Service levels", "Monthly availability", "P1 response");
  }
  if (/\bsecurity|infosec|iso/.test(blob)) {
    hints.push("8. Security, privacy", "ISO 27001", "penetration testing");
  }
  return hints;
}

function isNumberedHeading(value: string) {
  return /^\d+(?:\.\d+)*\.?\s+\S/.test(value.trim());
}

/** Last numbered heading that starts at or before `offset`. */
export function enclosingHeading(text: string, offset: number): string | null {
  const before = text.slice(0, Math.max(0, offset + 1));
  const headingRe = /(?:^|\n)(\d+(?:\.\d+)*\.?\s+[^\n]{3,90})/g;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(before))) last = m[1].trim();
  return last;
}

function headingPlusNextLine(text: string, heading: string): string {
  const found = findQuoteInText(text, heading);
  if (!found.hit) return heading;
  const after = text.slice(found.before.length + found.hit.length);
  const next = after
    .split(/\n+/)
    .map((l) => l.trim())
    .find((l) => l.length >= 4);
  if (!next) return found.hit.trim();
  const combined = `${found.hit} ${next}`.replace(/\s+/g, " ").trim();
  return combined.length >= 8 && combined.length <= 220 ? combined : found.hit.trim();
}

/** Candidate strings to search in the open file, strongest first. */
export function locatorNeedles(input: LocatorInput): string[] {
  const out: string[] = [];
  pushUnique(out, input.evidenceQuote);

  const just = String(input.justification ?? "");
  for (const m of just.matchAll(/[“”"']([^“”"']{10,180})[“”"']/g)) {
    pushUnique(out, m[1]);
  }
  for (const m of just.matchAll(/\b(?:Appendix|Annex|Schedule|Article|Clause)\s+[0-9A-Z.][^\n.]{0,80}/gi)) {
    pushUnique(out, m[0]);
  }

  const name = String(input.criterionName ?? "")
    .replace(/\b(presence|existence|alignment|comparison|baseline|mechanism)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (name.split(/\s+/).length >= 2) pushUnique(out, name);

  for (const hint of topicHints(String(input.criterionName ?? ""), input.category)) {
    pushUnique(out, hint);
  }
  return out.slice(0, 10);
}

function expandToSentence(
  text: string,
  found: { before: string; hit: string },
): string {
  const hit = found.hit;
  if (!hit) return "";
  if (hit.length >= 24 || /^\d+(?:\.\d+)*\.?\s+\S/.test(hit)) return hit;
  const start = found.before.length;
  const end = start + hit.length;
  const leftDot = text.lastIndexOf(".", start - 1);
  const leftNl = text.lastIndexOf("\n", start - 1);
  const left = Math.max(leftDot, leftNl);
  const rightDot = text.indexOf(".", end);
  const rightNl = text.indexOf("\n", end);
  const rightCandidates = [rightDot, rightNl].filter((n) => n >= 0);
  const right = rightCandidates.length ? Math.min(...rightCandidates) : -1;
  const a = left >= 0 ? left + 1 : Math.max(0, start - 50);
  const b = right >= 0 ? right + 1 : Math.min(text.length, end + 90);
  const span = text.slice(a, b).replace(/\s+/g, " ").trim();
  if (span.length >= 12 && span.length <= 280) return span;
  return hit;
}

function headingFallback(text: string, needles: string[]): string | null {
  const tokens = needles
    .flatMap((n) => n.toLowerCase().split(/[^a-zåäö0-9]+/))
    .filter((t) => t.length >= 4 && !STOP.has(t));
  const unique = [...new Set(tokens)].slice(0, 8);
  if (!unique.length) return null;
  const headingRe = /(?:^|\n)(\d+(?:\.\d+)*\.?\s+[^\n]{3,90})/g;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(text))) {
    const line = m[1];
    const lower = line.toLowerCase();
    if (unique.some((t) => lower.includes(t))) return line.trim();
  }
  return null;
}

/** First passage in `text` that belongs to this finding. */
export function locateInDocument(text: string, input: LocatorInput): string | null {
  if (!text) return null;
  const stored = String(input.evidenceQuote ?? "").trim();
  const needles = locatorNeedles(input);
  for (const n of needles) {
    const found = findQuoteInText(text, n);
    if (!found.hit) continue;
    const verbatim = stored.length >= 8 && n === stored;
    if (verbatim) return expandToSentence(text, { before: found.before, hit: found.hit });

    if (isNumberedHeading(found.hit) || isNumberedHeading(n)) {
      return headingPlusNextLine(text, isNumberedHeading(found.hit) ? found.hit.trim() : n);
    }

    const heading = enclosingHeading(text, found.before.length);
    const tokens = n
      .toLowerCase()
      .split(/[^a-zåäö0-9]+/)
      .filter((t) => t.length >= 4 && !STOP.has(t));
    const headingOnTopic =
      Boolean(heading) && tokens.some((t) => heading!.toLowerCase().includes(t));
    if (headingOnTopic && heading && found.hit.length < 48) {
      return headingPlusNextLine(text, heading);
    }
    return expandToSentence(text, { before: found.before, hit: found.hit });
  }
  return headingFallback(text, needles);
}

export function documentHasLocator(text: string, input: LocatorInput): boolean {
  return Boolean(locateInDocument(text, input));
}
