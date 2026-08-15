import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, AlertCircle } from "lucide-react";
import { renderRunPdfBlob, type Finding, type Run } from "@/lib/export-run";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  run: Run;
  findings: Finding[];
  docs?: any[];
  events?: any[];
  criteria?: any[];
  checklist?: any[];
};

export function PdfPreviewDialog({
  open,
  onOpenChange,
  run,
  findings,
  docs = [],
  events = [],
  criteria = [],
  checklist = [],
}: Props) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("audit.pdf");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUrl(null);
    (async () => {
      try {
        const { blob, filename } = await renderRunPdfBlob(
          run,
          findings,
          docs,
          events,
          criteria,
          checklist,
        );
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        urlRef.current = objectUrl;
        setUrl(objectUrl);
        setFilename(filename);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, run?.id]);

  const download = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[92vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-5 py-3 border-b flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-base">
            {t("runDetail.pdfPreviewTitle", "Audit PDF preview")}
          </DialogTitle>
          <div className="flex items-center gap-2 pr-6">
            <Button size="sm" onClick={download} disabled={!url}>
              <Download className="w-4 h-4 mr-1" />
              {t("runDetail.download", "Download")}
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 min-h-0 bg-muted/40">
          {loading && (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-sm">
                {t("runDetail.pdfRendering", "Rendering audit report…")}
              </span>
            </div>
          )}
          {error && !loading && (
            <div className="h-full flex flex-col items-center justify-center text-destructive gap-2 p-6 text-center">
              <AlertCircle className="w-6 h-6" />
              <span className="text-sm">{error}</span>
            </div>
          )}
          {url && !loading && !error && (
            <iframe
              key={url}
              src={url}
              title="Audit PDF preview"
              className="w-full h-full border-0 bg-background"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
