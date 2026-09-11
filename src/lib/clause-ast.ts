/**
 * Lightweight clause / document AST built from extracted text (and optional HTML).
 * Nodes are first-class blocks for headings, paragraphs, lists, and tables —
 * not a full legal parse, but enough structure for mapping and review.
 */

export type AstBlockType = "heading" | "paragraph" | "list_item" | "table" | "clause";

export type AstBlock = {
  id: string;
  type: AstBlockType;
  level?: number;
  text: string;
  clause_ref?: string;
  children?: AstBlock[];
};

export type ClauseDocumentAst = {
  version: 1;
  source: "text" | "html" | "ocr";
  blocks: AstBlock[];
  stats: {
    headings: number;
    paragraphs: number;
    list_items: number;
    tables: number;
    clauses: number;
  };
};

const HEADING_RE =
  /^(?:#{1,6}\s+|(?:SECTION|ARTICLE|CLAUSE|ANNEX|APPENDIX|SCHEDULE)\s+[\dIVXLC.]+[.:)]?\s*|(?:§|§§)\s*[\d.]+)/i;
const NUMBERED_HEADING_RE = /^\d+(?:\.\d+)*\.?\s+[A-ZÅÄÖ]/;
const CLAUSE_REF_RE = /(?:§\s*[\d.]+(?:\s*\([a-z0-9]+\))?|(?:Article|Clause|Section)\s+[\d.]+)/i;
const LIST_RE = /^\s*(?:[-*•]|[0-9]+[.)]|[a-z][.)])\s+/;
const TABLE_LINE_RE = /\|.+\||\t.+\t/;

const MONTH_RE =
  /January|February|March|April|May|June|July|August|September|October|November|December/i;

/** "1. Executive summary" is a heading; "1. The Supplier shall …." is a list item. */
export function isNumberedSectionHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length >= 120 || !NUMBERED_HEADING_RE.test(trimmed)) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  // Allocations like "0.6 FTE" are not section titles.
  if (/^0+(?:\.\d+)*\.?\s/.test(trimmed)) return false;
  // "14 August 2026" / deadline timestamps.
  if (new RegExp(`^\\d{1,2}\\s+(?:${MONTH_RE.source})\\b`, "i").test(trimmed)) return false;
  return true;
}

function blockId(ord: number, type: string): string {
  return `b${ord}-${type}`;
}

function detectClauseRef(text: string): string | undefined {
  const m = text.match(CLAUSE_REF_RE);
  return m ? m[0].replace(/\s+/g, " ").trim() : undefined;
}

