import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import mammoth from "mammoth";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, FileText, FileType2 } from "lucide-react";
import { findQuoteInText, highlightQuoteInHtml } from "@/lib/highlight-quote";
import { PdfEvidenceViewer } from "@/components/pack/pdf-evidence-viewer";
import { cn } from "@/lib/utils";
import { evidenceToneClass, toVerdict, type Severity, type Verdict } from "@/lib/verdict";

export type ViewableDoc = {
  id: string;
  filename: string;
  mime_type?: string | null;
  storage_path?: string | null;
  parsed_text?: string | null;
  extracted_text?: string | null;
};

type Props = {
  doc: ViewableDoc | null;
  quote?: string;
  fallbackNeedle?: string;
  /** Finding severity or verdict — drives highlight colour in the reference document. */
  severity?: Severity;
  verdict?: Verdict | null;
  emptyLabel?: string;
  className?: string;
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

function storageFileUrl(storagePath: string) {
  const q = new URLSearchParams({ bucket: "contracts", path: storagePath });
  return `/api/storage/file?${q.toString()}`;
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

export function DocumentViewer({
  doc,
  quote = "",
  fallbackNeedle = "",
  severity,
  verdict,
  emptyLabel = "Select a document",
  className,
}: Props) {
  const [viewMode, setViewMode] = useState<"formatted" | "text">("formatted");
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [htmlHits, setHtmlHits] = useState(0);
  const [pdfHit, setPdfHit] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needle = resolveNeedle(quote, fallbackNeedle);
  const tone = resolveVerdict(verdict, severity);
  const toneClass = evidenceToneClass(tone);

  const usableText = useMemo(() => {
    if (!doc) return "";
    const a = cleanText(doc.parsed_text);
    const b = cleanText(doc.extracted_text);
    if (isUsablePlainText(a)) return a;
    if (isUsablePlainText(b)) return b;
    return "";
  }, [doc]);

  const textHit = useMemo(
    () => (usableText && needle ? !!findQuoteInText(usableText, needle).hit : false),
    [usableText, needle],
  );

  const pdfUrl = doc?.storage_path && isPdf(doc) ? storageFileUrl(doc.storage_path) : null;

  useEffect(() => {
    setDocxHtml(null);
    setHtmlHits(0);
    setPdfHit(false);
    setPdfReady(false);
    setError(null);
    if (doc && isPlain(doc)) setViewMode("text");
    else setViewMode("formatted");
  }, [doc?.id]);

  // Re-locate evidence when the quote changes
  useEffect(() => {
    if (doc && isPdf(doc)) {
      setPdfHit(false);
      setPdfReady(false);
    }
  }, [needle, doc?.id]);

  // Load DOCX → HTML and apply highlight (stay on formatted Word view when possible)
  useEffect(() => {
    let cancelled = false;
    async function loadDocx() {
      if (!doc?.storage_path || !isDocx(doc)) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(storageFileUrl(doc.storage_path), { credentials: "same-origin" });
        if (!res.ok) throw new Error(`Could not open file (${res.status})`);
        const buf = await res.arrayBuffer();
        const result = await mammoth.convertToHtml(
          { arrayBuffer: buf },
          {
            // Prefer visible structure so evidence marks land in the document view
            includeDefaultStyleMap: true,
          },
        );
        if (cancelled) return;
        const raw = result.value || "<p>(Empty document)</p>";
        if (needle) {
          const { html, hitCount } = highlightQuoteInHtml(raw, needle, toneClass);
          setDocxHtml(html);
          setHtmlHits(hitCount);
          // Prefer formatted Word. Only fall back to plain text when HTML cannot highlight
          // but extracted text can (e.g. complex tables mammoth dropped).
          if (hitCount === 0 && usableText && findQuoteInText(usableText, needle).hit) {
            setViewMode("text");
          } else {
            setViewMode("formatted");
          }
        } else {
          setDocxHtml(raw);
          setHtmlHits(0);
          setViewMode("formatted");
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Could not open document");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadDocx();
    return () => {
      cancelled = true;
    };
  }, [doc?.id, doc?.storage_path, doc?.filename, needle, usableText, toneClass]);

  if (!doc) {
    return (
      <div className={`flex flex-col items-center justify-center text-muted-foreground gap-2 p-8 ${className ?? ""}`}>
        <FileText className="w-8 h-8 opacity-40" />
        <div className="text-sm">{emptyLabel}</div>
      </div>
    );
  }

  // ——— PDF: highlight on the actual page (pdf.js), not plain text ———
  if (isPdf(doc)) {
    const showPdf = viewMode === "formatted" || !usableText;
    const status = showPdf
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
        <ViewerToolbar
          filename={doc.filename}
          status={status}
          tone={tone}
          actions={
            usableText ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setViewMode((m) => (m === "formatted" ? "text" : "formatted"))}
              >
                {showPdf ? "Extracted text" : "Show PDF"}
              </Button>
            ) : null
          }
        />
        <div className="flex-1 min-h-0">
          {showPdf ? (
            pdfUrl ? (
              <PdfEvidenceViewer
                url={pdfUrl}
                quote={needle}
                toneClass={toneClass}
                onHighlightChange={(h) => {
                  setPdfHit(h);
                  setPdfReady(true);
                }}
              />
            ) : (
              <EmptyError message="PDF is not available in storage." />
            )
          ) : (
            <PlainReader text={usableText} quote={needle} toneClass={toneClass} />
          )}
        </div>
      </div>
    );
  }

  // ——— DOCX ———
  if (isDocx(doc)) {
    if (loading) {
      return (
        <div className={`flex flex-col items-center justify-center text-muted-foreground gap-2 ${className ?? ""}`}>
          <Loader2 className="w-6 h-6 animate-spin" />
          <div className="text-xs">Opening Word document…</div>
        </div>
      );
    }
    if (error && !usableText && !docxHtml) {
      return <EmptyError message={error} className={className} />;
    }

    const showHtml = viewMode === "formatted" && !!docxHtml;
    const status =
      showHtml && htmlHits > 0
        ? "hit"
        : !showHtml && textHit
          ? "hit"
          : needle
            ? "miss"
            : "idle";

    return (
      <div className={`flex flex-col min-h-0 h-full ${className ?? ""}`}>
        <ViewerToolbar
          filename={doc.filename}
          status={status}
          tone={tone}
          actions={
            usableText && docxHtml ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setViewMode((m) => (m === "formatted" ? "text" : "formatted"))}
              >
                {showHtml ? "Extracted text" : "Show Word document"}
              </Button>
            ) : null
          }
        />
        <div className="flex-1 min-h-0">
          {showHtml ? (
            <HtmlReader html={docxHtml!} />
          ) : (
            <PlainReader text={usableText || "(Empty file)"} quote={needle} toneClass={toneClass} />
          )}
        </div>
      </div>
    );
  }

  // ——— TXT / MD ———
  if (usableText || isPlain(doc)) {
    return (
      <div className={`flex flex-col min-h-0 h-full ${className ?? ""}`}>
        <ViewerToolbar
          filename={doc.filename}
          status={textHit ? "hit" : needle ? "miss" : "idle"}
          tone={tone}
        />
        <div className="flex-1 min-h-0">
          <PlainReader text={usableText || "(Empty file)"} quote={needle} toneClass={toneClass} />
        </div>
      </div>
    );
  }

  return <FallbackDownload doc={doc} quote={needle} toneClass={toneClass} className={className} />;
}

