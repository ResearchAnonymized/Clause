import { useState, useEffect, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { canMutateRun, VIEWER_MUTATION_DENIED } from "@/lib/organizations";
import { enqueueRun } from "@/lib/enqueue-run.functions";
import { expandUploads, type ExpandedUpload } from "@/lib/expand-uploads";
import { PackPreview } from "@/components/pack/pack-preview";
import { NewRunCoach, type NewRunCoachPhase } from "@/components/new-run-coach";
import { useOnboarding } from "@/hooks/use-onboarding";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Upload, Play, FileText, X, Layers, Package } from "lucide-react";
import { toast } from "sonner";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";

export const Route = createFileRoute("/_authenticated/runs/new")({
  head: () => ({ meta: [{ title: "New analysis — Counterpart" }] }),
  component: NewRunPage,
});

const ACCEPT = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/msword": [".doc"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "application/zip": [".zip"],
  "application/x-zip-compressed": [".zip"],
};
const MAX_DOC = 20 * 1024 * 1024;
const MAX_ZIP = 50 * 1024 * 1024;

type Mode = "single" | "tender" | "bulk";

function NewRunPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { workspaceId, role } = useCurrentWorkspace();
  const canStart = canMutateRun(role);
  const { mark: markOnboarding, showCoach } = useOnboarding();
  const [mode, setMode] = useState<Mode>("tender");
  const [title, setTitle] = useState("");
  const [customerFile, setCustomerFile] = useState<File | null>(null);
  const [supplierFile, setSupplierFile] = useState<File | null>(null);
  const [tenderFiles, setTenderFiles] = useState<File[]>([]);
  const [bidderFiles, setBidderFiles] = useState<File[]>([]);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [criteriaSetId, setCriteriaSetId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const coachPhase: NewRunCoachPhase = !showCoach
    ? null
    : mode === "tender"
      ? tenderFiles.length === 0
        ? "tender"
        : bidderFiles.length === 0
          ? "bidder"
          : "start"
      : mode === "single"
        ? !customerFile
          ? "tender"
          : !supplierFile
            ? "bidder"
            : "start"
        : !customerFile
          ? "tender"
          : bulkFiles.length === 0
            ? "bidder"
            : "start";

  const { data: sets } = useQuery({
    queryKey: ["criteria_sets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("criteria_sets").select("id, name, is_default").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!criteriaSetId && sets?.length) {
      setCriteriaSetId(sets.find((s) => s.is_default)?.id ?? sets[0].id);
    }
  }, [sets, criteriaSetId]);

  const startPack = async (
    customers: ExpandedUpload[],
    suppliers: ExpandedUpload[],
    titleOverride?: string,
    originals?: { customerFiles?: File[]; supplierFiles?: File[] },
  ) => {
    const cPack =
      customers.find((c) => c.packLabel && c.packLabel !== "direct")?.packLabel ??
      (customers.length === 1 ? customers[0].file.name : `${customers.length} tender docs`);
    const sPack =
      suppliers.find((s) => s.packLabel && s.packLabel !== "direct")?.packLabel ??
      (suppliers.length === 1 ? suppliers[0].file.name : `${suppliers.length} bidder docs`);
    const { data: run, error } = await supabase
      .from("runs")
      .insert({
        title: titleOverride || `${sPack} vs ${cPack}`,
        criteria_set_id: criteriaSetId,
        created_by: user!.id,
        workspace_id: workspaceId!,
        customer_pack_label: cPack,
        supplier_pack_label: sPack,
        customer_doc_count: customers.length,
        supplier_doc_count: suppliers.length,
      })
      .select("id")
      .single();
    if (error || !run) throw error ?? new Error("Could not create run");

    // Persist original uploaded ZIPs / files for case history & re-download
    const packRows: Record<string, unknown>[] = [];
    const archiveOriginals = async (files: File[] | undefined, role: "customer" | "supplier") => {
      if (!files?.length) return;
      for (const file of files) {
        const safe = file.name.replace(/[/\\]/g, "_");
        const path = `${user!.id}/${run.id}/packs/${role}-${safe}`;
        const up = await supabase.storage.from("contracts").upload(path, file, { upsert: true });
        if (up.error) throw up.error;
        const expandedForPack =
          role === "customer"
            ? customers.filter((c) => c.packLabel === file.name || (c.packLabel === "direct" && c.file.name === file.name))
            : suppliers.filter((s) => s.packLabel === file.name || (s.packLabel === "direct" && s.file.name === file.name));
        packRows.push({
          run_id: run.id,
          workspace_id: workspaceId!,
          role,
          pack_label: file.name,
          filename: file.name,
          storage_path: path,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          file_count: expandedForPack.length || 1,
        });
      }
    };
    await archiveOriginals(originals?.customerFiles, "customer");
    await archiveOriginals(originals?.supplierFiles, "supplier");
    if (packRows.length) {
      const { error: packErr } = await supabase.from("run_packs").insert(packRows);
      if (packErr) throw packErr;
    }

    const uploads = await Promise.all(
      [
        ...customers.map((u, i) => ({ u, role: "customer" as const, i })),
        ...suppliers.map((u, i) => ({ u, role: "supplier" as const, i })),
      ].map(async ({ u, role, i }) => {
        const safe = u.file.name.replace(/[/\\]/g, "_");
        const path = `${user!.id}/${run.id}/${role}-${i}-${safe}`;
        const up = await supabase.storage.from("contracts").upload(path, u.file, { upsert: true });
        if (up.error) throw up.error;
        return {
          run_id: run.id,
          workspace_id: workspaceId!,
          role,
          filename: u.file.name,
          storage_path: path,
          mime_type: u.file.type || "application/octet-stream",
          size_bytes: u.file.size,
          source_path: u.sourcePath,
          pack_label: u.packLabel,
          doc_kind: u.docKind,
          sort_order: i,
        };
      }),
    );
    const { error: docErr } = await supabase.from("run_documents").insert(uploads);
    if (docErr) throw docErr;

    try {
      await enqueueRun({ data: { runId: run.id, criteriaSetId } });
    } catch (err) {
      toast.error(`Could not start analysis: ${String((err as Error)?.message ?? err)}`);
      throw err;
    }
    void markOnboarding("first_analysis");
    return run.id;
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!criteriaSetId) return toast.error("Pick a criteria set");
    if (!user || !workspaceId) return toast.error("No active workspace — reload and try again");

    setBusy(true);
    try {
      if (mode === "single") {
        if (!customerFile || !supplierFile) {
          toast.error("Upload both contracts");
          setBusy(false);
          return;
        }
        const [customers, suppliers] = await Promise.all([
          expandUploads([customerFile]),
          expandUploads([supplierFile]),
        ]);
        const runId = await startPack(customers, suppliers, title || undefined, {
          customerFiles: [customerFile],
          supplierFiles: [supplierFile],
        });
        toast.success(
          suppliers.length > 1 || customers.length > 1
            ? `Analysis started (${customers.length} tender + ${suppliers.length} bidder docs)`
            : "Analysis started",
        );
        navigate({ to: "/runs/$runId", params: { runId } });
      } else if (mode === "tender") {
        if (!tenderFiles.length) {
          toast.error("Upload the tender / customer documents");
          setBusy(false);
          return;
        }
        if (!bidderFiles.length) {
          toast.error("Upload the bidder pack (ZIP or files)");
          setBusy(false);
          return;
        }
        const [customers, suppliers] = await Promise.all([
          expandUploads(tenderFiles),
          expandUploads(bidderFiles),
        ]);
        const runId = await startPack(customers, suppliers, title || undefined, {
          customerFiles: tenderFiles,
          supplierFiles: bidderFiles,
        });
        toast.success(
          `Analysis started — ${customers.length} tender doc(s) vs ${suppliers.length} bidder doc(s)`,
        );
        navigate({ to: "/runs/$runId", params: { runId } });
      } else {
        if (!customerFile) {
          toast.error("Upload the customer / tender baseline");
          setBusy(false);
          return;
        }
        if (bulkFiles.length === 0) {
          toast.error("Add at least one bidder file or ZIP");
          setBusy(false);
          return;
        }
        const customers = await expandUploads([customerFile]);
        let done = 0;
        for (const f of bulkFiles) {
          try {
            const suppliers = await expandUploads([f]);
            await startPack(customers, suppliers, undefined, {
              customerFiles: [customerFile],
              supplierFiles: [f],
            });
            done++;
          } catch (err: any) {
            toast.error(`${f.name}: ${err?.message ?? err}`);
          }
        }
        toast.success(`Started ${done} of ${bulkFiles.length} analyses`);
        navigate({ to: "/runs" });
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to start analysis");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="space-y-2" data-tour-stage="newAnalysis">
        <PageBack label="Back to analyses" fallback={{ to: "/runs" }} />
        <PageBreadcrumbs items={[{ label: "Analyses", to: "/runs" }, { label: "New analysis" }]} />
        <h1 className="text-2xl font-semibold tracking-tight">New analysis</h1>
        <p className="text-muted-foreground mt-1">
          Compare a tender / customer baseline against a bidder response — including multi-file ZIP packs common in Finnish and EU procurements.
        </p>
      </div>

      <NewRunCoach
        phase={coachPhase}
        onLoadSamples={({ tender, bidder }) => {
          setMode("tender");
          setTenderFiles(tender);
          setBidderFiles(bidder);
          if (!title) setTitle("Sample · public procurement training pack");
        }}
      />

      <form onSubmit={submit} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
            <CardDescription>
              PDF, DOCX, DOC, TXT, or ZIP packs — documents up to 20&nbsp;MB each, ZIPs up to 50&nbsp;MB.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList className="grid w-full grid-cols-3 h-auto">
                <TabsTrigger value="tender" className="text-xs sm:text-sm py-2">
                  <Package className="h-3.5 w-3.5 mr-1 shrink-0" />
                  Tender pack
                </TabsTrigger>
                <TabsTrigger value="single" className="text-xs sm:text-sm py-2">
                  Single pair
                </TabsTrigger>
                <TabsTrigger value="bulk" className="text-xs sm:text-sm py-2">
                  <Layers className="h-3.5 w-3.5 mr-1 shrink-0" />
                  Many bidders
                </TabsTrigger>
              </TabsList>

              <TabsContent value="tender" className="pt-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Typical Hilma / EU pattern: one tender (or annex ZIP) vs one bidder ZIP with offer, price schedule,
                  DPA, certificates, etc. Everything lands in <span className="font-medium text-foreground">one analysis</span>;
                  agents retrieve across all files. Review the document register below before starting.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <MultiDrop
                    label="Tender / customer docs"
                    hint="Tender PDF or ZIP of annexes"
                    files={tenderFiles}
                    onFiles={setTenderFiles}
                    highlighted={coachPhase === "tender"}
                  />
                  <MultiDrop
                    label="Bidder response pack"
                    hint="ZIP or multiple PDF/DOCX files"
                    files={bidderFiles}
                    onFiles={setBidderFiles}
                    highlighted={coachPhase === "bidder"}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <PackPreview files={tenderFiles} label="Tender pack register" />
                  <PackPreview files={bidderFiles} label="Bidder pack register" />
                </div>
              </TabsContent>

              <TabsContent value="single" className="pt-4 grid gap-4 md:grid-cols-2">
                <DropStub
                  label="Customer / tender"
                  file={customerFile}
                  onFile={setCustomerFile}
                  allowZip
                />
                <DropStub
                  label="Supplier / bidder"
                  file={supplierFile}
                  onFile={setSupplierFile}
                  allowZip
                />
                <p className="md:col-span-2 text-xs text-muted-foreground">
                  If you drop a ZIP on either side, nested PDF/DOCX files are expanded into that side of the same run.
                </p>
              </TabsContent>

              <TabsContent value="bulk" className="pt-4 space-y-4">
                <DropStub
                  label="Shared tender / customer baseline"
                  file={customerFile}
                  onFile={setCustomerFile}
                  allowZip
                />
                <MultiDrop
                  label="Bidder files (one analysis each)"
                  hint="Each file or ZIP = a separate bidder comparison"
                  files={bulkFiles}
                  onFiles={setBulkFiles}
                />
                <p className="text-xs text-muted-foreground">
                  Use when comparing the same tender against several bidders. A ZIP under one bidder expands into that
                  bidder’s pack only.
                </p>
              </TabsContent>
            </Tabs>

            {(mode === "single" || mode === "tender") && (
              <div className="space-y-1.5">
                <Label htmlFor="run-title">Analysis title (optional)</Label>
                <Input
                  id="run-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. CareFlow tender · Bidder A · 2026"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Criteria set</Label>
              <Select value={criteriaSetId} onValueChange={setCriteriaSetId}>
                <SelectTrigger><SelectValue placeholder="Select a criteria set" /></SelectTrigger>
                <SelectContent>
                  {sets?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} {s.is_default && "· default"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 mt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                window.history.back();
              } else {
                navigate({ to: "/runs" });
              }
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !criteriaSetId || !workspaceId || !canStart}
            title={!canStart ? VIEWER_MUTATION_DENIED : undefined}
            className={cn(coachPhase === "start" && "ring-2 ring-brand ring-offset-2")}
            onClick={() => void submit()}
          >
            <Play className="w-4 h-4 mr-1" />
            {busy
              ? mode === "bulk"
                ? `Starting ${bulkFiles.length}…`
                : "Unpacking & starting…"
              : mode === "bulk"
              ? `Start ${bulkFiles.length || ""} ${bulkFiles.length === 1 ? "analysis" : "analyses"}`.trim()
              : "Start analysis"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function fileCap(file: File) {
  return file.name.toLowerCase().endsWith(".zip") ? MAX_ZIP : MAX_DOC;
}

function DropStub({
  label,
  file,
  onFile,
  allowZip,
}: {
  label: string;
  file: File | null;
  onFile: (f: File | null) => void;
  allowZip?: boolean;
}) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      const f = accepted[0];
      if (!f) return;
      if (f.size > fileCap(f)) {
        toast.error(f.name.toLowerCase().endsWith(".zip") ? "ZIP exceeds 50 MB" : "File exceeds 20 MB");
        return;
      }
      onFile(f);
    },
    [onFile],
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: false,
    maxSize: MAX_ZIP,
  });

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {file ? (
        <div className="border rounded-lg p-4 bg-muted/30 flex items-center gap-3">
          <FileText className="w-6 h-6 text-brand shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate text-sm">{file.name}</div>
            <div className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => onFile(null)} aria-label={`Remove ${file.name}`}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div
          {...getRootProps()}
          role="button"
          tabIndex={0}
          aria-label={`${label} — drop or click to upload`}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-brand ${
            isDragActive ? "border-brand bg-brand/5" : "border-border hover:border-brand/50 bg-muted/20"
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
          <div className="text-sm font-medium">{isDragActive ? "Drop it here" : "Drop file or click to browse"}</div>
          <div className="text-xs text-muted-foreground mt-1">
            PDF, DOCX, DOC, TXT{allowZip ? ", ZIP" : ""} · docs 20 MB / ZIP 50 MB
          </div>
        </div>
      )}
    </div>
  );
}

