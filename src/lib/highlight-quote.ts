/** Find and highlight evidence quotes inside plain text or HTML (incl. Word / markdown tables). */

function isSpaceLike(ch: string) {
  return /\s/.test(ch) || ch === "\u00A0" || ch === "|" || ch === "¦" || ch === "·";
}

function foldChar(ch: string) {
  if (isSpaceLike(ch)) return " ";
  if (/[\u2010-\u2015\u2212]/.test(ch)) return "-";
  if (/[\u2192\u21D2\u2794\u2799\u27A1]/.test(ch)) return "->";
  if (/[“”„"]/.test(ch)) return '"';
  if (/[‘’']/.test(ch)) return "'";
  return ch.toLowerCase();
}

/** Fold text for matching; map[i] = original index of folded[i]. */
function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = "";
  const map: number[] = [];
  let lastSpace = false;
  for (let i = 0; i < text.length; i++) {
    const unit = foldChar(text[i]);
    if (unit === " ") {
      if (!lastSpace && folded.length > 0) {
        folded += " ";
        map.push(i);
      }
      lastSpace = true;
      continue;
    }
    lastSpace = false;
    for (let u = 0; u < unit.length; u++) {
      folded += unit[u];
      map.push(i);
    }
  }
  // Trim trailing space from folded + map together (keep indices in sync)
  while (folded.endsWith(" ")) {
    folded = folded.slice(0, -1);
    map.pop();
  }
  return { folded, map };
}

export function findQuoteInText(
  text: string,
  quote: string,
): { before: string; hit: string | null; after: string } {
  if (!text || !quote?.trim()) return { before: text, hit: null, after: "" };

  const q = quote.trim();
  const exact = text.indexOf(q);
  if (exact >= 0) {
    return {
      before: text.slice(0, exact),
      hit: text.slice(exact, exact + q.length),
      after: text.slice(exact + q.length),
    };
  }

  const { folded: fText, map } = foldWithMap(text);
  let fQuote = foldWithMap(q).folded;

  let idx = fText.indexOf(fQuote);
  if (idx < 0) {
    // Progressive shorten: keep punctuation tokens (e.g. "/") that folding preserved
    const words = fQuote.split(" ").filter(Boolean);
    for (let len = Math.min(14, words.length); len >= 3; len--) {
      const short = words.slice(0, len).join(" ");
      idx = fText.indexOf(short);
      if (idx >= 0) {
        fQuote = short;
        break;
      }
    }
  }
  // Token-span fallback: find first word, then last word nearby (handles odd separators)
  if (idx < 0) {
    const words = fQuote.split(" ").filter((w) => w.length >= 2);
    if (words.length >= 3) {
      const first = words[0];
      const last = words[words.length - 1];
      let from = 0;
      while (from < fText.length) {
        const a = fText.indexOf(first, from);
        if (a < 0) break;
        const b = fText.indexOf(last, a + first.length);
        if (b >= 0 && b - a < fQuote.length + 40) {
          idx = a;
          fQuote = fText.slice(a, b + last.length);
          break;
        }
        from = a + first.length;
      }
    }
  }
  if (idx < 0 || !map.length) return { before: text, hit: null, after: "" };

  const endFold = idx + fQuote.length - 1;
  const startOrig = map[idx] ?? 0;
  let endOrig = (map[Math.min(endFold, map.length - 1)] ?? text.length - 1) + 1;
  while (endOrig < text.length && /[A-Za-z0-9.%=]/.test(text[endOrig])) endOrig++;

  return {
    before: text.slice(0, startOrig),
    hit: text.slice(startOrig, endOrig),
    after: text.slice(endOrig),
  };
}

type MapEntry = { node: Text; offset: number } | "space";

/**
 * Flatten HTML text, inserting a space between adjacent text nodes so
 * table cells ("scope"+"V1") become searchable as "scope V1".
 */
function flattenHtml(root: HTMLElement): { text: string; map: MapEntry[] } {
  let text = "";
  const map: MapEntry[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.data) continue;
    if (text.length > 0 && !/\s$/.test(text) && !/^\s/.test(node.data)) {
      text += " ";
      map.push("space");
    }
    for (let i = 0; i < node.data.length; i++) {
      text += node.data[i];
      map.push({ node, offset: i });
    }
  }
  return { text, map };
}

export type EvidencePaintSpec = {
  quote: string;
  toneClass?: string;
  active?: boolean;
  findingId?: string;
};

type WrapRange = {
  start: number;
  end: number;
  toneClass: string;
  active: boolean;
  findingId?: string;
};

function rangesOverlap(a: WrapRange, b: WrapRange) {
  return a.start < b.end && b.start < a.end;
}

function wrapRanges(map: MapEntry[], ranges: WrapRange[]) {
  type Piece = { node: Text; start: number; end: number };
  const sorted = [...ranges].sort((a, b) => b.start - a.start);

  for (const range of sorted) {
    const markClass = [
      "evidence-hit",
      range.toneClass,
      range.active ? "evidence-hit-active" : "evidence-hit-context",
    ]
      .filter(Boolean)
      .join(" ");
    const cellClass = ["evidence-hit-cell", range.toneClass].filter(Boolean).join(" ");
    const local: Piece[] = [];
    for (let i = range.start; i < range.end && i < map.length; i++) {
      const entry = map[i];
      if (entry === "space") continue;
      const prev = local[local.length - 1];
      if (prev && prev.node === entry.node && prev.end === entry.offset) {
        prev.end = entry.offset + 1;
      } else {
        local.push({ node: entry.node, start: entry.offset, end: entry.offset + 1 });
      }
    }
    for (let i = local.length - 1; i >= 0; i--) {
      const { node, start: s, end: e } = local[i];
      if (!node.parentNode || node.data == null) continue;
      try {
        if (node.parentElement?.closest("mark.evidence-hit")) continue;
        if (s >= node.data.length) continue;
        const mid = s === 0 ? node : node.splitText(s);
        const len = Math.min(e - s, mid.data.length);
        if (len < mid.data.length) mid.splitText(len);
        const mark = document.createElement("mark");
        mark.setAttribute("data-evidence-mark", "1");
        if (range.active) mark.setAttribute("data-evidence-hit", "1");
        if (range.findingId) mark.setAttribute("data-finding-id", range.findingId);
        mark.className = markClass;
        mid.parentNode?.replaceChild(mark, mid);
        mark.appendChild(mid);
        const cell = mark.closest("td, th");
        if (cell) {
          cell.classList.add(...cellClass.split(/\s+/).filter(Boolean));
        }
      } catch {
        // ignore split failures on live DOM
      }
    }
  }
}

function clearHits(root: HTMLElement) {
  root.querySelectorAll("mark[data-evidence-hit], mark[data-evidence-mark]").forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
    parent.normalize();
  });
  root.querySelectorAll(".evidence-hit-cell").forEach((el) => {
    el.classList.remove(
      "evidence-hit-cell",
      "evidence-tone-gap",
      "evidence-tone-partial",
      "evidence-tone-aligned",
      "evidence-tone-not_addressed",
    );
  });
}

