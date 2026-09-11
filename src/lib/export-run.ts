import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toVerdict, type Verdict as AlignmentVerdict } from "@/lib/verdict";
import { alignmentScore } from "@/lib/report-data";

export type Finding = {
  criterion_name: string;
  category: string;
  severity: "critical" | "warning" | "ok" | string;
  clause_ref: string | null;
  justification: string;
  recommended_action: string | null;
  agent_name: string | null;
  model: string | null;
  confidence: number | null;
  prompt_variant?: string | null;
  grounded?: boolean | null;
  evidence_quote?: string | null;
};

export type Run = {
  id: string;
  title: string;
  status: string;
  critical_count: number;
  warning_count: number;
  ok_count: number;
  summary: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  worker_version?: string | null;
  token_usage?: any;
};

type RunDoc = {
  role: string;
  filename: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  num_chunks?: number | null;
};

type AgentEvent = {
  agent_name: string;
  model: string | null;
  status: string | null;
  message: string | null;
  created_at: string;
};

type Criterion = {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  severity_default?: string | null;
  model?: string | null;
  enabled?: boolean | null;
};

// ---------- Palette (Counterpart navy) ----------
const NAVY: [number, number, number] = [10, 36, 114];
const NAVY_DEEP: [number, number, number] = [6, 22, 74];
const INK: [number, number, number] = [22, 28, 45];
const MUTED: [number, number, number] = [110, 115, 130];
const RULE: [number, number, number] = [220, 224, 232];
const PAPER: [number, number, number] = [248, 249, 252];
const CRIT: [number, number, number] = [176, 30, 40];
const WARN: [number, number, number] = [190, 130, 20];
const OK: [number, number, number] = [30, 130, 70];

export const severityLabel = (s: string) =>
  s === "critical" ? "CRITICAL" : s === "warning" ? "WARNING" : "COMPLIANT";
export const severityColor = (s: string): [number, number, number] =>
  s === "critical" ? CRIT : s === "warning" ? WARN : OK;
export const fmtBytes = (n?: number | null) => {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};


// ---------- Decision engine ----------
export type Verdict = {
  code: "REJECT" | "CONDITIONAL" | "APPROVE";
  labelEn: string;
  labelFi: string;
  labelSv: string;
  color: [number, number, number];
  rationale: string;
};

function alignmentVerdicts(run: Run, findings: Finding[]): AlignmentVerdict[] {
  if (findings.length) return findings.map((f) => toVerdict(f.severity));
  return [
    ...Array(run.ok_count ?? 0).fill("aligned" as const),
    ...Array(run.warning_count ?? 0).fill("partial" as const),
    ...Array(run.critical_count ?? 0).fill("gap" as const),
  ];
}

export function computeVerdict(run: Run, findings: Finding[]): Verdict {
  const vs = alignmentVerdicts(run, findings);
  const c = vs.filter((v) => v === "gap").length;
  const w = vs.filter((v) => v === "partial").length;
  if (c > 0) {
    return {
      code: "REJECT",
      labelEn: "Do not sign",
      labelFi: "Älä allekirjoita",
      labelSv: "Underteckna inte",
      color: CRIT,
      rationale: `${c} gap${c === 1 ? "" : "s"} must be resolved before signature.`,
    };
  }
  if (w > 0) {
    return {
      code: "CONDITIONAL",
      labelEn: "Negotiate before signing",
      labelFi: "Neuvottele ennen allekirjoitusta",
      labelSv: "Förhandla före undertecknande",
      color: WARN,
      rationale: `${w} partial match${w === 1 ? "" : "es"} need supplier clarification.`,
    };
  }
  return {
    code: "APPROVE",
    labelEn: "Safe to sign",
    labelFi: "Allekirjoitettavissa",
    labelSv: "Säker att underteckna",
    color: OK,
    rationale: "Evaluated requirements meet the customer template.",
  };
}


export function complianceScore(run: Run, findings: Finding[]) {
  return alignmentScore(alignmentVerdicts(run, findings));
}

export function riskScore(run: Run, findings: Finding[]) {
  const c = run.critical_count ?? findings.filter((f) => f.severity === "critical").length;
  const w = run.warning_count ?? findings.filter((f) => f.severity === "warning").length;
  return Math.min(100, c * 25 + w * 8);
}


// ---------- Primitives ----------
function sectionHeader(doc: jsPDF, num: string, label: string, y: number) {
  const w = doc.internal.pageSize.getWidth();
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.8);
  doc.line(40, y, w - 40, y);
  doc.setFillColor(...NAVY);
  doc.rect(40, y, 4, 20, "F");
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`${num}   ${label.toUpperCase()}`, 52, y + 14);
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "normal");
  return y + 28;
}

