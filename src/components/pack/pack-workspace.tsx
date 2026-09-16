import { useEffect, useMemo, useState } from "react";
import { PackBrowser, type PackBrowserDoc } from "@/components/pack/pack-browser";
import { DocumentViewer } from "@/components/pack/document-viewer";
import { suggestAnnexPairs, displayPath, kindLabel } from "@/lib/pack-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import type { Severity, Verdict } from "@/lib/verdict";

type Props = {
  docs: PackBrowserDoc[];
  mode: "documents" | "compare";
  /** Prefer opening this document (e.g. from a finding). */
  focusDocId?: string | null;
  /** Prefer tender or bidder pane (e.g. mapping evidence jump). */
  initialSide?: "customer" | "supplier" | null;
  quote?: string;
  fallbackNeedle?: string;
  /** Colours evidence highlights to match the finding status. */
  severity?: Severity;
  verdict?: Verdict | null;
  className?: string;
};

export function PackWorkspace({
  docs,
  mode,
  focusDocId,
  initialSide,
  quote,
  fallbackNeedle,
  severity,
  verdict,
  className,
}: Props) {
  const { t } = useTranslation();
  const tender = useMemo(() => docs.filter((d) => d.role === "customer"), [docs]);
  const bidder = useMemo(() => docs.filter((d) => d.role === "supplier"), [docs]);
  const pairs = useMemo(() => suggestAnnexPairs(tender, bidder), [tender, bidder]);

  const [side, setSide] = useState<"customer" | "supplier">(initialSide ?? "supplier");
  const [tenderId, setTenderId] = useState<string | null>(null);
  const [bidderId, setBidderId] = useState<string | null>(null);
  const [activePairKey, setActivePairKey] = useState<string | null>(null);
  const [compareReady, setCompareReady] = useState(false);

  // Initialise selections when mode or pack contents change (not on every focus tick).
  useEffect(() => {
    if (!tender.length && !bidder.length) return;

    const focus = focusDocId ? docs.find((d) => d.id === focusDocId) : null;
    const kindPair =
      focus?.doc_kind
        ? pairs.find((p) => {
            const t = tender.find((d) => d.id === p.tenderId);
            const b = bidder.find((d) => d.id === p.bidderId);
            return t?.doc_kind === focus.doc_kind || b?.doc_kind === focus.doc_kind;
          })
        : null;
    const starter = kindPair ?? pairs[0] ?? null;

    if (mode === "compare") {
      if (starter) {
        setTenderId(starter.tenderId);
        setBidderId(starter.bidderId);
        setActivePairKey(`${starter.tenderId}-${starter.bidderId}`);
      } else {
        setTenderId(tender[0]?.id ?? null);
        setBidderId(bidder[0]?.id ?? null);
        setActivePairKey(null);
      }
      setCompareReady(true);
      return;
    }

    // Documents mode
    if (focus?.role === "customer" || initialSide === "customer") {
      setSide("customer");
      setTenderId(focus?.role === "customer" ? focus.id : tender[0]?.id ?? null);
      setBidderId(
        focus?.role === "customer"
          ? bidder.find((d) => d.doc_kind && d.doc_kind === focus.doc_kind)?.id ?? bidder[0]?.id ?? null
          : bidder[0]?.id ?? null,
      );
    } else if (focus?.role === "supplier" || initialSide === "supplier") {
      setSide("supplier");
      setBidderId(focus?.role === "supplier" ? focus.id : bidder[0]?.id ?? null);
      setTenderId(
        focus?.role === "supplier"
          ? tender.find((d) => d.doc_kind && d.doc_kind === focus.doc_kind)?.id ?? tender[0]?.id ?? null
          : tender[0]?.id ?? null,
      );
    } else {
      setTenderId(tender[0]?.id ?? null);
      setBidderId(bidder[0]?.id ?? null);
    }
    setCompareReady(true);
    // Only re-init when switching mode or pack identity changes — not when clicking findings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tender.length, bidder.length, pairs.length, initialSide, quote]);

  const applyPair = (tenderDocId: string, bidderDocId: string) => {
    setTenderId(tenderDocId);
    setBidderId(bidderDocId);
    setActivePairKey(`${tenderDocId}-${bidderDocId}`);
  };

  const activeList = side === "customer" ? tender : bidder;
  const activeId = side === "customer" ? tenderId : bidderId;
  const setActiveId = (id: string) => {
    if (side === "customer") setTenderId(id);
    else setBidderId(id);
    setActivePairKey(null);
  };
  const activeDoc = activeList.find((d) => d.id === activeId) ?? activeList[0] ?? null;

  const tenderDoc = tender.find((d) => d.id === tenderId) ?? null;
  const bidderDoc = bidder.find((d) => d.id === bidderId) ?? null;

  if (!compareReady && mode === "compare") {
    return (
      <div className={cn("flex items-center justify-center text-sm text-muted-foreground", className)}>
        {t("review.comparePreparing")}
      </div>
    );
  }

  if (mode === "compare") {
    const kindsMatch =
      tenderDoc?.doc_kind &&
      bidderDoc?.doc_kind &&
      tenderDoc.doc_kind === bidderDoc.doc_kind;

    return (
      <div className={cn("flex flex-col min-h-0 h-full", className)}>
        <div className="border-b px-4 py-2.5 flex items-center gap-2 flex-wrap bg-background shrink-0">
          <div className="text-sm font-medium">{t("review.compareTitle")}</div>
          <div className="text-xs text-muted-foreground">{t("review.compareHint")}</div>
          <div className="flex-1" />
          {pairs.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              {pairs.map((p) => {
                const key = `${p.tenderId}-${p.bidderId}`;
                const active = activePairKey === key;
                return (
                  <Button
                    key={key}
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => applyPair(p.tenderId, p.bidderId)}
                  >
                    <ArrowLeftRight className="w-3 h-3 mr-1" />
                    {p.reason}
                  </Button>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">{t("review.comparePickFiles")}</div>
          )}
        </div>
        {!kindsMatch && tenderDoc && bidderDoc && (
          <div className="px-4 py-1.5 text-[11px] text-warning border-b bg-warning/5">
            {t("review.compareTypeMismatch", {
              tender: kindLabel(tenderDoc.doc_kind),
              bidder: kindLabel(bidderDoc.doc_kind),
            })}
          </div>
        )}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2">
          <ComparePane
            label={t("dashboard.tenderPack")}
            tone="tender"
            docs={tender}
            selectedId={tenderDoc?.id ?? null}
            onSelect={(id) => {
              setTenderId(id);
              setActivePairKey(null);
            }}
            doc={tenderDoc}
            quote={quote}
            fallbackNeedle={fallbackNeedle}
            severity={severity}
            verdict={verdict}
            pickLabel={t("review.comparePickFile")}
          />
          <ComparePane
            label={t("dashboard.bidderPack")}
            tone="bidder"
            docs={bidder}
            selectedId={bidderDoc?.id ?? null}
            onSelect={(id) => {
              setBidderId(id);
              setActivePairKey(null);
            }}
            doc={bidderDoc}
            quote={quote}
            fallbackNeedle={fallbackNeedle}
            severity={severity}
            verdict={verdict}
            pickLabel={t("review.comparePickFile")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col min-h-0 h-full", className)}>
      <div className="border-b px-3 py-2 flex items-center gap-2 bg-background/80 shrink-0">
        <div className="text-sm font-medium">{t("review.viewDocuments")}</div>
        <div className="flex rounded-md border p-0.5 ml-2">
          <button
            type="button"
            className={cn(
              "px-2.5 py-1 text-xs rounded-sm",
              side === "customer" ? "bg-muted font-medium" : "text-muted-foreground",
            )}
            onClick={() => setSide("customer")}
          >
            Tender ({tender.length})
          </button>
          <button
            type="button"
            className={cn(
              "px-2.5 py-1 text-xs rounded-sm",
              side === "supplier" ? "bg-muted font-medium" : "text-muted-foreground",
            )}
            onClick={() => setSide("supplier")}
          >
            Bidder ({bidder.length})
          </button>
        </div>
        <div className="flex-1" />
        {activeDoc && (
          <Badge variant="secondary" className="text-[10px] font-normal hidden sm:inline-flex">
            {kindLabel(activeDoc.doc_kind)} · {displayPath(activeDoc)}
          </Badge>
        )}
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[280px_1fr]">
        <PackBrowser
          docs={activeList}
          selectedId={activeDoc?.id ?? null}
          onSelect={setActiveId}
          title={side === "customer" ? "Tender register" : "Bidder register"}
          tone={side === "customer" ? "tender" : "bidder"}
        />
        <div className="flex flex-col min-h-0 min-w-0 bg-muted/10">
          <div
            className={cn(
              "px-4 py-2.5 border-b text-xs flex items-center gap-2 shrink-0",
              side === "bidder" ? "bg-amber-500/[0.06]" : "bg-sky-500/[0.06]",
            )}
          >
            <span className="font-semibold truncate">{activeDoc?.filename ?? "—"}</span>
            {activeDoc?.doc_kind && (
              <Badge variant="secondary" className="text-[10px] font-normal shrink-0">
                {kindLabel(activeDoc.doc_kind)}
              </Badge>
            )}
            {activeDoc?.pack_label && activeDoc.pack_label !== "direct" && (
              <span className="text-muted-foreground truncate">· {activeDoc.pack_label}</span>
            )}
          </div>
          <div className="flex-1 min-h-0">
            <DocumentViewer
              doc={activeDoc}
              quote={quote}
              fallbackNeedle={fallbackNeedle}
              severity={severity}
              verdict={verdict}
              showFilename={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ComparePane({
  label,
  tone,
  docs,
  selectedId,
  onSelect,
  doc,
  quote,
  fallbackNeedle,
  severity,
  verdict,
  pickLabel,
}: {
  label: string;
  tone: "tender" | "bidder";
  docs: PackBrowserDoc[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  doc: PackBrowserDoc | null;
  quote?: string;
  fallbackNeedle?: string;
  severity?: Severity;
  verdict?: Verdict | null;
  pickLabel: string;
}) {
  return (
    <div className={cn("flex flex-col min-h-0 border-t lg:border-t-0", tone === "bidder" && "lg:border-l")}>
      <div
        className={cn(
          "px-3 py-2 border-b shrink-0 space-y-1.5",
          tone === "bidder" ? "bg-amber-500/[0.06]" : "bg-sky-500/[0.06]",
        )}
      >
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <Select value={selectedId ?? undefined} onValueChange={onSelect} disabled={!docs.length}>
          <SelectTrigger className="h-8 text-xs bg-background">
            <SelectValue placeholder={pickLabel} />
          </SelectTrigger>
          <SelectContent>
            {docs.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.filename}
                {d.doc_kind ? ` · ${kindLabel(d.doc_kind)}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 min-h-0 bg-background">
        <DocumentViewer
          doc={doc}
          quote={quote}
          fallbackNeedle={fallbackNeedle}
          severity={severity}
          verdict={verdict}
          showFilename={false}
        />
      </div>
    </div>
  );
}