function headingLevel(line: string): number {
  const md = line.match(/^(#{1,6})\s/);
  if (md) return md[1].length;
  if (/^(?:ARTICLE|SECTION)\b/i.test(line)) return 1;
  if (/^(?:CLAUSE|ANNEX|APPENDIX|SCHEDULE)\b/i.test(line)) return 2;
  if (/^§/.test(line)) return 2;
  const num = line.match(/^(\d+(?:\.\d+)*)/);
  if (num) return Math.min(4, num[1].split(".").length);
  return 2;
}

/** Build an ordered AST from plain extracted text. */
export function buildClauseAstFromText(
  text: string,
  source: ClauseDocumentAst["source"] = "text",
): ClauseDocumentAst {
  const clean = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const blocks: AstBlock[] = [];
  if (!clean) {
    return { version: 1, source, blocks: [], stats: emptyStats() };
  }

  const parts = clean.split(/\n{2,}/);
  let ord = 0;
  let tableBuf: string[] = [];

  const flushTable = () => {
    if (!tableBuf.length) return;
    const body = tableBuf.join("\n").trim();
    if (body) {
      blocks.push({
        id: blockId(++ord, "table"),
        type: "table",
        text: body.slice(0, 8000),
      });
    }
    tableBuf = [];
  };

  for (const part of parts) {
    const lines = part.split("\n").map((l) => l.trimEnd());
    const nonEmpty = lines.filter((l) => l.trim());
    if (!nonEmpty.length) continue;

    if (nonEmpty.length >= 2 && nonEmpty.every((l) => TABLE_LINE_RE.test(l))) {
      flushTable();
      tableBuf = nonEmpty;
      flushTable();
      continue;
    }

    for (const line of nonEmpty) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (TABLE_LINE_RE.test(trimmed) && trimmed.includes("|")) {
        tableBuf.push(trimmed);
        continue;
      }
      flushTable();

      if ((HEADING_RE.test(trimmed) || isNumberedSectionHeading(trimmed)) && trimmed.length < 200) {
        const ref = detectClauseRef(trimmed);
        blocks.push({
          id: blockId(++ord, ref ? "clause" : "heading"),
          type: ref ? "clause" : "heading",
          level: headingLevel(trimmed),
          text: trimmed.slice(0, 2000),
          clause_ref: ref,
        });
        continue;
      }

      if (LIST_RE.test(trimmed) && !isNumberedSectionHeading(trimmed)) {
        blocks.push({
          id: blockId(++ord, "list"),
          type: "list_item",
          text: trimmed.replace(LIST_RE, "").slice(0, 4000),
          clause_ref: detectClauseRef(trimmed),
        });
        continue;
      }

      const ref = detectClauseRef(trimmed);
      blocks.push({
        id: blockId(++ord, ref ? "clause" : "para"),
        type: ref && trimmed.length < 280 ? "clause" : "paragraph",
        text: trimmed.slice(0, 8000),
        clause_ref: ref,
      });
    }
  }
  flushTable();

  return { version: 1, source, blocks, stats: countStats(blocks) };
}

/** Prefer HTML structure (DOCX via mammoth) when available. */
export function buildClauseAstFromHtml(html: string): ClauseDocumentAst {
  const raw = String(html ?? "");
  if (!raw.trim()) return buildClauseAstFromText("", "html");

  const blocks: AstBlock[] = [];
  let ord = 0;

  const tagRe =
    /<(h[1-6]|p|li|tr)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(raw))) {
    const tag = m[1].toLowerCase();
    const inner = stripTags(m[2]).replace(/\s+/g, " ").trim();
    if (!inner) continue;
    if (tag.startsWith("h")) {
      const level = Number(tag[1]) || 2;
      const ref = detectClauseRef(inner);
      blocks.push({
        id: blockId(++ord, ref ? "clause" : "heading"),
        type: ref ? "clause" : "heading",
        level,
        text: inner.slice(0, 2000),
        clause_ref: ref,
      });
    } else if (tag === "li") {
      blocks.push({
        id: blockId(++ord, "list"),
        type: "list_item",
        text: inner.slice(0, 4000),
        clause_ref: detectClauseRef(inner),
      });
    } else if (tag === "tr") {
      blocks.push({
        id: blockId(++ord, "table"),
        type: "table",
        text: inner.slice(0, 4000),
      });
    } else {
      const ref = detectClauseRef(inner);
      blocks.push({
        id: blockId(++ord, ref ? "clause" : "para"),
        type: ref && inner.length < 280 ? "clause" : "paragraph",
        text: inner.slice(0, 8000),
        clause_ref: ref,
      });
    }
  }

  if (!blocks.length) {
    return buildClauseAstFromText(stripTags(raw), "html");
  }
  return { version: 1, source: "html", blocks, stats: countStats(blocks) };
}

/** Flatten AST back to text (RAG / display). */
export function flattenAstText(ast: ClauseDocumentAst): string {
  return ast.blocks
    .map((b) => (b.type === "heading" || b.type === "clause" ? b.text : b.text))
    .join("\n\n");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function emptyStats(): ClauseDocumentAst["stats"] {
  return { headings: 0, paragraphs: 0, list_items: 0, tables: 0, clauses: 0 };
}

function countStats(blocks: AstBlock[]): ClauseDocumentAst["stats"] {
  const stats = emptyStats();
  for (const b of blocks) {
    if (b.type === "heading") stats.headings += 1;
    else if (b.type === "paragraph") stats.paragraphs += 1;
    else if (b.type === "list_item") stats.list_items += 1;
    else if (b.type === "table") stats.tables += 1;
    else if (b.type === "clause") stats.clauses += 1;
  }
  return stats;
}
