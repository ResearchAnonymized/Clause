# Change: service-manager path (2M-IT, 8 Nov 2026)

**Status:** One UI change. Analysis engine, auth, storage, and deploy are not touched.  
**Why:** 28 Oct 2M-IT trial — people could upload and get findings, then got lost (English New analysis, no colour legend, too many tabs). GENT summary is context only; this change is the meeting-note path.

## What changed

1. **New analysis** is translated (EN / FI / SV). Left = customer pack, right = supplier pack. Size-limit toasts explain 20 MB / 50 MB and say to start small. Upload, unpack, and start-analysis logic is unchanged. English button labels stay `New analysis` / `Start analysis` / `Load sample packs` so Playwright still matches.
2. **Analysis is still the home view.** Findings list shows a colour legend: Critical (red) / Partial (amber) / Meets (green). Topic headings (termination, SLA, security, DPA, pricing) use the UI language. Click a finding → clause on the right (already built; now labelled).
3. **Help** is a one-page service-manager guide in the same three languages. Stale LangGraph / LiteLLM / RLS copy is removed. Product tour and “Replay getting started” stay.
4. **Verdict badge** for a critical finding says Critical / Kriittinen / Kritisk instead of Gap / Puute, so red items match what testers asked for.

## What did not change

- Scoring, agents, prompts, file caps, ZIP unpack, database, sessions, People desk, production compose.
- Default language remains browser/localStorage (`clause.lang`). We do not force Finnish (would break English e2e and existing users).

## How to check nothing broke

- Sign in → Dashboard → New analysis → Load sample packs → Start analysis (English UI).
- Open an existing completed run: findings + document side-by-side, colours visible.
- Switch language to Suomi: New analysis and Help and colour legend in Finnish; start still works.
- `pnpm test` (unit). Do not run a live analysis unless you mean to.

## Out of this change

Anonymiser, large-pack performance, measuring hours saved, extra AI assistant, 2M-IT’s own cluster.
