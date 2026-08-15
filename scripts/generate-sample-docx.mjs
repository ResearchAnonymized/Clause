/**
 * Generate professionally formatted CareFlow tender + bidder Word packs.
 * Run: node scripts/generate-sample-docx.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outRoot = path.join(root, "samples", "docx");

const COLORS = {
  ink: "1A2332",
  muted: "5C6570",
  line: "D0D5DD",
  tender: "0B4F6C",
  bidderWeak: "9A3412",
  bidderOk: "166534",
  soft: "F4F6F8",
  warn: "FEF3C7",
};

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 160, before: opts.before ?? 0, line: 276 },
    alignment: opts.align,
    ...opts.para,
    children: [
      new TextRun({
        text,
        font: "Calibri",
        size: opts.size ?? 22, // 11pt
        bold: opts.bold,
        italics: opts.italics,
        color: opts.color ?? COLORS.ink,
      }),
    ],
  });
}

function h1(text, color = COLORS.tender) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 200, before: 0 },
    children: [
      new TextRun({ text, font: "Calibri", size: 32, bold: true, color }),
    ],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { after: 120, before: 240 },
    children: [
      new TextRun({ text, font: "Calibri", size: 24, bold: true, color: COLORS.ink }),
    ],
  });
}

function meta(label, value) {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${label}: `, font: "Calibri", size: 20, bold: true, color: COLORS.muted }),
      new TextRun({ text: value, font: "Calibri", size: 20, color: COLORS.ink }),
    ],
  });
}

function note(text, accent = COLORS.bidderWeak) {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 24, color: accent, space: 10 },
    },
    shading: { type: ShadingType.CLEAR, fill: COLORS.warn },
    children: [
      new TextRun({ text: "DEMO NOTE — ", font: "Calibri", size: 18, bold: true, color: accent }),
      new TextRun({ text, font: "Calibri", size: 18, color: COLORS.ink }),
    ],
  });
}

function cell(text, opts = {}) {
  return new TableCell({
    width: { size: opts.width ?? 2500, type: WidthType.DXA },
    shading: opts.header ? { type: ShadingType.CLEAR, fill: opts.fill ?? COLORS.tender } : opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill } : undefined,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line },
      left: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line },
      right: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line },
    },
    children: [
      new Paragraph({
        spacing: { after: 40, before: 40 },
        children: [
          new TextRun({
            text,
            font: "Calibri",
            size: opts.header ? 18 : 18,
            bold: opts.header || opts.bold,
            color: opts.header ? "FFFFFF" : COLORS.ink,
          }),
        ],
      }),
    ],
  });
}

function table(headers, rows, headerFill = COLORS.tender) {
  const widths = headers.map(() => Math.floor(9000 / headers.length));
  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        children: headers.map((h, i) => cell(h, { header: true, width: widths[i], fill: headerFill })),
      }),
      ...rows.map(
        (r, ri) =>
          new TableRow({
            children: r.map((c, i) =>
              cell(c, { width: widths[i], fill: ri % 2 === 0 ? COLORS.soft : undefined }),
            ),
          }),
      ),
    ],
  });
}

function docShell({ title, subtitle, accent, children }) {
  return new Document({
    styles: {
      default: {
        document: {
          styles: [{ id: "Normal", run: { font: "Calibri", size: 22 } }],
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 864, right: 864 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                border: {
                  bottom: { style: BorderStyle.SINGLE, size: 12, color: accent, space: 8 },
                },
                spacing: { after: 120 },
                children: [
                  new TextRun({ text: title, font: "Calibri", size: 16, bold: true, color: accent }),
                  new TextRun({ text: "  ·  ", font: "Calibri", size: 16, color: COLORS.muted }),
                  new TextRun({ text: subtitle, font: "Calibri", size: 16, color: COLORS.muted }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                border: {
                  top: { style: BorderStyle.SINGLE, size: 6, color: COLORS.line, space: 8 },
                },
                children: [
                  new TextRun({ text: "Page ", font: "Calibri", size: 16, color: COLORS.muted }),
                  new TextRun({ children: [PageNumber.CURRENT], font: "Calibri", size: 16, color: COLORS.muted }),
                  new TextRun({ text: "  ·  Demo material for Clause / 2M-IT", font: "Calibri", size: 16, color: COLORS.muted }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

async function writeDoc(relPath, document) {
  const full = path.join(outRoot, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  const buf = await Packer.toBuffer(document);
  await fs.writeFile(full, buf);
  console.log("wrote", relPath);
}

// ——— Tender pack ———
async function tenderPack() {
  const accent = COLORS.tender;
  const base = "tender";

  await writeDoc(
    `${base}/01-invitation-to-tender.docx`,
    docShell({
      title: "2M-IT Procurement",
      subtitle: "Invitation to Tender",
      accent,
      children: [
        h1("INVITATION TO TENDER", accent),
        meta("Procurement reference", "2M-IT / 2026 / CAREFlow-01"),
        meta("Contracting authority", "2M-IT Oy (on behalf of participating wellbeing services counties)"),
        meta("Procedure", "Open procedure (Finnish Act on Public Procurement and Concession Contracts)"),
        meta("Publication channel", "Hilma / TED (EU)"),
        h2("1. Subject matter"),
        p(
          "Procurement of a clinical care pathway and case-management software service (“CareFlow”) including hosting, support, integrations, and personal data processing as a processor.",
        ),
        h2("2. Estimated value"),
        p("EUR 1,800,000 – 2,400,000 (4-year term + optional 2×12-month extensions)."),
        h2("3. Documents forming the tender"),
        p("• Draft Framework Agreement"),
        p("• Appendix 1.1 Service and Information System Map"),
        p("• Appendix 1.2 Description of Personal Data Processing Activities"),
        p("• Appendix 2 Special Terms"),
        p("• Appendix 5 Service-Specific Pricing (structure)"),
        p("• This Invitation"),
        h2("4. Mandatory response package (bidder ZIP)"),
        p("Bidders must submit a single ZIP containing at least:"),
        p("a) Signed main offer / supplier agreement"),
        p("b) Appendix 5 Service Levels response"),
        p("c) DPA / processing response for CareFlow"),
        p("d) Price schedule aligned to Appendix 5 structure"),
        p("e) Information security statement (ISO 27001 or equivalent evidence)"),
        h2("5. Award criteria (illustrative for demo)"),
        p("• Price 40%"),
        p("• Quality & SLA 35%"),
        p("• Security & data protection 25%"),
        h2("6. Contact"),
        p("procurement@2m-it.example (demo address)"),
      ],
    }),
  );

  await writeDoc(
    `${base}/02-framework-agreement-draft.docx`,
    docShell({
      title: "2M-IT Procurement",
      subtitle: "Draft Framework Agreement",
      accent,
      children: [
        h1("DRAFT FRAMEWORK AGREEMENT", accent),
        p("Between 2M-IT Oy (“Organisation”) and the selected Supplier", { italics: true }),
        meta("Service", "CareFlow clinical pathway platform"),
        meta("Governing law", "Finland"),
        h2("1. Scope"),
        p(
          "The Supplier shall deliver the CareFlow service as described in Appendix 1.1, process personal data as set out in Appendix 1.2, and comply with the Special Terms in Appendix 2.",
        ),
        h2("2. Term"),
        p("Initial term four (4) years from Go-Live, with two optional extensions of twelve (12) months each."),
        h2("3. Service levels"),
        p(
          "Service levels for CareFlow shall be at least the level stated in Appendix 1.1 (Service Level V2). Any lower level offered by the Supplier is a material non-conformity.",
        ),
        h2("4. Subcontractors and sub-processors"),
        p(
          "The Supplier shall disclose all sub-processors prior to Go-Live and obtain written approval for material changes. Sub-processors must meet the same security baseline as the Supplier.",
        ),
        h2("5. Information security minimum"),
        p(
          "The Supplier shall maintain a certified information security management system equivalent to ISO/IEC 27001, encrypt data in transit and at rest, and notify the Organisation of personal data breaches without undue delay and in any event within twenty-four (24) hours of becoming aware.",
        ),
        h2("6. Price adjustments"),
        p(
          "Price adjustments may follow the Finnish ICT index once per calendar year, capped at 3%. Licence cost increases from third parties may be passed through only if the Organisation can pass the same increase to the end customer under Appendix 5.",
        ),
        h2("7. Order of precedence"),
        p("(1) Appendix 2 Special Terms"),
        p("(2) This Framework Agreement"),
        p("(3) Appendix 1.1, 1.2, and 5"),
        p("(4) Supplier offer documents"),
      ],
    }),
  );

  await writeDoc(
    `${base}/03-appendix-1.1-service-map.docx`,
    docShell({
      title: "Appendix 1.1",
      subtitle: "Service and Information System Map",
      accent,
      children: [
        h1("APPENDIX 1.1 — SERVICE AND INFORMATION SYSTEM MAP", accent),
        p("Customer / Organisation baseline (2M-IT)", { italics: true, color: COLORS.muted }),
        new Paragraph({ spacing: { after: 200 }, children: [] }),
        table(
          ["#", "System / Service", "Description", "Service Level", "Criticality"],
          [
            [
              "1",
              "CareFlow",
              "Clinical care pathway and case-management SaaS used by wellbeing services counties. Includes appointment orchestration, care plans, and integration APIs.",
              "V2",
              "Business-critical",
            ],
            [
              "2",
              "Identity Bridge",
              "Federation connector for HAKA / Suomi.fi e-Identification (supporting service).",
              "V1",
              "Supporting",
            ],
          ],
        ),
        h2("CareFlow — Service Level V2 (Organisation baseline)"),
        p("• Availability: 99.9% measured monthly (excluding agreed maintenance windows)"),
        p("• Severity-1 incident response: 30 minutes"),
        p("• Severity-1 resolution target: 4 hours"),
        p("• Planned maintenance: max 4 hours / month, outside 07:00–18:00 EET on weekdays"),
        p("• RPO: 1 hour | RTO: 4 hours"),
        note(
          "The target service for this procurement is CareFlow. CareFlow MUST appear in the Supplier’s Appendix 5 Service Levels response at level V2 (or better). Any mismatch vs V2 is critical.",
          accent,
        ),
      ],
    }),
  );

  await writeDoc(
    `${base}/04-appendix-1.2-dpa.docx`,
    docShell({
      title: "Appendix 1.2",
      subtitle: "Personal Data Processing",
      accent,
      children: [
        h1("APPENDIX 1.2 — DESCRIPTION OF PERSONAL DATA PROCESSING ACTIVITIES", accent),
        meta("Controller", "Participating wellbeing services county (via 2M-IT coordination)"),
        meta("Processor", "Selected Supplier"),
        h2("1.2.1 CareFlow — Personal data processing description"),
        h2("Purpose of processing"),
        p("Provision of CareFlow clinical pathway software, support, and hosting."),
        h2("Categories of data subjects"),
        p("Patients / clients of wellbeing services; healthcare professionals; Organisation administrators."),
        h2("Categories of personal data"),
        p("• Identification data (name, unique identifiers)"),
        p("• Contact data"),
        p("• Health and care-related data (special category / sensitive)"),
        p("• Authentication and audit logs"),
        h2("Special categories"),
        p("Yes — health data under GDPR Art. 9. Processing basis coordinated by the Controller."),
        h2("Retention"),
        p(
          "As instructed by the Controller; default operational retention 10 years for care records unless shorter period required by applicable Finnish healthcare legislation.",
        ),
        h2("Location of processing"),
        p("EEA only. Transfers outside the EEA require prior written approval and appropriate safeguards (e.g. SCCs + TIA)."),
        h2("Security measures"),
        p("ISO/IEC 27001 (or equivalent), encryption in transit/at rest, access control, logging, incident notification within 24 hours."),
        note(
          "CareFlow is listed in this Appendix 1.2. Any Supplier response that omits CareFlow from the DPA / processing description constitutes a DPA gap (critical).",
          accent,
        ),
      ],
    }),
  );

  await writeDoc(
    `${base}/05-appendix-2-special-terms.docx`,
    docShell({
      title: "Appendix 2",
      subtitle: "Special Terms",
      accent,
      children: [
        h1("APPENDIX 2 — SPECIAL TERMS", accent),
        p("Organisation commitments toward participating customers / counties", { italics: true, color: COLORS.muted }),
        h2("1. Termination for convenience — Organisation side"),
        p(
          "The Organisation may terminate the CareFlow service for a participating customer with twelve (12) months’ written notice. If a specific notice period is not stated elsewhere for the Organisation’s downstream commitment, the default notice period is twelve (12) months.",
        ),
        h2("2. Termination for convenience — Supplier side (requirement)"),
        p(
          "The Supplier shall grant the Organisation a termination-for-convenience right with a notice period that is not longer than twelve (12) months. A Supplier notice period longer than twelve (12) months creates a liability gap (Organisation remains bound to customers while unable to exit Supplier).",
        ),
        h2("3. Exit assistance"),
        p(
          "Upon termination or expiry, the Supplier shall provide exit assistance for at least ninety (90) days, including data export in documented machine-readable formats.",
        ),
        h2("4. Continuity"),
        p("Critical CareFlow functions shall remain available during exit at the contracted Service Level V2."),
      ],
    }),
  );

  await writeDoc(
    `${base}/06-appendix-5-pricing.docx`,
    docShell({
      title: "Appendix 5",
      subtitle: "Service-Specific Pricing",
      accent,
      children: [
        h1("APPENDIX 5 — SERVICE-SPECIFIC PRICING (STRUCTURE)", accent),
        p("Customer / Organisation baseline", { italics: true, color: COLORS.muted }),
        h2("Systems that must appear in pricing"),
        p("1) CareFlow — monthly SaaS fee per active professional user + environment fees"),
        p("2) Identity Bridge — optional monthly connector fee"),
        h2("CareFlow pricing rows (required structure)"),
        table(
          ["SKU", "Description"],
          [
            ["CF-BASE", "Platform fee / month / production environment"],
            ["CF-USER", "Fee per named clinical user / month"],
            ["CF-API", "Integration / API calls bundle / month"],
            ["CF-SUP", "Support uplift for Service Level V2 (included or itemised)"],
          ],
        ),
        h2("Price adjustment (Organisation → customer)"),
        p("• ICT index adjustment max once per year, cap 3%"),
        p("• Third-party licence pass-through only if mirrored in customer pricing schedule"),
        note("CareFlow MUST be listed in Appendix 5 pricing. Absence = critical (cannot bill).", accent),
      ],
    }),
  );
}

async function bidderWeak() {
  const accent = COLORS.bidderWeak;
  const base = "bidder-a-weak";

  await writeDoc(
    `${base}/01-main-agreement-offer.docx`,
    docShell({
      title: "NordicCare Soft Oy",
      subtitle: "Supplier Main Offer",
      accent,
      children: [
        h1("SUPPLIER MAIN AGREEMENT / OFFER", accent),
        meta("Bidder", "NordicCare Soft Oy (“Supplier”)"),
        meta("Procurement", "2M-IT / 2026 / CAREFlow-01"),
        meta("Offered service", "CareFlow-compatible pathway platform (“PathLynx”)"),
        h2("1. Acceptance"),
        p(
          "NordicCare Soft Oy offers to supply PathLynx as CareFlow replacement under the draft Framework Agreement, subject to the deviations in this Offer and its annexes.",
        ),
        h2("2. Term"),
        p("Four (4) years from Go-Live + two optional 12-month extensions."),
        h2("3. Termination for convenience — notice period"),
        p("Either party may terminate for convenience with eighteen (18) months’ prior written notice. The Supplier does not accept a shorter Organisation exit right."),
        note(
          "Organisation Appendix 2 requires max 12 months — 18 months is CRITICAL misalignment.",
          accent,
        ),
        h2("4. Service levels"),
        p(
          "Service levels are exclusively those in Supplier Appendix 5 (Service Levels). In case of conflict with the Organisation’s Appendix 1.1, Supplier Appendix 5 prevails.",
        ),
        h2("5. Price adjustments"),
        p(
          "The Supplier may increase fees annually by up to 8% or by the full amount of any third-party licence cost increase, whichever is higher. Such increases apply even if the Organisation cannot pass them through to end customers.",
        ),
        note("Organisation allows max 3% ICT index / mirrored pass-through only.", accent),
        h2("6. Governing law"),
        p("Finland."),
        new Paragraph({ spacing: { before: 400 }, children: [] }),
        p("Signed for demo purposes:", { italics: true }),
        p("NordicCare Soft Oy — Offer Manager", { bold: true }),
        p("Date: 2026-03-01"),
      ],
    }),
  );

  await writeDoc(
    `${base}/02-appendix-5-service-levels.docx`,
    docShell({
      title: "NordicCare Soft Oy",
      subtitle: "Appendix 5 — Service Levels",
      accent,
      children: [
        h1("SUPPLIER APPENDIX 5 — SERVICE LEVELS", accent),
        meta("Bidder", "NordicCare Soft Oy"),
        meta("Service", "PathLynx (proposed for CareFlow scope)"),
        new Paragraph({ spacing: { after: 200 }, children: [] }),
        table(
          ["Service", "Offered level", "Availability", "Sev-1 response", "Sev-1 resolve"],
          [
            ["PathLynx / CareFlow scope", "V1", "99.5% monthly", "2 hours", "8 hours"],
            ["Identity Bridge (if ordered)", "V1", "99.5% monthly", "4 hours", "24 hours"],
          ],
          accent,
        ),
        h2("V1 definition (Supplier)"),
        p("• Planned maintenance: up to 8 hours / month, may include weekday evenings"),
        p("• RPO: 4 hours | RTO: 12 hours"),
        p("• No 99.9% commitment"),
        note(
          "Organisation requires CareFlow at Service Level V2. Supplier offers V1 only → SLA level comparison = CRITICAL.",
          accent,
        ),
      ],
    }),
  );

  await writeDoc(
    `${base}/03-dpa-response.docx`,
    docShell({
      title: "NordicCare Soft Oy",
      subtitle: "Data Processing Response",
      accent,
      children: [
        h1("SUPPLIER DATA PROCESSING RESPONSE", accent),
        meta("Bidder", "NordicCare Soft Oy"),
        h2("1. Systems covered by this DPA response"),
        p("• Identity Bridge connector (optional)"),
        p("• Generic hosting telemetry platform"),
        h2("2. CareFlow / PathLynx clinical processing"),
        p(
          "Not included in this DPA annex at offer stage. A separate DPA will be “discussed after award” if requested by the Organisation.",
        ),
        note(
          "Organisation Appendix 1.2.1 lists CareFlow processing of health data. This bidder pack omits CareFlow from the DPA description → DPA appendix presence = CRITICAL.",
          accent,
        ),
        h2("3. Location"),
        p("Primary processing in EU; disaster-recovery copy may be stored in the United Kingdom without prior approval workflow."),
        h2("4. Breach notification"),
        p("Supplier will notify “without undue delay”, target five (5) business days."),
      ],
    }),
  );

  await writeDoc(
    `${base}/04-price-schedule.docx`,
    docShell({
      title: "NordicCare Soft Oy",
      subtitle: "Price Schedule",
      accent,
      children: [
        h1("SUPPLIER PRICE SCHEDULE", accent),
        meta("Bidder", "NordicCare Soft Oy"),
        meta("Currency", "EUR"),
        new Paragraph({ spacing: { after: 200 }, children: [] }),
        table(
          ["SKU", "Description", "Unit", "Monthly unit price"],
          [
            ["PL-BASE", "PathLynx platform (prod)", "environment", "12,500"],
            ["PL-USER", "Named clinical user", "user", "48"],
            ["PL-API", "API bundle (1M calls)", "bundle", "1,200"],
          ],
          accent,
        ),
        p("Systems listed: PathLynx platform only. Identity Bridge: “quoted on request” (not itemised).", {
          before: 200,
        }),
        p("Price adjustment clause (see Main Agreement §5): up to 8% / year or full third-party pass-through."),
        note(
          "Pricing exists for the offered platform under PathLynx naming. Main commercial risk is the adjustment mechanism vs Organisation 3% / mirrored pass-through.",
          accent,
        ),
      ],
    }),
  );

  await writeDoc(
    `${base}/05-infosec-statement.docx`,
    docShell({
      title: "NordicCare Soft Oy",
      subtitle: "Information Security Statement",
      accent,
      children: [
        h1("INFORMATION SECURITY STATEMENT", accent),
        meta("Bidder", "NordicCare Soft Oy"),
        h2("1. Certification status"),
        p(
          "The Supplier is “working toward” ISO/IEC 27001. Certification is planned within 18 months of contract signature. No current ISO 27001 or SOC 2 Type II report is attached.",
        ),
        h2("2. Encryption"),
        p("TLS 1.2+ in transit. At-rest encryption “where supported by the hosting provider”."),
        h2("3. Incident / personal data breach notification"),
        p("Target notification window: five (5) business days after confirmed incident."),
        h2("4. Sub-processors"),
        p("List available on request after NDA. Not attached to this offer ZIP."),
        h2("5. Penetration testing"),
        p("Last external test: more than 24 months ago; summary not attached."),
        note(
          "Missing mandatory ISO 27001 (or equivalent), weak incident timeline, incomplete sub-processor disclosure → Information security baseline = CRITICAL / WARNING.",
          accent,
        ),
      ],
    }),
  );
}

async function bidderAligned() {
  const accent = COLORS.bidderOk;
  const base = "bidder-b-aligned";

  await writeDoc(
    `${base}/01-main-agreement-offer.docx`,
    docShell({
      title: "Aurora Health Systems Oy",
      subtitle: "Supplier Main Offer (Aligned)",
      accent,
      children: [
        h1("SUPPLIER MAIN AGREEMENT / OFFER", accent),
        meta("Bidder", "Aurora Health Systems Oy (“Supplier”)"),
        meta("Procurement", "2M-IT / 2026 / CAREFlow-01"),
        meta("Offered service", "CareFlow"),
        h2("1. Acceptance"),
        p(
          "Aurora Health Systems Oy accepts the Draft Framework Agreement and Appendices 1.1, 1.2, 2 and 5 without material deviation, except as expressly listed as clarifications (none material).",
        ),
        h2("2. Termination for convenience — notice period"),
        p(
          "Either party may terminate for convenience with twelve (12) months’ prior written notice, aligned with Organisation Appendix 2.",
        ),
        h2("3. Service levels"),
        p(
          "CareFlow shall be delivered at Service Level V2 as defined in Organisation Appendix 1.1 and mirrored in Supplier Appendix 5.",
        ),
        h2("4. Price adjustments"),
        p(
          "Annual ICT index adjustment max 3%. Third-party licence pass-through only when the Organisation can pass the same increase to the end customer under Appendix 5.",
        ),
        h2("5. Governing law"),
        p("Finland."),
        new Paragraph({ spacing: { before: 400 }, children: [] }),
        p("Signed for demo purposes:", { italics: true }),
        p("Aurora Health Systems Oy — Bid Lead", { bold: true }),
        p("Date: 2026-03-02"),
      ],
    }),
  );

  await writeDoc(
    `${base}/02-appendix-5-service-levels.docx`,
    docShell({
      title: "Aurora Health Systems Oy",
      subtitle: "Appendix 5 — Service Levels",
      accent,
      children: [
        h1("SUPPLIER APPENDIX 5 — SERVICE LEVELS", accent),
        meta("Bidder", "Aurora Health Systems Oy"),
        new Paragraph({ spacing: { after: 200 }, children: [] }),
        table(
          ["Service", "Offered level", "Availability", "Sev-1 response", "Sev-1 resolve"],
          [
            ["CareFlow", "V2", "99.9% monthly", "30 minutes", "4 hours"],
            ["Identity Bridge", "V1", "99.5% monthly", "4 hours", "24 hours"],
          ],
          accent,
        ),
        p("CareFlow V2 matches Organisation Appendix 1.1 (RPO 1h, RTO 4h, maintenance outside 07:00–18:00 EET).", {
          before: 200,
        }),
      ],
    }),
  );

  await writeDoc(
    `${base}/03-dpa-response.docx`,
    docShell({
      title: "Aurora Health Systems Oy",
      subtitle: "DPA / Processing Response",
      accent,
      children: [
        h1("SUPPLIER DPA / PROCESSING RESPONSE", accent),
        meta("Bidder", "Aurora Health Systems Oy"),
        h2("1.2.1 CareFlow — Personal data processing description"),
        p("Purpose: Provision of CareFlow clinical pathway software, support, and hosting."),
        p("Data subjects: Patients/clients; healthcare professionals; administrators."),
        p("Data: Identification, contact, health/care data (special category), audit logs."),
        p("Location: EEA only; no UK/US transfer without prior written approval + SCCs/TIA."),
        p("Breach notification: within twenty-four (24) hours of becoming aware."),
        p(
          "Sub-processors: Initial list — EU hosting provider + EU email relay; changes require Organisation approval.",
        ),
        p("CareFlow is explicitly covered by this DPA response (aligned with Organisation Appendix 1.2.1).", {
          bold: true,
          before: 200,
        }),
      ],
    }),
  );

  await writeDoc(
    `${base}/04-price-schedule.docx`,
    docShell({
      title: "Aurora Health Systems Oy",
      subtitle: "Price Schedule",
      accent,
      children: [
        h1("SUPPLIER PRICE SCHEDULE", accent),
        meta("Bidder", "Aurora Health Systems Oy"),
        meta("Currency", "EUR"),
        new Paragraph({ spacing: { after: 200 }, children: [] }),
        table(
          ["SKU", "Description", "Unit", "Monthly unit price"],
          [
            ["CF-BASE", "CareFlow platform (prod)", "environment", "11,800"],
            ["CF-USER", "Named clinical user", "user", "45"],
            ["CF-API", "Integration / API bundle", "bundle", "1,050"],
            ["CF-SUP", "Support uplift for Service Level V2", "environment", "included in CF-BASE"],
            ["IB-BASE", "Identity Bridge connector", "environment", "900"],
          ],
          accent,
        ),
        p("CareFlow is listed in Appendix 5 pricing structure.", { before: 200 }),
        p("Price adjustment: ICT index max 3% / year; mirrored third-party pass-through only."),
      ],
    }),
  );

  await writeDoc(
    `${base}/05-infosec-statement.docx`,
    docShell({
      title: "Aurora Health Systems Oy",
      subtitle: "Information Security Statement",
      accent,
      children: [
        h1("INFORMATION SECURITY STATEMENT", accent),
        meta("Bidder", "Aurora Health Systems Oy"),
        h2("1. Certification"),
        p(
          "ISO/IEC 27001 certified (certificate ID DEMO-ISO-27001-2025). SOC 2 Type II report available under NDA within five business days.",
        ),
        h2("2. Encryption"),
        p("TLS 1.3 in transit; AES-256 at rest for all CareFlow data stores."),
        h2("3. Incident / personal data breach notification"),
        p("Without undue delay and in any event within twenty-four (24) hours of becoming aware."),
        h2("4. Sub-processors"),
        p("Disclosed in DPA response; material changes require prior written approval."),
        h2("5. Penetration testing"),
        p("Annual independent penetration test; executive summary available under NDA."),
        p("Aligned with Organisation Framework Agreement information-security minimum.", {
          bold: true,
          before: 200,
        }),
      ],
    }),
  );
}

async function main() {
  await fs.rm(outRoot, { recursive: true, force: true });
  await fs.mkdir(outRoot, { recursive: true });
  await tenderPack();
  await bidderWeak();
  await bidderAligned();

  // Zip packs
  const { execSync } = await import("node:child_process");
  for (const dir of ["tender", "bidder-a-weak", "bidder-b-aligned"]) {
    const zipPath = path.join(outRoot, `${dir}.zip`);
    execSync(`cd "${path.join(outRoot, dir)}" && zip -q "${zipPath}" *.docx`);
    console.log("zipped", `${dir}.zip`);
  }

  // Copy to Desktop materials folder
  const dest = "/Users/svm648/Desktop/2M-IT materials/Clause-demo-samples-docx";
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(dest, { recursive: true });
  execSync(`cp -R "${outRoot}/"* "${dest}/"`);
  console.log("copied to", dest);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
