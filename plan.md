# Utah Grant Outreach Agent — Implementation Plan

## Problem & Fit

Built for the "Government Opportunity Finder" hackathon brief: help startups discover federal
funding without navigating agency-organized bureaucracy. Our angle is proactive, not
search-driven — an agent watches new Utah business registrations, matches each one against
federal grant/R&D programs, and reaches out directly with a short list of relevant
opportunities plus a mostly-drafted application for the best fit.

Rubric fit:
- **Usefulness (30%)** — proactive outreach removes the "founder has to know to look" problem entirely.
- **Matching Quality (25%)** — covered by the discovery pipeline across all four recommended sources.
- **Intelligence (20%)** — pre-filled SBIR/STTR draft is the differentiator beyond keyword search.
- **UX (15%)** — one email → one personalized dashboard → one reviewable draft.
- **Technical Execution (10%)** — kept narrow on purpose (see Scope below) to stay a working prototype rather than a half-built platform.

## Tech Stack

**Next.js (TypeScript) + Postgres + Resend, deployed on Vercel.**

- **Next.js** — API routes / server actions handle ingestion, enrichment, matching, and autofill logic; React pages serve both the initial internal views and the per-business tokenized dashboard. One framework, one deploy, team already knows it — the right call for a 1-day build.
- **Postgres** (Supabase or Neon) — stores `Business` records, match results, enrichment status (found vs. still-missing per field), and draft applications.
- **Resend** — transactional email for the outreach send (test inbox / opt-in list per Scope Decision 1); handles sender identity, physical address footer, opt-out link.
- **Vercel Cron** — triggers the Opportunity sync job on a schedule (business ingestion is a one-time seed, not scheduled — see Scope Decision 3).
- **Anthropic API** — LLM calls for: translating business description → funding categories (matching), generating per-match reasoning (explanation layer), and drafting SBIR/STTR field content (autofill).
- **Scraping** — server-side `fetch` + HTML parsing (e.g. Cheerio) for the web enrichment step; scoped to static page fetches to stay within serverless function time limits, not a headless browser.

**Data storage budget (Supabase free tier = 500 MB):** Grants.gov (~2,000-2,500 open opportunities) + SAM.gov Assistance Listings (~2,300 listings) + SBIR.gov (active solicitation topics), normalized and cached locally, come to roughly 50-80 MB total — well within budget. USAspending.gov is excluded from this cache: it's transaction-level historical data at a scale meant for bulk analytics (gigabytes-to-terabytes at the source), so it stays a **live, targeted query** (e.g. "similar funded companies" for one matched opportunity, fetched on demand when a dashboard loads) rather than something the sync job pulls wholesale.

## Scope Decisions (locked in)

1. **Live demo send is simulated, not a real blast.** Full pipeline runs on a seeded set of
   real Utah businesses (see Scope Decision 3) and real grant sources. The final "send" step demos live to a
   test inbox / a small opt-in list, not 100-200 unconsented real founders. Rationale: CAN-SPAM
   likely doesn't bind a state agency's public-interest email, but whether the registration
   email on file is public or GRAMA-protected hasn't been confirmed — that's a legal check, not
   a same-day build item. Production rollout is a documented next step, not part of the hackathon
   build.
2. **Autofill goes deep on one program: SBIR/STTR.** Most structured fields of any program
   (company info, NAICS, technical abstract, eligibility), and the best fit for the brief's
   AI/tech-heavy test cases. Other matched grants are shown with reasoning but not auto-filled —
   this keeps hallucination risk contained to a single well-scoped form.
3. **Data source: hand-curated seed dataset of real Utah businesses**, not a live crawl.
   Every self-serve option was tried and ruled out: Utah's `opendata.utah.gov` (which
   previously hosted a queryable Socrata "Businesses" dataset) has been decommissioned; the
   state's live tools (`commerce.utah.gov/corporations`, `businessregistration.utah.gov`) are
   form-based search UIs with no API, and `businessregistration.utah.gov` actively blocks
   unauthenticated automated requests (403); OpenCorporates' free tier requires manually
   contacting them for a token; and SAM.gov's Entity Management API requires the requester to
   already be associated with a registered entity to obtain a personal API key — a dead end for
   an unaffiliated builder. Given three dead ends inside a one-day build, ingestion is seeded
   instead of live: `prisma/seed-data.ts` lists ~25 real, publicly known Utah businesses
   (Qualtrics, Podium, Weave, Domo, Owlet, etc.), loaded via `npm run seed`
   (`prisma/seed.ts`, upserts on a slugified name as `externalId`). The rest of the pipeline
   (enrichment, matching, explanation, outreach, dashboard) is unaffected — it operates on
   `Business` rows regardless of how they got there. Framing shifts accordingly: the pitch is
   "matches against a seeded set of real Utah businesses," not "watches new registrations
   live" — the live-crawl version is a documented next step, not part of the hackathon build.
   `src/lib/sam.ts` and `/api/ingest` are left in place as that future path, gated behind a
   `SAM_GOV_API_KEY` that isn't required for the demo.

