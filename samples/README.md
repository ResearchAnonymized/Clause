# Demo documents — CareFlow tender pack

Sample Finnish / EU-style procurement documents for Clause demos.

Service under review: **CareFlow** (clinical pathway SaaS for wellbeing services counties).

## Packs

### Text (.txt) — quick ingest

| Path | Role | Intent |
|------|------|--------|
| `tender/` or `tender.zip` | Customer / tender baseline | 2M-IT requirements (SLA V2, 12-month notice, DPA, pricing, ISO 27001) |
| `bidder-a-weak/` or `bidder-a-weak.zip` | Bidder response | **Intentional gaps** — best for live demo |
| `bidder-b-aligned/` or `bidder-b-aligned.zip` | Stronger bidder | Mostly aligned — use for “Many bidders” contrast |

### Word (.docx) — properly formatted

| Path | Role |
|------|------|
| `docx/tender.zip` | Formatted tender pack (headers, tables, demo notes) |
| `docx/bidder-a-weak.zip` | Formatted weak bidder offer |
| `docx/bidder-b-aligned.zip` | Formatted aligned bidder offer |

Regenerate Word packs:

```bash
node scripts/generate-sample-docx.mjs
```

## How to run in Clause

1. Open **New analysis → Tender pack**
2. Tender side: drop `tender.zip` (or all files in `tender/`)
3. Bidder side: drop `bidder-a-weak.zip`
4. Confirm the **pack register** preview (folder paths + document types)
5. Criteria set: **Welfare Region Default**
6. Start analysis
7. On the run page use the header modes:
   - **Documents** — browse the ZIP register and read each file
   - **Compare** — tender vs bidder side-by-side (mapped annex buttons)
   - **Findings** — agent verdicts with evidence file viewer

Optional: **Many bidders** with the same tender + both ZIPs to compare weak vs aligned.

## Expected findings (Bidder A — weak)

| Criterion | Expected direction |
|-----------|-------------------|
| SLA existence | CareFlow present on tender side → usually OK / context OK |
| SLA level comparison | Tender **V2** vs bidder **V1** → **critical** |
| Notice period alignment | Tender **12 months** vs bidder **18 months** → **critical** |
| DPA appendix presence | CareFlow missing from bidder DPA → **critical** |
| Pricing appendix presence | Platform priced (PathLynx naming) — may be OK or naming risk |
| Price adjustment mechanism | Bidder 8% / unlimited pass-through vs 3% mirrored → **critical/warning** |
| Information security baseline | No ISO 27001, 5-day breach notice → **critical/warning** |

Bidder B should score clearly better on SLA, notice, DPA, and infosec.

## Notes

- Files are `.txt` so they ingest reliably without Word/PDF tooling.
- Content is **fictional demo data**, not a real Hilma tender.
- ZIPs are regenerated from the folders if you edit the texts:

```bash
cd samples
(cd tender && zip -q ../tender.zip *.txt)
(cd bidder-a-weak && zip -q ../bidder-a-weak.zip *.txt)
(cd bidder-b-aligned && zip -q ../bidder-b-aligned.zip *.txt)
```
