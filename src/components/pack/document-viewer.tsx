import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import mammoth from "mammoth";
import { renderAsync } from "docx-preview";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, FileText, FileType2, Download, LocateFixed } from "lucide-react";
import { findQuoteInText, highlightQuoteInHtml, highlightQuoteInElement, highlightEvidenceInElement, highlightEvidenceInHtml, type EvidencePaintSpec } from "@/lib/highlight-quote";
import { scrollElementIntoScroller } from "@/lib/scroll-into-scroller";
import { PdfEvidenceViewer } from "@/components/pack/pdf-evidence-viewer";
import { cn } from "@/lib/utils";
import { evidenceToneClass, toVerdict, type Severity, type Verdict } from "@/lib/verdict";
import { buildClauseAstFromText, type AstBlock, type ClauseDocumentAst } from "@/lib/clause-ast";

export type ViewableDoc = {
  id: string;
  filename: string;
  mime_type?: string | null;
  storage_path?: string | null;
  parsed_text?: string | null;
  extracted_text?: string | null;
  structure_json?: ClauseDocumentAst | null;
};

export type EvidenceLayout = "original" | "reconstructed" | "empty";

export type EvidenceMark = {
  id?: string;
  quote: string;
  severity?: Severity;
  verdict?: Verdict | null;
};

type Props = {
  doc: ViewableDoc | null;
  quote?: string;
  fallbackNeedle?: string;
  /** Finding severity or verdict — drives highlight colour in the reference document. */
  severity?: Severity;
  verdict?: Verdict | null;
  /** All findings to paint in the bid, each with its own verdict colour. */
  marks?: EvidenceMark[];
  activeMarkId?: string | null;
  onMarkClick?: (findingId: string) => void;
  emptyLabel?: string;
  className?: string;
  /** Hide filename in the viewer toolbar when the parent already shows it. */
  showFilename?: boolean;
  /**
   * When false, the parent owns chrome (file name, quote locator). The pane
   * is only the document surface — original pages when possible.
   */
  chrome?: boolean;
  onLayout?: (layout: EvidenceLayout) => void;
};

function isPdf(doc: ViewableDoc) {
  const m = (doc.mime_type ?? "").toLowerCase();
  const n = doc.filename.toLowerCase();
  return m.includes("pdf") || n.endsWith(".pdf");
}

function isDocx(doc: ViewableDoc) {
  const m = (doc.mime_type ?? "").toLowerCase();
  const n = doc.filename.toLowerCase();
  return m.includes("wordprocessingml") || n.endsWith(".docx") || n.endsWith(".doc");
}

function isPlain(doc: ViewableDoc) {
  const n = doc.filename.toLowerCase();
  return n.endsWith(".txt") || n.endsWith(".md") || (doc.mime_type ?? "").startsWith("text/");
}

function cleanText(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\u0000/g, " ")
    .replace(/[\x01-\x08\x0B-\x1F]/g, " ")
    .trim();
}

function isUsablePlainText(value: string | null | undefined) {
  const text = cleanText(value);
  if (text.length < 40) return false;
  if (text.startsWith("%PDF-")) return false;
  const sample = text.slice(0, 4000);
  const rawMarkers = ["%PDF-", " endobj", "xref", "trailer", "stream", "/Type /Page"];
  const hits = rawMarkers.reduce((n, m) => n + (sample.includes(m) ? 1 : 0), 0);
  if (hits >= 2) return false;
  return (text.match(/[A-Za-zÅÄÖåäö]/g) ?? []).length >= 20;
}

function isLegacyDoc(doc: ViewableDoc) {
  const n = doc.filename.toLowerCase();
  return n.endsWith(".doc") && !n.endsWith(".docx");
}

function fileKind(doc: ViewableDoc): "word" | "pdf" | "text" | "file" {
  if (isPdf(doc)) return "pdf";
  if (isDocx(doc)) return "word";
  if (isPlain(doc)) return "text";
  return "file";
}

export function fileKindLabel(doc: ViewableDoc | null | undefined) {
  if (!doc) return "";
  const kind = fileKind(doc);
  if (kind === "word") return "Word";
  if (kind === "pdf") return "PDF";
  if (kind === "text") return "Text";
  return "File";
}