function quoteRange(text: string, quote: string): WrapRange | null {
  const found = findQuoteInText(text, quote);
  if (!found.hit) return null;
  return {
    start: found.before.length,
    end: found.before.length + found.hit.length,
    toneClass: "",
    active: false,
  };
}

/** Paint every finding quote in the live DOM, with the active finding strongest. */
export function highlightEvidenceInElement(root: HTMLElement, marks: EvidencePaintSpec[]): number {
  clearHits(root);
  const usable = marks.filter((m) => (m.quote ?? "").trim().length >= 8);
  if (!usable.length) return 0;

  const { text, map } = flattenHtml(root);
  const placed: WrapRange[] = [];

  const inactive = usable.filter((m) => !m.active);
  const active = usable.filter((m) => m.active);

  for (const m of [...inactive, ...active]) {
    const hit = quoteRange(text, m.quote);
    if (!hit) continue;
    const next: WrapRange = {
      ...hit,
      toneClass: m.toneClass ?? "",
      active: Boolean(m.active),
      findingId: m.findingId,
    };
    if (next.active) {
      for (let i = placed.length - 1; i >= 0; i--) {
        if (rangesOverlap(placed[i], next)) placed.splice(i, 1);
      }
    } else if (placed.some((p) => rangesOverlap(p, next))) {
      continue;
    }
    placed.push(next);
  }

  if (placed.length) wrapRanges(map, placed);
  return root.querySelectorAll("mark.evidence-hit").length;
}

export type HtmlHighlightResult = { html: string; hitCount: number };

/** Highlight a quote in a live DOM tree (Word preview, HTML reader). */
export function highlightQuoteInElement(
  root: HTMLElement,
  quote: string,
  toneClass = "",
): number {
  return highlightEvidenceInElement(root, [{ quote, toneClass, active: true }]);
}

/** Wrap quote matches in HTML. Returns hitCount so UI can tell if highlight worked. */
export function highlightQuoteInHtml(
  html: string,
  quote: string,
  toneClass = "",
): HtmlHighlightResult {
  if (!html) return { html, hitCount: 0 };
  if (!quote?.trim() || typeof document === "undefined") return { html, hitCount: 0 };

  const root = document.createElement("div");
  root.innerHTML = html;
  const hitCount = highlightQuoteInElement(root, quote, toneClass);
  return { html: root.innerHTML, hitCount };
}

export function highlightEvidenceInHtml(
  html: string,
  marks: EvidencePaintSpec[],
): HtmlHighlightResult {
  if (!html) return { html, hitCount: 0 };
  if (!marks.length || typeof document === "undefined") return { html, hitCount: 0 };
  const root = document.createElement("div");
  root.innerHTML = html;
  const hitCount = highlightEvidenceInElement(root, marks);
  return { html: root.innerHTML, hitCount };
}
