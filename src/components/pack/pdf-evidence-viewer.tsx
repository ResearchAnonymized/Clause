/**
 * PDF.js viewer that highlights evidence quotes on the rendered page
 * (canvas + overlay rects from text-layer geometry — not a plain-text fallback).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { findQuoteInText } from "@/lib/highlight-quote";
import { scrollElementIntoScroller } from "@/lib/scroll-into-scroller";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type Props = {
  url: string;
  quote?: string;
  /** Verdict tone class, e.g. evidence-tone-gap */
  toneClass?: string;
  marks?: Array<{ quote: string; toneClass?: string; active?: boolean }>;
  className?: string;
  onHighlightChange?: (hit: boolean) => void;
};

type TextItemBox = {
  page: number;
  str: string;
  start: number;
  end: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

type PageRender = {
  pageNum: number;
  width: number;
  height: number;
  dataUrl: string;
  highlights: Array<{ left: number; top: number; width: number; height: number; toneClass: string; active: boolean }>;
};

type ViewportLike = {
  width: number;
  height: number;
  convertToViewportRectangle: (r: number[]) => number[];
};

function appendPageItems(
  pageNum: number,
  items: Array<{ str: string; transform: number[]; width: number; height: number }>,
  viewport: ViewportLike,
  searchText: string,
  searchOffset: number,
  boxes: TextItemBox[],
): { searchText: string; searchOffset: number } {
  let text = searchText;
  let offset = searchOffset;

  if (text.length > 0) {
    text += "\n";
    offset += 1;
  }

  for (const item of items) {
    const str = item.str ?? "";
    if (!str) continue;

    if (text.length > 0 && !text.endsWith("\n") && !/\s$/.test(text) && !/^\s/.test(str)) {
      text += " ";
      offset += 1;
    }

    const start = offset;
    text += str;
    offset += str.length;
    const end = offset;

    const tx = item.transform[4] ?? 0;
    const ty = item.transform[5] ?? 0;
    const fontHeight =
      Math.hypot(item.transform[2] ?? 0, item.transform[3] ?? 0) || item.height || 10;
    const w = item.width || Math.max(2, str.length * fontHeight * 0.45);
    const pdfRect = [tx, ty - fontHeight * 0.2, tx + w, ty + fontHeight * 0.85];
    const vr = viewport.convertToViewportRectangle(pdfRect);
    const left = Math.min(vr[0], vr[2]);
    const top = Math.min(vr[1], vr[3]);
    const width = Math.abs(vr[2] - vr[0]);
    const height = Math.abs(vr[3] - vr[1]);

    boxes.push({
      page: pageNum,
      str,
      start,
      end,
      left,
      top,
      width: Math.max(width, 2),
      height: Math.max(height, 4),
    });
  }

  return { searchText: text, searchOffset: offset };
}

async function renderPageCanvas(page: PDFPageProxy, scale: number) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { viewport, dataUrl: canvas.toDataURL("image/png") };
}

