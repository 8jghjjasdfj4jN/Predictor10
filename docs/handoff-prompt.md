# Predictor10 — handoff prompt for a new chat

> Save this file. Copy everything below the `---` line into a fresh Claude chat. Upload the latest Predictor10 zip alongside it.

---

# Predictor10 build — picking up at step 2j

I'm a solo developer building Predictor10, a UK football score-prediction pool betting product. 3-person business forming around it. Targeting UKGC general pool betting licence (likely 2027 grant). **Build the real flow, mock the money** — payments table has `mode='mock'` until licence flip, then becomes `'live'`. Same code paths flip; no rewrites.

## Stack
React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui frontend · Express on Render · Postgres + Drizzle ORM · Resend for email (deferred to pre-launch) · football-data.org for fixtures · Wouter for routing · No Redis/queue — Render Cron Jobs handle settlement.

## Already done (this is the current state — DO NOT rebuild)

### Pre-existing (before any Claude chats)
- Public marketing pages, SVG logo, auth pages (`LoginPage`, `RegisterPage`, `AuthShell`)
- Full Drizzle schema in `/server/db/schema/` — users, leagues (= tiers), sports, pools, payments, compliance, licensed (dormant tables for post-licence)
- Render Postgres provisioned · `DATABASE_URL`, `FOOTBALL_API_KEY` in Render env
- Three docs in `/docs/`: `portal-architecture.md`, `roadmap.md`, `pre-launch.md`

### Step 1 — Portal shell
- `AppShell.tsx` rebuilt: post-login shell with sticky top bar (logo · conditional live badge · greeting + avatar → `/account`) + sticky bottom 4-tab nav (Home / Predict / Pools / Account). Mobile-first, 480px max column on desktop.
- `MarketingShell.tsx` created from the previous AppShell content — wraps the public marketing routes for logged-out users.
- Stub pages at `client/src/pages/portal/`. `AccountPage` has a working Sign Out; everything else has since been built out.
- `App.tsx` rewired: logged-in users → portal routes wrapped in AppShell. Logged-out → marketing routes wrapped in MarketingShell. Auth pages bypass both shells.

### Step 2a — DB foundation
- `server/db/index.ts` exports a Drizzle instance over postgres-js, reads `DATABASE_URL`.
- Added deps: `drizzle-orm`, `postgres`, `@node-rs/argon2`, `drizzle-kit` (dev), `dotenv`.
- `pnpm` scripts: `db:generate`, `db:push`, `db:studio`, `seed`, `sync-outcomes`.
- `.env.example` documents required env vars (`DATABASE_URL`, `FOOTBALL_API_KEY`, `SESSION_SECRET`, `BYPASS_LATE_ENTRY`, `ADMIN_SECRET`).
- First migration generated and pushed to Render Postgres. 25 tables live (active + dormant).

### Step 2b — Real auth
- Real signup/login/logout/me endpoints under `/api/auth/*`. Argon2id password hashing (OWASP params: 19 MiB / 2 iters / parallelism 1).
- Sessions are server-stored (row in `sessions` table) with SHA-256-hashed tokens. HTTP-only cookie `p10_session`, SameSite=Lax, Secure in prod, 30-day sliding TTL (refreshed when <7 days remain).
- Audit log writes for `user.signup` / `user.login` / `user.logout`. Non-blocking.
- Age gate: server rejects DOB < 18 years.
- Login burns a dummy argon2 verify when email isn't found, masking the email-existence timing oracle.
- `AuthContext.tsx` — real fetch calls with `credentials: "include"`, restores session on mount via `/api/auth/me`, exposes `isLoading` so App.tsx can show a splash during the initial round-trip.
- LoadingSplash with progressive copy (silent → "Loading…" at 2s → "Server is waking up…" at 8s) and a 30s AbortController timeout. Handles Render cold starts.
- Static-asset caching fixed in `server/index.ts`: `index.html` is `no-cache`, `/assets/*` is `immutable, max-age=1y`, SPA catch-all returns real 404 for `.css/.js/etc`.
- Dev workflow: `pnpm dev` runs Vite (port 3000) + Express (port 3001) via `concurrently`, with Vite proxying `/api/*` to Express. `tsx watch` for the server side.

### Step 2c — Seed + sync
- `pnpm seed` script (`server/scripts/seed.ts`) — idempotent one-shot that inserts football sport, PL + Championship competitions, the 5 tiers, fetches the 2025/26 season from football-data.org, groups matches into 9 Rounds per competition (constants in `server/lib/rounds.ts`), upserts events keyed by football-data match id, sets `predictionLockAt = kickoff − 1 hour`, picks the current Round per competition, creates 5 pools (one per tier) for the current Round, and cleans up stale pools.