function drawBarChart(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  data: { label: string; value: number; color: [number, number, number] }[],
  title: string,
) {
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(title, x, y - 4);
  const max = Math.max(1, ...data.map((d) => d.value));
  const barW = (w - (data.length - 1) * 12) / data.length;
  doc.setDrawColor(...RULE);
  doc.line(x, y + h, x + w, y + h);
  data.forEach((d, i) => {
    const bx = x + i * (barW + 12);
    const bh = (d.value / max) * (h - 20);
    const by = y + h - bh;
    doc.setFillColor(...d.color);
    doc.rect(bx, by, barW, bh, "F");
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...d.color);
    doc.text(String(d.value), bx + barW / 2, by - 4, { align: "center" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(d.label, bx + barW / 2, y + h + 12, { align: "center" });
  });
}

function drawStackedComplianceBar(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  crit: number,
  warn: number,
  ok: number,
  title: string,
) {
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(title, x, y - 4);
  const total = Math.max(1, crit + warn + ok);
  const wCrit = (crit / total) * w;
  const wWarn = (warn / total) * w;
  const wOk = (ok / total) * w;
  let cx = x;
  doc.setFillColor(...CRIT);
  doc.rect(cx, y, wCrit, h, "F");
  cx += wCrit;
  doc.setFillColor(...WARN);
  doc.rect(cx, y, wWarn, h, "F");
  cx += wWarn;
  doc.setFillColor(...OK);
  doc.rect(cx, y, wOk, h, "F");
  // Percentages inside if wide enough
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255);
  if (wCrit > 26) doc.text(`${Math.round((crit / total) * 100)}%`, x + wCrit / 2, y + h / 2 + 3, { align: "center" });
  if (wWarn > 26) doc.text(`${Math.round((warn / total) * 100)}%`, x + wCrit + wWarn / 2, y + h / 2 + 3, { align: "center" });
  if (wOk > 26) doc.text(`${Math.round((ok / total) * 100)}%`, x + wCrit + wWarn + wOk / 2, y + h / 2 + 3, { align: "center" });
  // Legend
  const ly = y + h + 14;
  const legend = [
    ["Critical", CRIT, crit],
    ["Warning", WARN, warn],
    ["Compliant", OK, ok],
  ] as const;
  let lx = x;
  legend.forEach(([lbl, col, n]) => {
    doc.setFillColor(...(col as [number, number, number]));
    doc.rect(lx, ly, 8, 8, "F");
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${lbl}: ${n}`, lx + 12, ly + 7);
    lx += 90;
  });
}

function drawScoreGauge(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  score: number,
  label: string,
  color: [number, number, number],
  suffix = "/100",
) {
  doc.setDrawColor(...RULE);
  doc.setFillColor(...PAPER);
  doc.roundedRect(x, y, w, h, 6, 6, "FD");
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(label.toUpperCase(), x + 12, y + 18);
  // Big number
  doc.setTextColor(...color);
  doc.setFontSize(28);
  const numStr = String(score);
  const numW = doc.getTextWidth(numStr); // measured at 28pt
  doc.text(numStr, x + 12, y + 48);
  // Suffix aligned to number baseline
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(suffix, x + 12 + numW + 4, y + 48);
  // Bar
  const barY = y + h - 14;
  const barW = w - 24;
  doc.setFillColor(...RULE);
  doc.rect(x + 12, barY, barW, 4, "F");
  doc.setFillColor(...color);
  doc.rect(x + 12, barY, (score / 100) * barW, 4, "F");
}


// ---------- Main export ----------
export type ChecklistItem = {
  ord: number;
  criterion_name: string;
  category: string | null;
  clause_ref: string | null;
  agent_answer: "yes" | "no" | "na" | string;
  agent_severity?: string | null;
  agent_justification?: string | null;
  reviewer_answer: "yes" | "no" | "na" | string | null;
  reviewer_comment: string | null;
  flagged?: boolean;
};

// Tier-2 delegating implementation: builds an audit-firm-quality PDF
// via @react-pdf/renderer, pulling the sealed decision + co-signers +
// negotiation checklist directly from the database.
export async function buildAuditPdfInput(
  run: Run,
  findings: Finding[],
  docs: RunDoc[] = [],
  events: AgentEvent[] = [],
  criteria: Criterion[] = [],
  checklist: ChecklistItem[] = [],
): Promise<{ input: any; reference: string }> {
  const { supabase } = await import("@/integrations/supabase/client");

  const reference = `CLA-${new Date(run.created_at).getFullYear()}-${run.id.slice(0, 8).toUpperCase()}`;

  // Pull decision + approvals + negotiation items (best effort).
  const [decRes, negRes] = await Promise.all([
    (supabase.from("decisions" as any) as any).select("*").eq("run_id", run.id).neq("status", "revoked").maybeSingle(),
    (supabase.from("negotiation_items" as any) as any).select("*").eq("run_id", run.id).order("created_at"),
  ]);
  const decision = decRes?.data ?? null;
  const negotiationItems = (negRes?.data ?? []) as any[];
  let approvals: any[] = [];
  if (decision?.id) {
    const apr = await (supabase.from("decision_approvals" as any) as any)
      .select("*").eq("decision_id", decision.id).order("signed_at");
    approvals = apr?.data ?? [];
  }

  // Compute a stable doc hash from the parsed contract texts (best effort).
  let docSha256: string | null = null;
  try {
    const { data: parsed } = await supabase
      .from("run_documents")
      .select("parsed_text")
      .eq("run_id", run.id);
    const concat = (parsed ?? []).map((d: any) => d.parsed_text ?? "").join("\n\n---\n\n");
    if (concat) {
      const buf = new TextEncoder().encode(concat);
      const hashBuf = await crypto.subtle.digest("SHA-256", buf);
      docSha256 = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    docSha256 = null;
  }

  const clientName = (docs.find((d) => d.role === "customer")?.filename || "Customer").replace(/\.[a-z0-9]+$/i, "");
  const supplierName = (docs.find((d) => d.role === "supplier")?.filename || "Supplier").replace(/\.[a-z0-9]+$/i, "");
  const reviewerName = ((run as any).reviewer_name as string | undefined) ?? undefined;

  // Workspace report template (optional)
  let reportTitle: string | null = null;
  let reportSubtitle: string | null = null;
  try {
    const workspaceId = (run as any).workspace_id as string | undefined;
    if (workspaceId) {
      const { data: tpls } = await supabase
        .from("report_templates" as any)
        .select("config, workspace_id, is_default")
        .or(`workspace_id.eq.${workspaceId},workspace_id.is.null`)
        .order("is_default", { ascending: false });
      const pick =
        (tpls ?? []).find((t: any) => t.workspace_id === workspaceId) ??
        (tpls ?? []).find((t: any) => !t.workspace_id) ??
        null;
      const cfg = (pick?.config ?? {}) as any;
      reportTitle = cfg.title ?? null;
      reportSubtitle = cfg.subtitle ?? null;
    }
  } catch {
    /* ignore */
  }

  let mappingPairs: any[] = [];
  try {
    const { data: pairs } = await supabase
      .from("run_clause_pairs" as any)
      .select(
        "topic, customer_excerpt, supplier_excerpt, note, derived_status, override_status, override_reason, similarity, auth_grade",
      )
      .eq("run_id", run.id)
      .order("sort_order");
    mappingPairs = (pairs ?? []).map((p: any) => {
      const status = p.override_status || p.derived_status || "needs_review";
      return {
        topic: p.topic,
        status,
        similarity: p.similarity != null ? Number(p.similarity) : null,
        overridden: Boolean(p.override_status),
        customer_excerpt: p.customer_excerpt,
        supplier_excerpt: p.supplier_excerpt,
        reason: p.override_reason || p.note || null,
      };
    });
  } catch {
    mappingPairs = [];
  }

  const input = {
    reportId: reference,
    clientName,
    supplierName,
    engagementTitle: run.title,
    reportTitle,
    reportSubtitle,
    preparedBy: reviewerName || "Counterpart — Contract Intelligence",
    preparedAt: run.completed_at ? new Date(run.completed_at) : new Date(),
    docSha256,
    run: {
      id: run.id,
      title: run.title,
      started_at: run.started_at ?? null,
      completed_at: run.completed_at ?? null,
      worker_version: run.worker_version ?? null,
      review_status: (run as any).review_status ?? null,
    },
    documents: docs.map((d) => ({
      role: d.role,
      filename: d.filename,
      size_bytes: d.size_bytes ?? null,
      num_chunks: d.num_chunks ?? null,
    })),
    findings: findings.map((f, i) => ({
      id: (f as any).id ?? String(i),
      criterion_id: (f as any).criterion_id ?? null,
      criterion_name: f.criterion_name,
      severity: f.severity,
      evidence_quote: f.evidence_quote ?? null,
      justification: f.justification,
      recommended_action: f.recommended_action,
      agent_name: f.agent_name,
      clause_ref: f.clause_ref,
      grounded: f.grounded ?? null,
      ...(f as any),
    })),
    criteria: criteria.map((c) => ({ id: c.id, name: c.name, category: (c as any).category ?? null })),
    events: events.map((e) => ({
      agent_name: e.agent_name,
      message: e.message,
      created_at: e.created_at,
      model: e.model ?? null,
      status: e.status ?? null,
    })),
    decision: decision
      ? {
          verdict: decision.verdict,
          rationale: decision.rationale,
          required_approvals: decision.required_approvals ?? 1,
          status: decision.status,
          finalised_at: decision.finalised_at ?? null,
        }
      : null,
    approvals: approvals.map((a: any) => ({
      approver_name: a.approver_name,
      role: a.role,
      signed_at: a.signed_at,
      comment: a.comment ?? null,
      signature: a.signature ?? null,
    })),
    negotiationItems: negotiationItems.map((n: any) => ({
      category: n.category,
      criterion_name: n.criterion_name,
      priority: n.priority,
      ask: n.ask,
      status: n.status,
    })),
    checklist: (checklist as any[]).map((c) => {
      const finalAnswer = (c.reviewer_answer ?? c.agent_answer ?? "na") as string;
      const confirmed = finalAnswer === "yes";
      const notesParts = [
        c.criterion_name ? String(c.criterion_name) : null,
        c.category ? `[${c.category}]` : null,
        c.reviewer_comment ? String(c.reviewer_comment) : null,
        c.agent_justification && !c.reviewer_comment
          ? `AI: ${String(c.agent_justification).slice(0, 180)}`
          : null,
      ].filter(Boolean);
      return {
        label: c.label ?? c.criterion_name ?? "Checklist item",
        checked: c.checked ?? confirmed,
        notes: c.notes ?? notesParts.join(" · ") ?? null,
      };
    }),
    mappingPairs,
    pipeline: {
      analyzer: run.worker_version ?? undefined,
    },
  };

  return { input, reference };
}

export async function renderRunPdfBlob(
  run: Run,
  findings: Finding[],
  docs: RunDoc[] = [],
  events: AgentEvent[] = [],
  criteria: Criterion[] = [],
  checklist: ChecklistItem[] = [],
): Promise<{ blob: Blob; filename: string }> {
  const [{ renderAuditPdfBlob }, { input, reference }] = await Promise.all([
    import("@/lib/audit-pdf"),
    buildAuditPdfInput(run, findings, docs, events, criteria, checklist),
  ]);
  const blob = await renderAuditPdfBlob(input as any);
  return { blob, filename: `clause-audit-${reference}.pdf` };
}

export async function exportRunPdf(
  run: Run,
  findings: Finding[],
  docs: RunDoc[] = [],
  events: AgentEvent[] = [],
  criteria: Criterion[] = [],
  checklist: ChecklistItem[] = [],
) {
  try {
    const [{ downloadAuditPdf }, { input, reference }] = await Promise.all([
      import("@/lib/audit-pdf"),
      buildAuditPdfInput(run, findings, docs, events, criteria, checklist),
    ]);
    await downloadAuditPdf(input as any, `clause-audit-${reference}.pdf`);
  } catch (err: any) {
    const message = String(err?.message ?? err);
    console.error("[exportRunPdf]", message);
    throw new Error(`PDF export failed: ${message.slice(0, 240)}`);
  }
}

export function exportRunCsv(run: Run, findings: Finding[]) {
  try {
    const rows = [
      [
        "Severity",
        "Category",
        "Criterion",
        "Ref",
        "Agent",
        "Model",
        "Confidence",
        "Grounded",
        "Evidence quote",
        "Justification",
        "Recommended action",
      ],
      ...findings.map((f) => [
        f.severity,
        f.category,
        f.criterion_name,
        f.clause_ref ?? "",
        f.agent_name ?? "",
        f.model ?? "",
        f.confidence != null ? String(f.confidence) : "",
        f.grounded == null ? "" : f.grounded ? "yes" : "no",
        (f.evidence_quote ?? "").replace(/\r?\n/g, " "),
        (f.justification ?? "").replace(/\r?\n/g, " "),
        (f.recommended_action ?? "").replace(/\r?\n/g, " "),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clause-findings-${run.id.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err: any) {
    const message = String(err?.message ?? err);
    console.error("[exportRunCsv]", message);
    throw new Error(`CSV export failed: ${message.slice(0, 240)}`);
  }
}
