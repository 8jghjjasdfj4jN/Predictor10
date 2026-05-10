# Predictor10 — handoff prompt for a new chat

> Save this file. Copy everything below the `---` line into a fresh Claude chat. Upload the latest Predictor10 zip alongside it.

---

# Predictor10 build — portal UI completion + backend wiring

I'm a solo developer building Predictor10, a UK football score-prediction pool betting product. 3-person business forming around it. Targeting UKGC general pool betting licence (likely 2027 grant). **Build the real flow, mock the money** — payments table has `mode='mock'` until licence flip, then becomes `'live'`. Same code paths flip; no rewrites.

## Stack
React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui frontend · Express on Render · Postgres + Drizzle ORM · Resend for email · football-data.org for fixtures · Wouter for routing · No Redis/queue — Render Cron Jobs handle settlement.

## Already done
- Public marketing pages, SVG logo, auth pages (`LoginPage`, `RegisterPage`, `AuthShell`)
- Full Drizzle schema in `/server/db/schema/` — users, leagues (= tiers), sports, pools, payments, compliance, licensed (dormant tables for post-licence)
- Render Postgres provisioned · `DATABASE_URL`, `FOOTBALL_API_KEY` already in Render env · local `.env` configured for Drizzle
- Three docs in `/docs/`:
  1. **`portal-architecture.md`** — design canon. Read this first.
  2. **`roadmap.md`** — week-by-week build plan.
  3. **`pre-launch.md`** — launch readiness checklist.
- Five canonical screens designed and approved (top tabs Variant B for predict, archive section for settled rounds, etc.). All decisions captured as numbered Decided Rules in arch doc Section 13.

## What I want from this chat

**Two-phase scope, will likely span several chats. This is the start.**

### Phase 1 — Build all post-login portal screens in React (mock data initially)
Match the wireframes in `portal-architecture.md` Section 8. Components in `/client/src/components/predictor10/`. shadcn primitives. No inline `style={}` (the existing `Dashboard.tsx` uses inline styles — that gets refactored out as part of this work).

**Build order:**
1. Top bar + bottom 4-tab nav (Home / Predict / Pools / Account) in `AppShell.tsx`
2. Home (arch §8.1) — live entries + available tiers
3. Pools landing (§8.3) and Pools by competition (§8.4)
4. **Pool detail / Predict CANONICAL (§8.5)** — Variant B refined: GW tabs, default to current GW, all matches shown without truncation, four match-row states (finished / saved-locked / half-saved / editable), day groupers within GWs, auto-save footer, late-entry warning modal
5. League Table (§8.6)
6. History archive (§8.8)
7. Account (§8.7) + Responsible Gambling (§8.9)

Match the dark theme + emerald accent (`#070f09` bg, `#34d379` accent, Manrope body, Barlow Condensed display) from the existing `Dashboard.tsx`.

### Phase 2 — Wire backend per roadmap Weeks 1-4
- Install Drizzle deps · `server/db/index.ts` · first migration (`drizzle-kit generate` then `push`)
- Real auth endpoints (signup, login, logout, me, verify-email) · session middleware (HTTP-only cookie) · audit log middleware
- Pool entry endpoint with mock-payment + late-entry 7-day window · per-match prediction lock at kickoff -1hr · auto-save endpoint
- Settlement worker (Render Cron Job, 5min cadence)
- Replace UI mock data with real API calls

## Decisions already made — DO NOT relitigate

These are settled. The arch doc has the full list (Decided Rules §13). Highlights:
- Round = 4-5 GW tournament block. PL has 9 Rounds (4-4-4-4-4-4-4-5-5 GWs). Champ has 9 Rounds (5-5-5-5-5-5-5-5-6 MDs).
- One stake per Round covers all matches in it.
- Late entry allowed for 7 days after Round opens, with explicit warning modal.
- Predictions lock 1 hour before each match's individual kickoff. Server rejects predictions for already-played matches with HTTP 403.
- Tie-breaker: pts → exact-score count → correct-result count → split.
- 5 tiers: The Pound (£1), The Fiver (£5), The Tenner (£10), The Pony (£25), The Big One (£50). All visible from day one.
- Multi-entry: one entry per pool, but multiple tiers and multiple competitions concurrent OK.
- MVP competitions: Premier League + EFL Championship. World Cup and League One out of scope.
- Settled pools archive immediately to `/account/history`, off active surfaces.
- Combined Pool/Predict screen on one URL: `/pools/:competitionSlug/:poolId`.
- Prize structure (% splits, operator commission): TBD — defer until pre-launch.

## My working style
- **File deliverables in a table:**
  | File | Path | Action |
  |---|---|---|
  | `Foo.tsx` | `client/src/pages/` | REPLACES existing |
- Direct. Concrete. No long explanations or feature rationales.
- Recommend, don't menu — only offer 2-3 options if a real tradeoff exists.
- No emoji unless I use them first. No mid-sentence bolding.
- If something's risky, one-sentence flag, then proceed.
- I'm not deeply technical with backend ops (terminal, env files, Postgres CLI). Brief explanation when commands are needed.
- I push back when designs feel wrong. Take it, fix it, no defending.

## What to do first
1. Ask me to upload the Predictor10 zip
2. Read all three docs in `/docs/` (architecture first)
3. Propose your first batch of file deliverables for Phase 1 step 1 (top bar + bottom nav refactor) — show me the files in tabular form
4. Wait for me to say "go" before bulk-changing files

Don't ask 5 clarifying questions before starting. Read the docs, make a recommendation, I'll push back if it's wrong.