function storageFileUrl(storagePath: string) {
  const q = new URLSearchParams({ bucket: "contracts", path: storagePath });
  return `/api/storage/file?${q.toString()}`;
}

async function loadOriginalBytes(storagePath: string): Promise<ArrayBuffer> {
  const res = await fetch(storageFileUrl(storagePath), { credentials: "same-origin" });
  if (res.ok) return res.arrayBuffer();
  const { data, error } = await supabase.storage.from("contracts").download(storagePath);
  if (error || !data) {
    throw new Error(error?.message ?? `Could not open file (${res.status})`);
  }
  return data.arrayBuffer();
}

function friendlyOpenError(message: string, kind: "word" | "pdf" | "text" | "file") {
  if (/ENOENT|not found|404|no such file/i.test(message)) {
    const label = kind === "word" ? "Word document" : kind === "pdf" ? "PDF" : "file";
    return `The original ${label} is not in storage. Re-upload the pack to review the real page layout.`;
  }
  return message;
}

function resolveNeedle(quote?: string, fallback?: string) {
  const q = (quote ?? "").trim();
  if (q.length >= 8) return q;
  const f = (fallback ?? "").trim();
  return f.length >= 8 ? f : q;
}

function resolveVerdict(verdict?: Verdict | null, severity?: Severity): Verdict | null {
  if (verdict) return verdict;
  if (severity === undefined || severity === null) return null;
  return toVerdict(severity);
}

function activeEvidenceMark(root: ParentNode | null | undefined): HTMLElement | null {
  if (!root) return null;
  return (
    (root.querySelector("mark.evidence-hit-active") as HTMLElement | null) ??
    (root.querySelector("mark[data-evidence-hit]") as HTMLElement | null)
  );
}

export function scrollToEvidenceQuote(root?: HTMLElement | Document | null) {
  const host = root ?? document;
  scrollElementIntoScroller(activeEvidenceMark(host));
}

