/**
 * Client-side export of the compliance mapping annex (PDF + CSV).
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  MAPPING_STATUS_META,
  computeMappingCoverage,
  enrichMappingRows,
  type MappingFindingInput,
  type MappingPairInput,
} from "@/lib/clause-mapping-status";

export type MappingExportRow = MappingPairInput & { id: string };

export function exportMappingCsv(
  runTitle: string,
  runId: string,
  pairs: MappingExportRow[],
  findings: MappingFindingInput[] = [],
) {
  const rows = enrichMappingRows(pairs, findings, null, null);
  const header = [
    "Requirement",
    "Category",
    "Status",
    "Suggested status",
    "Overridden",
    "Override reason",
    "Quote match",
    "Quotes",
    "Tender quote",
    "Bidder quote",
    "Note",
  ];
  const body = rows.map((r) => [
    r.pair.topic,
    r.category,
    r.status,
    r.derivedStatus,
    r.overridden ? "yes" : "no",
    r.pair.override_reason ?? "",
    r.similarity != null ? String(Math.round(r.similarity * 1000) / 1000) : "",
    r.authenticity.grade,
    (r.pair.customer_excerpt ?? "").replace(/\r?\n/g, " "),
    (r.pair.supplier_excerpt ?? "").replace(/\r?\n/g, " "),
    (r.pair.note ?? "").replace(/\r?\n/g, " "),
  ]);
  const csv = [header, ...body]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `clause-mapping-${runId.slice(0, 8)}.csv`);
}

export function exportMappingPdf(
  runTitle: string,
  runId: string,
  pairs: MappingExportRow[],
  findings: MappingFindingInput[] = [],
) {
  const rows = enrichMappingRows(pairs, findings, null, null);
  const coverage = computeMappingCoverage(rows);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Requirements Compliance Annex", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(runTitle || "Untitled run", margin, y);
  y += 14;
  doc.text(
    `${coverage.total} requirements · ${coverage.coveragePct}% meet tender · ${coverage.riskPct}% open risk · ${coverage.verifiedPct}% quotes verified`,
    margin,
    y,
  );
  y += 10;
  doc.text(`Run ${runId.slice(0, 8)} · Generated ${new Date().toISOString().slice(0, 16)}Z`, margin, y);
  y += 20;
  doc.setTextColor(0);

  const riskN = coverage.byStatus.deviates + coverage.byStatus.bidder_silent;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(
    riskN >= 3
      ? "Award readiness: Negotiate before award"
      : riskN > 0
        ? "Award readiness: Resolve open deviations"
        : "Award readiness: Mapping looks clean",
    margin,
    y,
  );
  y += 16;

  autoTable(doc, {
    startY: y,
    head: [["#", "Requirement", "Category", "Status", "Match", "Quotes"]],
    body: rows.map((r, i) => [
      String(i + 1),
      r.pair.topic.slice(0, 48),
      r.category.slice(0, 22),
      `${MAPPING_STATUS_META[r.status].short}${r.overridden ? "*" : ""}`,
      r.similarity != null ? `${Math.round(r.similarity * 100)}%` : "—",
      r.authenticity.grade,
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [10, 36, 114], textColor: 255 },
    margin: { left: margin, right: margin },
  });

  const afterTable = (doc as any).lastAutoTable?.finalY ?? y + 40;
  let y2 = afterTable + 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Priority items for discussion", margin, y2);
  y2 += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  for (const r of coverage.topRisks) {
    if (y2 > 760) {
      doc.addPage();
      y2 = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.text(
      `${MAPPING_STATUS_META[r.status].label} · ${r.pair.topic}`.slice(0, 90),
      margin,
      y2,
    );
    y2 += 11;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60);
    const reason = r.reasons[0] ?? "";
    const lines = doc.splitTextToSize(
      `T: ${(r.pair.customer_excerpt ?? "—").slice(0, 140)}\nB: ${(r.pair.supplier_excerpt ?? "Silent").slice(0, 140)}${reason ? `\n${reason}` : ""}`,
      500,
    );
    doc.text(lines, margin, y2);
    y2 += lines.length * 11 + 8;
    doc.setTextColor(0);
  }

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text("* = reviewer override · Status from source-checked quotes and wording match", margin, 820);

  doc.save(`clause-mapping-${runId.slice(0, 8)}.pdf`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
