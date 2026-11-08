import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VerdictBadge } from "@/components/verdict-badge";
import { toVerdict, verdictTone, type Verdict } from "@/lib/verdict";
import { ChevronLeft, ChevronRight, ClipboardList, Loader2, CheckCircle2, XCircle, AlertTriangle, MinusCircle, PenLine, RefreshCw, Clock, Lock, FileStack, LocateFixed } from "lucide-react";
import { toast } from "sonner";
import {
  ANALYZER_VERSION,
  CHUNKER_VERSION,
  EXTRACTOR_VERSION,
  computeStaleness,
  type Staleness,
} from "@/lib/pipeline-version";
import { reanalyseRun } from "@/lib/reanalyse-run.functions";
import { useServerFn } from "@tanstack/react-start";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PackWorkspace } from "@/components/pack/pack-workspace";
import { DocumentViewer, scrollToEvidenceQuote, type EvidenceLayout } from "@/components/pack/document-viewer";
import { ClausePairsTeaser } from "@/components/pack/clause-pairs-panel";
import { findQuoteInText } from "@/lib/highlight-quote";
import { locateInDocument } from "@/lib/evidence-locator";
import { cn } from "@/lib/utils";
import { RunWorkspaceLayout, type RunWorkspacePage } from "@/components/run-workspace-layout";
import { computeReportData } from "@/lib/report-data";

type RunViewMode = "findings" | "documents" | "compare";

