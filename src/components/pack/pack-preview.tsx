import { useEffect, useState } from "react";
import { expandUploads, type ExpandedUpload } from "@/lib/expand-uploads";
import { kindLabel, formatBytes } from "@/lib/pack-utils";
import { Loader2, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Props = {
  files: File[];
  label: string;
};

/** Live unpack preview shown on New analysis before starting. */
export function PackPreview({ files, label }: Props) {
  const [items, setItems] = useState<ExpandedUpload[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fileKey = files.map((f) => `${f.name}:${f.size}:${f.lastModified}`).join("|");

  useEffect(() => {
    let cancelled = false;
    if (!files.length) {
      setItems(null);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    (async () => {
      try {
        const expanded = await expandUploads(files);
        if (cancelled) return;
        setItems(expanded);
      } catch (e: any) {
        if (cancelled) return;
        setItems(null);
        setError(e?.message ?? "Could not read pack");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey]);

  if (!files.length) return null;

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <Package className="w-3.5 h-3.5 text-brand" />
        <span className="font-medium">{label}</span>
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        {items && (
          <span className="text-muted-foreground">
            {items.length} document{items.length === 1 ? "" : "s"} ready
          </span>
        )}
      </div>
      {error && <div className="text-xs text-critical">{error}</div>}
      {items && items.length > 0 && (
        <div className="border rounded-md divide-y max-h-40 overflow-auto bg-background text-xs">
          {items.map((u, i) => (
            <div key={`${u.sourcePath}-${i}`} className="flex items-center gap-2 px-2.5 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{u.sourcePath}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {u.packLabel !== "direct" ? u.packLabel : "Direct upload"}
                </div>
              </div>
              <Badge variant="secondary" className="h-4 px-1 text-[9px] font-normal shrink-0">
                {kindLabel(u.docKind)}
              </Badge>
              <span className="text-[10px] text-muted-foreground w-12 text-right shrink-0">
                {formatBytes(u.file.size)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