export function DocumentViewer({
  doc,
  quote = "",
  fallbackNeedle = "",
  severity,
  verdict,
  marks,
  activeMarkId,
  onMarkClick,
  emptyLabel = "Select a document",
  className,
  showFilename = true,
  chrome = true,
  onLayout,
}: Props) {
  const [viewMode, setViewMode] = useState<"formatted" | "text">("formatted");
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [nativeHits, setNativeHits] = useState(0);
  const [htmlHits, setHtmlHits] = useState(0);
  const [pdfHit, setPdfHit] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needle = resolveNeedle(quote, fallbackNeedle);
  const tone = resolveVerdict(verdict, severity);
  const toneClass = evidenceToneClass(tone);
  const paintSpecs = useMemo<EvidencePaintSpec[]>(() => {
    const specs: EvidencePaintSpec[] = [];
    const seen = new Set<string>();
    for (const m of marks ?? []) {
      const q = (m.quote ?? "").trim();
      if (q.length < 8) continue;
      const key = q.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      specs.push({
        quote: q,
        toneClass: evidenceToneClass(resolveVerdict(m.verdict, m.severity)),
        active: Boolean(m.id && activeMarkId && m.id === activeMarkId),
        findingId: m.id,
      });
    }
    if (needle.length >= 8 && !specs.some((s) => s.active || s.quote === needle)) {
      specs.push({ quote: needle, toneClass, active: true });
    } else if (needle.length >= 8) {
      const hit = specs.find((s) => s.quote === needle) ?? specs.find((s) => s.active);
      if (hit) {
        hit.active = true;
        hit.toneClass = toneClass || hit.toneClass;
      }
    }
    return specs;
  }, [marks, activeMarkId, needle, toneClass]);

  const usableText = useMemo(() => {
    if (!doc) return "";
    const a = cleanText(doc.parsed_text);
    const b = cleanText(doc.extracted_text);
    if (isUsablePlainText(a)) return a;
    if (isUsablePlainText(b)) return b;
    return "";
  }, [doc]);

  useEffect(() => {
    if (!doc) {
      onLayout?.("empty");
      return;
    }
    const originalReady = Boolean(bytes) && !error;
    const extractedAvailable = Boolean(usableText);
    const wantOriginal = chrome === false || viewMode === "formatted";
    const canOriginal = originalReady && (isPdf(doc) || isDocx(doc));
    if (wantOriginal && canOriginal) onLayout?.("original");
    else if (extractedAvailable) onLayout?.("reconstructed");
    else onLayout?.("empty");
  }, [doc, bytes, error, viewMode, usableText, chrome, onLayout]);

  const textHit = useMemo(
    () => (usableText && needle ? !!findQuoteInText(usableText, needle).hit : false),
    [usableText, needle],
  );

  const pdfObjectUrl = useMemo(() => {
    if (!bytes || !doc || !isPdf(doc)) return null;
    return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  }, [bytes, doc?.id]);

  useEffect(() => {
    return () => {
      if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
    };
  }, [pdfObjectUrl]);

  useEffect(() => {
    setBytes(null);
    setDocxHtml(null);
    setNativeHits(0);
    setHtmlHits(0);
    setPdfHit(false);
    setPdfReady(false);
    setError(null);
    if (doc && isPlain(doc)) setViewMode("text");
    else setViewMode("formatted");
  }, [doc?.id]);

  useEffect(() => {
    if (doc && isPdf(doc)) {
      setPdfHit(false);
      setPdfReady(false);
    }
  }, [needle, doc?.id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!doc?.storage_path) return;
      setLoading(true);
      setError(null);
      try {
        const buf = await loadOriginalBytes(doc.storage_path);
        if (cancelled) return;
        setBytes(buf);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Could not open document");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [doc?.id, doc?.storage_path]);

  useEffect(() => {
    let cancelled = false;
    async function convertLegacy() {
      if (!bytes || !doc || !isDocx(doc) || !isLegacyDoc(doc)) return;
      try {
        const result = await mammoth.convertToHtml(
          { arrayBuffer: bytes.slice(0) },
          { includeDefaultStyleMap: true },
        );
        if (cancelled) return;
        const raw = result.value || "<p>(Empty document)</p>";
        const { html, hitCount } = paintSpecs.length
          ? highlightEvidenceInHtml(raw, paintSpecs)
          : needle
            ? highlightQuoteInHtml(raw, needle, toneClass)
            : { html: raw, hitCount: 0 };
        setDocxHtml(html);
        setHtmlHits(hitCount);
      } catch {
        /* native path not used for .doc */
      }
    }
    convertLegacy();
    return () => {
      cancelled = true;
    };
  }, [bytes, doc?.id, doc?.filename, needle, toneClass, paintSpecs]);

  const downloadOriginal = () => {
    if (!bytes || !doc) return;
    const blob = new Blob([bytes]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!doc) {
    return (
      <div className={`flex flex-col items-center justify-center text-muted-foreground gap-2 p-8 ${className ?? ""}`}>
        <FileText className="w-8 h-8 opacity-40" />
        <div className="text-sm">{emptyLabel}</div>
      </div>
    );
  }

  const kind = fileKind(doc);
  const showOriginal = chrome === false ? true : viewMode === "formatted";
  const originalReady = Boolean(bytes) && !error;
  const extractedAvailable = Boolean(usableText);

  const toolbar = (
    extra?: ReactNode,
    status?: "hit" | "miss" | "searching" | "idle",
  ) =>
    chrome === false ? null : (
      <ViewerToolbar
        filename={doc.filename}
        kind={kind}
        showFilename={showFilename}
        status={status ?? "idle"}
        tone={tone}
        onDownload={bytes ? downloadOriginal : undefined}
        actions={extra}
      />
    );

  if (loading && !bytes) {
    return (
      <div className={`flex flex-col items-center justify-center text-muted-foreground gap-2 ${className ?? ""}`}>
        <Loader2 className="w-6 h-6 animate-spin" />
        <div className="text-xs">
          {kind === "word" ? "Opening Word document…" : kind === "pdf" ? "Opening PDF…" : "Opening file…"}
        </div>
      </div>
    );
  }

  // ——— PDF ———
  if (isPdf(doc)) {
    const showingPdf = showOriginal && Boolean(pdfObjectUrl);
    const status = showingPdf
      ? pdfHit
        ? "hit"
        : needle
          ? pdfReady
            ? "miss"
            : "searching"
          : "idle"
      : textHit
        ? "hit"
        : needle
          ? "miss"
          : "idle";

    return (
      <div className={`flex flex-col min-h-0 h-full ${className ?? ""}`}>
        {toolbar(
          extractedAvailable ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setViewMode((m) => (m === "formatted" ? "text" : "formatted"))}
            >
              {showingPdf ? "Extracted text" : "Show PDF"}
            </Button>
          ) : null,
          status,
        )}
        <div className="flex-1 min-h-0">
          {showingPdf && pdfObjectUrl ? (
            <PdfEvidenceViewer
              url={pdfObjectUrl}
              quote={needle}
              toneClass={toneClass}
              marks={paintSpecs}
              onHighlightChange={(h) => {
                setPdfHit(h);
                setPdfReady(true);
              }}
            />
          ) : extractedAvailable ? (
            <StructuredReader
              text={usableText}
              structure={doc.structure_json}
              quote={needle}
              toneClass={toneClass}
              marks={paintSpecs}
              onMarkClick={onMarkClick}
              missingOriginal={Boolean(error)}
              quiet={chrome === false}
            />
          ) : (
            <EmptyError message={friendlyOpenError(error ?? "PDF is not available in storage.", "pdf")} />
          )}
        </div>
      </div>
    );
  }

  // ——— Word (.docx native pages, .doc via Word HTML) ———
  if (isDocx(doc)) {
    const useNative = originalReady && !isLegacyDoc(doc);
    const useHtml = originalReady && isLegacyDoc(doc) && !!docxHtml;
    const showingOriginal = showOriginal && (useNative || useHtml);
    const status = showingOriginal
      ? (useNative ? nativeHits : htmlHits) > 0
        ? "hit"
        : needle
          ? "miss"
          : "idle"
      : textHit
        ? "hit"
        : needle
          ? "miss"
          : "idle";

    if (error && !extractedAvailable && !bytes) {
      return <EmptyError message={friendlyOpenError(error, kind)} className={className} />;
    }

    return (
      <div className={`flex flex-col min-h-0 h-full ${className ?? ""}`}>
        {toolbar(
          <div className="flex items-center gap-1">
            {needle && showingOriginal && (useNative ? nativeHits : htmlHits) > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => scrollToEvidenceQuote()}
              >
                <LocateFixed className="w-3.5 h-3.5 mr-1" />
                Jump to quote
              </Button>
            )}
            {extractedAvailable && (useNative || useHtml) && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setViewMode((m) => (m === "formatted" ? "text" : "formatted"))}
              >
                {showingOriginal ? "Extracted text" : "Show Word document"}
              </Button>
            )}
          </div>,
          status,
        )}
        {chrome !== false && error && extractedAvailable && !bytes && (
          <div className="shrink-0 text-[11px] text-muted-foreground border-b px-3 py-1.5 bg-muted/40">
            Could not open the original Word file. Showing extracted text.
          </div>
        )}
        <div className="flex-1 min-h-0">
          {showingOriginal && useNative && bytes ? (
            <DocxNativeViewer
              bytes={bytes}
              quote={needle}
              toneClass={toneClass}
              marks={paintSpecs}
              onMarkClick={onMarkClick}
              onHits={setNativeHits}
            />
          ) : showingOriginal && useHtml && docxHtml ? (
            <HtmlReader html={docxHtml} />
          ) : extractedAvailable ? (
            <StructuredReader
              text={usableText}
              structure={doc.structure_json}
              quote={needle}
              toneClass={toneClass}
              marks={paintSpecs}
              onMarkClick={onMarkClick}
              missingOriginal={Boolean(error)}
              quiet={chrome === false}
            />
          ) : (
            <EmptyError message={friendlyOpenError(error ?? "Word document is not available.", "word")} />
          )}
        </div>
      </div>
    );
  }

  // ——— TXT / MD ———
  if (usableText || isPlain(doc)) {
    return (
      <div className={`flex flex-col min-h-0 h-full ${className ?? ""}`}>
        {toolbar(null, textHit ? "hit" : needle ? "miss" : "idle")}
        <div className="flex-1 min-h-0">
          <StructuredReader
            text={usableText || "(Empty file)"}
            structure={doc.structure_json}
            quote={needle}
            toneClass={toneClass}
            marks={paintSpecs}
            onMarkClick={onMarkClick}
            quiet={chrome === false}
          />
        </div>
      </div>
    );
  }

  return <FallbackDownload doc={doc} quote={needle} toneClass={toneClass} className={className} />;
}

