import { useMemo, useState } from "react";
import {
  buildPackTree,
  displayPath,
  formatBytes,
  kindLabel,
  type PackTreeNode,
} from "@/lib/pack-utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Shield,
  Scale,
  Banknote,
  FileSignature,
  Lock,
  ScrollText,
  Mail,
} from "lucide-react";

export type PackBrowserDoc = {
  id: string;
  role: string;
  filename: string;
  source_path?: string | null;
  pack_label?: string | null;
  doc_kind?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  storage_path?: string | null;
  parsed_text?: string | null;
  extracted_text?: string | null;
  sort_order?: number | null;
};

type Props = {
  docs: PackBrowserDoc[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  title?: string;
  /** Visual tone for tender vs bidder rail */
  tone?: "tender" | "bidder";
  className?: string;
};

function KindIcon({ kind }: { kind?: string | null }) {
  const cls = "w-3.5 h-3.5 shrink-0";
  switch (kind) {
    case "sla":
      return <Scale className={cls} />;
    case "dpa":
      return <Shield className={cls} />;
    case "pricing":
      return <Banknote className={cls} />;
    case "infosec":
      return <Lock className={cls} />;
    case "main_agreement":
      return <FileSignature className={cls} />;
    case "special_terms":
      return <ScrollText className={cls} />;
    case "invitation":
      return <Mail className={cls} />;
    default:
      return <FileText className={cls} />;
  }
}

function kindAccent(kind?: string | null) {
  switch (kind) {
    case "sla":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
    case "dpa":
      return "bg-violet-500/15 text-violet-700 dark:text-violet-300";
    case "pricing":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "infosec":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "main_agreement":
      return "bg-brand/15 text-brand";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function PackBrowser({ docs, selectedId, onSelect, title, tone = "tender", className }: Props) {
  const sorted = useMemo(
    () =>
      [...docs].sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          displayPath(a).localeCompare(displayPath(b), undefined, { numeric: true }),
      ),
    [docs],
  );
  const tree = useMemo(() => buildPackTree(sorted), [sorted]);
  const packLabel = sorted[0]?.pack_label;
  const kinds = useMemo(() => {
    const set = new Set(sorted.map((d) => d.doc_kind).filter(Boolean));
    return Array.from(set) as string[];
  }, [sorted]);

  const rail =
    tone === "bidder"
      ? "border-amber-500/20 bg-gradient-to-b from-amber-500/[0.06] to-background"
      : "border-sky-500/20 bg-gradient-to-b from-sky-500/[0.06] to-background";

  const headerBar = tone === "bidder" ? "border-amber-500/25" : "border-sky-500/25";

  return (
    <div className={cn("flex flex-col min-h-0 border-r", rail, className)}>
      <div className={cn("px-3 py-3 border-b shrink-0 space-y-2", headerBar)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div
              className={cn(
                "text-[10px] uppercase tracking-[0.14em] font-semibold",
                tone === "bidder" ? "text-amber-700/80 dark:text-amber-300/80" : "text-sky-700/80 dark:text-sky-300/80",
              )}
            >
              {title ?? (tone === "bidder" ? "Bidder pack" : "Tender pack")}
            </div>
            <div className="text-sm font-semibold truncate mt-0.5 tracking-tight">
              {packLabel && packLabel !== "direct" ? packLabel : `${sorted.length} file(s)`}
            </div>
          </div>
          <div
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
              tone === "bidder" ? "bg-amber-500/15 text-amber-800 dark:text-amber-200" : "bg-sky-500/15 text-sky-800 dark:text-sky-200",
            )}
          >
            {sorted.length}
          </div>
        </div>
        {kinds.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {kinds.slice(0, 5).map((k) => (
              <span
                key={k}
                className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-medium", kindAccent(k))}
              >
                <KindIcon kind={k} />
                {kindLabel(k)}
              </span>
            ))}
          </div>
        )}
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-0.5">
          {tree.length === 0 ? (
            <div className="text-xs text-muted-foreground p-3">No documents</div>
          ) : (
            tree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                selectedId={selectedId}
                onSelect={onSelect}
                docs={sorted}
                tone={tone}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function TreeNode({
  node,
  depth,
  selectedId,
  onSelect,
  docs,
  tone,
}: {
  node: PackTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  docs: PackBrowserDoc[];
  tone: "tender" | "bidder";
}) {
  const [open, setOpen] = useState(depth < 2);
  const pad = { paddingLeft: 8 + depth * 12 };

  if (node.type === "folder") {
    return (
      <div>
        <button
          type="button"
          className="w-full flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs hover:bg-background/70 text-left"
          style={pad}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />}
          <Folder className={cn("w-3.5 h-3.5 shrink-0", tone === "bidder" ? "text-amber-600" : "text-sky-600")} />
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {open &&
          node.children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              docs={docs}
              tone={tone}
            />
          ))}
      </div>
    );
  }

  const doc = docs.find((d) => d.id === node.docId);
  const selected = node.docId === selectedId;

  return (
    <button
      type="button"
      onClick={() => node.docId && onSelect(node.docId)}
      className={cn(
        "w-full flex items-start gap-2 rounded-lg px-2 py-2 text-xs text-left transition-all border border-transparent",
        selected
          ? tone === "bidder"
            ? "bg-background shadow-sm ring-1 ring-amber-500/35 border-amber-500/20"
            : "bg-background shadow-sm ring-1 ring-sky-500/35 border-sky-500/20"
          : "hover:bg-background/80",
      )}
      style={pad}
    >
      <div
        className={cn(
          "mt-0.5 flex h-7 w-7 items-center justify-center rounded-md shrink-0",
          kindAccent(doc?.doc_kind),
        )}
      >
        <KindIcon kind={doc?.doc_kind} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium leading-snug">{node.name}</div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {doc?.doc_kind && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px] font-normal">
              {kindLabel(doc.doc_kind)}
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">{formatBytes(doc?.size_bytes)}</span>
        </div>
      </div>
    </button>
  );
}

/** Compact register table for upload preview / report. */
export function PackRegisterTable({
  docs,
  onSelect,
  selectedId,
}: {
  docs: PackBrowserDoc[];
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}) {
  return (
    <div className="border rounded-md overflow-hidden text-xs">
      <div className="grid grid-cols-[1fr_120px_72px] gap-2 px-3 py-2 bg-muted/40 font-medium text-muted-foreground uppercase tracking-wider text-[10px]">
        <div>Path in pack</div>
        <div>Type</div>
        <div className="text-right">Size</div>
      </div>
      <div className="divide-y max-h-56 overflow-auto">
        {docs.map((d) => (
          <button
            key={d.id || displayPath(d)}
            type="button"
            disabled={!onSelect}
            onClick={() => onSelect?.(d.id)}
            className={cn(
              "grid grid-cols-[1fr_120px_72px] gap-2 px-3 py-2 w-full text-left hover:bg-muted/30",
              selectedId === d.id && "bg-brand/5",
            )}
          >
            <div className="truncate font-medium">{displayPath(d)}</div>
            <div className="text-muted-foreground truncate">{kindLabel(d.doc_kind)}</div>
            <div className="text-right text-muted-foreground">{formatBytes(d.size_bytes)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
