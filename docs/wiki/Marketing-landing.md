# Change: marketing landing (8 Nov 2026)

**Status:** Homepage only. Analysis, auth, storage, and deploy are not touched.  
**Why:** The public page was shouty Title Case and a static navy block. Readers should feel the product in a few seconds: two packs, specialists, a cited gap.

GitHub: this note is the product record for [ResearchAnonymized/Clause](https://github.com/ResearchAnonymized/Clause). The repo README opens with the same story. Live check: open `/` (local `http://localhost:3000`, production `https://usecounterpart.com` after this image is shipped).

## What changed

1. **Hero** — Sentence-case headline (“See the gaps / *that matter.*”). Customer pack left, supplier pack right. Cream italic accent on navy. Request access and See how it works stay the same routes (`/request`, `#how`).
2. **Motion that explains the product** (skipped when `prefers-reduced-motion`):
   - Headline, lead, and CTAs stagger in.
   - Soft colour orbs and a slow grid; the review card floats.
   - Live-agents card: packs pulse into the orchestrator, a spark travels to the active specialist, the finding and 99.9 vs 99.0 swap in.
   - How-it-works files and agent pills appear one by one; cards lift on hover.
   - Mapping coverage bar fills; the critical side of the pair is marked.
   - Closing navy band reuses the same orbs; the primary arrow nudges.
3. **Surface** — Marketing stays navy + cream even if the app theme is dark (`.landing-page` resets tokens). App pages after sign-in are unchanged.
4. **Languages** — EN/FI/SV follow the same customer / supplier wording.
5. **README** — Product story + mermaid at the top; operator Stack / Quick start / Testing kept below. No in-app `/wiki` route.

Playwright still matches `/gaps/i` on the H1 and the CounterPart mark.

## What did not change

Scoring, agents, prompts, sessions, People desk, sample packs, analysis workspace. Theme toggle still writes `clause.theme`; it does not restyle this marketing page.

## How to check

- `/` — headline, live-agents card cycling, Request access → `/request`.
- Scroll How it works → mapping → review board → closing CTA.
- OS “Reduce motion”: no float, no sparks, no stagger (content still there).
- `pnpm test` (unit). `pnpm test:e2e` landing smoke.

## Out of this change

New photography, video, or a separate marketing site. This is still the TanStack Start `/` route. Production image is not this landing until you ask to ship it.