## Pipeline

```
Grants.gov, SAM.gov Assistance Listings, SBIR.gov                    prisma/seed-data.ts
        │  (scheduled sync, independent of any business)     (~25 real Utah businesses)
        ▼                                                              │
[0] Opportunity Sync — pulls current open opportunities from all       │
        three sources on a schedule (e.g. every few hours via          │
        Vercel Cron); normalizes into one local `Opportunity`          │
        table. USAspending.gov is NOT synced here — it's too           │
        large to cache (see Data storage budget above); queried        │
        live and on demand instead, only when a specific matched       ▼
        opportunity needs "similar funded companies" context.   [1] Ingest — `npm run seed`
                                                                  upserts the seed list into
                                                                  `Business`, deduped on a
                                                                  slugified name
                                                                  (Business.externalId)
                                                                         │
                                                                         ▼
                                                                  [2] Web Enrichment — scrape
                                                                  business website (if
                                                                  findable) + public signals
                                                                  for: product/tech
                                                                  description, rough
                                                                  industry/NAICS, employee
                                                                  count signal, funding
                                                                  history signal; record
                                                                  found vs. still missing
                                                                         │
        ┌────────────────────────────────────────────────────────────┘
        ▼
[3] Matching Engine  — score the business against the locally cached `Opportunity` table
        │              (not live API calls) using whatever criteria are available so far;
        │              translate business description → funding categories; score + rank;
        │              drop poor fits rather than force a match (explicit anti-hallucination
        │              rule); pulls USAspending.gov live, on demand, for supporting context
        │              on top candidates only
        ▼
[4] Explanation Layer — for each of the top 3 matches, generate plain-language reasoning:
        │                why it fits, eligibility caveats, next steps
        ▼
[5] Outreach          — templated/personalized email with the 3 matches + a link to a
        │               per-business dashboard (signed/expiring token, no login required)
        ▼
[6] Founder Enrichment — dashboard surfaces a short form for exactly the fields web enrichment
        │                couldn't find (see Founder-provided row below); framed as "answer a
        │                few questions to refine your matches and finish your application"
        ▼
[7] Dashboard          — shows the 3 matches with reasoning, refined once founder answers land;
        │                for the top SBIR/STTR-eligible match, shows a pre-filled draft application
        ▼
[8] SBIR/STTR Autofill — maps web-enriched + founder-provided data + matched program
                          requirements into the SBIR/STTR application fields; every field
                          flagged as AI-drafted/unreviewed; explicit "verify before submitting"
                          banner; no auto-submission — founder reviews and exports/copies it
                          themselves
```

**Enrichment source map** (which step is expected to supply which field):

| Field | Source |
|---|---|
| Entity type, address, filing date | [1] Ingest (filing record) |
| Product/tech description, rough industry/NAICS, employee count signal, funding history signal | [2] Web Enrichment |
| Exact revenue, capital need/amount, US ownership %, ownership demographics, PI primary employment, prior SBIR/STTR award history | [6] Founder Enrichment (not reliably public — self-reported only) |

If web enrichment finds nothing usable (no website, no public presence), matching in step 3 falls back to filing-record fields only and the founder-enrichment ask in step 6 grows to cover the gap — the form should be built to ask only for what's actually still missing, not a fixed fifteen-field questionnaire.

## Components to Build

1. **Opportunity sync job** — scheduled (Vercel Cron), pulls current open opportunities from
   Grants.gov, SAM.gov Assistance Listings, and SBIR.gov; normalizes into one `Opportunity`
   table, independent of any business. Does not touch USAspending.gov (see Data storage budget).
2. **Ingestion (seed script)** — `npm run seed` (`prisma/seed.ts`) upserts the ~25 real Utah
   businesses in `prisma/seed-data.ts` into `Business` (name, entity type, address), keyed on
   `(source, externalId)` with a slugified name as `externalId` so re-runs don't duplicate.
   Seeded records don't include contact emails, so `filingContactEmail` stays null — email
   discovery happens in web enrichment. `src/lib/sam.ts` + `/api/ingest` (SAM.gov Entity
   Management API) remain as a documented future live-ingestion path, not used in the demo —
   see Scope Decision 3.
3. **Web enrichment service** — given a business name/address, attempts to locate a
   website and public profile; scrapes/extracts product description, industry signal,
   employee count signal, funding history signal; tags each field found/not-found so
   downstream steps know what's still missing.
4. **Matching service** — LLM-driven scoring step that maps free-text business description
   → funding categories and ranks against the locally cached `Opportunity` table (no live
   calls to Grants.gov/SAM.gov/SBIR.gov at match time); explicit low-confidence cutoff so
   poor fits are dropped instead of surfaced; re-runnable once founder-provided fields
   arrive; a thin USAspending.gov client is called live, on demand, only to pull "similar
   funded companies" context for a business's top candidate match.