function bindMarkClicks(root: HTMLElement | null, onMarkClick?: (id: string) => void) {
  if (!root || !onMarkClick) return () => undefined;
  const handler = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const mark = target?.closest?.("mark[data-finding-id]");
    const id = mark?.getAttribute("data-finding-id");
    if (!id) return;
    event.preventDefault();
    onMarkClick(id);
  };
  root.addEventListener("click", handler);
  return () => root.removeEventListener("click", handler);
}

function DocxNativeViewer({
  bytes,
  quote,
  toneClass,
  marks = [],
  onMarkClick,
  onHits,
}: {
  bytes: ArrayBuffer;
  quote: string;
  toneClass: string;
  marks?: EvidencePaintSpec[];
  onMarkClick?: (id: string) => void;
  onHits: (n: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [htmlFallback, setHtmlFallback] = useState<string | null>(null);

  const [ready, setReady] = useState(false);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    let cancelled = false;
    setFailed(false);
    setHtmlFallback(null);
    setReady(false);
    body.innerHTML = "";
    onHits(0);

    (async () => {
      try {
        await renderAsync(bytes.slice(0), body, undefined, {
          className: "docx",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          experimental: true,
          useBase64URL: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          ignoreLastRenderedPageBreak: true,
        });
        if (!cancelled) setReady(true);
      } catch {
        if (cancelled) return;
        try {
          const result = await mammoth.convertToHtml(
            { arrayBuffer: bytes.slice(0) },
            { includeDefaultStyleMap: true },
          );
          if (cancelled) return;
          const raw = result.value || "<p>(Empty document)</p>";
          setHtmlFallback(raw);
        } catch {
          if (!cancelled) setFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bytes, onHits]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!ready || !body || htmlFallback) return;
    const hits = marks.length
      ? highlightEvidenceInElement(body, marks)
      : quote.trim()
        ? highlightQuoteInElement(body, quote, toneClass)
        : 0;
    onHits(hits);
    const t = window.setTimeout(() => {
      scrollElementIntoScroller(activeEvidenceMark(body), { behavior: "auto" });
    }, 120);
    return () => window.clearTimeout(t);
  }, [ready, quote, toneClass, htmlFallback, onHits, marks]);

  useEffect(() => bindMarkClicks(hostRef.current ?? bodyRef.current, onMarkClick), [onMarkClick, ready]);

  const fallbackHtml = useMemo(() => {
    if (!htmlFallback) return null;
    if (marks.length) return highlightEvidenceInHtml(htmlFallback, marks);
    if (!quote.trim()) return { html: htmlFallback, hitCount: 0 };
    return highlightQuoteInHtml(htmlFallback, quote, toneClass);
  }, [htmlFallback, quote, toneClass, marks]);

  useEffect(() => {
    if (fallbackHtml) onHits(fallbackHtml.hitCount);
  }, [fallbackHtml, onHits]);

  if (failed) {
    return <EmptyError message="This Word file could not be rendered." />;
  }
  if (fallbackHtml) {
    return <HtmlReader html={fallbackHtml.html} />;
  }

  return (
    <div ref={hostRef} className="h-full overflow-auto docx-preview-host relative">
      {!ready && (
        <div className="absolute inset-0 grid place-items-center text-muted-foreground z-[1]">
          <div className="flex items-center gap-2 text-xs">
            <Loader2 className="w-4 h-4 animate-spin" />
            Opening Word document…
          </div>
        </div>
      )}
      <div ref={bodyRef} />
    </div>
  );
}

function ViewerToolbar({
  filename,
  kind = "file",
  showFilename = true,
  status,
  tone,
  actions,
  onDownload,
}: {
  filename: string;
  kind?: "word" | "pdf" | "text" | "file";
  showFilename?: boolean;
  status: "hit" | "miss" | "pdf" | "searching" | "idle";
  tone: Verdict | null;
  actions?: ReactNode;
  onDownload?: () => void;
}) {
  const badgeTone = evidenceToneClass(tone);
  const kindLabel = kind === "word" ? "Word" : kind === "pdf" ? "PDF" : kind === "text" ? "Text" : "File";
  const hasStatus = status === "hit" || status === "searching" || status === "miss";
  if (!showFilename && !hasStatus && !actions && !onDownload) return null;
  return (
    <div className="shrink-0 border-b px-3 py-1.5 flex items-center gap-2 text-xs bg-background/90">
      {showFilename && (
        <>
          <FileType2 className="w-3.5 h-3.5 text-brand" />
          <span className="text-muted-foreground truncate">{filename}</span>
        </>
      )}
      <span className="shrink-0 rounded border border-border/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {kindLabel}
      </span>
      {status === "hit" && (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium evidence-hit",
            badgeTone,
          )}
        >
          Quote marked in file
        </span>
      )}
      {status === "searching" && (
        <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px]">
          Locating quote…
        </span>
      )}
      {status === "miss" && (
        <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px]">
          Quote not found in this layout
        </span>
      )}
      <div className="flex-1" />
      {actions}
      {onDownload && (
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onDownload}>
          <Download className="w-3.5 h-3.5 mr-1" />
          Download
        </Button>
      )}
    </div>
  );
}

