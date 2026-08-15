import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, PenLine, Plus, Trash2, Lock } from "lucide-react";
import { computeReportData } from "@/lib/report-data";
import { toVerdict } from "@/lib/verdict";
import { sealDecisionSignature } from "@/lib/decisions.functions";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";

export const Route = createFileRoute("/_authenticated/runs/$runId_/sign")({
  head: () => ({ meta: [{ title: "Decide & sign — Clause" }] }),
  component: SignWizardPage,
});

type Verdict = "sign" | "negotiate" | "reject";
type Priority = "high" | "med" | "low";

const verdictMeta: Record<Verdict, { title: string; sub: string; icon: any; tone: string }> = {
  sign:      { title: "Sign as-is",            sub: "Approve the contract without changes.",        icon: CheckCircle2, tone: "text-ok border-ok/40 bg-ok/5" },
  negotiate: { title: "Negotiate first",       sub: "Approve conditional on the changes below.",    icon: AlertTriangle, tone: "text-warning border-warning/40 bg-warning/5" },
  reject:    { title: "Reject",                sub: "Reject and archive with rationale.",           icon: XCircle,     tone: "text-critical border-critical/40 bg-critical/5" },
};

function SignWizardPage() {
  const { runId } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [rationale, setRationale] = useState("");
  const [requiredApprovals, setRequiredApprovals] = useState(1);
  const [items, setItems] = useState<Array<{ id: string; category: string; criterion_name: string; ask: string; priority: Priority; finding_id?: string | null }>>([]);
  const [approverRole, setApproverRole] = useState("legal");
  const [approverName, setApproverName] = useState("");
  const [approverComment, setApproverComment] = useState("");
  const [signing, setSigning] = useState(false);

  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });

  const { data: run } = useQuery({
    queryKey: ["run", runId],
    queryFn: async () => (await supabase.from("runs").select("*").eq("id", runId).maybeSingle()).data,
  });

  const { data: findings } = useQuery({
    queryKey: ["findings", runId],
    queryFn: async () =>
      (await supabase.from("findings").select("*").eq("run_id", runId).is("superseded_at", null)).data ?? [],
  });

  const { data: criteria } = useQuery({
    queryKey: ["run_criteria", (run as any)?.criteria_set_id],
    enabled: !!(run as any)?.criteria_set_id,
    queryFn: async () =>
      (await supabase.from("criteria").select("*").eq("set_id", (run as any).criteria_set_id).order("sort_order")).data ?? [],
  });

  const report = useMemo(() => computeReportData(findings ?? [], (criteria ?? []) as any), [findings, criteria]);

  // Auto-suggest verdict from recommendation on first load.
  useEffect(() => {
    if (verdict) return;
    if (!report.total) return;
    const map: Record<string, Verdict> = { sign: "sign", negotiate: "negotiate", reject: "reject" };
    setVerdict(map[report.recommendation.kind]);
  }, [report.recommendation.kind, report.total, verdict]);

  // Auto-seed negotiation items from partial+gap findings when reaching step 2.
  useEffect(() => {
    if (items.length || step !== 2) return;
    const seed = report.rows
      .filter((r) => r.finding && (r.verdict === "gap" || r.verdict === "partial"))
      .map((r) => ({
        id: crypto.randomUUID(),
        category: r.category,
        criterion_name: r.criterion.name,
        ask: r.finding?.recommended_action || `Clarify or amend clause to address: ${r.criterion.name}`,
        priority: (r.verdict === "gap" ? "high" : "med") as Priority,
        finding_id: r.finding?.id ?? null,
      }));
    setItems(seed);
  }, [step, report.rows, items.length]);

  // Existing active decision (if any)
  const { data: existingDecision } = useQuery({
    queryKey: ["decision", runId],
    queryFn: async () =>
      (await (supabase.from("decisions" as any) as any).select("*").eq("run_id", runId).neq("status", "revoked").maybeSingle()).data,
  });

  const { data: approvals } = useQuery({
    queryKey: ["decision_approvals", (existingDecision as any)?.id],
    enabled: !!(existingDecision as any)?.id,
    queryFn: async () =>
      ((await (supabase.from("decision_approvals" as any) as any).select("*").eq("decision_id", (existingDecision as any).id).order("signed_at")).data ?? []) as any[],
  });

  const isSigned = (existingDecision as any)?.status === "signed";
  const alreadySignedByMe = approvals?.some((a: any) => a.approver_id === user?.id);

  async function saveDraftAndProceed() {
    if (!verdict) { toast.error("Pick a verdict first"); return; }
    if (!rationale.trim()) { toast.error("Rationale is required"); return; }
    setStep(2);
  }

  async function finaliseAndCreate() {
    if (!user || !run) return;
    setSigning(true);
    try {
      // Compute doc hash (best-effort client-side).
      const { data: docs } = await supabase.from("run_documents").select("parsed_text").eq("run_id", runId);
      const concat = (docs ?? []).map((d: any) => d.parsed_text ?? "").join("\n\n---\n\n");
      const buf = new TextEncoder().encode(concat);
      const hashBuf = await crypto.subtle.digest("SHA-256", buf);
      const hash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");

      const userAgent = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null;

      let decisionId = (existingDecision as any)?.id;
      if (!decisionId) {
        const { data, error } = await (supabase.from("decisions" as any) as any)
          .insert({
            run_id: runId,
            workspace_id: (run as any).workspace_id,
            verdict,
            rationale,
            doc_sha256: hash,
            source_docs_sha256: hash,
            signer_user_agent: userAgent,
            required_approvals: requiredApprovals,
            status: "pending",
            created_by: user.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        decisionId = data.id;
      } else {
        await (supabase.from("decisions" as any) as any)
          .update({ verdict, rationale, required_approvals: requiredApprovals, status: "pending", source_docs_sha256: hash, signer_user_agent: userAgent })
          .eq("id", decisionId);
      }

      // Persist negotiation items (replace all for this decision — only if user is on negotiate)
      if (verdict === "negotiate") {
        // Simple approach: insert only new items, don't delete existing to avoid data loss.
        for (const it of items) {
          await (supabase.from("negotiation_items" as any) as any).insert({
            run_id: runId,
            workspace_id: (run as any).workspace_id,
            finding_id: it.finding_id ?? null,
            category: it.category,
            criterion_name: it.criterion_name,
            priority: it.priority,
            ask: it.ask,
            status: "open",
            created_by: user.id,
          });
        }
      }

      // Sign
      const { error: signErr } = await (supabase.from("decision_approvals" as any) as any).insert({
        decision_id: decisionId,
        workspace_id: (run as any).workspace_id,
        approver_id: user.id,
        approver_name: approverName || user.email?.split("@")[0] || "Reviewer",
        role: approverRole,
        signature: approverName || user.email || "signed",
        comment: approverComment || null,
      });
      if (signErr) throw signErr;

      // Server-authoritative: record signer IP against the decision.
      try {
        await sealDecisionSignature({ data: { decisionId } });
      } catch (e) {
        console.warn("Could not seal signer IP", e);
      }

      // Check if enough signatures now → mark signed
      const { data: nowApprovals } = await (supabase.from("decision_approvals" as any) as any)
        .select("id").eq("decision_id", decisionId);
      if ((nowApprovals?.length ?? 0) >= requiredApprovals) {
        await (supabase.from("decisions" as any) as any)
          .update({ status: "signed", finalised_at: new Date().toISOString() })
          .eq("id", decisionId);
        // Also mark run review_status signed (keeps existing PDF unlock behaviour).
        await supabase.from("runs").update({ review_status: "signed" } as any).eq("id", runId);
      }

      toast.success("Decision recorded");
      qc.invalidateQueries();
      nav({ to: "/runs/$runId/report", params: { runId } });
    } catch (e: any) {
      toast.error(e.message || "Failed to sign");
    } finally {
      setSigning(false);
    }
  }

  if (!run) return <div className="p-8 text-muted-foreground">Loading…</div>;

  // Gate: the Review Checklist must be signed off AND the Full Report must
  // have been opened before the decision wizard becomes accessible.
  //   Step 1 · Review Checklist  →  Step 2 · Full report  →  Step 3 · Decide & sign
  const reportViewed = typeof window !== "undefined" && (() => {
    try { return window.localStorage.getItem(`clause.reportViewed.${runId}`) === "1"; } catch { return false; }
  })();
  const reviewSigned = (run as any).review_status === "signed";
  if ((!reviewSigned || !reportViewed) && !isSigned) {
    return (
      <div className="p-6 lg:p-8 max-w-2xl mx-auto">
        <PageBack
          label="Back to analysis"
          fallback={{
            to: "/runs/$runId",
            params: { runId },
            search: { view: undefined, side: undefined, quote: undefined },
          }}
        />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="w-4 h-4 text-warning" /> Complete review before signing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Before a decision can be recorded for <b>{(run as any).title}</b>,
              a reviewer must complete both preparation steps:
            </p>
            <ol className="space-y-2 text-foreground">
              <li className="flex items-start gap-2">
                <span className={reviewSigned ? "text-ok" : "text-warning"}>{reviewSigned ? "✓" : "1."}</span>
                <span>Sign off the <b>Review Checklist</b> — confirm each agent-proposed answer.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className={reportViewed ? "text-ok" : "text-warning"}>{reportViewed ? "✓" : "2."}</span>
                <span>Open the <b>Full Report</b> — inspect the detailed analysis.</span>
              </li>
            </ol>
            <div className="flex flex-wrap gap-2 pt-1">
              {!reviewSigned && (
                <Button asChild>
                  <Link to="/runs/$runId/review" params={{ runId }}>Open Review Checklist</Link>
                </Button>
              )}
              {!reportViewed && (
                <Button asChild variant={reviewSigned ? "default" : "outline"}>
                  <Link to="/runs/$runId/report" params={{ runId }}>View Full Report</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }




  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <PageBack
          label="Back to analysis"
          fallback={{
            to: "/runs/$runId",
            params: { runId },
            search: { view: undefined, side: undefined, quote: undefined },
          }}
        />
        <PageBreadcrumbs
          className="mt-2"
          items={[
            { label: "Analyses", to: "/runs" },
            {
              label: ((run as any).title as string) || "Analysis",
              to: "/runs/$runId",
              params: { runId },
              search: { view: undefined, side: undefined, quote: undefined },
            },
            { label: "Decide & sign" },
          ]}
        />
        <div className="flex items-start justify-between mt-2 gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Decide &amp; sign</h1>
            <p className="text-muted-foreground text-sm">Record a verdict, negotiation items and co-signers for <b>{(run as any).title}</b>.</p>
          </div>
          {isSigned && (
            <Badge className="bg-ok/10 text-ok border-ok/30 border">
              <Lock className="w-3 h-3 mr-1" /> Signed
            </Badge>
          )}
        </div>
      </div>

      {/* Stepper */}
      <ol className="flex items-center gap-2 text-xs">
        {[
          { n: 1, label: "Verdict" },
          { n: 2, label: "Negotiation checklist" },
          { n: 3, label: "Approvers" },
          { n: 4, label: "Seal" },
        ].map((s, i, arr) => (
          <li key={s.n} className="flex items-center gap-2 flex-1">
            <div className={`h-6 w-6 rounded-full grid place-items-center font-semibold ${step >= (s.n as any) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{s.n}</div>
            <span className={step === (s.n as any) ? "font-medium" : "text-muted-foreground"}>{s.label}</span>
            {i < arr.length - 1 && <div className="flex-1 h-px bg-border" />}
          </li>
        ))}
      </ol>

      {/* Step 1: Verdict */}
      {step === 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Pick a verdict</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Analyst recommendation: <b className="text-foreground">{report.recommendation.headline}</b> — {report.recommendation.reason}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {(["sign", "negotiate", "reject"] as Verdict[]).map((v) => {
                const m = verdictMeta[v];
                const Icon = m.icon;
                const active = verdict === v;
                return (
                  <button
                    key={v}
                    disabled={isSigned}
                    onClick={() => setVerdict(v)}
                    className={`text-left rounded-lg border p-4 transition-all ${active ? m.tone + " ring-2 ring-current/20" : "border-border hover:border-foreground/30"} disabled:opacity-60`}
                  >
                    <div className="flex items-center gap-2 font-semibold"><Icon className="w-4 h-4" /> {m.title}</div>
                    <p className="text-xs text-muted-foreground mt-1">{m.sub}</p>
                  </button>
                );
              })}
            </div>
            <div>
              <Label className="text-xs">Rationale (required)</Label>
              <Textarea
                disabled={isSigned}
                placeholder="Explain why. This is stored on the signed record."
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                className="mt-1 min-h-[100px]"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={saveDraftAndProceed} disabled={isSigned}>
                Continue <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Negotiation checklist */}
      {step === 2 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">Negotiation checklist</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Auto-drafted from partial & gap findings. Edit or drop items before sending.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setItems((prev) => [...prev, { id: crypto.randomUUID(), category: "Other", criterion_name: "New ask", ask: "", priority: "med" }])}>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-6">No open items — nothing to negotiate.</div>
            )}
            {items.map((it, idx) => (
              <div key={it.id} className="rounded-md border bg-card p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 min-w-0 text-xs">
                    <Badge variant="outline" className="shrink-0">{it.category}</Badge>
                    <span className="font-medium text-foreground truncate">{it.criterion_name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Select value={it.priority} onValueChange={(v) => setItems((prev) => prev.map((p, i) => i === idx ? { ...p, priority: v as Priority } : p))}>
                      <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="med">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}>
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={it.ask}
                  onChange={(e) => setItems((prev) => prev.map((p, i) => i === idx ? { ...p, ask: e.target.value } : p))}
                  rows={Math.max(3, Math.min(10, Math.ceil((it.ask?.length || 0) / 90) + 1))}
                  className="text-sm leading-relaxed resize-y min-h-[84px]"
                  placeholder="Ask to send to the supplier…"
                />
              </div>
            ))}
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
              <Button onClick={() => setStep(3)}>Continue <ArrowRight className="w-4 h-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Approvers */}
      {step === 3 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Required approvers</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              A decision is finalised once <b>{requiredApprovals}</b> workspace member(s) have signed. Each co-signer signs from their own account.
            </div>
            <div className="max-w-xs">
              <Label className="text-xs">Required signatures</Label>
              <Select value={String(requiredApprovals)} onValueChange={(v) => setRequiredApprovals(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {(approvals?.length ?? 0) > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Signed so far</div>
                <div className="space-y-1.5">
                  {approvals!.map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                      <div><b>{a.approver_name}</b> <Badge variant="outline" className="ml-1 text-[10px]">{a.role}</Badge></div>
                      <div className="text-xs text-muted-foreground">{new Date(a.signed_at).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
              <Button onClick={() => setStep(4)}>Continue <ArrowRight className="w-4 h-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Seal / sign */}
      {step === 4 && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> Sign the decision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-md border p-3 bg-muted/30 space-y-1">
              <div><span className="text-muted-foreground">Verdict:</span> <b>{verdict ? verdictMeta[verdict].title : "—"}</b></div>
              <div><span className="text-muted-foreground">Rationale:</span> {rationale || "—"}</div>
              <div><span className="text-muted-foreground">Negotiation items:</span> {items.length}</div>
              <div><span className="text-muted-foreground">Required approvals:</span> {requiredApprovals}</div>
            </div>
            <Separator />
            {alreadySignedByMe ? (
              <div className="rounded-md border p-3 bg-ok/5 text-ok text-sm flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5" />
                <div>You have already signed this decision. Waiting for other co-signers.</div>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs">Your name (typed signature)</Label>
                  <Input value={approverName} onChange={(e) => setApproverName(e.target.value)} placeholder={user?.email ?? ""} />
                </div>
                <div>
                  <Label className="text-xs">Role</Label>
                  <Select value={approverRole} onValueChange={setApproverRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["legal", "procurement", "security", "finance", "other"].map((r) => (
                        <SelectItem key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Comment (optional)</Label>
                  <Textarea value={approverComment} onChange={(e) => setApproverComment(e.target.value)} className="min-h-[60px]" />
                </div>
              </div>
            )}
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(3)}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
              <Button onClick={finaliseAndCreate} disabled={signing || alreadySignedByMe}>
                <PenLine className="w-4 h-4 mr-1" /> {signing ? "Signing…" : "Sign & seal"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