function MultiDrop({
  label,
  hint,
  files,
  onFiles,
  highlighted,
}: {
  label: string;
  hint?: string;
  files: File[];
  onFiles: (f: File[]) => void;
  highlighted?: boolean;
}) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      const filtered = accepted.filter((f) => {
        if (f.size > fileCap(f)) {
          toast.error(
            `${f.name} exceeds ${f.name.toLowerCase().endsWith(".zip") ? "50" : "20"} MB`,
          );
          return false;
        }
        return true;
      });
      onFiles([...files, ...filtered]);
    },
    [files, onFiles],
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: true,
    maxSize: MAX_ZIP,
  });
  const remove = (i: number) => onFiles(files.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <Label>
        {label} {files.length > 0 && `(${files.length})`}
      </Label>
      <div
        {...getRootProps()}
        role="button"
        tabIndex={0}
        aria-label={`Drop or click to add ${label}`}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-brand",
          isDragActive ? "border-brand bg-brand/5" : "border-border hover:border-brand/50 bg-muted/20",
          highlighted && "ring-2 ring-brand ring-offset-2 border-brand bg-brand/5",
        )}
      >
        <input {...getInputProps()} />
        <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
        <div className="text-sm font-medium">{isDragActive ? "Drop files here" : "Drop files or click to browse"}</div>
        <div className="text-xs text-muted-foreground mt-1">{hint ?? "PDF, DOCX, TXT, or ZIP"}</div>
      </div>
      {files.length > 0 && (
        <div className="border rounded-md divide-y max-h-64 overflow-auto">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="flex items-center gap-3 p-2 text-sm">
              <FileText className="w-4 h-4 text-brand shrink-0" />
              <span className="truncate flex-1">{f.name}</span>
              <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label={`Remove ${f.name}`}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