5. **Explanation generator** — LLM call producing the "why this fits" + caveats text per match, grounded in the actual program eligibility text (not free-floating claims).
6. **Email sender** — transactional email (test inbox / opt-in list only per Scope Decision 1); includes real sender identity, physical address line, opt-out link even though not strictly required.
7. **Dashboard (per-business, tokenized link)** — simple web view: 3 matches, reasoning, a founder-enrichment form scoped to only the still-missing fields, and the SBIR/STTR draft when applicable.
8. **SBIR/STTR autofill** — field-by-field mapping from `Business` (web + founder enriched) + matched program data into the application's structured fields; unreviewed/draft state is persistent until a human explicitly marks it reviewed.
9. **"Try it yourself" interactive entry point** — a public page with a text box where anyone
   (a judge, a founder not yet in the Utah registry) describes their company in natural
   language; routes through the same matching → explanation → autofill pipeline as the
   proactive flow, just skipping ingestion/scraping and using the typed description as the
   profile directly. Covers the brief's core "What to Build" item #1 (natural-language
   startup understanding) and gives judges a live, hands-on moment instead of only a
   walkthrough of pre-ingested businesses — also a fallback if the live Utah-data pull hits
   an issue during the demo.

## Test Cases

Reuse the five hypothetical startups from the brief (AI healthcare, advanced manufacturing,
climate/water tech, cybersecurity, consumer/workforce tech) as fixtures to validate the
matching engine before/alongside real Utah registration data — lets us sanity-check matching
quality independent of how much real data lands in time.

## Demo Script

Runs live, in this order. Everything shown is the real pipeline against real data (Utah
Division of Corporations, real opportunity sources) except the actual outbound send, which
goes to a controlled inbox/opt-in list per Scope Decision 1 — say that out loud rather than
letting it pass as ambiguous.

1. **Set up the problem (30 sec).** Billions in federal funding, organized by agency and
   bureaucratic category instead of by startup need. Most teams here will build a better
   search box. We built something that doesn't wait to be asked.
2. **Show the real ingestion feed.** Pull up the list of businesses the system actually
   ingested from Utah's live registration data — real names, real filing dates, timestamped
   recently. Establishes this isn't a fabricated dataset.
3. **Wow #1 — the email.** Open a real inbox and show the personalized outreach email that
   went out for one of those real businesses: their name, 3 tailored matches, one-line
   reasoning for each. This is the moment that lands "the state reached out to me" instead
   of "I had to go find this."
4. **Click through to the dashboard.** Tokenized link, no login — lands directly on that
   business's 3 matches with full reasoning and eligibility caveats.
5. **Wow #2 — the pre-filled application.** Open the SBIR/STTR draft for the top match and
   scroll through real filled fields (company info, NAICS, technical abstract, eligibility)
   pulled from web enrichment — clearly marked AI-drafted/unreviewed. This is the "beyond a
   links list" moment: a founder is minutes from submitting, not hours from starting.
6. **Wow #3 — live interactivity.** Hand the keyboard to a judge. They type a company
   description (their own, or one of the brief's 5 test-case startups) into the "try it
   yourself" entry point and watch real matches + reasoning generate live. Proves it's a
   working system, not a scripted walkthrough, and directly answers the brief's own test
   cases in front of the people grading against them.
7. **Wow #4 — restraint, not just reach.** Show one deliberately weak-fit business getting an
   honest "no strong matches" result instead of a forced recommendation. Directly
   demonstrates the brief's explicit anti-hallucination requirement — most competing chatbot
   entries will not think to show this.
8. **Close on scale + what's next.** State the real ingestion count for the day (target:
   100-200 real Utah businesses processed end-to-end, even though only a controlled subset
   was actually emailed), then one sentence on the production path (GRAMA/legal review before
   any real send) — signals this was scoped deliberately, not left unfinished.

**Wow-moment priority for build time:** if something has to slip under time pressure, protect
#3 (pre-filled application) and #6 (live interactivity) first — they're the two moments a
chatbot-style competing entry structurally cannot produce, and they map directly onto
Intelligence (20%) and Usefulness (30%), the two highest-weighted criteria after Matching
Quality.

## Explicitly Out of Scope (for the hackathon build)

- Real unsolicited email at volume to real businesses (blocked on GRAMA/legal review).
- Auto-submission of applications to any government portal.
- Autofill for programs other than SBIR/STTR.
- Authentication/accounts for the dashboard (tokenized links only).

## Production Follow-ups (post-hackathon, not built now)

- Confirm GRAMA classification of registration contact emails with GOED legal before any real send.
- Formal CAN-SPAM-style compliance pass (sender ID, opt-out, physical address) even if not strictly required.
- Expand autofill beyond SBIR/STTR once the pattern is validated.
- Human-in-the-loop review queue before any email actually leaves the system in production.
