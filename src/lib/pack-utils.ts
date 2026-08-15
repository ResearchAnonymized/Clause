/** Helpers for tender / bidder document packs (ZIP folders, annex typing, trees). */

export type PackDocKind =
  | "invitation"
  | "main_agreement"
  | "sla"
  | "dpa"
  | "pricing"
  | "infosec"
  | "special_terms"
  | "other";

export type PackTreeNode = {
  name: string;
  path: string;
  type: "folder" | "file";
  docId?: string;
  kind?: PackDocKind | string | null;
  children?: PackTreeNode[];
};

// Order matters: more specific patterns first. Avoid bare "appendix 5" — tender
// pricing and bidder SLA annexes are both often numbered "5".
const KIND_RULES: Array<{ kind: PackDocKind; re: RegExp }> = [
  { kind: "invitation", re: /invitation|itt|hilma|tarjouspyyntö|call.?for.?tender/i },
  { kind: "sla", re: /sla|service.?level|service-map|1\.1|palvelutaso/i },
  { kind: "dpa", re: /\bdpa\b|personal.?data|gdpr|1\.2|tietosuoja|käsittely/i },
  { kind: "pricing", re: /pric(e|ing)|price-schedule|hinta|service-specific.?pricing/i },
  { kind: "infosec", re: /infosec|iso.?27001|security|tietoturva|soc.?2/i },
  { kind: "special_terms", re: /special.?terms|appendix.?2|liite.?2|erityisehdot/i },
  { kind: "main_agreement", re: /framework|main.?agreement|sopimus|offer|tarjous|agreement/i },
];

export function inferDocKind(filename: string, sourcePath?: string | null): PackDocKind {
  const hay = `${sourcePath ?? ""} ${filename}`;
  for (const rule of KIND_RULES) {
    if (rule.re.test(hay)) return rule.kind;
  }
  return "other";
}

export function kindLabel(kind: string | null | undefined): string {
  switch (kind) {
    case "invitation":
      return "Invitation";
    case "main_agreement":
      return "Main agreement";
    case "sla":
      return "SLA / service levels";
    case "dpa":
      return "DPA / data processing";
    case "pricing":
      return "Pricing";
    case "infosec":
      return "Information security";
    case "special_terms":
      return "Special terms";
    default:
      return "Other";
  }
}

export function displayPath(doc: {
  source_path?: string | null;
  pack_label?: string | null;
  filename: string;
}): string {
  if (doc.source_path?.trim()) return doc.source_path.replace(/\\/g, "/");
  if (doc.pack_label) return `${doc.pack_label}/${doc.filename}`;
  return doc.filename;
}

/** Build a folder tree from pack-relative paths. */
export function buildPackTree(
  docs: Array<{
    id: string;
    filename: string;
    source_path?: string | null;
    pack_label?: string | null;
    doc_kind?: string | null;
  }>,
): PackTreeNode[] {
  const root: PackTreeNode[] = [];

  const ensureFolder = (nodes: PackTreeNode[], name: string, path: string) => {
    let folder = nodes.find((n) => n.type === "folder" && n.name === name);
    if (!folder) {
      folder = { name, path, type: "folder", children: [] };
      nodes.push(folder);
    }
    return folder;
  };

  for (const doc of docs) {
    const full = displayPath(doc);
    const parts = full.split("/").filter(Boolean);
    if (!parts.length) continue;
    let cursor = root;
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      acc = acc ? `${acc}/${part}` : part;
      const isFile = i === parts.length - 1;
      if (isFile) {
        cursor.push({
          name: part,
          path: acc,
          type: "file",
          docId: doc.id,
          kind: doc.doc_kind,
        });
      } else {
        const folder = ensureFolder(cursor, part, acc);
        cursor = folder.children!;
      }
    }
  }

  const sortNodes = (nodes: PackTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
    for (const n of nodes) if (n.children) sortNodes(n.children);
  };
  sortNodes(root);
  return root;
}

/**
 * Suggest tender↔bidder annex pairs by doc_kind, then filename similarity.
 */
export function suggestAnnexPairs(
  tender: Array<{ id: string; filename: string; doc_kind?: string | null }>,
  bidder: Array<{ id: string; filename: string; doc_kind?: string | null }>,
): Array<{ tenderId: string; bidderId: string; reason: string }> {
  const pairs: Array<{ tenderId: string; bidderId: string; reason: string }> = [];
  const usedBidder = new Set<string>();

  const kinds = ["sla", "dpa", "pricing", "infosec", "special_terms", "main_agreement"] as const;
  for (const kind of kinds) {
    const t = tender.find((d) => d.doc_kind === kind);
    const b = bidder.find((d) => d.doc_kind === kind && !usedBidder.has(d.id));
    if (t && b) {
      pairs.push({ tenderId: t.id, bidderId: b.id, reason: kindLabel(kind) });
      usedBidder.add(b.id);
    }
  }
  return pairs;
}

export function formatBytes(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