function ViewerToolbar({
  filename,
  status,
  tone,
  actions,
}: {
  filename: string;
  status: "hit" | "miss" | "pdf" | "searching" | "idle";
  tone: Verdict | null;
  actions?: ReactNode;
}) {
  const badgeTone = evidenceToneClass(tone);
  return (
    <div className="shrink-0 border-b px-3 py-1.5 flex items-center gap-2 text-xs bg-background/80">
      <FileType2 className="w-3.5 h-3.5 text-brand" />
      <span className="text-muted-foreground truncate">{filename}</span>
      {status === "hit" && (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold evidence-hit",
            badgeTone,
          )}
        >
          Evidence highlighted in document
        </span>
      )}
      {status === "searching" && (
        <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px]">
          Locating evidence in document…
        </span>
      )}
      {status === "miss" && (
        <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px]">
          Quote not found in this document
        </span>
      )}
      <div className="flex-1" />
      {actions}
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

function PlainReader({
  text,
  quote,
  toneClass,
  className,
}: {
  text: string;
  quote?: string;
  toneClass?: string;
  className?: string;
}) {
  const markRef = useRef<HTMLElement | null>(null);
  const parts = useMemo(() => findQuoteInText(text, quote ?? ""), [text, quote]);

  useEffect(() => {
    // delay so ScrollArea has laid out
    const t = window.setTimeout(() => {
      markRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    return () => window.clearTimeout(t);
  }, [parts.hit, text, quote]);

  return (
    <ScrollArea className={`h-full ${className ?? ""}`}>
      <pre className="p-4 text-[12px] leading-snug whitespace-pre-wrap font-sans text-foreground/90">
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
              <div className="mt-4 text-xs text-muted-foreground border-t pt-3">
                Evidence quote not found in this file’s text. Try another pack file.
              </div>
            )}
          </>
        )}
      </pre>
    </ScrollArea>
  );
}

function HtmlReader({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const el = containerRef.current?.querySelector("mark[data-evidence-hit]");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [html]);

  return (
    <ScrollArea className="h-full">
      <div
        ref={containerRef}
        className="prose prose-sm dark:prose-invert max-w-none p-4 evidence-doc"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </ScrollArea>
  );
}