export const Route = createFileRoute("/_authenticated/runs/$runId")({
  head: () => ({ meta: [{ title: "Review — Counterpart" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    view: (search.view === "documents" || search.view === "compare" || search.view === "findings"
      ? search.view
      : undefined) as RunViewMode | undefined,
    side: (search.side === "customer" || search.side === "supplier" ? search.side : undefined) as
      | "customer"
      | "supplier"
      | undefined,
    quote: typeof search.quote === "string" ? search.quote : undefined,
  }),
  component: ReviewRoomPage,
});

type Criterion = { id: string; name: string; description: string | null; prompt: string | null; category: string | null; sort_order: number | null; enabled?: boolean | null };
type Finding = {
  id: string; run_id: string; criterion_id: string | null; criterion_name: string | null;
  severity: string | null; evidence_quote: string | null; evidence_chunk_ids: string[] | null;
  justification: string | null; recommended_action: string | null; clause_ref: string | null;
  agent_name: string | null; grounded: boolean | null;
  analyzer_version: number | null; extractor_version: number | null; chunker_version: number | null;
  superseded_at: string | null;
};
type RunDoc = {
  id: string; role: string; filename: string; parsed_text: string | null; extracted_text: string | null;
  extractor_version: number | null;
  storage_path?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  source_path?: string | null;
  pack_label?: string | null;
  doc_kind?: string | null;
  sort_order?: number | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  SLA: "Service Level Agreement",
  DPA: "Data Processing & GDPR",
  GDPR: "Data Processing & GDPR",
  INFOSEC: "Information Security",
  SECURITY: "Information Security",
  PRICING: "Pricing & Commercials",
  COMMERCIAL: "Pricing & Commercials",
  LEGAL: "Legal & Contractual Terms",
  IPR: "Intellectual Property Rights",
  EXIT: "Exit & Termination",
  SCOPE: "Scope of Services",
  SUPPORT: "Support & Maintenance",
  CHANGE: "Change Management",
  COMPLIANCE: "Regulatory Compliance",
};
const SHORT_CATEGORY_LABELS: Record<string, string> = {
  SLA: "SLA",
  DPA: "GDPR",
  GDPR: "GDPR",
  INFOSEC: "InfoSec",
  SECURITY: "InfoSec",
  PRICING: "Pricing",
  COMMERCIAL: "Pricing",
  LEGAL: "Legal",
  IPR: "IPR",
  EXIT: "Exit",
  SCOPE: "Scope",
  SUPPORT: "Support",
  CHANGE: "Change",
  COMPLIANCE: "Compliance",
};
function expandCategory(cat: string | null | undefined): string {
  if (!cat) return "";
  const key = cat.trim().toUpperCase();
  return CATEGORY_LABELS[key] ?? cat;
}
function shortenCategory(cat: string | null | undefined): string {
  if (!cat) return "Other";
  const key = cat.trim().toUpperCase();
  return SHORT_CATEGORY_LABELS[key] ?? cat;
}

const CATEGORY_TOPIC_KEY: Record<string, string> = {
  SLA: "review.categorySla",
  DPA: "review.categoryDpa",
  GDPR: "review.categoryDpa",
  INFOSEC: "review.categoryInfosec",
  SECURITY: "review.categoryInfosec",
  PRICING: "review.categoryPricing",
  COMMERCIAL: "review.categoryPricing",
  LEGAL: "review.categoryLegal",
  IPR: "review.categoryLegal",
  EXIT: "review.categoryExit",
  TERMINATION: "review.categoryExit",
  SCOPE: "review.categoryScope",
  SUPPORT: "review.categoryScope",
  CHANGE: "review.categoryLegal",
  COMPLIANCE: "review.categoryLegal",
};

const CATEGORY_SHORT_KEY: Record<string, string> = {
  SLA: "review.categoryShortSla",
  DPA: "review.categoryShortDpa",
  GDPR: "review.categoryShortDpa",
  INFOSEC: "review.categoryShortInfosec",
  SECURITY: "review.categoryShortInfosec",
  PRICING: "review.categoryShortPricing",
  COMMERCIAL: "review.categoryShortPricing",
  LEGAL: "review.categoryShortLegal",
  IPR: "review.categoryShortLegal",
  EXIT: "review.categoryShortExit",
  TERMINATION: "review.categoryShortExit",
  SCOPE: "review.categoryShortScope",
  SUPPORT: "review.categoryShortScope",
  CHANGE: "review.categoryShortLegal",
  COMPLIANCE: "review.categoryShortLegal",
  __OTHER__: "review.categoryShortOther",
};

function topicLabel(t: TFunction, cat: string | null | undefined): string {
  const key = (cat ?? "").trim().toUpperCase();
  if (!key || key === "__OTHER__") return t("review.categoryOther");
  const i18nKey = CATEGORY_TOPIC_KEY[key];
  return i18nKey ? t(i18nKey) : expandCategory(cat);
}

function topicShort(t: TFunction, catKey: string): string {
  const key = catKey.trim().toUpperCase() || "__OTHER__";
  const i18nKey = CATEGORY_SHORT_KEY[key];
  return i18nKey ? t(i18nKey) : shortenCategory(catKey);
}

function ReviewRoomPage() {
  const { t } = useTranslation();
  const { runId } = Route.useParams();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: run } = useQuery({
    queryKey: ["run", runId],
    queryFn: async () => (await supabase.from("runs").select("*").eq("id", runId).maybeSingle()).data,
    refetchInterval: (q) => (q.state.data?.status === "running" || q.state.data?.status === "queued" ? 1500 : false),
  });

  const { data: docs } = useQuery({
    queryKey: ["run_docs", runId],
    queryFn: async () => ((await supabase.from("run_documents").select("*").eq("run_id", runId)).data ?? []) as RunDoc[],
  });

  const { data: findings } = useQuery({
    queryKey: ["findings", runId],
    queryFn: async () =>
      ((await supabase.from("findings").select("*").eq("run_id", runId).is("superseded_at", null).order("created_at")).data ?? []) as Finding[],
    refetchInterval: (q) => (run?.status === "running" || run?.status === "queued" ? 1500 : false),
  });

  const { data: criteria } = useQuery({
    queryKey: ["run_criteria", run?.criteria_set_id],
    enabled: !!run?.criteria_set_id,
    queryFn: async () =>
      ((await supabase.from("criteria").select("*").eq("set_id", run!.criteria_set_id as string).order("sort_order")).data ?? []) as Criterion[],
  });

  useEffect(() => {
    const ch = supabase.channel(`review-${runId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "findings", filter: `run_id=eq.${runId}` },
        () => qc.invalidateQueries({ queryKey: ["findings", runId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "runs", filter: `id=eq.${runId}` },
        () => qc.invalidateQueries({ queryKey: ["run", runId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [runId, qc]);

  // Ordered rows: one per enabled criterion. If no finding yet, treat as pending.
  const rows = useMemo(() => {
    if (!criteria) return [];
    const byCrit = new Map((findings ?? []).map((f) => [f.criterion_id, f] as const));
    return criteria
      .filter((c) => c.enabled !== false)
      .map((c) => ({ criterion: c, finding: byCrit.get(c.id) ?? null }));
  }, [criteria, findings]);

  const [activeCat, setActiveCat] = useState<string>("__all__");
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);

  // Agent tabs — group by category, with counts, sorted by risk (gaps first)
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; total: number; c: Record<Verdict, number> }>();
    for (const r of rows) {
      const key = (r.criterion.category?.trim().toUpperCase()) || "__OTHER__";
      const label = topicLabel(t, key === "__OTHER__" ? null : r.criterion.category);
      const g = map.get(key) ?? { key, label, total: 0, c: { aligned: 0, partial: 0, gap: 0, not_addressed: 0 } };
      g.total += 1;
      g.c[toVerdict(r.finding?.severity)]++;
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => {
      const riskA = a.c.gap * 1000 + a.c.partial * 10 + a.c.not_addressed;
      const riskB = b.c.gap * 1000 + b.c.partial * 10 + b.c.not_addressed;
      if (riskB !== riskA) return riskB - riskA;
      return a.label.localeCompare(b.label);
    });
  }, [rows, t]);

  const visibleRows = useMemo(
    () => (activeCat === "__all__" ? rows : rows.filter((r) => ((r.criterion.category?.trim().toUpperCase()) || "__OTHER__") === activeCat)),
    [rows, activeCat]
  );

  // Group visible rows by full agent label for the evidence stream.
  const streamGroups = useMemo(() => {
    const m = new Map<string, { label: string; items: typeof visibleRows }>();
    for (const r of visibleRows) {
      const label = topicLabel(t, r.criterion.category);
      const g = m.get(label) ?? { label, items: [] as typeof visibleRows };
      g.items.push(r);
      m.set(label, g);
    }
    // Sort items inside each group: gap, partial, aligned, not_addressed
    const rank: Record<Verdict, number> = { gap: 0, partial: 1, aligned: 2, not_addressed: 3 };
    for (const g of m.values()) {
      g.items.sort((a, b) => rank[toVerdict(a.finding?.severity)] - rank[toVerdict(b.finding?.severity)]);
    }
    return Array.from(m.values()).sort((a, b) => {
      const risk = (items: typeof visibleRows) => items.reduce((n, r) => {
        const v = toVerdict(r.finding?.severity);
        return n + (v === "gap" ? 1000 : v === "partial" ? 10 : 0);
      }, 0);
      return risk(b.items) - risk(a.items);
    });
  }, [visibleRows, t]);

  const supplierDocs = (docs ?? []).filter((d) => d.role === "supplier");
  const customerDocs = (docs ?? []).filter((d) => d.role === "customer");
  const [packDocId, setPackDocId] = useState<string | null>(null);
  const [paneSide, setPaneSide] = useState<"customer" | "supplier">("supplier");
  const [evidenceLayout, setEvidenceLayout] = useState<EvidenceLayout>("empty");
  const evidencePaneRef = useRef<HTMLDivElement>(null);
  // Analysis / findings is always the home view. Documents & Compare are secondary tools.
  const [viewMode, setViewMode] = useState<RunViewMode>(search.view ?? "findings");
  const [evidenceQuote, setEvidenceQuote] = useState<string>(search.quote ?? "");
  const [evidenceSide, setEvidenceSide] = useState<"customer" | "supplier" | null>(search.side ?? null);

  /** Push Analysis / Documents / Compare into the URL so browser Back/Forward works. */
  const goToView = useCallback(
    (
      next: RunViewMode,
      opts?: { quote?: string | null; side?: "customer" | "supplier" | null; replace?: boolean },
    ) => {
      const nextQuote =
        next === "documents"
          ? opts && "quote" in opts
            ? opts.quote ?? undefined
            : evidenceQuote || undefined
          : undefined;
      const nextSide =
        next === "findings"
          ? undefined
          : opts && "side" in opts
            ? opts.side ?? undefined
            : evidenceSide ?? undefined;

      const quoteChanging = opts && "quote" in opts;
      const sideChanging = opts && "side" in opts;
      if (next === viewMode && !quoteChanging && !sideChanging && !opts?.replace) {
        return;
      }

      setViewMode(next);
      if (quoteChanging) setEvidenceQuote(opts.quote ?? "");
      if (sideChanging) setEvidenceSide(opts.side ?? null);

      navigate({
        to: "/runs/$runId",
        params: { runId },
        search: {
          view: next === "findings" ? undefined : next,
          side: nextSide,
          quote: nextQuote?.trim() ? nextQuote : undefined,
        },
        replace: opts?.replace,
      });
    },
    [navigate, runId, evidenceQuote, evidenceSide, viewMode],
  );

  useEffect(() => {
    if (typeof search.quote === "string" && search.quote.trim()) {
      setEvidenceQuote(search.quote);
      setEvidenceSide(search.side ?? "supplier");
      setViewMode(search.view ?? "documents");
      setPackDocId(null);
      return;
    }
    // Keep view in sync with browser Back/Forward (including cleared search → Analysis).
    setViewMode(search.view ?? "findings");
    if (search.side) setEvidenceSide(search.side);
  }, [search.view, search.quote, search.side]);

  const anySupplierText = useMemo(
    () =>
      supplierDocs.some((d) =>
        Boolean(firstUsableDocumentText(d.parsed_text, d.extracted_text)),
      ),
    [supplierDocs],
  );

  // Backfill parsed_text for older runs that were ingested before we started
  // persisting it. Fires once when we detect an empty supplier document.
  const backfilledRef = useRef(false);
  useEffect(() => {
    if (backfilledRef.current) return;
    if (!docs || docs.length === 0) return;
    if (anySupplierText) return;
    if (run?.status === "queued" || run?.status === "running") return;
    backfilledRef.current = true;
    (async () => {
      try {
        const { backfillRunParsedText } = await import("@/lib/backfill-parsed-text.functions");
        const res = await backfillRunParsedText({ data: { runId } });
        if ((res as any)?.updated > 0) {
          qc.invalidateQueries({ queryKey: ["run_docs", runId] });
        }
      } catch {
        // silent — the empty-state message already covers this
      }
    })();
  }, [docs, anySupplierText, run?.status, runId, qc]);

  const isLive = run?.status === "running" || run?.status === "queued";

  // Buyer-facing summary — same formula as the full report and PDF.
  const report = useMemo(() => {
    if (!criteria) {
      return computeReportData([], []);
    }
    return computeReportData((findings ?? []) as any, criteria as any);
  }, [findings, criteria]);
  const counts = report.counts;

  const recommendation = useMemo((): Recommendation => {
    const rec = report.recommendation;
    const kind: Recommendation["kind"] =
      rec.kind === "reject" ? "do_not_sign" : rec.kind === "sign" ? "safe" : rec.kind;
    return { kind, headline: rec.headline, reason: rec.reason, score: report.score };
  }, [report]);

  // ---- Pipeline staleness --------------------------------------------------
  // Findings + docs may have been produced by an older extractor / chunker /
  // analyzer than we now run. When that happens the verdict on the left can
  // contradict the re-parsed document on the right (e.g. "unreadable
  // characters" beside a perfectly readable ISO 27001 clause). We surface it
  // as a banner + offer a one-click re-analyse, and gate the sign flow.
  const supplierDocVersion = useMemo(() => {
    const versions = (docs ?? [])
      .filter((d) => d.role === "supplier")
      .map((d) => d.extractor_version ?? 0);
    if (!versions.length) return null;
    return Math.min(...versions);
  }, [docs]);
  const runStaleness: Staleness = useMemo(() => {
    // No findings yet (queued/running) — don't flash a false stale banner.
    if (!findings?.length) {
      return computeStaleness({
        documentExtractorVersion: EXTRACTOR_VERSION,
        chunkExtractorVersion: EXTRACTOR_VERSION,
        chunkChunkerVersion: CHUNKER_VERSION,
        findingAnalyzerVersion: ANALYZER_VERSION,
        findingExtractorVersion: EXTRACTOR_VERSION,
        findingChunkerVersion: CHUNKER_VERSION,
      });
    }
    // Take the "worst" (lowest) versions across findings to represent the run.
    let minAnaV: number | null = null, minExtV: number | null = null, minChkV: number | null = null;
    for (const f of findings) {
      if (minAnaV === null || (f.analyzer_version ?? 0) < minAnaV) minAnaV = f.analyzer_version ?? 0;
      if (minExtV === null || (f.extractor_version ?? 0) < minExtV) minExtV = f.extractor_version ?? 0;
      if (minChkV === null || (f.chunker_version ?? 0) < minChkV) minChkV = f.chunker_version ?? 0;
    }
    return computeStaleness({
      documentExtractorVersion: supplierDocVersion,
      chunkExtractorVersion: supplierDocVersion, // proxy — chunks match doc extraction
      // Use findings' chunker stamp (same value written at ingest). Passing null
      // here previously forced a permanent false "newer chunker" banner.
      chunkChunkerVersion: minChkV,
      findingAnalyzerVersion: minAnaV,
      findingExtractorVersion: minExtV,
      findingChunkerVersion: minChkV,
    });
  }, [findings, supplierDocVersion]);




  const [reanalysing, setReanalysing] = useState(false);
  const callReanalyse = useServerFn(reanalyseRun);
  const onReanalyse = async () => {
    if (reanalysing) return;
    setReanalysing(true);
    try {
      const res = await callReanalyse({ data: { runId, mode: "auto" } });
      toast.success(t("review.reanalyseDone") ?? `Re-analysed (${(res as any)?.mode ?? "auto"})`);
      qc.invalidateQueries({ queryKey: ["findings", runId] });
      qc.invalidateQueries({ queryKey: ["run", runId] });
      qc.invalidateQueries({ queryKey: ["run_docs", runId] });
    } catch (err: any) {
      toast.error((err?.message as string) ?? "Re-analysis failed");
    } finally {
      setReanalysing(false);
    }
  };

  // Ensure something is selected once findings arrive.
  useEffect(() => {
    if (activeFindingId && visibleRows.some((r) => r.finding?.id === activeFindingId)) return;
    const first = visibleRows.find((r) => r.finding)?.finding?.id ?? null;
    setActiveFindingId(first);
  }, [visibleRows, activeFindingId]);

  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const registerCard = (id: string) => (el: HTMLButtonElement | null) => {
    if (el) cardRefs.current.set(id, el); else cardRefs.current.delete(id);
  };
  const selectFinding = (id: string) => {
    setActiveFindingId(id);
    setPackDocId(null); // let evidence quote pick the right pack file
    goToView("findings", { quote: null, side: null });
    const el = cardRefs.current.get(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const active = useMemo(
    () => visibleRows.find((r) => r.finding?.id === activeFindingId) ?? visibleRows[0],
    [visibleRows, activeFindingId],
  );

  const focusEvidenceDoc = useMemo(() => {
    const preferCustomer = evidenceSide === "customer";
    const pool = preferCustomer ? customerDocs : supplierDocs;
    if (!pool.length) return null;
    if (packDocId) {
      return pool.find((d) => d.id === packDocId) ?? pool[0];
    }
    const quote = (evidenceQuote || active?.finding?.evidence_quote || "").trim();
    if (quote.length >= 8) {
      const hit = pool.find((d) => {
        const text = firstUsableDocumentText(d.parsed_text, d.extracted_text);
        return !!findQuoteInText(text, quote).hit;
      });
      if (hit) return hit;
    }
    if (active?.finding) {
      const located = pool.find((d) => {
        const text = firstUsableDocumentText(d.parsed_text, d.extracted_text);
        return Boolean(
          locateInDocument(text, {
            evidenceQuote: active.finding?.evidence_quote,
            justification: active.finding?.justification,
            criterionName: active.criterion.name,
            category: active.criterion.category,
          }),
        );
      });
      if (located) return located;
    }
    return pool[0];
  }, [
    supplierDocs,
    customerDocs,
    packDocId,
    active?.finding?.evidence_quote,
    evidenceQuote,
    evidenceSide,
  ]);

  const evidencePool = paneSide === "customer" ? customerDocs : supplierDocs;

  const evidenceDoc = useMemo(() => {
    if (packDocId) {
      const pinned = evidencePool.find((d) => d.id === packDocId);
      if (pinned) return pinned;
    }
    const quote = (active?.finding?.evidence_quote || "").trim();
    if (quote.length >= 8) {
      const hit = evidencePool.find((d) => {
        const text = firstUsableDocumentText(d.parsed_text, d.extracted_text);
        return !!findQuoteInText(text, quote).hit;
      });
      if (hit) return hit;
    }
    if (active?.finding) {
      const located = evidencePool.find((d) => {
        const text = firstUsableDocumentText(d.parsed_text, d.extracted_text);
        return Boolean(
          locateInDocument(text, {
            evidenceQuote: active.finding?.evidence_quote,
            justification: active.finding?.justification,
            criterionName: active.criterion.name,
            category: active.criterion.category,
          }),
        );
      });
      if (located) return located;
    }
    return evidencePool[0] ?? null;
  }, [evidencePool, packDocId, active?.finding?.evidence_quote, active?.finding?.justification, active?.criterion.name, active?.criterion.category]);

  useEffect(() => {
    if (!active?.finding) {
      setPaneSide(supplierDocs.length ? "supplier" : "customer");
      return;
    }
    const input = {
      evidenceQuote: active.finding.evidence_quote,
      justification: active.finding.justification,
      criterionName: active.criterion.name,
      category: active.criterion.category,
    };
    const inSupplier = supplierDocs.some((d) =>
      Boolean(locateInDocument(firstUsableDocumentText(d.parsed_text, d.extracted_text), input)),
    );
    const inCustomer = customerDocs.some((d) =>
      Boolean(locateInDocument(firstUsableDocumentText(d.parsed_text, d.extracted_text), input)),
    );
    if (inCustomer && !inSupplier) setPaneSide("customer");
    else setPaneSide(supplierDocs.length ? "supplier" : "customer");
    // Only re-aim when the selected finding changes; user can still toggle Tender/Bidder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.finding?.id]);

  const onEvidenceLayout = useCallback((layout: EvidenceLayout) => {
    setEvidenceLayout(layout);
  }, []);

  const selectPaneSide = (next: "customer" | "supplier") => {
    if (next === paneSide) return;
    const current = evidenceDoc;
    const to = next === "customer" ? customerDocs : supplierDocs;
    setPaneSide(next);
    if (current?.doc_kind) {
      const match = to.find((d) => d.doc_kind === current.doc_kind);
      setPackDocId(match?.id ?? to[0]?.id ?? null);
    } else {
      setPackDocId(to[0]?.id ?? null);
    }
  };

  const evidenceQuoteText = (active?.finding?.evidence_quote || "").trim();
  const locatedPassage = useMemo(() => {
    if (!active?.finding || !evidenceDoc) return null;
    return locateInDocument(firstUsableDocumentText(evidenceDoc.parsed_text, evidenceDoc.extracted_text), {
      evidenceQuote: active.finding.evidence_quote,
      justification: active.finding.justification,
      criterionName: active.criterion.name,
      category: active.criterion.category,
    });
  }, [active?.finding, active?.criterion.name, active?.criterion.category, evidenceDoc]);
  const locatorDisplay = evidenceQuoteText || locatedPassage || "";
  const locatorIsRelated = !evidenceQuoteText && Boolean(locatedPassage);

  const evidenceMarks = useMemo(
    () =>
      rows
        .filter((r) => r.finding)
        .map((r) => {
          const f = r.finding!;
          const stored = (f.evidence_quote ?? "").trim();
          const text = firstUsableDocumentText(evidenceDoc?.parsed_text, evidenceDoc?.extracted_text);
          const located = text
            ? locateInDocument(text, {
                evidenceQuote: stored,
                justification: f.justification,
                criterionName: r.criterion.name,
                category: r.criterion.category,
              })
            : null;
          const quote = stored.length >= 8 ? stored : located ?? "";
          if (quote.length < 8) return null;
          return { id: f.id, quote, severity: f.severity };
        })
        .filter((m): m is { id: string; quote: string; severity: string | null } => Boolean(m)),
    [rows, evidenceDoc],
  );

  if (!run) return <div className="p-8 text-muted-foreground">{t("common.loading")}</div>;

  const isStale = runStaleness.level !== "fresh";
  const isCriticallyStale = runStaleness.level === "critical";
  const workspacePage: RunWorkspacePage =
    viewMode === "compare" ? "compare" : viewMode === "documents" ? "documents" : "analysis";

  return (
    <RunWorkspaceLayout
      runId={runId}
      page={workspacePage}
      title={run.title}
      subtitle={[
        t("review.requirementCount", { count: rows.length }),
        t("review.packLine", { tender: customerDocs.length, bidder: supplierDocs.length }),
      ].join(" · ")}
      fill
      banner={
        <>
          {isLive && (
            <div className="border-b bg-brand-soft/50 text-brand text-xs px-4 lg:px-6 py-2 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t("review.stillWorking")}
            </div>
          )}
          {isStale && !isLive && (
            <div
              className={cn(
                "border-b px-4 lg:px-6 py-2 flex items-center gap-3 text-xs",
                isCriticallyStale
                  ? "bg-warning/10 text-warning-foreground"
                  : "bg-muted/50 text-muted-foreground",
              )}
            >
              <Clock className={cn("w-3.5 h-3.5 shrink-0", isCriticallyStale ? "text-warning" : "text-muted-foreground")} />
              <div className="min-w-0 flex-1">
                <span className="font-medium text-foreground">
                  {isCriticallyStale ? t("review.staleCritical") : t("review.staleMinor")}
                </span>
                {runStaleness.reason ? (
                  <span className="text-muted-foreground"> — {runStaleness.reason}</span>
                ) : null}
              </div>
              <Button
                size="sm"
                variant={isCriticallyStale ? "default" : "outline"}
                className="h-7 px-2.5 text-xs shrink-0"
                disabled={reanalysing}
                onClick={onReanalyse}
              >
                {reanalysing ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> {t("review.reanalysing")}</>
                ) : (
                  <><RefreshCw className="w-3 h-3 mr-1" /> {t("review.reanalyse")}</>
                )}
              </Button>
            </div>
          )}
        </>
      }
    >

      {(viewMode === "documents" || viewMode === "compare") && (
        <div className="flex-1 min-h-0 flex flex-col">
          <PackWorkspace
            docs={(docs ?? []) as any}
            mode={viewMode === "compare" ? "compare" : "documents"}
            focusDocId={focusEvidenceDoc?.id ?? evidenceDoc?.id ?? null}
            initialSide={evidenceSide}
            quote={evidenceQuote || active?.finding?.evidence_quote || ""}
            severity={active?.finding?.severity}
            className="flex-1"
          />
        </div>
      )}

      {viewMode === "findings" && (
      <div className="flex-1 grid min-h-0 grid-cols-1 lg:grid-cols-[280px_minmax(0,1.05fr)_minmax(0,0.95fr)]">
        {/* LEFT — Decision panel */}
        <DecisionPanel
          runId={runId}
          recommendation={recommendation}
          counts={counts}
          totalCount={rows.length}
          staleness={runStaleness}
          reviewSigned={(run as any)?.review_status === "signed"}
        />


        {/* MIDDLE — Evidence stream */}
        <div className="border-t lg:border-t-0 lg:border-l flex flex-col min-h-0 bg-muted/20">
          {rows.length > 0 && groups.length > 0 && (
            <AgentTabs
              groups={groups}
              total={rows.length}
              counts={counts}
              activeCat={activeCat}
              onSelect={setActiveCat}
              t={t}
            />
          )}

          {rows.length > 0 && <ColourLegend counts={counts} />}

          <ClausePairsTeaser runId={runId} />

          <ScrollArea className="flex-1">
            <div className="p-4 lg:p-5 space-y-7">
              {streamGroups.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground p-8">
                  {isLive ? t("runDetail.agentsWorking") : t("runDetail.noFindings")}
                </div>
              ) : streamGroups.map((g) => (
                <section key={g.label}>
                  <div className="flex items-center gap-2 mb-3 sticky top-0 bg-muted/90 backdrop-blur-sm py-1 z-[1]">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{g.label}</div>
                    <div className="flex-1 h-px bg-border/70" />
                    <div className="text-[11px] text-muted-foreground tabular-nums">{g.items.length}</div>
                  </div>
                  <div className="space-y-2.5">
                    {g.items.map((r) => {
                      const fid = r.finding?.id ?? `pending-${r.criterion.id}`;
                      const isActive = active?.criterion.id === r.criterion.id;
                      return (
                        <div key={fid} className="space-y-2">
                          <EvidenceCard
                            ref={registerCard(fid)}
                            criterion={r.criterion}
                            finding={r.finding}
                            selected={isActive}
                            onClick={() => r.finding && selectFinding(r.finding.id)}
                          />
                          {isActive && r.finding && (
                            <OverridePanel finding={r.finding} onSaved={() => qc.invalidateQueries({ queryKey: ["findings", runId] })} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* RIGHT — Evidence workbench */}
        <div className="flex flex-col min-h-0 bg-paper/80 dark:bg-muted/20 border-t lg:border-t-0 lg:border-l">
          <div className="shrink-0 border-b bg-background">
            <div className="px-3 py-2 flex items-center gap-2">
              {customerDocs.length > 0 && supplierDocs.length > 0 && (
                <div className="inline-flex rounded-md border p-0.5 shrink-0">
                  <button
                    type="button"
                    className={cn(
                      "h-6 px-2 text-[11px] rounded-[3px] transition-colors",
                      paneSide === "supplier"
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => selectPaneSide("supplier")}
                  >
                    {t("dashboard.bidderPack")}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "h-6 px-2 text-[11px] rounded-[3px] transition-colors",
                      paneSide === "customer"
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => selectPaneSide("customer")}
                  >
                    {t("dashboard.tenderPack")}
                  </button>
                </div>
              )}
              <div className="min-w-0 flex-1">
                {evidencePool.length > 1 ? (
                  <Select
                    value={evidenceDoc?.id ?? evidencePool[0]?.id}
                    onValueChange={(id) => setPackDocId(id)}
                  >
                    <SelectTrigger className="h-7 text-xs font-medium border-0 bg-transparent px-0 shadow-none focus:ring-0">
                      <SelectValue placeholder={t("review.evidenceFile")} />
                    </SelectTrigger>
                    <SelectContent>
                      {evidencePool.map((d) => (
                        <SelectItem key={d.id} value={d.id} className="text-xs">
                          {d.filename}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="truncate text-sm font-medium">{evidenceDoc?.filename ?? "—"}</div>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs shrink-0 text-muted-foreground"
                onClick={() => goToView("documents")}
              >
                <FileStack className="w-3.5 h-3.5 mr-1" />
                {t("review.openPack")}
              </Button>
            </div>
            {active?.finding ? (
              <div className="px-3 pb-2.5">
                <div className="rounded-md border bg-muted/40 px-2.5 py-2">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium leading-snug truncate">{active.criterion.name}</div>
                      {locatorDisplay ? (
                        <div className="mt-1 text-[11px] text-muted-foreground leading-snug line-clamp-2">
                          “{locatorDisplay}”
                        </div>
                      ) : (
                        <div className="mt-1 text-[11px] text-muted-foreground">{t("review.noEvidenceTitle")}</div>
                      )}
                    </div>
                    <VerdictBadge severity={active.finding.severity} size="sm" />
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    {locatorDisplay ? (
                      <button
                        type="button"
                        className="inline-flex items-center text-[11px] font-medium text-brand hover:underline"
                        onClick={() => scrollToEvidenceQuote(evidencePaneRef.current)}
                      >
                        <LocateFixed className="w-3 h-3 mr-1" />
                        {t("review.jumpToQuote")}
                      </button>
                    ) : null}
                    {locatorIsRelated && (
                      <span className="text-[10px] text-muted-foreground">{t("review.relatedPassage")}</span>
                    )}
                    {evidenceLayout === "reconstructed" && (
                      <span className="text-[10px] text-muted-foreground">
                        {t("review.reconstructedLayout")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-3 pb-2.5 text-xs text-muted-foreground">
                {t("review.clickToSeeProof")}
              </div>
            )}
          </div>
          <div ref={evidencePaneRef} className="flex-1 min-h-0">
            <DocumentViewer
              doc={evidenceDoc}
              quote={locatorDisplay}
              severity={active?.finding?.severity}
              marks={evidenceMarks}
              activeMarkId={active?.finding?.id ?? null}
              onMarkClick={selectFinding}
              chrome={false}
              onLayout={onEvidenceLayout}
            />
          </div>
        </div>
      </div>
      )}
    </RunWorkspaceLayout>
  );
}

// ---------------------------------------------------------------------------
// Decision panel (left)
// ---------------------------------------------------------------------------

type Recommendation = {
  kind: "do_not_sign" | "negotiate" | "safe" | "pending";
  headline: string;
  reason: string;
  score: number;
};

function DecisionPanel({
  runId, recommendation, counts, totalCount,
  staleness, reviewSigned,
}: {
  runId: string;
  recommendation: Recommendation;
  counts: Record<Verdict, number>;
  totalCount: number;
  staleness: Staleness;
  reviewSigned: boolean;
}) {

  const { t } = useTranslation();
  const reportViewedKey = `clause.reportViewed.${runId}`;
  const [reportViewed, setReportViewed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem(reportViewedKey) === "1"; } catch { return false; }
  });
  const markReportViewed = () => {
    try { window.localStorage.setItem(reportViewedKey, "1"); } catch {}
    setReportViewed(true);
  };
  const kindTone =
    recommendation.kind === "do_not_sign" ? { bg: "bg-critical/8", border: "border-critical/30", text: "text-critical", accent: "bg-critical" } :
    recommendation.kind === "negotiate"   ? { bg: "bg-warning/8",  border: "border-warning/30",  text: "text-warning",  accent: "bg-warning" } :
    recommendation.kind === "pending"     ? { bg: "bg-muted/50",   border: "border-border",      text: "text-muted-foreground", accent: "bg-muted-foreground/50" } :
                                            { bg: "bg-ok/8",       border: "border-ok/30",       text: "text-ok",       accent: "bg-ok" };
  const Icon = recommendation.kind === "do_not_sign" ? XCircle : recommendation.kind === "negotiate" ? AlertTriangle : recommendation.kind === "pending" ? Loader2 : CheckCircle2;
  const isCriticallyStale = staleness.level === "critical";
  const canSign = reviewSigned && reportViewed && !isCriticallyStale;
  const nextStep: "review" | "report" | "sign" = !reviewSigned ? "review" : !reportViewed ? "report" : "sign";
  const gateReason = isCriticallyStale
    ? t("review.signBlocked")
    : !reviewSigned
    ? t("review.signGatedHint")
    : !reportViewed
    ? t("review.signGatedOnReport")
    : t("review.decisionHint");

  return (
    <aside className="border-b lg:border-b-0 bg-background min-h-0 flex flex-col">
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-5">
          <div className={`relative overflow-hidden rounded-xl border ${kindTone.border} ${kindTone.bg} p-4`}>
            <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${kindTone.accent}`} />
            <div className="flex items-start justify-between gap-3 pl-1">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("review.whatToDo")}
                </div>
                <div className={`mt-1.5 flex items-center gap-2 ${kindTone.text}`}>
                  <Icon className={cn("w-5 h-5 shrink-0", recommendation.kind === "pending" && "animate-spin")} />
                  <div className="text-[15px] font-semibold leading-snug">{recommendation.headline}</div>
                </div>
              </div>
              {recommendation.kind !== "pending" && (
              <div className="text-right shrink-0">
                <div className="text-2xl font-semibold tabular-nums tracking-tight leading-none">{recommendation.score}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{t("review.alignmentScore")}</div>
              </div>
              )}
            </div>
            <p className="text-sm text-foreground/75 mt-2.5 leading-relaxed pl-1">{recommendation.reason}</p>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2.5">
              {t("review.requirementsAtAGlance")}
            </div>
            <CoverageStack counts={counts} total={totalCount} t={t} />
          </div>

          <div className="pt-1 space-y-2">
            {nextStep === "review" && (
              <Button asChild className="w-full">
                <Link to="/runs/$runId/review" params={{ runId }}>
                  <ClipboardList className="w-4 h-4 mr-1" />
                  {t("review.openChecklist")}
                </Link>
              </Button>
            )}
            {nextStep === "report" && (
              <Button asChild className="w-full">
                <Link to="/runs/$runId/report" params={{ runId }} hash="gap-report" onClick={markReportViewed}>
                  <ClipboardList className="w-4 h-4 mr-1" />
                  {t("review.fullReport")}
                </Link>
              </Button>
            )}
            {nextStep === "sign" && (
              canSign ? (
                <Button asChild className="w-full">
                  <Link to="/runs/$runId/sign" params={{ runId }}>
                    {t("review.decideAndSign")}
                  </Link>
                </Button>
              ) : (
                <Button className="w-full" variant="default" disabled title={gateReason}>
                  <Lock className="w-4 h-4 mr-1.5" />
                  {t("review.decideAndSign")}
                </Button>
              )
            )}
            <p className="text-[11px] text-muted-foreground leading-relaxed">{gateReason}</p>
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}

function CoverageStack({
  counts, total, t,
}: {
  counts: Record<Verdict, number>;
  total: number;
  t: TFunction;
}) {
  const parts: { verdict: Verdict; n: number; className: string }[] = [
    { verdict: "gap", n: counts.gap, className: "bg-critical" },
    { verdict: "partial", n: counts.partial, className: "bg-warning" },
    { verdict: "aligned", n: counts.aligned, className: "bg-ok" },
    { verdict: "not_addressed", n: counts.not_addressed, className: "bg-muted-foreground/40" },
  ];
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {parts.map((p) =>
          p.n > 0 ? (
            <div
              key={p.verdict}
              className={p.className}
              style={{ width: `${Math.max(total > 0 ? (p.n / total) * 100 : 0, 0)}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {parts.filter((p) => p.n > 0 || p.verdict !== "not_addressed").map((p) => (
          <span key={p.verdict} className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className={`w-1.5 h-1.5 rounded-full ${p.className}`} />
            {t(`verdict.${p.verdict === "not_addressed" ? "notAddressed" : p.verdict}`)}
            <span className="font-medium tabular-nums text-foreground">{p.n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evidence card (middle)
// ---------------------------------------------------------------------------

const EvidenceCard = React.forwardRef<
  HTMLButtonElement,
  {
    criterion: Criterion;
    finding: Finding | null;
    selected: boolean;
    onClick: () => void;
  }
>(function EvidenceCard({ criterion, finding, selected, onClick }, ref) {
  const { t } = useTranslation();
  const v = toVerdict(finding?.severity);
  const tone = verdictTone[v];
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border bg-background p-4 transition-all",
        selected
          ? "border-transparent shadow-sm ring-1 ring-black/5 dark:ring-white/10"
          : "border-border/70 hover:border-border hover:bg-background/80",
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("w-[3px] self-stretch rounded-full shrink-0", tone.dot)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm font-medium leading-snug flex-1">{criterion.name}</div>
            <VerdictBadge severity={finding?.severity} size="sm" />
          </div>
          {finding?.justification && (
            <p className="text-[13px] text-foreground/70 mt-2 leading-relaxed line-clamp-2">
              {finding.justification}
            </p>
          )}
          {!finding && (
            <div className="text-[12px] text-muted-foreground mt-1.5">
              {t("review.pending")}
            </div>
          )}
        </div>
      </div>
    </button>
  );
});

function ColourLegend({ counts }: { counts: Record<Verdict, number> }) {
  const { t } = useTranslation();
  return (
    <div data-testid="colour-legend" className="border-b bg-background px-3 py-2 space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {t("review.colourLegend")}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-critical" />
          {t("review.colourCritical")}
          <span className="font-medium tabular-nums text-foreground">{counts.gap}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-warning" />
          {t("review.colourPartial")}
          <span className="font-medium tabular-nums text-foreground">{counts.partial}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-ok" />
          {t("review.colourAligned")}
          <span className="font-medium tabular-nums text-foreground">{counts.aligned}</span>
        </span>
      </div>
      {counts.gap === 0 ? (
        <p className="text-[11px] text-muted-foreground leading-snug">{t("review.colourNoneCritical")}</p>
      ) : null}
      <p className="text-[11px] text-muted-foreground leading-snug">{t("review.clickFinding")}</p>
    </div>
  );
}

function AgentTabs({
  groups, total, counts, activeCat, onSelect, t,
}: {
  groups: { key: string; label: string; total: number; c: Record<Verdict, number> }[];
  total: number;
  counts: Record<Verdict, number>;
  activeCat: string;
  onSelect: (key: string) => void;
  t: TFunction;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScroll();
    el.addEventListener("scroll", updateScroll, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateScroll) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScroll);
      ro?.disconnect();
    };
  }, []);

  const scrollBy = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = Math.max(160, el.clientWidth * 0.6);
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <div className="border-b bg-background px-3 py-2">
      <div className="relative flex items-center gap-2">
        <button
          type="button"
          aria-label="Scroll agents left"
          onClick={() => scrollBy("left")}
          className={`shrink-0 rounded-md border border-border/60 bg-background p-1 text-muted-foreground shadow-sm transition-all md:hidden ${
            canScrollLeft ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto scrollbar-hide scroll-smooth"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <div className="flex items-stretch gap-1.5 min-w-max pr-4">
            <AgentTab
              label={t("review.allTopics")}
              shortLabel={t("review.allTopics")}
              total={total}
              counts={counts}
              selected={activeCat === "__all__"}
              onClick={() => onSelect("__all__")}
              isAll
            />
            <div className="w-px bg-border/60 mx-1 my-1" />
            {groups.map((g) => (
              <AgentTab
                key={g.key}
                label={g.label}
                shortLabel={topicShort(t, g.key)}
                total={g.total}
                counts={g.c}
                selected={activeCat === g.key}
                onClick={() => onSelect(g.key)}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          aria-label="Scroll agents right"
          onClick={() => scrollBy("right")}
          className={`shrink-0 rounded-md border border-border/60 bg-background p-1 text-muted-foreground shadow-sm transition-all md:hidden ${
            canScrollRight ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Subtle right-edge fade hint on mobile when scrollable */}
        <div
          className={`pointer-events-none absolute right-8 top-0 h-full w-8 bg-gradient-to-l from-muted/30 to-transparent transition-opacity md:hidden ${
            canScrollRight ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>
    </div>
  );
}

function AgentTab({
  label, shortLabel, total, counts, selected, onClick, isAll = false,
}: {
  label: string; shortLabel: string; total: number; counts: Record<Verdict, number>; selected: boolean; onClick: () => void; isAll?: boolean;
}) {
  const riskCount = counts.gap + counts.partial;
  const hasRisk = riskCount > 0;
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-all ${
        selected
          ? "bg-muted text-foreground font-medium"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      }`}
    >
      <span className={`font-medium whitespace-nowrap ${selected ? "text-foreground" : ""}`}>
        <span className="hidden md:inline">{label}</span>
        <span className="md:hidden">{shortLabel}</span>
      </span>
      <span className={`inline-flex items-center justify-center min-w-[1.15rem] h-5 rounded px-1 text-[11px] font-semibold tabular-nums ${
        selected ? "bg-background text-foreground" : "bg-muted/80 text-muted-foreground"
      }`}>
        {total}
      </span>
      {!isAll && hasRisk && (
        <span className="flex items-center gap-1 pl-1 border-l border-border/60 ml-0.5">
          {counts.gap > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />{counts.gap}
            </span>
          )}
          {counts.partial > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{counts.partial}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

type QuoteMark = { quote: string; verdict: Verdict; active: boolean };

function EvidencePane({
  text, quote, fallbackNeedle = "", verdict, allQuotes = [], activeKey = "",
}: {
  text: string; quote: string; fallbackNeedle?: string; verdict: Verdict; allQuotes?: QuoteMark[]; activeKey?: string;
}) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hitRef = useRef<HTMLElement | null>(null);
  const [search, setSearch] = useState("");
  const [pulseKey, setPulseKey] = useState(0);

  const blocks = useMemo(() => structureDocument(text), [text]);
  const normQuote = useMemo(() => normalizeForMatch(quote), [quote]);
  const normFallback = useMemo(() => normalizeForMatch(fallbackNeedle), [fallbackNeedle]);
  const normSearch = useMemo(() => normalizeForMatch(search), [search]);
  const normMarks = useMemo<Array<{ needle: string; verdict: Verdict; active: boolean }>>(
    () =>
      allQuotes
        .map((q) => ({ needle: normalizeForMatch(q.quote), verdict: q.verdict, active: q.active }))
        .filter((q) => q.needle.length >= 6),
    [allQuotes],
  );

  const jumpToHit = () => {
    const el = hitRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setPulseKey((k) => k + 1);
  };

  useEffect(() => {
    const timer = setTimeout(jumpToHit, 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, quote, fallbackNeedle, text]);


  const quoteHits = normQuote && blocks.some((b) => normalizeForMatch(b.text).includes(normQuote));
  const effectiveActiveNeedle = quoteHits
    ? normQuote
    : (normFallback && blocks.some((b) => normalizeForMatch(b.text).includes(normFallback)) ? normFallback : "");
  const usingFallback = !quoteHits && !!effectiveActiveNeedle;
  const tone = verdictTone[verdict];
  const totalWords = useMemoWordCount(text);
  const legendCounts = useMemo(() => {
    const c: Record<Verdict, number> = { aligned: 0, partial: 0, gap: 0, not_addressed: 0 };
    for (const m of normMarks) if (blocks.some((b) => normalizeForMatch(b.text).includes(m.needle))) c[m.verdict]++;
    return c;
  }, [normMarks, blocks]);

  if (!text) {
    return (
      <div className="flex-1 grid place-items-center p-8 text-center text-sm text-muted-foreground">
        {t("review.noDocumentText")}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="border-b bg-background/95 backdrop-blur px-4 lg:px-6 py-2.5 flex items-center gap-3 flex-wrap">
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {blocks.length} {blocks.length === 1 ? "section" : "sections"} · {totalWords.toLocaleString()} words
        </div>
        <div className="flex-1 min-w-[140px]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this document…"
            className="w-full h-8 rounded-md border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        {effectiveActiveNeedle ? (
          <button
            onClick={jumpToHit}
            className={`inline-flex items-center gap-1.5 rounded-md border ${tone.border} ${tone.bg} ${tone.text} px-2 py-1 text-xs font-medium hover:opacity-90`}
            title={usingFallback ? "Nearest matching section (no exact quote returned)" : "Jump to the quoted evidence"}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
            {usingFallback ? "Jump to nearest section" : "Jump to evidence"}
          </button>
        ) : (
          quote ? <EvidenceEmptyBanner verdict={verdict} /> : null
        )}
      </div>
      {(legendCounts.aligned + legendCounts.partial + legendCounts.gap + legendCounts.not_addressed) > 0 && (
        <div className="border-b bg-muted/20 px-4 lg:px-6 py-1.5 flex items-center gap-3 flex-wrap text-[11px]">
          <span className="text-muted-foreground">Highlights:</span>
          {(["aligned", "partial", "gap", "not_addressed"] as Verdict[]).map((v) => legendCounts[v] > 0 && (
            <span key={v} className="inline-flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-sm border ${verdictTone[v].bg} ${verdictTone[v].border}`} />
              <span className={verdictTone[v].text}>
                {t(`verdict.${v === "not_addressed" ? "notAddressed" : v}`)}
              </span>
              <span className="text-muted-foreground tabular-nums">{legendCounts[v]}</span>
            </span>
          ))}
        </div>
      )}
      <ScrollArea className="flex-1" ref={scrollRef as never}>
        <div className="px-4 lg:px-8 py-6 space-y-5 max-w-[72ch]">
          {blocks.map((block, i) => (
            <DocBlock
              key={i}
              block={block}
              activeQuote={effectiveActiveNeedle}
              activeVerdict={verdict}
              activeIsFallback={usingFallback}
              marks={normMarks}
              search={normSearch}
              hitRef={hitRef}
              pulseKey={pulseKey}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}


function useMemoWordCount(text: string) {
  return useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text]);
}

type DocBlockData = { kind: "heading" | "paragraph"; text: string; level?: number };

function DocBlock({
  block, activeQuote, activeVerdict, activeIsFallback = false, marks, search, hitRef, pulseKey,
}: {
  block: DocBlockData;
  activeQuote: string;
  activeVerdict: Verdict;
  activeIsFallback?: boolean;
  marks: Array<{ needle: string; verdict: Verdict; active: boolean }>;
  search: string;
  hitRef: React.MutableRefObject<HTMLElement | null>;
  pulseKey?: number;
}) {
  const normText = normalizeForMatch(block.text);
  const markHere = marks.find((m) => normText.includes(m.needle));
  const activeHere = !!activeQuote && normText.includes(activeQuote);
  const searchHere = search && search.length >= 2 && normText.includes(search);
  // Context-oriented tone: prefer active verdict when this block is the active target,
  // otherwise fall back to any other evidence mark landing in this block.
  const blockVerdict: Verdict | null = activeHere ? activeVerdict : (markHere ? markHere.verdict : null);
  const blockTone = blockVerdict ? verdictTone[blockVerdict] : null;

  if (block.kind === "heading") {
    return (
      <h3 className={`font-semibold tracking-tight ${block.level === 1 ? "text-lg" : "text-sm uppercase text-muted-foreground"} pt-2`}>
        {searchHere ? highlightPlain(block.text, search) : block.text}
      </h3>
    );
  }

  // Whole-paragraph tint when there is any evidence in this block.
  const paraClass = [
    "text-[13.5px] leading-[1.75] text-foreground/90 rounded-md transition-shadow",
    blockTone ? `border-l-2 pl-4 pr-3 py-2 ${blockTone.border} ${blockTone.bg}` : "",
    activeHere ? `ring-2 ring-current/30 ${blockTone?.text ?? ""} animate-evidence-pulse` : "",
  ].join(" ");

  // In fallback mode we do NOT want to inline-mark a random keyword — we want the
  // paragraph itself to be the evidence. Scroll target is the whole paragraph.
  const suppressInlineActive = activeIsFallback;
  const paraRef = activeHere
    ? (el: HTMLParagraphElement | null) => { if (el) hitRef.current = el; }
    : undefined;

  return (
    <p key={activeHere ? `pa-${pulseKey}` : undefined} ref={paraRef} className={paraClass}>
      {renderParagraph(block.text, marks, search, activeQuote, hitRef, !!markHere, activeVerdict, pulseKey, suppressInlineActive)}
    </p>
  );
}


type Range = { start: number; end: number; verdict: Verdict; active: boolean };

function renderParagraph(
  text: string,
  marks: Array<{ needle: string; verdict: Verdict; active: boolean }>,
  search: string,
  activeQuote: string,
  hitRef: React.MutableRefObject<HTMLElement | null>,
  _anyMarkHere: boolean,
  activeVerdict: Verdict = "not_addressed",
  pulseKey: number = 0,
  suppressInlineActive: boolean = false,
) {
  const norm = normalizeForMatch(text);

  // Collect all candidate ranges (existing quote marks) in normalized coords.
  const candidates: Range[] = [];
  const priority: Record<Verdict, number> = { gap: 4, partial: 3, aligned: 2, not_addressed: 1 };
  for (const m of marks) {
    let from = 0;
    while (from <= norm.length) {
      const i = norm.indexOf(m.needle, from);
      if (i < 0) break;
      candidates.push({ start: i, end: i + m.needle.length, verdict: m.verdict, active: m.active });
      from = i + Math.max(1, m.needle.length);
    }
  }
  // Only inject the active needle when it is a real quote (not a derived keyword).
  if (activeQuote && !suppressInlineActive) {
    let from = 0;
    while (from <= norm.length) {
      const i = norm.indexOf(activeQuote, from);
      if (i < 0) break;
      candidates.push({ start: i, end: i + activeQuote.length, verdict: activeVerdict, active: true });
      from = i + Math.max(1, activeQuote.length);
    }
  }
  // Sort: active first, then higher priority, then longer.
  candidates.sort((a, b) =>
    Number(b.active) - Number(a.active)
    || priority[b.verdict] - priority[a.verdict]
    || (b.end - b.start) - (a.end - a.start)
    || a.start - b.start,
  );
  // Greedy non-overlap.
  const chosen: Range[] = [];
  const occupied: Array<[number, number]> = [];
  for (const r of candidates) {
    if (occupied.some(([s, e]) => r.start < e && r.end > s)) continue;
    chosen.push(r);
    occupied.push([r.start, r.end]);
  }
  chosen.sort((a, b) => a.start - b.start);

  if (chosen.length === 0) return highlightPlain(text, search);

  const nodes: React.ReactNode[] = [];
  let cursorNorm = 0;
  for (const r of chosen) {
    if (r.start > cursorNorm) {
      const gap = sliceOriginalByNorm(text, cursorNorm, r.start - cursorNorm);
      nodes.push(<React.Fragment key={`g-${cursorNorm}`}>{highlightPlain(gap.hit, search)}</React.Fragment>);
    }
    const slice = sliceOriginalByNorm(text, r.start, r.end - r.start);
    const tone = verdictTone[r.verdict];
    const isActive = r.active && !!activeQuote;
    nodes.push(
      <mark
        key={`m-${r.start}-${isActive ? pulseKey : "s"}`}
        ref={isActive ? (el) => { if (el) hitRef.current = el; } : undefined}
        className={`rounded-sm px-0.5 ${tone.text} bg-transparent ${isActive ? "font-semibold underline decoration-2 underline-offset-2" : "underline decoration-dotted underline-offset-2"}`}
      >
        {slice.hit}
      </mark>,
    );
    cursorNorm = r.end;
  }


  if (cursorNorm < norm.length) {
    const tail = sliceOriginalByNorm(text, cursorNorm, norm.length - cursorNorm);
    nodes.push(<React.Fragment key={`t-${cursorNorm}`}>{highlightPlain(tail.hit, search)}</React.Fragment>);
  }
  return <>{nodes}</>;
}

function highlightPlain(text: string, needle: string) {
  if (!needle || needle.length < 2) return text;
  const nText = normalizeForMatch(text);
  const i = nText.indexOf(needle);
  if (i < 0) return text;
  const parts = sliceOriginalByNorm(text, i, needle.length);
  return (
    <>
      {parts.before}
      <span className="bg-yellow-200/60 dark:bg-yellow-500/25 rounded px-0.5">{parts.hit}</span>
      {parts.after}
    </>
  );
}

function normalizeForMatch(s: string) {
  return String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}


// Split raw document text into readable blocks with heading detection.
function structureDocument(text: string): DocBlockData[] {
  const cleaned = String(text ?? "").replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];
  // Insert breaks before likely section headings ("1. Foo", "1.2 Foo", ALL CAPS lines)
  const withBreaks = cleaned
    .replace(/(?<=[a-z\).,;:”"])\s+(?=\d{1,2}\.\s+[A-ZÅÄÖ])/g, "\n\n")
    .replace(/(?<=[a-z\).,;:”"])\s+(?=[A-ZÅÄÖ][A-ZÅÄÖ ]{4,}(?:\n|$))/g, "\n\n");
  const rawBlocks = withBreaks.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const blocks: DocBlockData[] = [];
  for (const b of rawBlocks) {
    const headMatch = b.match(/^(\d{1,2}(?:\.\d{1,2})?\.?)\s+(.{3,80})$/);
    const isAllCaps = /^[A-ZÅÄÖ0-9 ,\-–—:()]{6,80}$/.test(b);
    if (headMatch) {
      blocks.push({ kind: "heading", text: `${headMatch[1]} ${headMatch[2]}`, level: headMatch[1].includes(".") ? 2 : 1 });
    } else if (isAllCaps) {
      blocks.push({ kind: "heading", text: b, level: 2 });
    } else {
      // Further split very long paragraphs on sentence boundaries around 600 chars
      if (b.length > 900) {
        const sentences = b.split(/(?<=[.!?])\s+(?=[A-ZÅÄÖ0-9])/);
        let buf = "";
        for (const s of sentences) {
          if ((buf + " " + s).length > 600 && buf) {
            blocks.push({ kind: "paragraph", text: buf.trim() });
            buf = s;
          } else {
            buf = buf ? buf + " " + s : s;
          }
        }
        if (buf.trim()) blocks.push({ kind: "paragraph", text: buf.trim() });
      } else {
        blocks.push({ kind: "paragraph", text: b });
      }
    }
  }
  return blocks;
}

// Map a normalized-string offset back into the original string.
function sliceOriginalByNorm(text: string, normStart: number, normLen: number) {
  let count = 0;
  let hitStart = -1;
  let hitEnd = -1;
  let lastWasSpace = false;
  for (let idx = 0; idx < text.length; idx++) {
    const ch = text[idx];
    const isWs = /\s/.test(ch);
    let advance = 0;
    if (isWs) {
      if (!lastWasSpace && count > 0) advance = 1;
      lastWasSpace = true;
    } else {
      advance = 1;
      lastWasSpace = false;
    }
    if (advance) {
      if (count === normStart && hitStart === -1) hitStart = idx;
      count += advance;
      if (count >= normStart + normLen && hitEnd === -1) { hitEnd = idx + 1; break; }
    }
  }
  if (hitStart === -1) return { before: text, hit: "", after: "" };
  if (hitEnd === -1) hitEnd = text.length;
  return { before: text.slice(0, hitStart), hit: text.slice(hitStart, hitEnd), after: text.slice(hitEnd) };
}

function EvidenceEmptyBanner({ verdict }: { verdict: Verdict }) {
  const { t } = useTranslation();
  const Icon = verdict === "aligned" ? CheckCircle2
    : verdict === "partial" ? AlertTriangle
    : verdict === "gap" ? XCircle : MinusCircle;
  const tone = verdictTone[verdict];
  return (
    <div className={`flex items-start gap-2 text-sm ${tone.text}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div>
        <div className="font-medium">{t("review.noEvidenceTitle")}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{t("review.noEvidenceBody")}</div>
      </div>
    </div>
  );
}

function OverridePanel({ finding, onSaved }: { finding: Finding; onSaved: () => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (newSev: string) => {
    setBusy(true);
    try {
      const suffix = note.trim() ? `\n\n[Reviewer override] ${note.trim()}` : "\n\n[Reviewer override]";
      const nextJust = (finding.justification || "") + suffix;
      const { error } = await supabase
        .from("findings")
        .update({ severity: newSev, justification: nextJust })
        .eq("id", finding.id);
      if (error) throw error;
      toast.success(t("review.overrideSaved"));
      setEditing(false);
      setNote("");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <div className="px-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <PenLine className="w-3 h-3" />
          {t("review.disagree")}
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-xl border bg-background p-3 space-y-2.5">
      <div className="text-xs font-medium">{t("review.changeVerdict")}</div>
      <Textarea rows={2} placeholder={t("review.notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => save("ok")}    className="border-ok/40 text-ok hover:bg-ok/10">{t("verdict.aligned")}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => save("warning")} className="border-warning/40 text-warning hover:bg-warning/10">{t("verdict.partial")}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => save("critical")} className="border-critical/40 text-critical hover:bg-critical/10">{t("verdict.gap")}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => save("na")}    >{t("verdict.notAddressed")}</Button>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setEditing(false); setNote(""); }}>{t("common.cancel")}</Button>
      </div>
    </div>
  );
}

function firstUsableDocumentText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const clean = cleanDocumentText(value);
    if (hasUsableDocumentText(clean)) return clean;
  }
  return "";
}

function cleanDocumentText(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\u0000/g, " ")
    .replace(/[\x01-\x08\x0B-\x1F]/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function hasUsableDocumentText(value: string | null | undefined) {
  const text = cleanDocumentText(value);
  if (text.length < 40) return false;
  const sample = text.slice(0, 5000);
  const rawMarkers = ["%PDF-", " xref", " trailer", "/Type /Page", "/Font", "/ProcSet", "endobj", "stream", "startxref"];
  const markerCount = rawMarkers.reduce((n, marker) => n + (sample.includes(marker) ? 1 : 0), 0);
  if (sample.startsWith("%PDF-") || markerCount >= 3) return false;
  return (text.match(/[A-Za-zÅÄÖåäö]/g) ?? []).length >= 20;
}

// Match a quote inside text ignoring whitespace differences.
function splitAroundQuote(text: string, quote: string): { before: string; hit: string | null; after: string } {
  if (!text || !quote) return { before: text, hit: null, after: "" };
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const nText = norm(text);
  const nQuote = norm(quote);
  if (!nQuote) return { before: text, hit: null, after: "" };
  const i = nText.toLowerCase().indexOf(nQuote.toLowerCase());
  if (i < 0) {
    // Fallback: try first 8 words of quote
    const short = nQuote.split(" ").slice(0, 8).join(" ");
    const j = nText.toLowerCase().indexOf(short.toLowerCase());
    if (j < 0) return { before: text, hit: null, after: "" };
    return sliceOriginal(text, j, short.length);
  }
  return sliceOriginal(text, i, nQuote.length);
}

// Map a position in normalized text back to the original text (approximate).
function sliceOriginal(text: string, normStart: number, normLen: number) {
  let out = "";
  let count = 0;
  let hitStart = -1;
  let hitEnd = -1;
  let lastWasSpace = false;
  for (let idx = 0; idx < text.length; idx++) {
    const ch = text[idx];
    const isWs = /\s/.test(ch);
    let normCh = "";
    if (isWs) {
      if (!lastWasSpace && out.length) normCh = " ";
      lastWasSpace = true;
    } else {
      normCh = ch;
      lastWasSpace = false;
    }
    if (normCh) {
      if (count === normStart && hitStart === -1) hitStart = idx;
      count += normCh.length;
      if (count >= normStart + normLen && hitEnd === -1) { hitEnd = idx + 1; break; }
    }
    out += normCh;
  }
  if (hitStart === -1) return { before: text, hit: null as string | null, after: "" };
  if (hitEnd === -1) hitEnd = text.length;
  return { before: text.slice(0, hitStart), hit: text.slice(hitStart, hitEnd), after: text.slice(hitEnd) };
}
