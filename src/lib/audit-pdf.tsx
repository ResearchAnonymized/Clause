// Tier-2 audit-firm PDF renderer using @react-pdf/renderer.
// Serif typography (EB Garamond), navy/gold palette, running header/footer,
// executive summary, decision + signatures, negotiation checklist,
// per-category scorecards, findings, methodology and appendices.

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Svg,
  Path,
  Circle,
  Rect,
  Line,
  pdf,
} from "@react-pdf/renderer";
import { computeReportData, type ReportFinding, type ReportCriterion } from "@/lib/report-data";
import type { Verdict } from "@/lib/verdict";

function pdfFontUrl(file: string): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/fonts/${file}`;
  }
  return `/fonts/${file}`;
}

let pdfFontsRegistered = false;
function registerPdfFonts() {
  if (pdfFontsRegistered) return;
  Font.register({
    family: "EBGaramond",
    fonts: [
      { src: pdfFontUrl("EBGaramond-Regular.ttf"), fontWeight: 400 },
      { src: pdfFontUrl("EBGaramond-Medium.ttf"), fontWeight: 500 },
      { src: pdfFontUrl("EBGaramond-Bold.ttf"), fontWeight: 700 },
      { src: pdfFontUrl("EBGaramond-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
    ],
  });
  Font.register({
    family: "InterUI",
    fonts: [
      { src: pdfFontUrl("Inter-Regular.ttf"), fontWeight: 400 },
      { src: pdfFontUrl("Inter-SemiBold.ttf"), fontWeight: 600 },
      { src: pdfFontUrl("Inter-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  pdfFontsRegistered = true;
}

// ---------- Design tokens ----------
const NAVY = "#0B1E3F";
const NAVY_SOFT = "#233457";
const GOLD = "#B08C3A";
const INK = "#1A1A1A";
const MUTED = "#5B6472";
const RULE = "#D5D2C7";
const CREAM = "#F7F4EC";
const PAPER = "#FFFFFF";

const V_TONE: Record<Verdict, { bg: string; fg: string; label: string }> = {
  aligned:       { bg: "#E9F3EC", fg: "#1F6B36", label: "Meets" },
  partial:       { bg: "#FBF1DE", fg: "#8A5A00", label: "Partial" },
  gap:           { bg: "#FBE5E5", fg: "#8A1D1D", label: "Gap" },
  not_addressed: { bg: "#EFEFEA", fg: "#5B6472", label: "Not addressed" },
};

// ---------- Types ----------
export type AuditPdfInput = {
  reportId: string;                     // human-readable identifier
  clientName: string;
  supplierName?: string | null;
  engagementTitle: string;
  /** Optional template overrides from report_templates */
  reportTitle?: string | null;
  reportSubtitle?: string | null;
  preparedBy?: string | null;
  preparedAt: Date;
  docSha256?: string | null;

  run: {
    id: string;
    title: string;
    started_at?: string | null;
    completed_at?: string | null;
    worker_version?: string | null;
    review_status?: string | null;
  };
  documents: Array<{ role: string; filename: string; size_bytes?: number | null; num_chunks?: number | null }>;
  findings: ReportFinding[];
  criteria: ReportCriterion[];
  events?: Array<{ agent_name: string; message: string | null; created_at: string; model?: string | null; status?: string | null }>;
  decision?: {
    verdict: "sign" | "negotiate" | "reject" | string;
    rationale: string | null;
    required_approvals: number;
    status: string;
    finalised_at?: string | null;
  } | null;
  approvals?: Array<{ approver_name: string; role: string; signed_at: string; comment?: string | null; signature?: string | null }>;
  negotiationItems?: Array<{ category: string; criterion_name: string; priority: string; ask: string; status: string }>;
  checklist?: Array<{ label?: string | null; checked?: boolean | null; notes?: string | null }>;
  pipeline?: { extractor?: string; chunker?: string; analyzer?: string; embedder?: string };
  mappingPairs?: Array<{
    topic: string;
    status: string;
    category?: string | null;
    similarity?: number | null;
    overridden?: boolean;
    customer_excerpt?: string | null;
    supplier_excerpt?: string | null;
    reason?: string | null;
  }>;
};

// ---------- Styles ----------
const S = StyleSheet.create({
  page: {
    paddingTop: 84,
    paddingBottom: 72,
    paddingHorizontal: 56,
    fontFamily: "EBGaramond",
    fontSize: 10.5,
    lineHeight: 1.45,
    color: INK,
    backgroundColor: PAPER,
  },
  cover: {
    padding: 0,
    fontFamily: "EBGaramond",
    color: INK,
    backgroundColor: PAPER,
  },
  coverBand: { backgroundColor: NAVY, paddingVertical: 24, paddingHorizontal: 56 },
  coverBandText: { color: CREAM, fontFamily: "InterUI", fontSize: 8.5, letterSpacing: 3 },
  coverBody: { paddingHorizontal: 56, paddingTop: 60, flexGrow: 1 },
  coverEyebrow: { fontFamily: "InterUI", fontSize: 9, letterSpacing: 4, color: GOLD, marginBottom: 24 },
  coverTitle: { fontFamily: "EBGaramond", fontSize: 34, fontWeight: 700, color: NAVY, lineHeight: 1.15 },
  coverSubtitle: { fontFamily: "EBGaramond", fontSize: 16, fontStyle: "italic", color: NAVY_SOFT, marginTop: 10 },
  coverRule: { borderBottomWidth: 0.75, borderBottomColor: GOLD, marginTop: 32, marginBottom: 24, width: 90 },
  coverMetaRow: { flexDirection: "row", marginBottom: 6 },
  coverMetaKey: { fontFamily: "InterUI", fontSize: 8.5, letterSpacing: 2, color: MUTED, width: 130 },
  coverMetaVal: { fontFamily: "EBGaramond", fontSize: 11, color: INK, flex: 1 },
  coverFoot: {
    paddingHorizontal: 56, paddingVertical: 20, borderTopWidth: 0.5, borderTopColor: RULE,
    flexDirection: "row", justifyContent: "space-between",
  },
  coverFootText: { fontFamily: "InterUI", fontSize: 8, color: MUTED, letterSpacing: 1.2 },

  // Running header/footer
  header: {
    position: "absolute", top: 32, left: 56, right: 56,
    flexDirection: "row", justifyContent: "space-between",
    borderBottomWidth: 0.5, borderBottomColor: RULE, paddingBottom: 8,
  },
  headerText: { fontFamily: "InterUI", fontSize: 7.5, color: MUTED, letterSpacing: 1.4 },
  footer: {
    position: "absolute", bottom: 32, left: 56, right: 56,
    flexDirection: "row", justifyContent: "space-between",
    borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 8,
  },
  footerText: { fontFamily: "InterUI", fontSize: 7.5, color: MUTED, letterSpacing: 1.2 },

  // Sections
  sectionNo: { fontFamily: "InterUI", fontSize: 8.5, letterSpacing: 3, color: GOLD, marginBottom: 4 },
  sectionH: { fontFamily: "EBGaramond", fontSize: 22, fontWeight: 700, color: NAVY, marginBottom: 4 },
  sectionSub: { fontFamily: "EBGaramond", fontStyle: "italic", fontSize: 11, color: NAVY_SOFT, marginBottom: 18 },
  h3: { fontFamily: "EBGaramond", fontSize: 14, fontWeight: 700, color: NAVY, marginTop: 14, marginBottom: 6 },
  h4: { fontFamily: "InterUI", fontSize: 9, fontWeight: 700, letterSpacing: 1.6, color: NAVY_SOFT, marginTop: 10, marginBottom: 4 },
  p: { fontFamily: "EBGaramond", fontSize: 10.5, lineHeight: 1.55, color: INK, marginBottom: 6 },
  small: { fontFamily: "InterUI", fontSize: 8, color: MUTED, lineHeight: 1.45 },
  rule: { borderBottomWidth: 0.5, borderBottomColor: RULE, marginVertical: 12 },

  // Verdict banner
  banner: { flexDirection: "row", borderWidth: 0.75, borderColor: NAVY, marginBottom: 14 },
  bannerLeft: { backgroundColor: NAVY, paddingVertical: 18, paddingHorizontal: 20, width: 150 },
  bannerScore: { color: CREAM, fontFamily: "EBGaramond", fontSize: 42, fontWeight: 700, lineHeight: 1 },
  bannerScoreLabel: { color: GOLD, fontFamily: "InterUI", fontSize: 7.5, letterSpacing: 2, marginTop: 4 },
  bannerRight: { padding: 16, flex: 1 },
  bannerEyebrow: { fontFamily: "InterUI", fontSize: 8, letterSpacing: 2, color: GOLD, marginBottom: 4 },
  bannerHeadline: { fontFamily: "EBGaramond", fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 4 },
  bannerRationale: { fontFamily: "EBGaramond", fontSize: 10.5, color: INK, fontStyle: "italic" },

  // Category / KPI strip
  kpiRow: { flexDirection: "row", marginBottom: 12, gap: 8 },
  kpi: { flex: 1, borderWidth: 0.5, borderColor: RULE, paddingVertical: 10, paddingHorizontal: 10 },
  kpiVal: { fontFamily: "EBGaramond", fontSize: 22, fontWeight: 700, color: NAVY },
  kpiLbl: { fontFamily: "InterUI", fontSize: 7.5, letterSpacing: 1.4, color: MUTED, marginTop: 2 },

  // Category scorecard
  cat: { borderWidth: 0.5, borderColor: RULE, padding: 12, marginBottom: 10 },
  catHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  catName: { fontFamily: "EBGaramond", fontSize: 14, fontWeight: 700, color: NAVY },
  catScore: { fontFamily: "EBGaramond", fontSize: 16, fontWeight: 700, color: NAVY },
  bar: { flexDirection: "row", height: 6, marginTop: 8, marginBottom: 6, borderRadius: 1, overflow: "hidden" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  chip: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: 2 },
  chipText: { fontFamily: "InterUI", fontSize: 7.5, letterSpacing: 0.6 },

  // Table
  tRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: RULE, paddingVertical: 6 },
  tHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: NAVY, paddingBottom: 4, marginBottom: 4 },
  tH: { fontFamily: "InterUI", fontSize: 7.5, letterSpacing: 1.2, color: NAVY, fontWeight: 700 },
  tC: { fontFamily: "EBGaramond", fontSize: 10, color: INK },

  // Finding card
  finding: { borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 10, paddingBottom: 12 },
  fHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  fTitle: { fontFamily: "EBGaramond", fontSize: 12, fontWeight: 700, color: NAVY, flex: 1, paddingRight: 8 },
  fMeta: { fontFamily: "InterUI", fontSize: 7.5, color: MUTED, marginBottom: 6 },
  quote: {
    borderLeftWidth: 2, borderLeftColor: GOLD, paddingLeft: 10, paddingVertical: 4,
    fontFamily: "EBGaramond", fontStyle: "italic", fontSize: 10.5, color: NAVY_SOFT, marginTop: 4, marginBottom: 6,
  },
  callout: { backgroundColor: CREAM, padding: 10, borderLeftWidth: 2, borderLeftColor: NAVY, marginTop: 6 },
  calloutLbl: { fontFamily: "InterUI", fontSize: 7.5, letterSpacing: 1.4, color: NAVY, marginBottom: 3 },
});

// ---------- Helpers ----------
function fmtDate(d?: string | Date | null) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "2-digit" });
}
function shortHash(s?: string | null) { return s ? s.slice(0, 12).toUpperCase() : "—"; }

const RunningChrome = ({ headerLeft, headerRight, footerLeft }: { headerLeft: string; headerRight: string; footerLeft: string }) => (
  <>
    <View style={S.header} fixed>
      <Text style={S.headerText}>{headerLeft.toUpperCase()}</Text>
      <Text style={S.headerText}>{headerRight.toUpperCase()}</Text>
    </View>
    <View style={S.footer} fixed>
      <Text style={S.footerText}>{footerLeft.toUpperCase()}</Text>
      <Text
        style={S.footerText}
        render={({ pageNumber, totalPages }) => `PAGE ${pageNumber} OF ${totalPages}`}
      />
    </View>
  </>
);

// Donut SVG (verdict mix)
function Donut({ counts, size = 120 }: { counts: Record<Verdict, number>; size?: number }) {
  const total = counts.aligned + counts.partial + counts.gap + counts.not_addressed || 1;
  const r = size / 2 - 8;
  const cx = size / 2, cy = size / 2;
  const segs: Array<{ v: Verdict; frac: number }> = ([
    { v: "aligned" as Verdict, frac: counts.aligned / total },
    { v: "partial" as Verdict, frac: counts.partial / total },
    { v: "gap" as Verdict, frac: counts.gap / total },
    { v: "not_addressed" as Verdict, frac: counts.not_addressed / total },
  ]).filter((s) => s.frac > 0);
  let a0 = -Math.PI / 2;
  const arcs = segs.map((s, i) => {
    const a1 = a0 + s.frac * Math.PI * 2;
    const large = s.frac > 0.5 ? 1 : 0;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const d = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
    a0 = a1;
    return <Path key={i} d={d} fill={V_TONE[s.v].fg} />;
  });
  return (
    <Svg width={size} height={size}>
      {arcs}
      <Circle cx={cx} cy={cy} r={r * 0.58} fill={PAPER} />
    </Svg>
  );
}

function StackedBar({ counts }: { counts: Record<Verdict, number> }) {
  const total = counts.aligned + counts.partial + counts.gap + counts.not_addressed || 1;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <View style={S.bar}>
      {counts.aligned > 0 && <View style={{ width: pct(counts.aligned), backgroundColor: V_TONE.aligned.fg }} />}
      {counts.partial > 0 && <View style={{ width: pct(counts.partial), backgroundColor: V_TONE.partial.fg }} />}
      {counts.gap > 0 && <View style={{ width: pct(counts.gap), backgroundColor: V_TONE.gap.fg }} />}
      {counts.not_addressed > 0 && <View style={{ width: pct(counts.not_addressed), backgroundColor: "#B7B3A6" }} />}
    </View>
  );
}

function VerdictChip({ v, n }: { v: Verdict; n: number }) {
  const t = V_TONE[v];
  return (
    <View style={[S.chip, { backgroundColor: t.bg }]}>
      <Text style={[S.chipText, { color: t.fg }]}>{t.label} · {n}</Text>
    </View>
  );
}

// ---------- Sections ----------
function CoverPage(props: AuditPdfInput) {
  return (
    <Page size="A4" style={S.cover}>
      <View style={S.coverBand}>
        <Text style={S.coverBandText}>CONFIDENTIAL · CLIENT DELIVERABLE · NOT FOR EXTERNAL DISTRIBUTION</Text>
      </View>
      <View style={S.coverBody}>
        <Text style={S.coverEyebrow}>{(props.reportTitle || "CONTRACT INTELLIGENCE  ·  AUDIT REPORT").toUpperCase()}</Text>
        <Text style={S.coverTitle}>{props.engagementTitle}</Text>
        <Text style={S.coverSubtitle}>
          {props.reportSubtitle || "Supplier offer assessed against the customer template"}
        </Text>
        <View style={S.coverRule} />
        <View style={S.coverMetaRow}><Text style={S.coverMetaKey}>REPORT ID</Text><Text style={S.coverMetaVal}>{props.reportId}</Text></View>
        <View style={S.coverMetaRow}><Text style={S.coverMetaKey}>CLIENT</Text><Text style={S.coverMetaVal}>{props.clientName}</Text></View>
        <View style={S.coverMetaRow}><Text style={S.coverMetaKey}>SUPPLIER</Text><Text style={S.coverMetaVal}>{props.supplierName || "—"}</Text></View>
        <View style={S.coverMetaRow}><Text style={S.coverMetaKey}>PREPARED BY</Text><Text style={S.coverMetaVal}>{props.preparedBy || "Counterpart — Contract Intelligence"}</Text></View>
        <View style={S.coverMetaRow}><Text style={S.coverMetaKey}>ISSUED</Text><Text style={S.coverMetaVal}>{fmtDate(props.preparedAt)}</Text></View>
        <View style={S.coverMetaRow}><Text style={S.coverMetaKey}>DOCUMENT HASH</Text><Text style={S.coverMetaVal}>SHA-256 · {shortHash(props.docSha256)}</Text></View>
      </View>
      <View style={S.coverFoot}>
        <Text style={S.coverFootText}>© {new Date().getFullYear()}  ·  ALL RIGHTS RESERVED</Text>
        <Text style={S.coverFootText}>{props.reportId}</Text>
      </View>
    </Page>
  );
}

function SectionHeader({ no, title, sub }: { no: string; title: string; sub?: string }) {
  return (
    <View>
      <Text style={S.sectionNo}>SECTION {no}</Text>
      <Text style={S.sectionH}>{title}</Text>
      {sub ? <Text style={S.sectionSub}>{sub}</Text> : <View style={{ marginBottom: 12 }} />}
    </View>
  );
}

function ExecutiveSummary(props: AuditPdfInput) {
  const report = computeReportData(props.findings, props.criteria);
  const gapRows = report.rows.filter((r) => r.verdict === "gap").slice(0, 3);
  const partialRows = report.rows.filter((r) => r.verdict === "partial").slice(0, 3);
  const topRisks = [...gapRows, ...partialRows].slice(0, 5);

  const decisionOverride = props.decision?.verdict;
  const headline = decisionOverride === "sign" ? "Sign as-is"
    : decisionOverride === "negotiate" ? "Negotiate before signing"
    : decisionOverride === "reject" ? "Do not sign"
    : report.recommendation.headline;
  const rationale = props.decision?.rationale?.trim() || report.recommendation.reason;

  return (
    <>
      <SectionHeader no="01" title="Executive Summary" sub="A concise brief for the signing authority." />
      <View style={S.banner}>
        <View style={S.bannerLeft}>
          <Text style={S.bannerScore}>{report.score}</Text>
          <Text style={S.bannerScoreLabel}>SCORE / 100</Text>
        </View>
        <View style={S.bannerRight}>
          <Text style={S.bannerEyebrow}>ANALYST RECOMMENDATION</Text>
          <Text style={S.bannerHeadline}>{headline}</Text>
          <Text style={S.bannerRationale}>{rationale}</Text>
        </View>
      </View>

      <View style={S.kpiRow}>
        <View style={S.kpi}><Text style={S.kpiVal}>{report.counts.aligned}</Text><Text style={S.kpiLbl}>MEETS</Text></View>
        <View style={S.kpi}><Text style={S.kpiVal}>{report.counts.partial}</Text><Text style={S.kpiLbl}>PARTIAL</Text></View>
        <View style={S.kpi}><Text style={S.kpiVal}>{report.counts.gap}</Text><Text style={S.kpiLbl}>GAPS</Text></View>
        <View style={S.kpi}><Text style={S.kpiVal}>{report.counts.not_addressed}</Text><Text style={S.kpiLbl}>NOT ADDRESSED</Text></View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, marginBottom: 14 }}>
        <Donut counts={report.counts} size={110} />
        <View style={{ flex: 1, paddingLeft: 16 }}>
          <Text style={S.h4}>ASSESSMENT MIX</Text>
          <View style={S.chips}>
            <VerdictChip v="aligned" n={report.counts.aligned} />
            <VerdictChip v="partial" n={report.counts.partial} />
            <VerdictChip v="gap" n={report.counts.gap} />
            <VerdictChip v="not_addressed" n={report.counts.not_addressed} />
          </View>
          <Text style={[S.small, { marginTop: 8 }]}>
            {report.total} criteria evaluated across {report.categories.length} discipline{report.categories.length === 1 ? "" : "s"}.
          </Text>
        </View>
      </View>

      <Text style={S.h3}>Top matters for the signing authority</Text>
      {topRisks.length === 0 ? (
        <Text style={S.p}>No material risks identified. Every evaluated criterion is aligned with the customer template.</Text>
      ) : topRisks.map((r, i) => (
        <View key={i} style={{ flexDirection: "row", marginBottom: 6 }}>
          <Text style={{ fontFamily: "EBGaramond", fontSize: 11, color: GOLD, width: 22 }}>{String(i + 1).padStart(2, "0")}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "EBGaramond", fontSize: 11, fontWeight: 700, color: NAVY }}>
              {r.criterion.name} <Text style={{ color: V_TONE[r.verdict].fg, fontFamily: "InterUI", fontSize: 8 }}>· {V_TONE[r.verdict].label.toUpperCase()}</Text>
            </Text>
            <Text style={S.small}>
              {r.finding?.recommended_action || r.finding?.justification || "Requires clarification with supplier."}
            </Text>
          </View>
        </View>
      ))}
    </>
  );
}

function TableOfContents(props: { hasDecision: boolean; hasNegotiation: boolean }) {
  const items: Array<[string, string]> = [
    ["01", "Executive Summary"],
    ["02", "Decision & Signatures"],
  ];
  if (props.hasNegotiation) items.push(["03", "Negotiation Checklist"]);
  const n = (i: number) => String(items.length + i).padStart(2, "0");
  items.push([n(1), "Category Scorecards"]);
  items.push([n(2), "Findings — Detailed Assessment"]);
  items.push([n(3), "Methodology & Assurance"]);
  items.push([n(4), "Appendix A — Full Criteria Matrix"]);
  items.push([n(5), "Appendix B — Agent Activity Log"]);
  items.push([n(6), "Appendix C — Document Register"]);

  return (
    <>
      <SectionHeader no="00" title="Contents" sub="Report navigation." />
      {items.map(([no, label]) => (
        <View key={no} style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: RULE, paddingVertical: 8 }}>
          <Text style={{ fontFamily: "InterUI", fontSize: 9, color: GOLD, letterSpacing: 2, width: 40 }}>{no}</Text>
          <Text style={{ fontFamily: "EBGaramond", fontSize: 12, color: NAVY, flex: 1 }}>{label}</Text>
        </View>
      ))}
    </>
  );
}

function DecisionAndSignatures(props: AuditPdfInput) {
  const d = props.decision;
  return (
    <>
      <SectionHeader no="02" title="Decision & Signatures" sub="Recorded verdict and co-signer attestations." />
      {!d ? (
        <View style={S.callout}>
          <Text style={S.calloutLbl}>PENDING</Text>
          <Text style={S.p}>No decision has been sealed yet. This report reflects the analyst assessment only and is not binding.</Text>
        </View>
      ) : (
        <>
          <View style={S.tHead}>
            <Text style={[S.tH, { width: 140 }]}>ATTRIBUTE</Text>
            <Text style={[S.tH, { flex: 1 }]}>VALUE</Text>
          </View>
          {[
            ["Verdict", d.verdict === "sign" ? "SIGN AS-IS" : d.verdict === "negotiate" ? "NEGOTIATE FIRST" : d.verdict === "reject" ? "REJECT" : d.verdict.toUpperCase()],
            ["Status", (d.status || "").toUpperCase()],
            ["Required approvals", String(d.required_approvals)],
            ["Approvals recorded", String(props.approvals?.length ?? 0)],
            ["Finalised", fmtDate(d.finalised_at)],
          ].map(([k, v], i) => (
            <View key={i} style={S.tRow}>
              <Text style={[S.tC, { width: 140, color: MUTED, fontFamily: "InterUI", fontSize: 8.5 }]}>{k}</Text>
              <Text style={[S.tC, { flex: 1, fontWeight: 700 }]}>{v}</Text>
            </View>
          ))}
          {d.rationale ? (
            <>
              <Text style={S.h4}>RATIONALE</Text>
              <Text style={S.p}>{d.rationale}</Text>
            </>
          ) : null}
        </>
      )}

      <Text style={S.h3}>Co-signers</Text>
      {(!props.approvals || props.approvals.length === 0) ? (
        <Text style={S.small}>No signatures recorded.</Text>
      ) : (
        <>
          <View style={S.tHead}>
            <Text style={[S.tH, { flex: 2 }]}>NAME</Text>
            <Text style={[S.tH, { width: 90 }]}>ROLE</Text>
            <Text style={[S.tH, { width: 140 }]}>SIGNED AT</Text>
            <Text style={[S.tH, { flex: 2 }]}>COMMENT</Text>
          </View>
          {props.approvals.map((a, i) => (
            <View key={i} style={S.tRow}>
              <Text style={[S.tC, { flex: 2, fontWeight: 700 }]}>{a.approver_name}</Text>
              <Text style={[S.tC, { width: 90, color: MUTED }]}>{a.role}</Text>
              <Text style={[S.tC, { width: 140, fontFamily: "InterUI", fontSize: 8.5, color: MUTED }]}>{fmtDate(a.signed_at)}</Text>
              <Text style={[S.tC, { flex: 2, fontStyle: "italic" }]}>{a.comment || "—"}</Text>
            </View>
          ))}
          <View style={{ marginTop: 18, flexDirection: "row", gap: 24, flexWrap: "wrap" }}>
            {props.approvals.map((a, i) => (
              <View key={i} style={{ width: 200 }}>
                <View style={{ height: 30, borderBottomWidth: 0.75, borderBottomColor: NAVY }}>
                  <Text style={{ fontFamily: "EBGaramond", fontStyle: "italic", fontSize: 14, color: NAVY_SOFT, marginTop: 6 }}>
                    {a.signature || a.approver_name}
                  </Text>
                </View>
                <Text style={{ fontFamily: "InterUI", fontSize: 7.5, color: MUTED, marginTop: 3, letterSpacing: 1 }}>
                  {a.approver_name.toUpperCase()}  ·  {a.role.toUpperCase()}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </>
  );
}

function NegotiationChecklist(props: AuditPdfInput & { sectionNo: string }) {
  const items = props.negotiationItems ?? [];
  return (
    <>
      <SectionHeader no={props.sectionNo} title="Negotiation Checklist" sub="Items to resolve with the supplier prior to signature." />
      {items.length === 0 ? (
        <Text style={S.p}>No open negotiation items were captured.</Text>
      ) : (
        <>
          <View style={S.tHead}>
            <Text style={[S.tH, { width: 20 }]}>#</Text>
            <Text style={[S.tH, { width: 110 }]}>CATEGORY</Text>
            <Text style={[S.tH, { flex: 1 }]}>ASK</Text>
            <Text style={[S.tH, { width: 60 }]}>PRIORITY</Text>
            <Text style={[S.tH, { width: 60 }]}>STATUS</Text>
          </View>
          {items.map((it, i) => (
            <View key={i} style={S.tRow} wrap={false}>
              <Text style={[S.tC, { width: 20, color: MUTED }]}>{i + 1}</Text>
              <View style={{ width: 110 }}>
                <Text style={[S.tC, { fontFamily: "InterUI", fontSize: 8, color: MUTED }]}>{it.category}</Text>
                <Text style={[S.tC, { fontWeight: 700 }]}>{it.criterion_name}</Text>
              </View>
              <Text style={[S.tC, { flex: 1, paddingHorizontal: 6 }]}>{it.ask}</Text>
              <Text style={[S.tC, { width: 60, textTransform: "uppercase", color: it.priority === "high" ? V_TONE.gap.fg : it.priority === "med" ? V_TONE.partial.fg : MUTED, fontFamily: "InterUI", fontSize: 8 }]}>{it.priority}</Text>
              <Text style={[S.tC, { width: 60, fontFamily: "InterUI", fontSize: 8, color: MUTED, textTransform: "uppercase" }]}>{it.status}</Text>
            </View>
          ))}
        </>
      )}
    </>
  );
}

function CategoryScorecards(props: AuditPdfInput & { sectionNo: string }) {
  const report = computeReportData(props.findings, props.criteria);
  return (
    <>
      <SectionHeader no={props.sectionNo} title="Category Scorecards" sub="Per-discipline alignment across the customer template." />
      {report.categories.map((c) => (
        <View key={c.category} style={S.cat} wrap={false}>
          <View style={S.catHead}>
            <Text style={S.catName}>{c.category}</Text>
            <Text style={S.catScore}>{c.score}<Text style={{ fontFamily: "InterUI", fontSize: 8, color: MUTED }}> / 100</Text></Text>
          </View>
          <StackedBar counts={c.counts} />
          <View style={S.chips}>
            <VerdictChip v="aligned" n={c.counts.aligned} />
            <VerdictChip v="partial" n={c.counts.partial} />
            <VerdictChip v="gap" n={c.counts.gap} />
            <VerdictChip v="not_addressed" n={c.counts.not_addressed} />
          </View>
        </View>
      ))}
    </>
  );
}

function FindingsDetailed(props: AuditPdfInput & { sectionNo: string }) {
  const report = computeReportData(props.findings, props.criteria);
  const groups = report.categories;
  return (
    <>
      <SectionHeader no={props.sectionNo} title="Findings — Detailed Assessment" sub="Each requirement, its verdict, evidence, and recommended action." />
      {groups.map((g) => (
        <View key={g.category}>
          <Text style={S.h3}>{g.category}</Text>
          {g.items.map((r, idx) => {
            const t = V_TONE[r.verdict];
            return (
              <View key={idx} style={S.finding} wrap={false}>
                <View style={S.fHead}>
                  <Text style={S.fTitle}>{r.criterion.name}</Text>
                  <View style={[S.chip, { backgroundColor: t.bg }]}>
                    <Text style={[S.chipText, { color: t.fg, fontWeight: 700 }]}>{t.label.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={S.fMeta}>
                  {(r.finding?.agent_name || "Analyst").toUpperCase()}
                  {r.finding?.clause_ref ? `  ·  Clause ${r.finding.clause_ref}` : ""}
                  {r.finding?.grounded === false ? "  ·  Ungrounded" : r.finding?.grounded ? "  ·  Grounded in supplier text" : ""}
                </Text>
                {r.finding?.evidence_quote ? (
                  <Text style={S.quote}>"{r.finding.evidence_quote.trim()}"</Text>
                ) : null}
                {r.finding?.justification ? <Text style={S.p}>{r.finding.justification}</Text> : (
                  <Text style={S.p}>Requirement was not addressed in the supplier offer.</Text>
                )}
                {r.finding?.recommended_action ? (
                  <View style={S.callout}>
                    <Text style={S.calloutLbl}>RECOMMENDED ACTION</Text>
                    <Text style={S.p}>{r.finding.recommended_action}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </>
  );
}

function Methodology(props: AuditPdfInput & { sectionNo: string }) {
  const pipe = props.pipeline ?? {};
  const modelSet = new Set(props.findings.map((f) => (f as any).model).filter(Boolean));
  const agentSet = new Set(props.findings.map((f) => f.agent_name).filter(Boolean));
  const checked = (props.checklist ?? []).filter((c) => c.checked).length;
  const total = (props.checklist ?? []).length;
  return (
    <>
      <SectionHeader no={props.sectionNo} title="Methodology & Assurance" sub="How this assessment was produced and reviewed." />
      <Text style={S.p}>
        Each requirement in the customer template was independently evaluated against the supplier offer by a specialist agent.
        Retrieved evidence was grounded against the supplier document before a verdict was assigned, and every finding was reviewed by a
        second-pass reviewer agent. Verdicts are stored with the supporting quote and a clause reference.
      </Text>
      <Text style={S.h4}>PIPELINE COMPONENTS</Text>
      <View style={S.tHead}>
        <Text style={[S.tH, { width: 130 }]}>COMPONENT</Text>
        <Text style={[S.tH, { flex: 1 }]}>VERSION / IDENTIFIER</Text>
      </View>
      {[
        ["Extractor", pipe.extractor || "unpdf v1"],
        ["Chunker", pipe.chunker || "semantic v1"],
        ["Embedder", pipe.embedder || "gateway/embed-v1"],
        ["Analyzer", pipe.analyzer || props.run.worker_version || "gateway/gemini-flash"],
        ["Models observed", Array.from(modelSet).join(", ") || "—"],
        ["Agents deployed", Array.from(agentSet).join(", ") || "—"],
      ].map(([k, v], i) => (
        <View key={i} style={S.tRow}>
          <Text style={[S.tC, { width: 130, color: MUTED, fontFamily: "InterUI", fontSize: 8.5 }]}>{k}</Text>
          <Text style={[S.tC, { flex: 1 }]}>{v}</Text>
        </View>
      ))}
      <Text style={S.h4}>HUMAN REVIEW</Text>
      <Text style={S.p}>
        {total > 0
          ? `${checked} of ${total} human-in-the-loop checklist items were confirmed by the reviewer.`
          : "The reviewer proceeded on the analyst assessment without recorded overrides."}
      </Text>
      <Text style={S.h4}>LIMITATIONS</Text>
      <Text style={S.p}>
        Findings are derived from the text of the supplied documents. Referenced attachments, side-letters, or oral commitments outside
        the analysed set are not considered. This report supports — but does not replace — professional legal, security and commercial review.
      </Text>
    </>
  );
}

function MappingAnnex(props: AuditPdfInput & { sectionNo: string }) {
  const pairs = props.mappingPairs ?? [];
  if (!pairs.length) return null;
  const comply = pairs.filter((p) => p.status === "comply").length;
  const risk = pairs.filter((p) => p.status === "deviates" || p.status === "bidder_silent").length;
  const overridden = pairs.filter((p) => p.overridden).length;
  const top = [...pairs]
    .filter((p) => p.status === "deviates" || p.status === "bidder_silent" || p.status === "partial")
    .slice(0, 8);

  return (
    <View>
      <SectionHeader
        no={props.sectionNo}
        title="Compliance Mapping Annex"
        sub="Source-checked tender ↔ bidder requirements with compliance status and quote match."
      />
      <Text style={S.p}>
        {pairs.length} requirements mapped · {comply} meet tender · {risk} open risk
        {overridden ? ` · ${overridden} reviewer override(s)` : ""}.
        Status is based on quotes found in the source documents and wording match; reviewer overrides are authoritative.
      </Text>
      <View style={{ marginTop: 8, marginBottom: 10 }}>
        {top.map((p, i) => (
          <View key={`${p.topic}-${i}`} style={{ marginBottom: 8, paddingBottom: 6, borderBottomWidth: 0.4, borderBottomColor: RULE }}>
            <Text style={{ fontFamily: "InterUI", fontSize: 9, fontWeight: 700, color: NAVY }}>
              {p.status.toUpperCase()}
              {p.overridden ? " (OVERRIDE)" : ""} · {p.topic}
              {typeof p.similarity === "number" ? ` · match ${Math.round(p.similarity * 100)}%` : ""}
            </Text>
            <Text style={S.small}>
              T: {(p.customer_excerpt ?? "—").slice(0, 160)}
            </Text>
            <Text style={S.small}>
              B: {(p.supplier_excerpt ?? "Silent").slice(0, 160)}
            </Text>
            {p.reason ? <Text style={S.small}>Note: {p.reason.slice(0, 180)}</Text> : null}
          </View>
        ))}
      </View>
      <Text style={S.h4}>FULL MATRIX</Text>
      {pairs.map((p, i) => (
        <Text key={`m-${i}`} style={{ fontFamily: "InterUI", fontSize: 8, color: MUTED, marginBottom: 2 }}>
          {String(i + 1).padStart(2, "0")} · {p.status}
          {p.overridden ? "*" : ""} · {p.topic}
          {typeof p.similarity === "number" ? ` · ${Math.round(p.similarity * 100)}%` : ""}
        </Text>
      ))}
    </View>
  );
}

function AppendixMatrix(props: AuditPdfInput & { sectionNo: string }) {
  const report = computeReportData(props.findings, props.criteria);
  return (
    <>
      <SectionHeader no={props.sectionNo} title="Appendix A — Full Criteria Matrix" sub="Every evaluated requirement with its assigned verdict." />
      <View style={S.tHead}>
        <Text style={[S.tH, { width: 24 }]}>#</Text>
        <Text style={[S.tH, { flex: 3 }]}>REQUIREMENT</Text>
        <Text style={[S.tH, { width: 110 }]}>CATEGORY</Text>
        <Text style={[S.tH, { width: 80 }]}>VERDICT</Text>
        <Text style={[S.tH, { width: 70 }]}>CLAUSE</Text>
      </View>
      {report.rows.map((r, i) => (
        <View key={i} style={S.tRow} wrap={false}>
          <Text style={[S.tC, { width: 24, color: MUTED }]}>{i + 1}</Text>
          <Text style={[S.tC, { flex: 3, paddingRight: 6 }]}>{r.criterion.name}</Text>
          <Text style={[S.tC, { width: 110, color: MUTED, fontFamily: "InterUI", fontSize: 8 }]}>{r.category}</Text>
          <Text style={[S.tC, { width: 80, color: V_TONE[r.verdict].fg, fontFamily: "InterUI", fontSize: 8, fontWeight: 700 }]}>{V_TONE[r.verdict].label.toUpperCase()}</Text>
          <Text style={[S.tC, { width: 70, fontFamily: "InterUI", fontSize: 8, color: MUTED }]}>{r.finding?.clause_ref || "—"}</Text>
        </View>
      ))}
    </>
  );
}

function AppendixActivity(props: AuditPdfInput & { sectionNo: string }) {
  const events = props.events ?? [];
  return (
    <>
      <SectionHeader no={props.sectionNo} title="Appendix B — Agent Activity Log" sub="Chronological trace of the analysis session." />
      {events.length === 0 ? (
        <Text style={S.small}>No activity events recorded.</Text>
      ) : (
        <>
          <View style={S.tHead}>
            <Text style={[S.tH, { width: 130 }]}>TIMESTAMP</Text>
            <Text style={[S.tH, { width: 130 }]}>AGENT</Text>
            <Text style={[S.tH, { flex: 1 }]}>MESSAGE</Text>
          </View>
          {events.map((e, i) => (
            <View key={i} style={S.tRow} wrap={false}>
              <Text style={[S.tC, { width: 130, fontFamily: "InterUI", fontSize: 8, color: MUTED }]}>{fmtDate(e.created_at)}</Text>
              <Text style={[S.tC, { width: 130 }]}>{e.agent_name}</Text>
              <Text style={[S.tC, { flex: 1 }]}>{e.message || "—"}</Text>
            </View>
          ))}
        </>
      )}
    </>
  );
}

function AppendixDocs(props: AuditPdfInput & { sectionNo: string }) {
  return (
    <>
      <SectionHeader no={props.sectionNo} title="Appendix C — Document Register" sub="Documents ingested into this assessment." />
      <View style={S.tHead}>
        <Text style={[S.tH, { width: 100 }]}>ROLE</Text>
        <Text style={[S.tH, { flex: 1 }]}>FILENAME</Text>
        <Text style={[S.tH, { width: 80 }]}>SIZE (KB)</Text>
        <Text style={[S.tH, { width: 70 }]}>CHUNKS</Text>
      </View>
      {props.documents.map((d, i) => (
        <View key={i} style={S.tRow}>
          <Text style={[S.tC, { width: 100, fontFamily: "InterUI", fontSize: 8, color: MUTED, textTransform: "uppercase" }]}>{d.role}</Text>
          <Text style={[S.tC, { flex: 1 }]}>{d.filename}</Text>
          <Text style={[S.tC, { width: 80, textAlign: "right" }]}>{d.size_bytes ? Math.round(d.size_bytes / 1024) : "—"}</Text>
          <Text style={[S.tC, { width: 70, textAlign: "right" }]}>{d.num_chunks ?? "—"}</Text>
        </View>
      ))}
      <View style={{ marginTop: 24, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 12 }}>
        <Text style={S.small}>
          END OF REPORT  ·  {props.reportId}  ·  DOCUMENT SHA-256 {shortHash(props.docSha256)}
        </Text>
      </View>
    </>
  );
}

// ---------- Document ----------
export function AuditPdfDocument(props: AuditPdfInput) {
  const headerLeft = `Confidential  ·  ${props.clientName}  ·  ${props.supplierName || "Supplier"}`;
  const headerRight = props.reportId;
  const footerLeft = `Counterpart — Contract Intelligence  ·  ${shortHash(props.docSha256)}`;
  const hasDecision = !!props.decision;
  const hasNegotiation = (props.negotiationItems?.length ?? 0) > 0;

  // Number sections dynamically depending on presence of negotiation.
  const baseAfterDecision = hasNegotiation ? 4 : 3;
  const secNo = (i: number) => String(baseAfterDecision + i - 1).padStart(2, "0");

  return (
    <Document title={`${props.engagementTitle} — Audit Report`} author="Counterpart — Contract Intelligence" subject="Supplier contract compliance audit">
      <CoverPage {...props} />
      <Page size="A4" style={S.page}>
        <RunningChrome headerLeft={headerLeft} headerRight={headerRight} footerLeft={footerLeft} />
        <TableOfContents hasDecision={hasDecision} hasNegotiation={hasNegotiation} />
      </Page>
      <Page size="A4" style={S.page}>
        <RunningChrome headerLeft={headerLeft} headerRight={headerRight} footerLeft={footerLeft} />
        <ExecutiveSummary {...props} />
      </Page>
      <Page size="A4" style={S.page}>
        <RunningChrome headerLeft={headerLeft} headerRight={headerRight} footerLeft={footerLeft} />
        <DecisionAndSignatures {...props} />
      </Page>
      {hasNegotiation && (
        <Page size="A4" style={S.page}>
          <RunningChrome headerLeft={headerLeft} headerRight={headerRight} footerLeft={footerLeft} />
          <NegotiationChecklist {...props} sectionNo="03" />
        </Page>
      )}
      <Page size="A4" style={S.page}>
        <RunningChrome headerLeft={headerLeft} headerRight={headerRight} footerLeft={footerLeft} />
        <CategoryScorecards {...props} sectionNo={secNo(1)} />
      </Page>
      <Page size="A4" style={S.page}>
        <RunningChrome headerLeft={headerLeft} headerRight={headerRight} footerLeft={footerLeft} />
        <FindingsDetailed {...props} sectionNo={secNo(2)} />
      </Page>
      <Page size="A4" style={S.page}>
        <RunningChrome headerLeft={headerLeft} headerRight={headerRight} footerLeft={footerLeft} />
        <Methodology {...props} sectionNo={secNo(3)} />
      </Page>
      {(props.mappingPairs?.length ?? 0) > 0 && (
        <Page size="A4" style={S.page}>
          <RunningChrome headerLeft={headerLeft} headerRight={headerRight} footerLeft={footerLeft} />
          <MappingAnnex {...props} sectionNo={secNo(4)} />
        </Page>
      )}
      <Page size="A4" style={S.page}>
        <RunningChrome headerLeft={headerLeft} headerRight={headerRight} footerLeft={footerLeft} />
        <AppendixMatrix {...props} sectionNo={secNo((props.mappingPairs?.length ?? 0) > 0 ? 5 : 4)} />
      </Page>
      <Page size="A4" style={S.page}>
        <RunningChrome headerLeft={headerLeft} headerRight={headerRight} footerLeft={footerLeft} />
        <AppendixActivity {...props} sectionNo={secNo((props.mappingPairs?.length ?? 0) > 0 ? 6 : 5)} />
      </Page>
      <Page size="A4" style={S.page}>
        <RunningChrome headerLeft={headerLeft} headerRight={headerRight} footerLeft={footerLeft} />
        <AppendixDocs {...props} sectionNo={secNo((props.mappingPairs?.length ?? 0) > 0 ? 7 : 6)} />
      </Page>
    </Document>
  );
}

// ---------- Public API ----------
export async function renderAuditPdfBlob(input: AuditPdfInput): Promise<Blob> {
  registerPdfFonts();
  return await pdf(<AuditPdfDocument {...input} />).toBlob();
}

export async function downloadAuditPdf(input: AuditPdfInput, filename?: string) {
  const blob = await renderAuditPdfBlob(input);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `audit-${input.reportId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