### Step 2d — Real Home page
- `GET /api/competitions` — public. Returns `Competition[]` with current Round + 5 nested pool DTOs per competition.
- `GET /api/entries/me` — requireAuth. Returns the user's open `pool_entries` with prediction progress.
- Query layer in `server/lib/portal-data.ts`.
- `client/src/lib/portal-api.ts` — typed client wrappers, DTOs mirror the server.
- `HomePage.tsx` matches arch §8.1 — Round header, "Your live entries", "Available tiers", three empty-state branches.

### Step 2e — Pool entry flow
- `GET /api/pools/:id` — public, returns full pool detail (round, tier, entry count, late-entry window state, locked-matches count, bypass status, plus `myEntry` when auth'd).
- `POST /api/pools/:id/enter` — requireAuth. Validates pool is open + within window (or `BYPASS_LATE_ENTRY=true`). Creates `payments` row (`mode='mock'`, `status='succeeded'`, `direction='debit'`, amount = tier fee) and `pool_entries` row in a transaction. Idempotent: returns existing entryId on duplicate. Audit-logs `pool.entry_created` + `payment.succeeded` (or `pool.entry_failed`).
- `LateEntryWarningModal.tsx` (arch §4 copy) — required confirmation when window state is `late`.
- `PoolDetailPage.tsx` — three pre-entry states (open / late / closed) with sticky CTA; entered state delegates to the canonical Predict view (step 2f).

### Step 2f — Canonical Predict screen
- **Schema migration**: `events.matchday` column added (nullable int) so GW tabs can group by gameweek. Backfilled via `pnpm seed`.
- `GET /api/entries/:id` — requireAuth, owner-only (404s for other users' entries — no info leak).
- `PUT /api/entries/:entryId/predictions/:eventId` — requireAuth, upserts a single prediction. Validates entry ownership, event-belongs-to-pool, and per-match lock (`predictionLockAt > now`, Decided Rule #7). Score range 0-99 enforced. Writes `predictions.ipAddress` per LCCP 13.1.2.
- `PredictGameweekTabs.tsx` + `PredictMatchRow.tsx` — GW tabs with `predictionCount/matchCount` progress; day-grouped match rows with 800ms debounced auto-save, footer indicator (`Auto-saving · saved 2s ago` / `Couldn't save`).
- 4 of 5 arch §8.5 row states delivered: editable, saved (editable), half-saved, locked. (Finished + Live deferred.)
- **Deviation from arch §11**: the prediction upsert endpoint is `PUT /api/entries/:entryId/predictions/:eventId`, not the doc's `PUT /api/predictions/:id`. Predictions have no stable id before first save; `(entry, event)` is the schema's natural unique key.

### Step 2g — Predict tab
- `PredictPage.tsx` — lists every open entry the user holds. Two sections: **Closing soon** (entries whose pool `closesAt` is within 48h, with a `2h 14m` countdown) and **This round** (everything else, showing round-end date).
- `UserEntryDto` enriched with `roundName`, `closesAt`, `roundEndDate`. No new endpoint.
- Empty-state CTA links to `/pools`.

### Step 2h — Pools landing + per-competition page
- `PoolsPage.tsx` (arch §8.3) — competition picker chips + "Open now" section with one row per competition that has an active Round.
- `PoolsCompetitionPage.tsx` (arch §8.4, new) — per-competition tier list at `/pools/:competitionSlug`. Each row indicates entry state (emerald-tinted with `You're in · X/Y saved` if entered; fee + entry count otherwise). Tap → pool detail.
- `App.tsx` routing: `/pools` → landing, `/pools/:slug` → competition page, `/pools/:slug/:poolId` → pool detail.
- Server untouched — both new pages reuse `/api/competitions` and `/api/entries/me`.

### Step 2i — Outcome sync + per-prediction scoring
- `server/lib/outcome-sync.ts` — pulls FINISHED matches from football-data.org per active competition. For each match maps to our `events` row, upserts `event_outcomes` (PK `eventId`, first-write-wins), updates `events.status` to `'finished'`, and scores any unscored predictions: 5 pts exact, 2 pts correct result, 0 otherwise (Decided Rule #10). Idempotent — once `predictions.pointsAwarded` is non-null we skip it.
- `pnpm sync-outcomes` runs the sync from the CLI (manual or Render Cron).
- `POST /api/admin/sync-outcomes` — token-gated by `ADMIN_SECRET` header (`X-Admin-Token`). Closed by default if the env var is unset. Same logic as the CLI.
- DTO additions: `EntryMatch.outcome`, `EntryMatchPrediction.points/isExact/isCorrectResult`, `EntryGameweek.finishedCount/pointsTotal`, `EntryDetail.pointsTotal`.
- `PredictMatchRow.tsx` — fifth row variant "Finished": emerald-tinted bg, solid FT score boxes, meta line `FT · You: 2-1 · +2 pts` (or `Missed — 0 pts`) with colour-coded points pill (emerald +5 / amber +2 / rose 0).
- `PredictGameweekTabs.tsx` — fully-finished GWs display `N pts ✓` instead of `P/M`.
- Team-name polish: match rows now render full team names (`displayTeamName` strips trailing ` FC` / ` AFC`) instead of the 3-letter TLAs — `truncate` handles overflow.
- **Deviation from arch §11**: the admin endpoint is `POST /api/admin/sync-outcomes`, not `POST /api/admin/settle`. The roadmap's "settlement worker" is being split — outcome sync is this step, pool settlement is step 2j.

### Live deployment state (post step 2i)
- Render web service deployed at `https://predictor10.com`. Build green.
- Render Postgres: 25 tables (matchday column added via `db:push`). 1 sport, 2 competitions, 5 tiers, 18 stages (9 Rounds × 2 comps), ~932 events, 5 open pools for PL Round 9, ~910 `event_outcomes` rows after first sync, at least 1 real user (`Wez`) with entries in the £10 Tenner pool plus predictions.
- Render env vars set: `DATABASE_URL`, `FOOTBALL_API_KEY`, `NODE_ENV`, `BYPASS_LATE_ENTRY=true` (Round 9's real window closed Apr 28; we're testing past it), `ADMIN_SECRET` (32-char random string for `/api/admin/*`).
- Sync has been run manually via Render shell. No automated scheduler wired yet — `pnpm sync-outcomes` works; HTTP endpoint also works with `X-Admin-Token`.

## Decisions made in earlier chats — DO NOT relitigate

From arch doc Decided Rules §13 + decisions made in build chats:

- Round = 4-5 GW tournament block. PL has 9 Rounds (4-4-4-4-4-4-4-5-5 GWs). Champ has 9 Rounds (5-5-5-5-5-5-5-5-6 MDs).
- One stake per Round covers all matches in it.
- Late entry allowed for 7 days after Round opens, with explicit warning modal.
- Predictions lock 1 hour before each match's individual kickoff. Server rejects predictions for already-played matches with HTTP 403.
- Tie-breaker: pts → exact-score count → correct-result count → split.
- 5 tiers visible day one: The Pound (£1), The Fiver (£5), The Tenner (£10), The Pony (£25), The Big One (£50).
- Multi-entry: one entry per pool, but multiple tiers and multiple competitions concurrent OK.
- MVP competitions: Premier League + EFL Championship only. World Cup, League One, all other comps out of scope.
- Settled pools archive immediately to `/account/history`.
- Combined Pool/Predict screen on one URL: `/pools/:competitionSlug/:poolId`.
- Prize structure (% splits, operator commission): TBD — defer until pre-launch. Placeholder splits in seed.
- **No more mock data. Everything is live from DB / football-data.**
- **Resend deferred to pre-launch.** No verification emails sent yet. Signup creates an unverified account that can use the product. `RESEND_API_KEY` not in env yet.
- **`BYPASS_LATE_ENTRY=true` in Render env** allows entries after the 7-day late-entry window has closed. Used for testing Round 9 of 2025/26 right now (real window closed Apr 28). Per-match anti-cheat lock (Decided Rule #7) always on regardless.
- **`ADMIN_SECRET` env var** gates `/api/admin/*` endpoints. Sent as `X-Admin-Token` header. Closed by default (401) if unset.

## Known follow-ups / pre-launch flags

Carry forward, none urgent for the next step:

- **`pool_entries` has no `uniqueIndex(pool_id, user_id)`** — Decided Rule #2 enforcement at the DB layer. Pre-flight check in `enterPool` catches double-tap; a true concurrent race could still produce two rows. Schema migration needed before public launch.
- **First-write-wins on `event_outcomes`** — score corrections from football-data are not re-recorded automatically. Reconciliation pass needed before public launch.
- **No `DELETE` for predictions** — overwrite-only after first save; "half-saved" is a UI-only state. Matches Decided Rule #12 wording. Confirm at pre-launch.
- **Audit log volume** — every prediction save writes a `prediction.updated` row. Indexed but disk grows. Revisit before public launch.
- **Pool detail back arrow** — always routes to `/` (Home). Users entering via `/pools/:slug` might expect to return there. Small polish, not urgent.
- **`/api/pools`, `/api/tiers`, `/api/pools/competition/:slug` from arch §11** — not built. Pools and tiers are surfaced via `/api/competitions` instead. Decide before pre-launch whether the separate endpoints are needed.
- **No automated outcome-sync schedule yet** — `pnpm sync-outcomes` is manual. Step 2j will likely need this on a 5-min cadence (cron-job.org pointing at the admin endpoint is the simplest path).

## My working style

- **File deliverables in a table:**
  | File | Folder | Action |
  |---|---|---|
  | `Foo.tsx` | `client/src/pages/` | REPLACES |
- Always state the target folder for each file. No long explanations.
- Direct. Concrete. No long feature rationales.
- Recommend, don't menu — only offer 2-3 options if a real tradeoff exists.
- No emoji unless I use them first. No mid-sentence bolding.
- If something's risky, one-sentence flag, then proceed.
- I'm not deeply technical with backend ops (terminal, env files, Postgres CLI). Brief explanation when commands are needed.
- I push back when designs feel wrong. Take it, fix it, no defending.
- **Mobile-first** (480px max column, per arch §1.3). App will eventually ship on Google Play and App Store — keep all UI touch-friendly (44px+ tap targets), PWA-aware, with safe-area-inset handling and no hover-only interactions.
- **Render deploys with `--frozen-lockfile`.** Whenever `package.json` changes, ship `pnpm-lock.yaml` in the same batch or the build fails with `ERR_PNPM_OUTDATED_LOCKFILE`.
- **Schema changes need `pnpm db:push` after deploy** (drizzle-kit syncs schema → live Postgres). Flag this explicitly whenever a step touches `server/db/schema/`. If matchday is missing or any new column is missing, the user has likely skipped this step.

## What's next — step 2j

**Pool-level settlement + history archive.** This closes the loop: enter → predict → score → settle → archive.

Files needed (proposed — verify before bulk-changing):
- `server/lib/pool-settle.ts` — for each pool where every event has an outcome:
  - Compute `finalPoints` per entry (sum of `predictions.pointsAwarded`).
  - Rank by (points desc, exact-count desc, correct-result-count desc); split ties evenly (Decided Rule #10).
  - Write mock payouts as `payments` rows (`direction='credit'`, `mode='mock'`, `status='succeeded'`, `referenceType='payout'`, `referenceId=poolEntries.id`). Splits per `pools.prizeStructure`.
  - Update `pool_entries`: `finalRank`, `finalPoints`, `payoutId`, `settledAt`.
  - Update `predictions.settledAt`.
  - Update `pool.status = 'settled'`.
  - Idempotent (Decided Rule #1). Audit `pool.settlement`.
- `server/scripts/settle-pools.ts` — CLI entry point (`pnpm settle-pools`).
- `server/routes/admin.ts` — add `POST /api/admin/settle-pools`, same token gate.
- `server/lib/portal-data.ts` — filter settled pools out of active surfaces (`getCompetitionsWithOpenPools`, `getUserOpenEntries`). They stay reachable via direct URL.
- New `getSettledEntriesForUser(userId)` for the history page.
- `server/routes/portal.ts` — add `GET /api/account/history`.
- `client/src/pages/portal/AccountHistoryPage.tsx` — new (arch §8.8). List of settled pools, newest first, with final rank + points + cashed status.
- `client/src/pages/portal/PoolDetailPage.tsx` — handle settled state (read-only banner, final rank header per arch §8.5).
- `App.tsx` — add `/account/history` route.

Test plan: run `pnpm sync-outcomes` to make sure outcomes are current; manually mark Round 9 events as "all finished" if needed (Round 9 doesn't finish until 24 May 2026 in real time, so verifying settlement might need a fake-ahead test or just wait); run `pnpm settle-pools`; verify Wez's entry shows up in history with the correct rank and points.

## What to do first

1. Read all three docs in `/docs/` (architecture first).
2. Skim the recent file edits to understand the current shape — particularly `server/lib/portal-data.ts`, `server/lib/outcome-sync.ts`, `client/src/pages/portal/PoolDetailPage.tsx`, and `client/src/components/predictor10/PredictMatchRow.tsx`.
3. Propose your file plan for step 2j in tabular form with folder paths.
4. Wait for me to say "go" before bulk-changing files.

Don't ask 5 clarifying questions before starting. Read the docs, make a recommendation, I'll push back if it's wrong.