export function PdfEvidenceViewer({ url, quote = "", toneClass = "", marks = [], className, onHighlightChange }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<PageRender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hit, setHit] = useState(false);
  const [hitPage, setHitPage] = useState<number | null>(null);
  const layoutRef = useRef<{ searchText: string; boxes: TextItemBox[] } | null>(null);

  const needle = useMemo(() => quote.trim(), [quote]);
  const paint = useMemo(() => {
    const list = marks.filter((m) => (m.quote ?? "").trim().length >= 8);
    if (list.length) return list;
    if (needle.length >= 4) return [{ quote: needle, toneClass, active: true }];
    return [];
  }, [marks, needle, toneClass]);

  useEffect(() => {
    let cancelled = false;
    let pdf: PDFDocumentProxy | null = null;

    async function load() {
      setLoading(true);
      setError(null);
      setPages([]);
      setHit(false);
      setHitPage(null);
      onHighlightChange?.(false);

      try {
        pdf = await pdfjs.getDocument({
          url,
          withCredentials: true,
          disableRange: true,
          disableStream: true,
        }).promise;
        if (cancelled) return;

        const scale = Math.min(1.4, Math.max(1.15, (window.devicePixelRatio || 1) * 0.95));
        const boxes: TextItemBox[] = [];
        let searchText = "";
        let searchOffset = 0;
        const rendered: PageRender[] = [];

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          if (cancelled) return;

          const { viewport, dataUrl } = await renderPageCanvas(page, scale);
          const content = await page.getTextContent();
          const items = (content.items as any[])
            .filter((it) => typeof it?.str === "string")
            .map((it) => ({
              str: String(it.str),
              transform: (it.transform as number[]) ?? [1, 0, 0, 1, 0, 0],
              width: Number(it.width) || 0,
              height: Number(it.height) || 0,
            }));

          const next = appendPageItems(
            pageNum,
            items,
            viewport as unknown as ViewportLike,
            searchText,
            searchOffset,
            boxes,
          );
          searchText = next.searchText;
          searchOffset = next.searchOffset;

          rendered.push({
            pageNum,
            width: viewport.width,
            height: viewport.height,
            dataUrl,
            highlights: [],
          });
        }

        if (cancelled) return;
        layoutRef.current = { searchText, boxes };
        setPages(rendered);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Could not open PDF");
          onHighlightChange?.(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      try {
        pdf?.destroy();
      } catch {
        /* ignore */
      }
    };
    // Intentionally omit onHighlightChange from deps to avoid reload loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    const layout = layoutRef.current;
    if (!layout || !pages.length) return;
    const byPage = new Map<number, PageRender["highlights"]>();
    let found = false;
    let firstPage: number | null = null;
    const ordered = [...paint].sort((a, b) => Number(Boolean(a.active)) - Number(Boolean(b.active)));
    for (const m of ordered) {
      const parts = findQuoteInText(layout.searchText, m.quote);
      if (!parts.hit) continue;
      const rangeStart = parts.before.length;
      const rangeEnd = rangeStart + parts.hit.length;
      const cls = m.toneClass || toneClass;
      const active = Boolean(m.active);
      for (const b of layout.boxes) {
        if (b.end <= rangeStart || b.start >= rangeEnd) continue;
        const list = byPage.get(b.page) ?? [];
        list.push({ left: b.left, top: b.top, width: b.width, height: b.height, toneClass: cls, active });
        byPage.set(b.page, list);
        if (active && firstPage == null) firstPage = b.page;
        if (active) found = true;
      }
      if (!found && firstPage == null) {
        firstPage = layout.boxes.find((b) => b.end > rangeStart && b.start < rangeEnd)?.page ?? null;
        found = true;
      }
    }
    setPages((prev) =>
      prev.map((p) => ({
        ...p,
        highlights: byPage.get(p.pageNum) ?? [],
      })),
    );
    setHit(found);
    setHitPage(firstPage);
    onHighlightChange?.(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paint, pages.length, toneClass]);

  useEffect(() => {
    if (!hitPage || !scrollRef.current) return;
    const t = window.setTimeout(() => {
      const pageEl = scrollRef.current?.querySelector(`[data-pdf-page="${hitPage}"]`);
      const mark =
        (pageEl?.querySelector("[data-evidence-pdf-hit]") as HTMLElement | null) ??
        (pageEl as HTMLElement | null);
      scrollElementIntoScroller(mark);
    }, 100);
    return () => window.clearTimeout(t);
  }, [hitPage, pages]);

  if (loading) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 text-muted-foreground h-full",
          className,
        )}
      >
        <Loader2 className="w-6 h-6 animate-spin" />
        <div className="text-xs">Opening PDF and locating evidence…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("flex items-center justify-center text-sm text-muted-foreground p-6", className)}>
        {error}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className={cn("h-full overflow-auto bg-muted/40", className)}>
      <div className="flex flex-col items-center gap-4 p-3">
        {pages.map((p) => (
          <div
            key={p.pageNum}
            data-pdf-page={p.pageNum}
            className="relative shadow-md bg-white"
            style={{ width: p.width, height: p.height }}
          >
            <img
              src={p.dataUrl}
              alt={`Page ${p.pageNum}`}
              width={p.width}
              height={p.height}
              className="block select-none"
              draggable={false}
            />
            {p.highlights.map((h, i) => (
              <div
                key={i}
                data-evidence-pdf-hit={h.active ? "1" : undefined}
                className={cn(
                  "absolute pointer-events-none evidence-pdf-hit",
                  h.toneClass,
                  h.active && "evidence-hit-active",
                )}
                style={{
                  left: h.left,
                  top: h.top,
                  width: h.width,
                  height: h.height,
                }}
              />
            ))}
            <div className="absolute bottom-1 right-2 text-[10px] text-black/40 font-medium tabular-nums">
              {p.pageNum}/{pages.length}
            </div>
          </div>
        ))}
        {needle && !hit && (
          <div className="text-xs text-muted-foreground pb-4 max-w-md text-center">
            Quote not found on the PDF text layer. Try another pack file, or switch to extracted text.
          </div>
        )}
      </div>
    </div>
  );
}