function EmptyError({ message, className }: { message: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center text-muted-foreground gap-2 p-6 ${className ?? ""}`}>
      <AlertCircle className="w-6 h-6 text-warning" />
      <div className="text-sm text-center max-w-sm">{message}</div>
    </div>
  );
}

function FallbackDownload({
  doc,
  quote,
  toneClass,
  className,
}: {
  doc: ViewableDoc;
  quote?: string;
  toneClass?: string;
  className?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!doc.storage_path) {
        setErr("No file in storage");
        return;
      }
      try {
        const { data, error } = await supabase.storage.from("contracts").download(doc.storage_path);
        if (error || !data) throw error ?? new Error("Download failed");
        const t = await data.text();
        if (!cancelled) {
          if (isUsablePlainText(t)) setText(t);
          else setErr("No readable preview for this file type.");
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Could not open document");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc.storage_path]);

  if (err) return <EmptyError message={err} className={className} />;
  if (!text) {
    return (
      <div className={`flex items-center justify-center text-muted-foreground ${className ?? ""}`}>
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  return <PlainReader text={text} quote={quote} toneClass={toneClass} className={className} />;
}

function PaperSheet({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ScrollArea className={cn("h-full bg-paper dark:bg-muted/50", className)}>
      <div className="px-4 py-5 lg:px-8 lg:py-6">
        <div className="mx-auto max-w-[42rem] min-h-[24rem] rounded-[2px] bg-background shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-12px_rgba(15,23,42,0.18)] border border-black/[0.04] dark:border-white/10 px-8 py-9 lg:px-11 lg:py-11">
          {children}
        </div>
      </div>
    </ScrollArea>
  );
}

function isCoverLabel(text: string) {
  const t = text.trim();
  if (!t || t.length > 48) return false;
  if (/[.!?]$/.test(t)) return false;
  if (/^\d+(?:\.\d+)*\.?\s/.test(t)) return false;
  return true;
}

type RenderItem =
  | { kind: "facts"; rows: Array<{ label: string; value: string }> }
  | { kind: "block"; block: AstBlock };

function toRenderItems(blocks: AstBlock[]): RenderItem[] {
  const out: RenderItem[] = [];
  let facts: Array<{ label: string; value: string }> = [];
  const flush = () => {
    if (facts.length) out.push({ kind: "facts", rows: facts });
    facts = [];
  };
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const next = blocks[i + 1];
    if (
      block.type === "paragraph" &&
      next?.type === "paragraph" &&
      isCoverLabel(block.text) &&
      next.text.trim().length > 0 &&
      next.text.trim().length < 220 &&
      !isCoverLabel(next.text)
    ) {
      facts.push({ label: block.text.trim(), value: next.text.trim() });
      i += 1;
      continue;
    }
    flush();
    out.push({ kind: "block", block });
  }
  flush();
  return out;
}

function StructuredReader({
  text,
  structure,
  quote,
  toneClass,
  marks = [],
  onMarkClick,
  missingOriginal = false,
  quiet = false,
}: {
  text: string;
  structure?: ClauseDocumentAst | null;
  quote?: string;
  toneClass?: string;
  marks?: EvidencePaintSpec[];
  onMarkClick?: (id: string) => void;
  missingOriginal?: boolean;
  quiet?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ast = useMemo<ClauseDocumentAst>(() => {
    if (structure?.blocks?.length) return structure;
    return buildClauseAstFromText(text);
  }, [structure, text]);
  const items = useMemo(() => toRenderItems(ast.blocks), [ast]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const hits = marks.length
      ? highlightEvidenceInElement(el, marks)
      : quote?.trim()
        ? highlightQuoteInElement(el, quote, toneClass ?? "")
        : 0;
    if (hits <= 0) return;
    const t = window.setTimeout(() => {
      scrollElementIntoScroller(activeEvidenceMark(el), { behavior: "auto" });
    }, 120);
    return () => window.clearTimeout(t);
  }, [quote, toneClass, ast, marks]);

  useEffect(() => bindMarkClicks(rootRef.current, onMarkClick), [onMarkClick, ast]);

  return (
    <div className="h-full overflow-auto docx-preview-host">
      <article className="docx-reconstructed-page">
        {!quiet && (
          <div className="mb-6 text-[11px] font-sans text-muted-foreground border-b pb-3">
            {missingOriginal
              ? "Original file is not in storage. Layout reconstructed from extracted text."
              : "Extracted text — not the original page layout."}
          </div>
        )}
        <div ref={rootRef} className="evidence-doc">
          {items.map((item, i) =>
            item.kind === "facts" ? (
              <dl key={`facts-${i}`} className="evidence-facts">
                {item.rows.map((row) => (
                  <div key={row.label} className="evidence-facts-row">
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <AstBlockView key={item.block.id} block={item.block} />
            ),
          )}
        </div>
      </article>
    </div>
  );
}

function AstBlockView({ block }: { block: AstBlock }) {
  if (block.type === "heading" || block.type === "clause") {
    const Tag = (block.level ?? 2) <= 1 ? "h2" : "h3";
    return <Tag className="font-semibold tracking-tight text-foreground">{block.text}</Tag>;
  }
  if (block.type === "list_item") {
    return <p className="pl-4 before:content-['•'] before:mr-2 before:text-muted-foreground">{block.text}</p>;
  }
  if (block.type === "table") {
    const rows = block.text.split("\n").map((line) =>
      line.split(/\||\t/).map((c) => c.trim()).filter((c, i, arr) => !(arr.length > 2 && (i === 0 || i === arr.length - 1) && !c)),
    ).filter((r) => r.length);
    if (rows.length >= 2) {
      return (
        <table>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => {
                  const Cell = i === 0 ? "th" : "td";
                  return <Cell key={j}>{cell}</Cell>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
  }
  return <p>{block.text}</p>;
}

function PlainReader({
  text,
  quote,
  toneClass,
  className,
  extracted = false,
}: {
  text: string;
  quote?: string;
  toneClass?: string;
  className?: string;
  extracted?: boolean;
}) {
  const markRef = useRef<HTMLElement | null>(null);
  const parts = useMemo(() => findQuoteInText(text, quote ?? ""), [text, quote]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      scrollElementIntoScroller(markRef.current);
    }, 80);
    return () => window.clearTimeout(t);
  }, [parts.hit, text, quote]);

  return (
    <PaperSheet className={className}>
      {extracted && (
        <div className="mb-5 -mt-2 text-[11px] font-sans tracking-normal text-muted-foreground border-b pb-3">
          Extracted text — this is not the original page layout.
        </div>
      )}
      <div className="text-[14.5px] leading-[1.75] text-foreground/90 whitespace-pre-wrap font-display tracking-[0.01em]">
        {parts.hit ? (
          <>
            {parts.before}
            <mark ref={markRef as any} className={cn("evidence-hit", toneClass)}>
              {parts.hit}
            </mark>
            {parts.after}
          </>
        ) : (
          <>
            {text}
            {quote?.trim() && (
              <div className="mt-5 text-xs font-sans tracking-normal text-muted-foreground border-t pt-4">
                This quote was not found in this file. Try another pack file.
              </div>
            )}
          </>
        )}
      </div>
    </PaperSheet>
  );
}

function HtmlReader({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      scrollElementIntoScroller(activeEvidenceMark(containerRef.current));
    }, 80);
    return () => window.clearTimeout(t);
  }, [html]);

  return (
    <PaperSheet>
      <div
        ref={containerRef}
        className="prose prose-sm dark:prose-invert max-w-none evidence-doc"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </PaperSheet>
  );
}
