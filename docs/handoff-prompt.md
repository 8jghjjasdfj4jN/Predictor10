# Predictor10 — handoff prompt for a new chat

> Save this file. Copy everything below the `---` line into a fresh Claude chat. Upload the latest Predictor10 zip alongside it.

---

# Predictor10 build — picking up after step 3b.14 (admin "Remove from pool" = audited entry void; outcome-recording integrity from 3b.13; tsc baseline 0)

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
- `pnpm` scripts: `db:generate`, `db:push`, `db:studio`, `seed`, `sync-outcomes`, `settle-pools`.
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
- `pnpm seed` script (`server/scripts/seed.ts`) — idempotent one-shot that inserts football sport, PL + Championship competitions, the 5 tiers, fetches the 2025/26 season from football-data.org, groups matches into 9 Rounds per competition (constants in `server/lib/rounds.ts`), upserts events keyed by football-data match id, sets `predictionLockAt = kickoff − 1 hour`, picks the current Round per competition (requires ≥5 future matches), creates 5 pools (one per tier) for the current Round, and cleans up stale pools.

### Step 2d — Real Home page
- `GET /api/competitions` — public. Returns `Competition[]` with current Round + 5 nested pool DTOs per competition.
- `GET /api/entries/me` — requireAuth. Returns the user's open `pool_entries` with prediction progress. Filters `settledAt IS NULL`.
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
- **Deviation from arch §11**: the prediction upsert endpoint is `PUT /api/entries/:entryId/predictions/:eventId`, not the doc's earlier `PUT /api/predictions/:id`. Predictions have no stable id before first save; `(entry, event)` is the schema's natural unique key. Arch §11 has been updated to match.

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

### Step 2j — Pool settlement + history archive
- `server/lib/pool-settle.ts` — `settleAllReadyPools()` + pure helpers (`rankEntries`, `computePayouts`). For each pool where the gate clause passes (Decided Rule #13 — every event is `finished + outcome` OR `cancelled/void`), inside one transaction:
  - Aggregates points / exacts / correct-results per entry (LEFT JOIN predictions so zero-prediction entries still rank).
  - Ranks standard-competition style (1, 2, 2, 4) using the Rule #10 tie-break (pts → exacts → results → split).
  - Computes mock payouts per `pool.prizeStructure.splits`. Tied positions share their combined slice evenly. Rounds to 2dp; residual penny → rank 1 (Decided Rule #14). Integer-pence internally, decimal string at insert.
  - Writes credit-direction `payments` rows (`mode='mock'`, `status='succeeded'`, `referenceType='payout'`, `referenceId=poolEntries.id`).
  - Updates `pool_entries.{finalRank, finalPoints, payoutId, settledAt}`.
  - Bulk-marks `predictions.settledAt`.
  - Flips `pools.status='settled'` last so the gate clause stops matching on subsequent runs.
  - Writes one `pool.settlement` audit row with full ranks + payouts metadata.
  - Row-level lock via `.for("update")` on the `pools` row protects against concurrent settle runs.
  - Zero-entry pools settle silently — pot=0, no payments, audit `entryCount: 0` (Decided Rule #15).
- `pnpm settle-pools` CLI + `POST /api/admin/settle-pools` (token-gated, same logic).
- `GET /api/account/history` — requireAuth. Returns `{ stats: { rounds, cashes, bestRank }, entries: SettledEntry[] }` ordered newest first. Pulls payout amount via LEFT JOIN on `payments.id = poolEntries.payoutId`.
- `AccountHistoryPage.tsx` (arch §8.8) — 3-cell stat strip (Rounds / Cashes / Best rank), entries grouped by Round, newest first. Cashed cards get amber accent + trophy badge. `[Results →]` deep-links into the read-only pool detail; `[Table →]` button is disabled until League Table page ships in step 2k.
- `PoolDetailPage.tsx` — settled-state branch: state-aware BackLink (→ History when settled, → Home otherwise), `Final · Settled DATE · X pts · Rank N of Y` meta line, "Round complete · League table coming soon" banner, read-only `Settled · Read-only` footer replacing the auto-save indicator.
- `PredictGameweekTabs.tsx` — new `poolSettled` prop. When true, every GW renders as fully-finished (handles the cancelled/void edge case where a settled Round contains matches that never reached `status='finished'`).
- `pickDefaultMatchday` now branches on `entry.settledAt`: settled → GW1 chronological (per arch §8.5 settled mockup, matching the default in deferred decision §14.2); active → first GW with an unlocked match (existing behaviour).
- `AccountPage.tsx` — History link is now active (chevron + tappable); Payment history / RG / Settings remain placeholder.
- New `/account/history` route in `App.tsx`.

### Step 2k — League Table page
- `server/lib/portal-data.ts` — new `getPoolEntries(poolId, viewerUserId)` returning `{ pool, viewer, entries }`. Live ranking via `rankEntries()` (reused from `pool-settle.ts`). Settled pools use stored `pool_entries.finalRank` / `finalPoints`. Single grouped query: `pool_entries INNER JOIN users LEFT JOIN predictions` with SUM aggregates — three queries total (pool meta, matchday rollup, entries).
- `server/routes/portal.ts` — new `GET /api/pools/:id/entries`. Gating at the route: 404 POOL_NOT_FOUND, 401 NOT_AUTHENTICATED (live pool, no session), 403 NOT_ENTRANT (live pool, signed in but not entered), 200 on success. Public when `pool.status='settled'`.
- `client/src/lib/portal-api.ts` — `PoolEntry` / `PoolEntriesPayload` types + `fetchPoolEntries()`. Custom `FetchPoolEntriesError` carries the status code.
- `client/src/pages/portal/PoolTablePage.tsx` — gold rank numbers for 1-3 (amber-300), emerald-tinted "You" row, status pill (`Round in progress · GW2 of 4` vs `Final · Settled DATE`), tie-break footer mirroring Decided Rule #10 verbatim including the `→ split` final step. Page-load + window-focus refetch; no polling.
- `client/src/App.tsx` — `/pools/:competitionSlug/:poolId/table` registered before `/:poolId` in the Wouter Switch (specific first).
- `client/src/pages/portal/PoolDetailPage.tsx` — `SettledBanner` is now a real Link to the table; active state gets `View league table →` affordance below the saved-progress meta row.
- `client/src/pages/portal/AccountHistoryPage.tsx` — disabled `[Table]` replaced with a Link to the table route.
- `client/src/pages/portal/HomePage.tsx` — `LiveEntryCard` refactored to two side-by-side CTAs (`[Predictions]` solid emerald + `[Table]` ghost) per arch §8.1.

### Step 2l — Football-data sync extended (fixture refresh) + legacy cleanup
- `server/lib/fixture-sync.ts` — NEW. Shared FD→events upsert helper. Exports `FDStatus`, `FDMatch`, `InternalEventStatus`, `LOCK_LEAD_MS` (60 min), `mapFootballDataStatus()`, `fetchAllMatchesForSeason()`, `upsertEventFromFootballData()`. Used by both `outcome-sync.ts` (cron) and `seed.ts` (bootstrap).
- `upsertEventFromFootballData()` returns discriminated `UpsertEventResult` action: `inserted` / `updated` / `unchanged` / `skipped_finished` / `skipped_no_stage`. **Finished events are terminal from this path** — never reverted to scheduled, even if football-data transiently re-emits a different status. Outcome corrections still go through the outcome-write path (first-write-wins) and remain a pre-launch follow-up.
- `server/lib/outcome-sync.ts` — `fetchAllMatchesForSeason()` replaces the FINISHED-only filter (one HTTP call per competition, ~50KB response). Loop branches: fixture upsert for every match, outcome write for finished ones. `SyncResult` adds `fixturesInserted` / `fixturesUpdated` / `fixturesUnchanged` / `fixturesSkippedFinished` / `fixturesSkippedNoStage` alongside the existing outcome counters.
- `server/scripts/seed.ts` — inline `footballFetch` + `mapStatus` + per-event upsert replaced with the shared helper. Batched `inArray` existing-event lookup.
- `server/scripts/sync-outcomes.ts` — two-line summary log (outcomes / fixtures).
- `server/index.ts` — removed legacy `footballFetch` + cache + `/api/fixtures`, `/api/fixtures/live`, `/api/fixtures/gameweek/:gw`, `/api/standings`, `/api/cache-status` (≈115 lines). These were rendered by the now-unmounted `Dashboard.tsx`; only consumer was `client/src/lib/footballService.ts`, also retired. `FixturesPage.tsx` stays mounted at `/fixtures` (uses `mockData`, never called the proxy).
- Verified working on Render: Wed 13 May 2026 Man City v Crystal Palace catch-up landed via the new fixture-refresh path (2 outcomes, 2 events marked finished, 1 prediction scored, 2 fixtures updated on first post-deploy run).

### Step 2l.1 — Refresh-on-portal cold-start fix
- Symptom: refreshing iPhone Safari on `/pools/...` URLs while Render's web service was cold-starting (>30s) dropped the session and dumped users on the marketing 404. A second bug — even with a valid cookie, logged-out users hitting portal URLs fell through to MarketingRouter → 404 with the marketing "Sign In" nav, making it look like a logout.
- `client/src/contexts/AuthContext.tsx` — removed the 30s `AbortController` timeout (cold starts on Render free tier legitimately exceed it). New `loadCurrentUser()` retries 5xx/network failures (2s → 5s → 10s backoff, ~17s before giving up). A genuine 401 resolves immediately as "logged out", no retry. Registers `setUnauthorizedHandler` from portal-api.ts on mount.
- `client/src/lib/portal-api.ts` — module-level `setUnauthorizedHandler` registry + `notify401IfNeeded(res)` called at every fetch site (getJson, fetchMyEntries, enterPool, savePrediction, fetchPoolEntries). Any post-boot 401 flips the auth context to logged-out, which the Router then redirects through `/login?redirect=<url>`.
- `client/src/App.tsx` — new `isPortalPath()` regex (`/^\/(predict|pools|account)(\/|$)/`), new `RedirectToLogin` component. Router: logged-out + portal URL → `RedirectToLogin` with the original URL as `redirect` query param. Extended `LoadingSplash` with longer escalation: 2s "Loading…", 8s "Server is waking up", 30s "Still waking up", 60s + Reload button.
- `client/src/pages/LoginPage.tsx` + `RegisterPage.tsx` — `readRedirectParam()` with open-redirect guard (must start with `/`, not `//`). On success, navigate to the redirect param if present, else `/`.

### Step 2m — IA restructure + Pound retirement
- **Bottom nav slot 3 repurposed**: POOLS → TABLES in `AppShell.tsx`. Trophy icon retained; `matchPrefix` updated to `/tables`.
- **Prediction screen moved**: `/pools/:competitionSlug/:poolId` → `/predict/:entryId`. Keeps the Predict bottom-nav tab highlighted while users make picks (the old URL was highlighting Pools).
- **`PoolDetailPage.tsx` refactored**: reads `:entryId` from the URL, fetches `EntryDetail` via `/api/entries/:id` only, renders the entered-state predict view. Pre-entry branches (open/late/closed window states, late-entry warning modal, enter CTA) removed entirely — those flows live in TablesPage now.
- **`TablesPage.tsx` NEW** (`client/src/pages/portal/`): comp pills + tier sub-tabs (entered tiers prefixed by an emerald dot) + header card with conditional entered-status widget or "Enter · £NN →" button + standings table (`maxRows={10}`, with the viewer's own row pinned below the visible window if they're outside the top 10). Inline entry flow using the existing `LateEntryWarningModal`. Default landing tier: leftmost-entered, fallback to The Fiver. Default comp: leftmost with an open Round.
- **`PoolStandingsTable.tsx` NEW** (`client/src/components/predictor10/`): shared leaderboard component extracted from PoolTablePage. Optional `maxRows` prop with "↓ N more entries ↓" expander + "Your position" pinned row when truncated. PoolTablePage refactored to consume it (full unbounded list when `maxRows` omitted).
- **`LegacyPoolRedirect.tsx` NEW** (`client/src/components/predictor10/`): mounted at the old `/pools/:competitionSlug/:poolId` URL. Fetches `/api/entries/me`, finds entry by poolId, redirects to `/predict/:entryId` (or `/tables` if no match / fetch error).
- **Browse-flow legacy redirects**: `/pools` and `/pools/:competitionSlug` route through a tiny inline `RedirectTo` component → `/tables`. `/pools/:competitionSlug/:poolId/table` stays mounted on PoolTablePage — Account History's `[Table →]` still links there. `PoolsPage.tsx` and `PoolsCompetitionPage.tsx` deleted outright (Pools-as-browse killed per Decisions §May 2026).
- **The Pound retired**: removed from `TIERS` array in `server/scripts/seed.ts`. New `RETIRED_TIER_SLUGS = ["pound"]` constant drives an idempotent `is_active=false` flip in `seedTiers()` on every run. Existing Round 9 Pound pool + Wez's entry + the `leagues.slug='pound'` row all stay in the DB — they play out and settle normally on 24 May 2026.
- **`getCompetitionsWithOpenPools` filters by `leagues.is_active=true`**: hides retired tiers from `/api/competitions` (Home + Tables). `/api/pools/:id` and `/api/entries/me` are unaffected so Wez's live Pound entry still loads on the predict screen.
- **Marketing showcase**: `leagueTiers` mock array in `client/src/lib/mockData.ts` lost its `kickoff-one` entry (4 entries now). `currentLeague` index shifted from `[2]` → `[1]` to keep marketing leaderboard preview anchored to "Premier Ten" (£10). `LeagueShowcase.tsx` copy "Five tiers" → "Four tiers", grid `xl:grid-cols-5` → `xl:grid-cols-4`.
- **PORTAL_PATH regex** in `App.tsx` extended to include `/tables`. Legacy `/pools` paths still match so logged-out users hitting old URLs go through the redirect-to-login flow with the return URL preserved.
- **Link target updates**: HomePage's live-entry "Predictions" button → `/predict/:entryId`; Available Tier rows → `/tables`. PredictPage's entry cards → `/predict/:entryId`. AccountHistoryPage's `[Results →]` → `/predict/:entryId`; `[Table →]` unchanged (still legacy `/pools/.../table`).

### Step 2n — Prize splits standardised + commission + per-rank breakdown UI
- **Commercial model**: 25% operator commission on every tier's gross pot. Player pot = gross × 0.75. Splits: 60% / 25% / 15% across top 3, applied to player pot (= 45% / 18.75% / 11.25% of gross). Standardised across all four active tiers — Fiver / Tenner / Pony / Big One — replacing the prior mix of top-3 (70/20/10) and top-5 (50/25/15/7/3).
- **`server/scripts/seed.ts`** — TIERS rewritten: all four get `prizeStructure: { model: "top_n", splits: [0.60, 0.25, 0.15], houseFeePct: 0.25 }`. New `syncOpenPoolPrizeStructure()` step iterates active tiers, finds open pools, updates each pool's `prize_structure` JSON to match the current tier value (open pools only — settled pools immutable per Decided Rule #14). Retired tiers (Pound) skipped — its open Round 9 pool keeps the original 70/20/10 with no commission so Wez's entry settles under the rules it was opened under.
- **`server/lib/pool-settle.ts`** — `PrizeStructure` type gains optional `houseFeePct: number` field. `isPrizeStructure` validates `[0, 1)` range. Settlement applies `houseFeePence = floor(grossPotPence × houseFeePct)` then passes `playerPotPence = grossPotPence - houseFeePence` to `computePayouts`. Audit metadata gains `houseFeePct`, `houseFeePence`, `playerPotPence` alongside the existing `potPence` (now gross). Missing `houseFeePct` defaults to 0 — preserves legacy Pound payout math.
- **`server/lib/pool-settle.ts` new export `computeDisplayBreakdown(playerPotPence, splits)`** — pure helper mirroring `computePayouts`'s rounding rule (Math.round per place, residual to rank 1 per Decided Rule #14). Used by `portal-data.ts` so display amounts match settlement to the penny.
- **`server/lib/portal-data.ts`** — new `PrizeBreakdownEntry = { rank, amount: "22.49" }` type. Added `prizeBreakdown: PrizeBreakdownEntry[]` to both `PoolDto` and `PoolDetailDto`. New private `buildPrizeBreakdown(prizeStructureJson, entryCount, entryFeeDecimal)` helper computes per-rank amounts from the pool's stored `prize_structure` JSON and the current entry count. Empty array when entryCount=0.
- **`client/src/lib/portal-api.ts`** — mirrored `PrizeBreakdownEntry`, added `prizeBreakdown` to `Pool` and `PoolDetail`.
- **`client/src/pages/portal/TablesPage.tsx`** — `TierHeader` meta line split: "£5 · 10 players" on line 1, "1st £22.49 · 2nd £9.38 · 3rd £5.63" on line 2 (emerald-tinted, tabular-nums). Old `£X pot` copy removed. New `formatPrizeBreakdown` helper handles the rendering; ordinal labels hard-coded `1st/2nd/3rd/4th/5th`. `formatPot` helper deleted as unused.
- **`client/src/pages/portal/HomePage.tsx`** — `AvailableTierRow` gains a third line under the entry count showing the same breakdown in a slightly more muted emerald (text-emerald-200/70). Same `formatPrizeBreakdown` helper duplicated locally — trivial and only used in one place per file.
- **Rounding behaviour**: settlement uses `Math.round` per place with residual penny to rank 1 (Decided Rule #14 unchanged). House fee uses `Math.floor` so players are never overpaid from sub-penny remainders. With current splits (60/25/15) and house fee (0.25), the math lands on whole pennies for any whole-pound gross pot — no quirks in practice.
- **Operational note**: deploy alone doesn't change Round 9's pool structures. After deploy, `pnpm seed` must run once to push the new `prize_structure` JSON into the open pools. Until that runs, Tables would show breakdowns computed from the *old* `prize_structure` JSON (still works, just under the old splits).

### Step 2o — In-process scheduler (auto sync + settle)
- `server/lib/scheduler.ts` — NEW. Wires two `node-cron` schedules directly into the Express server process: `syncOutcomes()` every 5 minutes (`*/5 * * * *`), `settleAllReadyPools()` every 15 minutes (`*/15 * * * *`). Calls the same library functions the admin endpoints call — no HTTP overhead, same DB pool, same env vars.
- `server/index.ts` — `startScheduler()` invoked from the `server.listen` callback so cron registration happens after the HTTP socket is open.
- Concurrency guard: each job carries a `running` flag. If a tick fires while the previous run is still in flight, the new tick is skipped and a `[scheduler] X skipped — previous run still in flight` line is logged. Prevents pile-up on slow runs.
- Gating: `NODE_ENV !== "production"` skips registration entirely (keeps `pnpm dev` / `tsx watch` from spawning duplicate schedulers and from spending football-data.org quota during development). `DISABLE_SCHEDULER=true` in Render env disables it in production too, falling back to manual triggering via the admin endpoints.
- Logging: silent on no-op ticks (typical 95% of runs). Single summary line on any tick that writes outcomes, scores predictions, inserts/updates fixtures, settles a pool, or errors. Stream is `[scheduler] ...` so it greps cleanly out of the web service logs.
- **Why in-process, not Render Cron Jobs**: Predictor10 runs on Render Starter ($7/mo) — the web service is always-on, no idle spin-down. The scheduler runs alongside the request handler in the same Node process. Saves $2/mo (Render charges $1/job/mo minimum × 2 jobs), keeps logs in one place, drops the need for a separate build per cron service. If we ever move to Standard with autoscaling, the scheduler must relocate (autoscaled instances would each fire the cron, causing duplicate runs).
- Deps: `node-cron@^4.0.0` (production), `@types/node-cron@^3.0.11` (dev). `pnpm-lock.yaml` regenerated and verified against `--frozen-lockfile`.
- **No DB schema changes**. No `pnpm db:push` needed.

### Step 2q — Step 2p rolled back
- `vite.config.ts` — restored to original form. All four Manus dev plugins (`jsxLocPlugin`, `vitePluginManusRuntime`, `vitePluginManusDebugCollector`, `vitePluginStorageProxy`) once again run in `pnpm build`. Production `index.html` is back to 368 KB (Manus runtime inlined).
- **Why rolled back**: step 2p's tiny HTML broke the signed-in refresh path on iPhone (Safari + Chrome). Both browsers rendered a blank white screen on refresh whenever a session cookie was present. Signed-out refresh continued to work fine on every browser. No code-level cause was identifiable from inspection — the regression's exact mechanism is still under investigation, but the strong correlation with step 2p combined with the failure mode being browser/auth-state-specific points at the 367 KB script's inadvertent role in the load timing or error-suppression behaviour.
- **Status of the cleanup goal**: still wanted. The Manus runtime is dev-tooling bloat; production users don't need it. Re-stripping it will be re-attempted once we understand why doing so broke iPhone signed-in users. Likely path: add an inline error reporter to `client/index.html` first (so a future strip surfaces any uncaught error visibly), then re-attempt the strip with that reporter in place.
- **No DB schema changes**. No `pnpm db:push`. No new env vars. No new dependencies.
- **Step 2o (scheduler) unaffected**: this revert touches `vite.config.ts` only. `server/lib/scheduler.ts`, `server/index.ts`, and the `node-cron` dependency from step 2o remain in place and continue running unchanged.

### Step 2p — Manus runtime stripped from production build (ROLLED BACK in step 2q)
- `vite.config.ts` — converted `defineConfig` to function form (`({ mode }) => ...`) and gated the four Manus dev plugins (`jsxLocPlugin`, `vitePluginManusRuntime`, `vitePluginManusDebugCollector`, `vitePluginStorageProxy`) so they only run when `mode !== "production"`. `pnpm build` → mode is `"production"` → none of them registered. `pnpm dev` → mode is `"development"` → all four registered, dev workflow unchanged.
- **Impact**: `dist/public/index.html` drops from **368 KB** to **1.27 KB** (99.65% reduction). The 367 KB removed was a giant `<script id="manus-runtime">` block previously inlined into every page load.
- **Bug this fixes**: Chrome on iPhone showed a white screen on refresh because the 368 KB HTML payload was large enough to freeze the render thread on a typical mobile connection before any of the actual app code ran. Also explained why some users saw the LoadingSplash escalate to "Server is waking up…" on legitimate paid-tier infrastructure — the HTML download alone was tripping the 8s threshold for that copy.
- **Regression**: blank white screen on iPhone (Safari + Chrome) for signed-in users on refresh. Signed-out refresh kept working. Rolled back in step 2q while we instrument and re-attempt.
- **No DB schema changes**. No `pnpm db:push`. No new env vars. No new dependencies.
- **No effect on native app store builds** (web-only artifact).

### Step 2r — Inline boot-time error reporter
- `client/index.html` — adds an inline `<script>` block that runs before React mounts. Captures `window.onerror` + `unhandledrejection` and renders a visible dark-themed error panel into `#root` with stack + UA + Reload + Copy-diagnostic when boot fails. 200 ms mount-check guard means healthy boots are a no-op (reporter exits silently once React paints).
- ~7 KB of inline HTML/JS. Designed to make any future failed boot diagnosable instead of presenting a white screen.
- **No DB schema changes**. No deps. No env vars.

### Step 2s — Re-attempted Manus strip (with reporter in place)
- `vite.config.ts` — same change as step 2p, now safe because the 2r reporter is in place.
- Production HTML drops from 376 KB → 8.84 KB.
- Step 2p's signed-in-iPhone bug returned; the reporter caught it this time with `bootStarted=false` and a `<script>` resource-load failure or a 10-second silent stall.

### Step 2t — Reporter tightened
- Error listener gains `useCapture: true` so script-load failures (which target the `<script>` element, don't bubble to window) are caught.
- `client/src/main.tsx` gains three boot checkpoints: `__p10_bootStarted` / `__p10_renderStarted` / `__p10_renderReturned`. Reporter reads them and reports how far boot got.
- Safety-net diagnostic copy adapts to which checkpoint was reached.

### Step 2u — Reporter adds fetch-status follow-up
- On a captured resource error, the reporter immediately re-fetches the failing URL via `fetch()` and appends `status / content-type / content-length` to the diagnostic.
- Distinguishes server failure (4xx/5xx) from browser module-load rejection (200 OK with wrong MIME, etc.).
- First step that produced a confirmed remote-resource failure log on a real iPhone refresh (WhatsApp screenshot from Jason, iOS 18_7).

### Step 2v — Strip `crossorigin` attribute from Vite-emitted script + link tags (monitored)
- `vite.config.ts` — adds a `stripCrossOriginPlugin()` using `transformIndexHtml` with `order: "post"` that runs a regex to strip the `crossorigin` attribute from the emitted `<script type="module">` and `<link rel="stylesheet">`. Preserves crossorigin on the font preconnect link.
- **Why**: Vite emits `crossorigin` by default for CDN/cross-origin asset hosting. Predictor10 serves all assets same-origin from Express, so the attribute is unnecessary. On iOS WebKit it can trigger a silent CORS-adjacent failure mode where module scripts stall without firing `error` events — caught in 2u's diagnostics.
- Safety net also enhanced to auto-fetch the bundle URL when fires + main.tsx never executed.
- **Status: monitored**. Wez reported an "intermittent" residual via WhatsApp on 20 May. Reporter remains in place to capture recurrence. Iterating again if a definitive diagnostic comes through.
- **No DB schema changes**. No deps. No env vars.

### Step 3a.1 — World Cup 2026 schema + seed prep (not deployed by Wez at the time)
- This step was prepared in a prior chat session but its files (modified `server/db/schema/sports.ts`, `server/scripts/seed.ts`) sat in Wez's local working copy without being pushed for some time. Confirmed via `GET /api/admin/state` after step 3a.2 deployed. Code state once finally pushed in step 3a.3:
- **Schema**: `server/db/schema/sports.ts` — adds `postponedPolicyEnum('wait' | 'forfeit')` and `postponedPolicy` column on the `competitions` table, default `'wait'`, NOT NULL.
- **Seed config**: `server/scripts/seed.ts` — adds World Cup 2026 to `COMPETITIONS` with `slug: 'world-cup-2026'`, `externalId: 'WC'`, `postponedPolicy: 'forfeit'`. Adds the dedicated WC tier (`slug: 'world-cup-2026'`, £30) to `TIERS`. Each competition gains a `tiers` array listing which TIER slugs apply (PL/Champ get the 4 league-style tiers; WC gets just its own).

### Step 3a.2 — Admin state inspection endpoint
- `server/routes/admin.ts` — adds `GET /api/admin/state`. Returns competitions (with `isActive`, `postponedPolicy`, stage/event/pool counts), tiers, and a `schemaHas.postponedPolicyColumn` probe. Token via `X-Admin-Token` header OR `?token=` query param (browser-accessible).
- Used to verify what's actually in the production DB without psql access. Read-only.

### Step 3a.3 — Turn World Cup on (backend foundation)
- `server/lib/rounds.ts` — `RoundSpec.matchdays` now accepts `number[] | "all"`. Adds `WC_ROUNDS = [{ round: 1, matchdays: "all" }]` for tournament-style (single Round = whole tournament). `roundForMatchday()` now accepts `matchday: number | null` and returns the Round number for tournament-style comps regardless of input.
- `server/scripts/seed.ts` — flips WC `isActive: true`. Each `COMPETITIONS` entry gains an explicit `season: number` field (PL/Champ = 2025, WC = 2026); the seed uses `def.season` per-comp instead of a global SEASON. Fetch wrapped in try/catch per comp so a WC outage can't break PL/Champ. The matchday-grouping loop accepts null matchdays when the comp's RoundSpec is `"all"`. Pool creation now respects per-comp `tiers` array (PL/Champ: 4 pools each; WC: 1 pool).
- `server/db/schema/sports.ts` — same as 3a.1.
- `server/lib/portal-data.ts` — small helper `matchdaysForRound()` coerces the `"all"` sentinel to `[]` for the DTO so the public `CurrentRoundDto.matchdays: number[]` contract holds. Three call sites updated to use it.
- **Deployment**: Wez ran `pnpm db:push` (added `postponed_policy` column to live DB) then `pnpm seed` (inserted WC competition + tier + stage; partially inserted events). Seed CRASHED on the first knockout fixture insert due to NOT NULL on `events.home_team` — football-data sends nulls for unresolved knockout slots, not placeholder strings. 72 group-stage events inserted successfully before the crash.

### Step 3a.4 — Null-team handling for unresolved knockout slots
- `server/db/schema/sports.ts` — `home_team` and `away_team` columns made nullable. Architecture §13 Rule #17 originally described "placeholder team names" from football-data; reality is that FD sends `homeTeam: null` / `awayTeam: null` for unresolved knockouts. Schema and code now match reality.
- `server/lib/fixture-sync.ts` — `FDMatch.homeTeam` / `awayTeam` type allows null. Insert path writes nulls cleanly. **Update path now overwrites team fields** (was previously deliberate-skip): essential for the bracket fill-in case where FD goes null → real team. `UpsertEventInput.existing` gains optional `homeTeam` / `awayTeam` for fill-in detection.
- `server/scripts/seed.ts` — batched event lookup now includes home/away team so the upsert helper sees the existing names and detects bracket fill-in vs noop.
- `server/lib/portal-data.ts` — `EntryMatchDto.homeTeam` / `awayTeam` typed `string | null`.
- `client/src/lib/portal-api.ts` — mirror client DTO change.
- `client/src/components/predictor10/PredictMatchRow.tsx` — `displayTeamName(null)` returns `"TBD"`. Aria-labels go via the same helper.
- **Deployment**: Wez ran `pnpm db:push` (dropped NOT NULL on the two columns) then `pnpm seed` clean to end. WC now has 104 events (72 with real teams, 32 placeholder slots with null teams) + 1 pool. Verified via `/api/admin/state`.

### Step 3a.5 — Outcome-sync per-comp season
- `server/lib/outcome-sync.ts` — hardcoded `SEASON = 2025` removed. The 5-min cron now reads `competitions.externalSeasonId` per comp and fetches football-data with that season number. PL/Champ fetch 2025; WC fetches 2026. Also drops the `m.matchday != null` guard from the FD match loop — required so WC knockouts (which arrive with null matchday) get inserted on first fixture-refresh after seed.
- One file. No schema change. Shipped + verified.

### Step 3a.6 — Home redesign (competition cards)
- `client/src/pages/portal/HomePage.tsx` — full rewrite. The old single-competition Round hero + live entries + tier list is gone. New layout per arch §8.1: "OPEN NOW / COMPETITIONS" header, one card per competition with an open Round. Card variant is discriminated by `comp.postponedPolicy`: `'wait'` → league-style card with tier explainer + "Choose your tier" CTA; `'forfeit'` → tournament card with "One bracket. One £30 entry. FT only — no ET, no penalties." copy + "Enter World Cup" CTA.
- `server/lib/portal-data.ts` — `CompetitionDto` gains `postponedPolicy` field; `UserEntryDto` gains it too so the Predict tab can bucket by policy.
- `client/src/lib/portal-api.ts` — mirror.
- Live entries removed from Home entirely (now live exclusively on the Predict tab per arch §8.2 and Rule #18).

### Step 3a.7 — `/enter/:competitionSlug` route
- `client/src/pages/portal/EnterPage.tsx` — NEW. Single-screen entry-confirm flow for tournament-style competitions per arch §8.6.1. Reuses `LateEntryWarningModal` from step 2e. On Enter tap: POST `/api/pools/:id/enter` → on success redirect to `/predict/:entryId`. Already-entered users (entry exists with `settledAt IS NULL`) get a 302-equivalent client redirect on mount. League-style comps fall back to the tier picker (redirect to `/tables?comp=...`).
- `client/src/App.tsx` — `/enter/:competitionSlug` route registered. `PORTAL_PATH` regex extended to include `enter` so logged-out users hitting this URL get bounced via `RedirectToLogin` (arch §7).

### Step 3a.8 — Predict tab redesign (sections + progress)
- `client/src/pages/portal/PredictPage.tsx` — full rewrite. "ACTIVE PLAY / YOUR LIVE ENTRIES" header (per arch §8.2). Three sections: **CLOSING SOON** (amber tint, `AlarmClock` icon, countdown when within 48h), **THIS ROUND** (league-style entries), **TOURNAMENT** (forfeit-policy entries — WC). Each card shows a progress bar (`{predictionsMade}/{matchesTotal}`) and a stage pill on tournament cards. Empty state copy points users to Home.
- `server/lib/portal-data.ts` — `getUserOpenEntries` returns entries enriched with `postponedPolicy` (joined from `competitions`) so the client can bucket. `UserEntryDto` gains the field.

### Step 3a.9 — Null-team gating in predict UI + server
- `client/src/components/predictor10/PredictMatchRow.tsx` — new row variant `awaitingTeams`: when `homeTeam === null || awayTeam === null`, render "TBD" team names with disabled score inputs and a "Awaiting teams" meta tag. No score boxes rendered; tap is a no-op.
- `server/routes/portal.ts` + `server/lib/portal.ts` — `upsertPrediction` now returns `EVENT_AWAITING_TEAMS` (HTTP 409) when either team is null on the target event. `PREDICTION_ERROR_MAP` extended with friendly copy for the client.
- Combined effect: arch §13 Rule #17 is now enforced end-to-end. Players see the road ahead, can't predict blind, server refuses to record predictions on unresolved slots even if a stale client bypasses the input gate.

### Step 3a.10 — Settlement gate forfeit branch
- `server/lib/pool-settle.ts` — `findReadyPoolIds()` gate SQL extended. The original branch (every event finished / cancelled / void) still applies. New OR branch: `(competitions.postponed_policy = 'forfeit' AND events.status = 'postponed' AND events.kickoff_at <= NOW())` counts as "accounted for". A WC pool can now settle when all 104 matches are either FINISHED-with-outcomes OR POSTPONED-without-future-kickoff. Joins added: pools → stages → events → competitions.
- No schema change. Manual verification deferred until first WC postponement occurs (or step 3a.11 walk-through).

### Step 3a.10b — FT-only scoring for WC knockouts
- `server/lib/fixture-sync.ts` — `FDMatch.score` type gains `duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT'`, `regularTime`, `extraTime`, `penalties` fields. New helper `extractRegulationScore(match)` returns `regularTime` when `duration !== 'REGULAR'`, else `fullTime`.
- `server/lib/outcome-sync.ts` — uses the helper so any knockout that goes to ET or shootout is scored from the 90-minute result only (per arch §3 WC table + the locked decision "FT scores only for WC"). PL/Champ matches always have `duration='REGULAR'` so behaviour is unchanged.

### Step 3a.11 — Persistent-after-entry Home + tab labelling + group letters
Four user-visible refinements bundled together; all front-end, except the new `events.group_label` column.

- **Persistent Home cards after entry** — replaces arch §8.1's "hide-on-entry" model. Wez's call after seeing the empty Home that resulted. `HomePage.tsx` rewritten with `CompState` model; `CardShell` accepts an `entered` prop that adds a brighter emerald border, bg tint, and inset ring. A "✓ You're in" line surfaces below the header with tier names. Smart CTA: 1 entry → `/predict/:entryId` direct; 2+ entries → `/predict` tab. Always-on secondary button — label adapts to enterable count (`Pick another tier` when `enterablePools.length > 0`, `View all tiers` when 0 — even on a fully-entered or late-entry-closed card, users can still browse standings).
- **Fully-entered count bug fix** — comparing visible-entered count (`userEntries.filter(e => competition.pools.some(p => p.id === e.poolId))`) against `competition.pools.length`. Previously the "in all N tiers" line fired any time `enterablePools.length === 0`, which made retired-tier ghost entries flip a partially-entered card to look fully entered.
- **Tab labelling for tournaments** — `getEntryDetail` matchday label is now `"Group MD"` for tournament-style comps (`competitionPostponedPolicy === 'forfeit'`), `"MD"` for ELC, `"GW"` for everything else. Null-matchday bucket label changes from `"Unscheduled"` to `"Knockout Stages"` for tournaments. Sort order also fixed: the null-matchday bucket sorts LAST (was first), so tabs read GW1 → GW2 → GW3 → Knockout Stages left-to-right.
- **Group letter per match** — schema column `events.group_label varchar(16) nullable` added. `fixture-sync.ts` extracts it from football-data's `match.group` field via `normaliseGroupLabel("GROUP_A") → "A"`. Insert + update paths write it; seed's batched lookup + outcome-sync include it. `EntryMatchDto.groupLabel` flows through. `PredictMatchRow` renders "Group A" in the meta line on both editable and finished views. Knockouts and league matches stay null; meta line just omits the segment.
- **Refresh bug fix** — `client/index.html` had a `<script src="%VITE_ANALYTICS_ENDPOINT%/umami">` block left over from never-set env vars; Vite was emitting the literal placeholder text. On iOS Chrome refresh the browser tried to load `https://predictor10.com/predict/%VITE_ANALYTICS_ENDPOINT%/umami` as a classic blocking script, which derailed boot on some refresh paths. Block removed entirely — analytics not wired up yet. **Wez confirmed reload now works.**
- **Deployment**: Wez ran `pnpm db:push` (added `group_label` column) then `pnpm seed` (re-synced; group letters populated for all 72 WC group-stage matches, all PL/Champ matches stay null).

### Step 3a.11+ — Knockout sub-headings + tournament-aware standings pill
Deep-dive verification of World Cup parity with Premier League surfaced two improvements; both bundled together with the new `events.fd_stage` column.

- **Knockout Stages tab sub-headings** — schema column `events.fd_stage varchar(32) nullable` added. `fixture-sync.ts` captures football-data's `match.stage` ("LAST_32" / "LAST_16" / "QUARTER_FINALS" / "SEMI_FINALS" / "THIRD_PLACE_PLAYOFF" / "FINAL" / "GROUP_STAGE"). Two new helpers: `knockoutStageOrder()` (sort key) and `knockoutStageDisplay()` ("Round of 32" / "Round of 16" / "Quarter-finals" / "Semi-finals" / "Third-place playoff" / "Final"). `EntryMatchDto.fdStage` flows through. `PoolDetailPage.groupedActive` branches: when `activeMatchday === -1` (Knockout Stages bucket), matches are stage-grouped under sub-headings instead of day-grouped. Other tabs unchanged.
- **Tournament-aware standings status pill** — fixes a real bug found in the deep dive. `PoolTablePage` status pill used to read `"Round in progress · GW1 of 3"` for WC during group stage (using the wrong label) and `"Round complete · awaiting settlement"` during knockouts (wrong — null-matchday events were filtered out of the matchday rollup, so once group stage ended the system thought the round was over). New: `PoolEntriesPool.liveStatusLabel` field, computed server-side for tournament comps only. Values: `"Group MD2 of 3"` / `"Round of 32"` / `"Round of 16"` / `"Quarter-finals"` / `"Semi-finals"` / `"Third-place playoff"` / `"Final"` / `"Awaiting settlement"`. The client `StatusPill` prefers it when set; falls back to the matchday-driven label for league comps.
- **Slot pairing placeholders DEFERRED** — Wez asked for "Winner Group A v Runner-up Group B" labels on knockout rows. Investigation confirmed via FIFA Annex C (Wikipedia: 2026 FIFA World Cup) that **495 possible combinations** exist for the 3rd-placed-team R32 slots, only resolving after group stage ends June 27. football-data sends `homeTeam: null` until then. Decision: skip the labels; the sub-headings already convey the bracket structure, and football-data will populate real team names automatically on June 27. Revisit only if a static FIFA bracket mapping table is desired (large, brittle, low-value for the seven days of "unknown" between group stage end and R32 kickoff).
- **Deployment**: Wez ran `pnpm db:push` (added `fd_stage` column) then `pnpm seed` (populated for all 104 WC events + PL/Champ events as `"REGULAR_SEASON"`, harmless).


### Step 3a.12 — WC entry fee → £10 + 75/25 disclosure + Pot label
Cosmetic + pricing shift bundled together for the informal pre-licence friends' run. WC entry was originally £30; reduced to £10 to keep stakes low while operating under the private-betting exemption (Gambling Act 2005). 11 users on the platform at time of change.

- **Seed change**: `server/scripts/seed.ts` — WC tier `entryFee` config from `"30.00"` to `"10.00"`. `seedTiers()` extended with a sync-existing-tier branch: when config diverges from DB, the existing row's `entry_fee` + `description` are updated. Previously the seed only inserted new tiers; this lets future pricing changes ship via config + re-seed without manual SQL. Logged as `"World Cup 2026 entry fee synced: £30.00 → £10.00"` on first run; idempotent thereafter.
- **HomePage WC card explainer** now reads: *"One bracket. One £10 entry. Full-time scores only — no extra time, no penalties. Predict each round as the bracket fills in."* The £10 interpolates from `pool.tier.entryFee` so it auto-corrects if pricing changes again.
- **Home — 75/25 disclosure**: new `PrizeFundNote` component rendered at the bottom of `HomePage.tsx`, outside the cards block and the empty-state block. Always visible regardless of entry state. Copy verbatim: *"75% of all entry fees are allocated to the prize fund. The remaining 25% is retained by Predictor10 to cover operating, administration and platform costs."* Subtle bordered card, muted text — UKGC-conformant disclosure pattern.
- **Tables — Pot label**: TierHeader meta line gains a `Pot £X` segment after the player count: `£10 · 3 players · Pot £30`. Hidden when entry count is 0. Computed as `entryFee × entryCount`; matches the gross pot that settlement reads off. Applies to all tiers.
- **Settlement reads from `tier.entryFee × entryCount`**, not from the `payments` table. Wez's pre-change £30 audit row in `payments` stays as a historical record; doesn't affect prize math on new entries at £10.

### Step 3a.13 — Real names + unique editable nicknames + marketing consent dropped
Schema expansion of `users` to separate KYC-bearing real names from publicly displayed handles. Driven by the 11 existing users with inconsistent `display_name` entries (full names mixed with handles).

- **Schema** (`server/db/schema/users.ts`): three new columns —
  - `first_name varchar(40) NULL` — KYC field, never displayed publicly.
  - `last_name varchar(40) NULL` — KYC field, never displayed publicly.
  - `nickname varchar(20) NULL` — public handle.
  - Nullable during the migration window so existing rows survive `db:push`. Signup enforces NOT NULL at the app layer for every new user.
  - Partial unique index `users_nickname_lower_idx` on `lower(nickname) WHERE nickname IS NOT NULL` — case-insensitive uniqueness, NULL excluded.
- **Signup form** (`RegisterPage.tsx`): "Display name" replaced with First name (1-40) + Last name (1-40) + Nickname (3-15, `[A-Za-z0-9_]` only, unique). Reserved nicknames blocked: `admin`, `administrator`, `moderator`, `mod`, `predictor10`, `predictor`, `support`, `system`, `staff`, `official`, `help`, `you`.
- **Signup endpoint** (`auth.ts`): schema now takes `firstName/lastName/nickname`. Pre-insert case-insensitive uniqueness check returns 409 with a clean error message; the partial unique index is the belt-and-braces backstop. `display_name` column still populated server-side (set to the chosen nickname for backwards compat).
- **One-shot backfill** (`server/scripts/backfill-names.ts`, NEW): pulls every row where `first_name IS NULL`, splits legacy `display_name` on whitespace:
  - `"James Woodhouse"` → first=`James`, last=`Woodhouse`
  - `"Jason"` → first=`Jason`, last=NULL
  - Nickname auto-generated by stripping non-alphanumeric from `display_name`, uniqueness-checked with numeric suffix on collision.
  - Idempotent — only touches rows with NULL `first_name`. Run via `pnpm tsx server/scripts/backfill-names.ts`.
- **Editable nickname** (`server/routes/account.ts`, NEW): `PATCH /api/account/nickname` — session-gated. Same validation as signup. Audit-logged as `user.profile_update`, before/after = `{nickname: old/new}`, metadata `{field: "nickname"}`. Survives anonymisation per LCCP 3-year retention.
- **AccountPage profile section** now shows a 2-row details card: "Full name" (read-only KYC field) + "Nickname" (inline-editable; pencil → input + tick/cross, Enter saves, Escape cancels, server errors render inline).
- **AppShell greeting** ("Hi, X") now uses `user.firstName ?? user.name` rather than splitting nickname on space (which broke for all-alpha nicknames like `JamesWoodhouse`).
- **Standings query** (`portal-data.ts`): standings select returns `COALESCE(nickname, displayName)` — DTO field name `displayName` retained for backwards compat, but the value is now the public nickname when set. No client-side `PoolStandingsTable` changes needed.
- **Marketing consent checkbox removed** from signup — UK GDPR requires explicit opt-in; absence of a tick = no consent. Hardcoded `marketingConsent: false` in the payload. Existing rows with `marketingConsent=true` from the old flow are untouched.
- **Deployment**: 8 files + `pnpm db:push` (3 columns + partial unique index) + `pnpm tsx server/scripts/backfill-names.ts` (populated all 11 existing users on first run).

### Step 3a.14 — Logged-out marketing redesigned to WC-only
Marketing surface (public / logged-out) refocused on the single WC product during the pre-licence informal run. Real visitors were getting confused by the multi-tier "pick a pool" UI when the only operational pool is the £10 WC.

- **Backups created**: `Home.tsx.bak`, `HeroSection.tsx.bak`, `LeagueShowcase.tsx.bak`, `HowItWorks.tsx.bak`, `MarketingShell.tsx.bak`. `.tsx.bak` extension is invisible to TypeScript (only `.tsx` is recognised). Restore by renaming back to `.tsx` in GitHub Desktop when PL/Champ pools come back online for 2026/27.
- **HeroSection**: copy rewritten for single-tournament focus. *"Predict the World Cup. Top three share the pot."* + *"One bracket, one £10 entry, 104 matches from group stage to the final on 19 July. Full-time scores only — no extra time, no penalties."* CTA pair: "Sign up — £10 to enter" + "I already have an account". No more mention of PL/Champ.
- **LeagueShowcase**: 4-tier picker replaced with a single 2-card layout — left card shows WC headline (entry £10, 104 matches, FT only, date range 11 Jun → 19 Jul); right card explains the prize fund (75/25 split, 60/25/15 across top 3, tie-break rules).
- **HowItWorks**: 3 steps with the middle one rewritten — was "Pick a pool" (the confusion), now "Predict every match" with WC format specifics. Scoring rules preserved on step 3.
- **MarketingShell nav**: trimmed from 5 items (Play / Leagues / Leaderboard / History / Rules) to 2 (Play / Rules). Sign In stays in its own slot. The `/leagues`, `/leaderboard`, `/history`, `/fixtures`, `/cart` routes still resolve — just unlinked. Anyone with a bookmark still lands somewhere; cleaner than ripping out routes mid-flight.
- **Dropped from Home assembly**: `LeaderboardPreview` (was showing mock "Premier league gameweek 35" data — exactly the source of confusion) and `TrustBand` ("Virtual credits, no money in or out" contradicted the £10 reality).
- **Pending follow-up**: `SiteFooter` still has a "Test mode: free-to-play, virtual credits, no real money accepted" amber banner that contradicts the £10 messaging. Left untouched to keep the batch focused; rewrite before licence application submission.

### Step 3a.15 — Admin portal (in-app user management)
First user-facing admin surface. Distinct from `/api/admin/*` (machine-to-machine, X-Admin-Token gated) which still exists for cron / maintenance. The new portal is session-gated, role-gated, audit-logged.

- **Schema**: two new boolean columns on `users`:
  - `is_admin boolean NOT NULL DEFAULT false` — gates the `/admin` route + Admin bottom-nav tab.
  - `is_paid boolean NOT NULL DEFAULT false` — tracks admin confirmation of off-platform £10 receipt during the informal WC run. Cleared when WC retires.
- **Seed** (`server/scripts/seed.ts`): new `seedAdmins()` step at end of orchestration. Founding admin allowlist hardcoded: `westley@sweetbyte.co.uk`, `mrwoodhouse@live.co.uk`, `jgs2011@hotmail.co.uk`. Idempotent — promotes matching users to `is_admin=true`, demotes any non-matching user that has `is_admin=true` (seed.ts is canonical source of truth for admin grants).
- **New router** (`server/routes/admin-portal.ts`, mounted at `/api/admin-portal/*`):
  - `requireAdmin` middleware: session present + `is_admin === true`. Non-admins get **404 Not Found** (not 403 — keeps the surface invisible).
  - `GET /users` — list every user with id, email, names, nickname, signup date, country, status flags. Password hashes never exposed.
  - `POST /users/:id/password` — admin sets new password directly. Argon2-hashed; audit-logged as `user.password_change` with the acting admin's id+email in metadata. Password value is NEVER logged.
  - `PATCH /users/:id/paid` — toggles `is_paid`. Audit-logged as `admin.action` with before/after = `{isPaid: bool}`, metadata `{field: "isPaid", performedBy, performedByEmail}`. No-op when state already matches; only real toggles get audited.
- **Bottom nav** (`AppShell.tsx`): conditional 5th tab "Admin" (shield icon, `/admin`) for users where `user?.isAdmin === true`. **Strict equality** — defensive against future type drift on the user payload. Non-admins see the original 4-tab grid; admins see 5. Grid class swaps dynamically (`grid-cols-4` / `grid-cols-5`).
- **AdminPage** (`client/src/pages/portal/AdminPage.tsx`, NEW): mobile-first user list. Each user is a card with name + nickname + admin pill + email + country + join date. Right-side controls: "Paid" checkbox (optimistic update, rolls back on server error, audit-logged) and "Reset password" button (opens modal — admin types new value, "Saved" confirmation, auto-close, told user out of band).
- **Three layers of admin gating** (intentional defence-in-depth):
  1. **Tab visibility** — `user?.isAdmin === true` → no Admin tab in nav for non-admins.
  2. **Server 404** — `/api/admin-portal/*` returns 404 for non-admins, masking the surface.
  3. **Client guard** — AdminPage refuses to call the API when local user state isn't admin; renders "Not found." immediately even if someone navigates to `/admin` by URL.
- **Audit-log impact**: every paid toggle + password reset writes a row to `audit_log` with the acting admin's id and email in metadata. Demonstrable record-keeping for the licence application.
- **Deployment**: 11 files + `pnpm db:push` (adds 2 boolean columns; existing rows default `false`) + `pnpm seed` (promotes the 3 founding admins). Wez ran both successfully on first deploy.
- **Test-user cleanup pattern** (post-deploy): for removing a test user completely from DB + WC standings, transactional `psql "$DATABASE_URL"` block from Render Shell. Delete order: `payments` → `pool_entries` (cascades `predictions`) → `audit_log` → `users` (cascades `sessions`/`email_verifications`/`password_resets`/`session_minutes`/`user_limits`/`self_exclusions`). Wrap in `BEGIN`/`COMMIT` so it's atomic. Verified working — Wez wiped `wez@thegreenagents.com` after admin testing.


### Step 3a.16 — Pre-WC audit + P1/P2 production fixes + predict lock note + manual late entries (June 11 2026)

Full read-only audit of the prediction → lock → scoring → settlement → standings stack ahead of the group stage (kickoff June 11). Core maths confirmed sound: FT-only scoring, server-side lock enforcement, null-team gating, shared `rankEntries` tie-break (standings == settlement), idempotent settlement, penny-accurate payout rounding, WC prize structure (60/25/15, 25% house, £10), and the `(league_id, stage_id)` unique index that makes a duplicate WC pool impossible. Five issues found, graded P1–P4:

- **P1 (fixed, deployed)** — duplicate entry race. `pool_entries` had no `(pool_id, user_id)` unique index; `enterPool`'s pre-flight SELECT-then-INSERT could let a double-tap / second tab / network retry create two entries + two debit payments for one user, inflating entryCount → pot → prize breakdown and putting the user on the table twice. Fix: `uniqueIndex("pool_entries_pool_user_idx").on(poolId, userId)` in `schema/pools.ts` + `enterPool` now wraps the insert in try/catch, recognises Postgres `23505` via `isUniqueViolation()`, rolls the transaction back (no orphan payment) and resolves to "already entered". Deployed; dedupe-check query confirmed zero existing duplicates; `pnpm db:push` built the index clean.
- **P2 (fixed, deployed)** — settlement racing unscored predictions. Outcome-write and prediction-scoring in `outcome-sync.ts` are separate non-transactional steps, and the scheduler runs sync (5 min) and settle (15 min) as independent crons that can overlap; a settle pass could observe a finished event whose predictions weren't yet scored and count them as 0 (worst case: the Final). Fix: `findReadyPoolIds()` in `pool-settle.ts` gained a `NOT EXISTS` guard — a pool is not "ready" while any of its predictions on a `status='finished'` event has `points_awarded IS NULL`. Next sync scores them, pool settles on the following pass. Score source untouched (still 90-min FT only). Cancelled/void + forfeit-postponed predictions stay null but their events aren't 'finished', so they don't trip the guard.
- **P3 (left as-is by choice)** — first-write-wins on `event_outcomes` means a football-data score correction is never re-applied. Wez's call: do NOT build auto-correction — silently rewriting a settled score is the dangerous path (a bad FD value could flip results and the whole leaderboard). Admin-only "scores diverged" alert was considered and deferred. No code change. See follow-up.
- **P4 (dropped)** — display breakdown renders 3 prize lines even when a pool has <3 entrants; unpaid split evaporates as mock dead money. Irrelevant at WC entry volumes. Dropped.

Also this step:
- **Predict-screen lock note** — `PoolDetailPage.tsx` now shows one muted line on live (non-settled) entries: "Each match locks 1 hour before kick-off. Edit your picks any time until then." No logic change; client page component only (does not touch `vite.config.ts` / `client/index.html`, so the step 2v crossorigin refresh fix is unaffected — verified the built `index.html` carries `crossorigin` only on the fonts preconnect, never on the module script).
- **Manual late entries (admin override)** — Wez allowed two late entrants (Waynebow, bert) to predict the opener after the 1-hour lock. Predictions inserted directly via Render Shell: Waynebow Mexico 2-0 South Africa, bert Mexico 2-1 South Africa. `points_awarded` left NULL so the normal scheduler scoring picks them up at FT. Rows tagged `ip_address='admin-shell-late-entry'` for audit. Orientation computed from the event row in SQL (not hardcoded) to rule out a reversed scoreline. Governance flag raised — see follow-ups.

Verification before delivery: `pnpm install --frozen-lockfile` clean, `pnpm build` exit 0, `tsc` unchanged at 18 pre-existing errors (zero new).

### Step 3a.17 — Predict-screen lock-rejection display fix (June 13 2026)

Live bug surfaced during the group stage. A user (Wez) loaded the predict screen before a match's 1-hour lock, then tried to change a saved prediction (Qatar 0-1 → 0-2 Switzerland) ~9 min before kickoff — i.e. ~51 min *after* the lock (lock = kickoff − 1hr). The server correctly rejected the post-lock write with 403 (verified against the live DB: stored value stayed 0-1, `updated_at` unchanged from the first save on 5 June), so the lock itself was never broken. But the client left the typed-but-unsaved "2" on screen, showing a phantom 0-2 that only cleared on a hard refresh.

Cause: `PredictMatchRow.tsx` reset its local input state only when the *saved* prediction changed (the snapshot-reset effect). A lock-rejection by definition leaves the saved value unchanged, so the reset never fired and the rejected value lingered in local state.

Fix: in the auto-save catch block, when the error is a 403 lock-rejection, explicitly revert `homeText`/`awayText` to the saved prediction (or empty if none). The row snaps back to the real saved pick immediately; the parent's existing one-shot refetch then flips `isLocked` and the row renders its read-only locked state. No save-loop — after the revert the values equal the saved ones and the lock guard short-circuits the auto-save effect anyway. Client-only: no server, schema, build-config, or `vite.config.ts` / `client/index.html` change (step 2v crossorigin refresh fix unaffected — built `index.html` still carries `crossorigin` only on the fonts preconnect).

No data correction needed — the DB always held the correct 0-1; the bug was purely cosmetic with no scoring or money impact. Verification: `tsc` unchanged at 18 pre-existing errors (zero new), `pnpm build` exit 0.

### Step 3a.18 — Player-predictions view, live status, predict-feed reorder, honest footer (June 14 2026)

A run of in-flight gameplay/UX work during the group stage. All client-side except one new read-only server endpoint; no schema or package changes anywhere in the step.

**1. Removed the "test mode / virtual credits / no real money" copy (pre-application honesty blocker).** The amber banner contradicted the live £10 reality. Deleted outright (Wez's call — delete, not reword) from three live surfaces: `SiteFooter.tsx` (amber banner + the "in test mode through the 2026 world cup" blurb line), `AuthShell.tsx` (the banner under the login/signup card), and `RegisterPage.tsx` ("Free to play. … Email confirmation will follow." → "Takes about thirty seconds." — also dropped the untrue email-confirmation claim, since Resend isn't wired yet). The `TrustBand.tsx` component is not rendered (already removed from `Home.tsx`); its copy is dead.

**2. P3 score-correction gap — SUPERSEDED by step 3b.13 (see §24); the underlying principle still holds.** Originally accepted as low-risk and left first-write-wins-only with no alert ("scores diverged" alert dropped from follow-ups at the time). The 21 Jun Spain 4-0 Saudi incident (recorded 5-0 from a transient pre-VAR value) proved the residual was real, so Wez directed the full fix in 3b.13: **confirm-before-commit** prevention + first-write-wins immutability + the divergence alert (now built, Admin → Score alerts) + an audited manual correction tool. The enduring principle is unchanged and must NOT be relitigated: **never silently auto-overwrite a recorded score** — corrections are deliberate, human, and logged. Do not describe P3 as open/deferred, and do not propose auto-overwrite.

**3. NEW FEATURE — view another player's predictions (lock-gated, anti-cheat).** Tap any player row on the league table → a read-only screen of their picks for that pool.
- Server: `getEntryPredictionsForViewer(poolId, entryId, viewerUserId)` in `portal-data.ts`, exposed at `GET /api/pools/:poolId/entries/:entryId/predictions`. Access mirrors the table exactly (public when settled; auth + entrant for live pools → 401/403; 404 for unknown pool/entry).
- **Anti-cheat guarantee:** a pick's scores are included in the payload **only** when the match has locked (`predictionLockAt <= now`, i.e. `predictionVisible = isLocked || ownEntry`). Unlocked picks are omitted entirely — never sent, so they can't be read off the wire. This is safe because the lock is symmetric: by the time you can see someone's pick, your own pick for that match is locked too.
- Client: new page `OpponentPredictionsPage.tsx` at route `/pools/:competitionSlug/:poolId/table/:entryId` (registered in `App.tsx` *before* the bare `/table` route). `fetchEntryPredictions` + types in `portal-api.ts`. Tap-through added to `PoolStandingsTable.tsx` via an optional `linkTo` prop, wired on both `PoolTablePage.tsx` (full table) and `TablesPage.tsx` (Tables tab).
- Nickname-only display (never real names). Re-fetches on window focus while live so newly-locked picks appear.

**4. Live status + juice.** Pulsing red "LIVE" badge (radar-ping dot + red row tint) on in-play matches, on **both** the player-predictions view and the Predict screen (`PredictMatchRow.tsx`). A distinct calm amber "Locked · awaiting kick-off" status marks the locked-but-not-started window (the hour between lock and kickoff). "Live" = kicked off (`kickoffAt <= now`) + not finished + not terminal; relies on the scheduler's `status='live'` sync (every 5 min) plus the kickoff-time derivation, so it shows within a few minutes of real kickoff and flips to the result a few minutes after FT. No live in-play score feed exists — actual scores only appear at full time.

**5. Predict-screen feed reorder (Decided Rule #12 refined, competition-agnostic).** Inside the open GW/round tab, matches are now a single ordered feed instead of day-grouped: **live (top) → still-predictable (soonest deadline first) → locked-about-to-start → finished (most recent first) → awaiting-teams (bottom).** A finished live game drops into the historical block automatically. Day headers ("FRI 12 JUN") and knockout stage headers ("Round of 32") were removed from inside the tab; instead every row now shows its full date and, for knockouts, its round inline (`formatKickoff` now includes the date; `stageLabelFor` on the rows). The GW/round tabs themselves and the default-tab logic are unchanged. One shared code path (`PoolDetailPage` `comparePredict` / `predictTier`, `PredictMatchRow`) — applies to PL, cups and WC with zero per-competition branching.

**6. Player-view ordering + clarity.** The player-predictions view shows locked-or-later matches only (live → about-to-start → finished), and every row clearly labels the prediction as "Pick" (so a pick can't be mistaken for a score) with the actual result shown as a prominent green "FT" + bold scoreline on finished rows.

**Docs:** `portal-architecture.md` §15 updated with two notes — (a) all these gameplay features are competition-agnostic and carry to the Premier League/cups for free (restoring PL is marketing-only, the `.tsx.bak` rename), and (b) **removal of a competition from the active surfaces must be operator-triggered, not automatic** (see follow-up below).

**Build verification:** `pnpm install --frozen-lockfile` + `pnpm build` exit 0. **tsc baseline dropped from 18 → 15** — the removed Predict-screen grouping code carried a few of the old pre-existing errors; zero new errors introduced anywhere this session. New baseline for future "zero new errors" checks is **15** (all in `client/src/lib/fixture-sync.ts`, `client/src/lib/outcome-sync.ts`, `server/lib/portal-data.ts`).

**OPEN — not yet built, awaiting Wez's go (pre-Final operational priority):** the WC must not auto-disappear from Home/Tables when the Final settles. Today `getCompetitionsWithOpenPools` filters `pools.status='open'`, so a settled pool drops off the active surfaces the instant it settles — the same end-of-season vanish Wez disliked on PL. The agreed fix (not yet coded): keep a settled pool visible on the active surfaces while its competition is still `isActive=true`, so removal only happens at the manual retirement step (Wez's say-so). Nothing is ever deleted either way — settled data always remains in `/account/history` and at the settled-table URL. Build this before ~19–22 July.

### Step 3a.19 — Engagement ("juice") session: table chat, pick distribution, live/timing treatments (June 15 2026)

A run of engagement features during the group stage. One schema change (chat), the rest client + read-only server. tsc baseline held at **15**, zero new errors; no `package.json`/lockfile change.

**1. NEW FEATURE — per-pool table chat (TEMPORARY, WC-only).** Each pool gets a chat, reached from a "Table chat" button on the Tables page (shown only to entrants, under the You/position card). Entrant-gated read + post; nickname/`displayName` author; plain text + emoji only (no images, no link auto-linkify); 500-char cap; 5-msg/10s rate limit; self-excluded users blocked from posting (reuses the dormant `self_exclusions` gate); admin soft-delete ("Hide", audited as `admin.action`). Polling, not websockets (5s while open + focus refetch) — deliberately matches the app's polling philosophy; no Redis/queue. **Moderation deferred to scale/licence:** no report queue, no automated content filter (the free OpenAI moderation endpoint slots into the POST path later) — admin-hide is the only moderation now, which is right for 11 mates.
- New: `server/db/schema/messages.ts` (`pool_messages` — id, pool_id, user_id, body, soft-delete `hidden_at`/`hidden_by`/`hidden_reason`, created_at), `server/lib/chat-data.ts`, `client/src/pages/portal/PoolChatPage.tsx`. Edits: `schema/index.ts`, `portal.ts` (GET/POST `/pools/:id/messages`), `admin-portal.ts` (POST `/messages/:id/hide`), `portal-api.ts`, `App.tsx` (route `/pools/:competitionSlug/:poolId/chat`), `TablesPage.tsx` (button).
- **TEMPORARY — built to be torn out after the WC.** Every shared-file edit is wrapped in `// ── WC CHAT (temporary) ── start/end` sentinel comments; the three new files delete outright. Full removal checklist in `docs/wc-chat-teardown.md` (trigger phrase: "Read the WC chat teardown doc and remove the chat"). `pnpm db:push` was run on the live DB (created `pool_messages` + FKs + 2 indexes, non-destructive).
- **Regulatory note (important for licence prep):** chat is the *only* feature that turns Predictor10 into a "user-to-user service" under the **Online Safety Act 2023 (Ofcom)** — a second regulator on top of the UKGC, and it applies regardless of size. Brings illegal-harms risk assessment, a reporting/complaints route, message-log retention, and CSAM duties. Fine for the informal WC run (low practical risk, admin-hide + retention in place); it's a documented line item before chat ships in the licensed product. Everything else this session stays purely inside the UKGC frame. See pre-launch §3.

**2. NEW FEATURE — pick distribution ("How the table called it"), permanent.** A tap-to-expand panel rendered **inside each match card** (live, about-to-start, finished) showing how the table called a **locked** match: home/draw/away split bar, top-3 most-predicted scorelines, the viewer's own pick highlighted, and a **"21/23 picks"** label (predictions / total pool entrants — so missed picks are visible). Locked-events-only and entrant-gated, reusing the §13 Rule #7 anti-cheat lock (nothing leaks pre-lock; the server never returns an unlocked event). Pure read.
- New: `server/lib/insight-data.ts` (`getPoolPredictionDistribution`), `client/src/components/predictor10/PickDistribution.tsx`. Edits: `portal.ts` (GET `/pools/:id/distribution`), `portal-api.ts`, `PredictMatchRow.tsx` (renders the panel inside each card via a `MatchDistribution` helper; takes `distribution` + `entrantCount` props), `PoolDetailPage.tsx` (fetches once per pool, focus-refetch while unsettled, passes the per-event slice + entrant count down). Competition-agnostic — carries to PL/cups. No schema change.

**3. Predict-screen live + timing treatments (refines §13 Rule #12 and the step 3a.18 feed).** All in `PredictMatchRow.tsx` + `PoolDetailPage.tsx`:
- **Countdowns** on the meta line — "Locks in 1d 05:00" while predictable, "Kicks off in 23m" once locked. Day-aware format (`Xd HH:MM` past 24h). Both go **amber + slow pulse** under their threshold (lock: 6h; the kickoff countdown is always imminent so it always pulses). On expiry they fire `onLockElapsed` → the page refetches → the row flips state on its own (lock → locked, kickoff → live) without waiting for a manual refresh.
- **Live card** (`LivePredictionView`) — an in-play match no longer shows faded mystery boxes. It gets a dedicated rose card with the predicted scoreline in big boxes clearly labelled **"Your pick"** + the pulsing LIVE badge, so the prediction never reads as "gone". *(Still no live in-play score — that's parked, see below. This keeps the pick prominent and on screen through the match.)*
- **"About to start" juice** (`KickoffSoonBadge`) — a locked-but-not-kicked match now gets an **amber card + bright team names + pulsing "STARTS SOON" badge + amber pulsing kickoff countdown**, a clear notch below the red LIVE energy. Per-match, so multiple simultaneous imminent games each light up (built with PL Saturdays in mind).
- **Feed ordering corrected.** New tier order, top→bottom: **live → about-to-start (soonest KO first) → finished within the last hour → still-predictable (soonest deadline first) → older played → awaiting-teams.** This fixes two reported issues: (a) a just-finished match no longer drops instantly to the history pile — it lingers an hour so you see your result; (b) an imminent locked match (e.g. KO in 23m) now sits at the top instead of *below* matches that don't lock for two days (the step 3a.18 order wrongly put about-to-start below still-predictable). Re-sorts on refetch (focus / countdown expiry), not on a live ticking clock.

**Parked / declined this session (don't lose the reasoning):**
- **Live points-on-pace — PARKED on cost.** The highest-juice idea (your predicted line tracking a live match) needs real-time scores. **football-data.org's free tier does NOT provide live scores** (delayed); real-time requires the paid **livescores add-on (~€12/month)**. Declined a "delayed live" compromise — a wrong live number in a betting product is worse than none. If greenlit later: live score must stay **completely out of the settlement path** (`eventOutcomes`/`extractRegulationScore` remain FT-only; live score in a separate side store, display-only), and it needs a faster (~30–60s) tick gated to when a pool actually has a live match. The new live card is the layout it would drop onto.
- **Reactions** (emoji on a rival's pick) — scoped then dropped (Wez: "a bit cheesy").
- **Head-to-head callouts** — proposed, not wanted.
- **In-app music / crowd-cheer audio — declined.** Licensing cost (PRS/PPL) for real tracks, PWA autoplay limits, and — the real reason — celebratory audio tied to *staking* (a cheer on predicting) is a responsible-gambling red flag for a licensed operator. A cheer on a *correct result* (rewards skill, not the bet) would be the only defensible version, opt-in/off-by-default, royalty-free — not built.

**Build verification:** `pnpm install --frozen-lockfile` + `pnpm build` exit 0; `pnpm check` = 15 (baseline, zero new). Only DB op all session: `pnpm db:push` for `pool_messages` (no seed change).

### Live deployment state (post step 3a.18)
- Render web service deployed at `https://predictor10.com`. Build green.
- **Render plan: Starter ($7/month)**. Always-on — no idle spin-down. Cold starts only occur on deploy / crash recovery. Single instance.
- **11 real users on the platform**, WC entries flowing in. **Group stage is underway** — opener Mexico v South Africa kicked off 11 June 19:00 UTC. Two late entrants (Waynebow, bert) were manually given opener predictions via shell after the lock (step 3a.16).
- **Render Postgres state**:
  - Schema includes everything through step 3a.16: `postponedPolicy` enum + column on competitions, nullable `home_team`/`away_team` on events, `group_label` and `fd_stage` columns on events, `first_name` / `last_name` / `nickname` / `is_admin` / `is_paid` columns on users, partial unique index on `lower(nickname)`, and (new in 3a.16) the `pool_entries_pool_user_idx` unique index on `(pool_id, user_id)`. **(step 3a.19)** the `pool_messages` table (temporary WC chat — dropped at retirement per `wc-chat-teardown.md`); `pnpm db:push` applied to live.
  - 3 competitions: `premier-league` (active, wait, 9 stages, 380 events, 5 pools incl. retired Pound), `championship` (active, wait, 9 stages, 552 events, 0 pools — between seasons), `world-cup-2026` (active, forfeit, 1 stage, 104 events, 1 pool, entry £10).
  - 6 tiers (leagues): Pound £1 (inactive), Fiver £5, Tenner £10, Pony £25, Big One £50, World Cup 2026 £10 (was £30 — synced down in step 3a.12).
  - 3 users flagged `is_admin=true`: Wez (westley@sweetbyte.co.uk), James Woodhouse (mrwoodhouse@live.co.uk), Jason (jgs2011@hotmail.co.uk).
- **WC end-to-end live and verified parity with Premier League**:
  - Home shows WC card with explainer ("One bracket. One £10 entry. ..."), 75/25 prize-fund disclosure at the bottom of the page.
  - `/enter/world-cup-2026` confirm screen routes to entry.
  - `/predict/:entryId` for WC shows tabs "Group MD1 / Group MD2 / Group MD3 / Knockout Stages".
  - Group rows show group letter ("Group A · TIME · ..."). Knockout tab is grouped under sub-headings (Round of 32 / Round of 16 / Quarter-finals / Semi-finals / Third-place playoff / Final).
  - Knockout rows render "TBD - TBD" with "Awaiting teams" copy + disabled inputs until FD populates real teams after group stage ends June 27.
  - FT-only scoring confirmed in code path (`extractRegulationScore` reads `score.regularTime` when `duration !== 'REGULAR'`).
  - League table at `/pools/world-cup-2026/{poolId}/table` shows entrants by nickname (or fallback) with the Pot label (e.g. `£10 · 3 players · Pot £30`) and tournament-aware status pill.
- **Logged-out marketing site**: WC-focused single-page landing per step 3a.14. Nav trimmed to Play + Rules. Original multi-tier marketing components live alongside as `.tsx.bak` files for restoration when domestic-league play returns.
- **Admin portal live** at `/admin` for the 3 founding admins. User list with paid checkbox + password reset; 4-tab bottom nav becomes 5-tab for admins only.
- **Active-tier prize structure**: 25% house fee, top 3 paid at 60/25/15 of the player pot. Identical across Fiver / Tenner / Pony / Big One / WC. **Pound's open pool still on legacy 70/20/10 with no commission** — deliberate, retired tier settles under original rules. Round 9 Pound settles Sun 24 May 2026; from Round 10 onwards no Pound pools are created.
- Bottom nav: HOME / PREDICT / TABLES / ACCOUNT (+ ADMIN for the 3 admins).
- Render env vars: `DATABASE_URL`, `FOOTBALL_API_KEY`, `NODE_ENV`, `BYPASS_LATE_ENTRY=true`, `ADMIN_SECRET`, `SESSION_SECRET`. Optional: `DISABLE_SCHEDULER=true` pauses the in-process scheduler.
- Node pinned `22.20.0` via `.nvmrc` + `engines.node`. Build command reads `corepack enable && pnpm install --frozen-lockfile && pnpm build`.
- **Automated scheduler running in-process** (step 2o). Score sync every 5 min, pool settle every 15 min, both inside the Express server.
- **iPhone refresh stability**: step 3a.11's analytics-script removal eliminated the boot-derailment vector. Wez confirmed reload works reliably.

### Step 3a.20 — Predict-screen FinishedView redesign (20 June 2026)
The Predict-screen "finished match" card was confusing: the big score boxes meant "your prediction" in every other state but silently flipped to "the FT result" once finished, with the actual pick buried in tiny "You: 3-0" text, and the card was emerald-tinted (looked celebratory even on 0 pts). Rewrote `FinishedView` + `FtScoreBox` in `PredictMatchRow.tsx`: muted settled card, centred **"FULL TIME"** eyebrow, neutral result boxes (not emerald), and a dedicated labelled **"Your pick X – Y"** chip with the points pill. No history tab (timeline ordering + `/account/history` already cover it). Single file: `PredictMatchRow.tsx`.

### Step 3b — Eliminator10, a second game mode (20 June 2026)
New last-survivor / **elimination** game (full canon in arch **§22**). Pick one team to win each round; win in normal time survives; loss/draw/no-pick out; one-team-once; last entrant wins. Its own Home card + pick screen + survivors board; reuses login / payments / fixtures / compliance. **Free** WC demo, built **PL-ready**. Built in sub-steps:
- **e1 schema** — `db/schema/eliminator.ts` (5 tables + 4 enums); `db:push` applied.
- **e2 seed** — Phase 6 `seedEliminatorGames`; `pnpm seed`.
- **e3 play server** — `lib/eliminator-data.ts` + `routes/eliminator.ts` (overview / join / pick / survivors); audit actions added (`db:push`).
- **e4 survival engine** — `lib/eliminator-settle.ts`, hooked into the 15-min settle tick.
- **e5 client** — `portal-api.ts` Eliminator section, `EliminatorPlayPage`, `EliminatorSurvivorsPage`, `EliminatorRules`, Home card, `App.tsx` routes.

Then, before launch: **UK-matchday round grouping** (`matchdayKey`, 06:00 cut-off) which fixed the 2am-UK lock problem — every round now locks 17:00–22:00 UK, verified across the whole WC; a self-expiring **`startFrom`** launch cutoff so Round 1 opens on the **Spain matchday** (locks Sun 21 Jun 17:00); a **"Starting soon"** Home-card note; a **private used-teams** list on the pick screen; a **tactics** rule callout (one-team-once can strand you in the thin knockout rounds); the trademark **wording change** (no "last man / player standing" → **"elimination game" / "outlast the field"**; internal `last_standing` id kept as it's never shown); and **green** Survivors/Rules header pills. Launched live: `world-cup-2026-eliminator`, **24 rounds**, free, open registration, e5 deployed and phone-tested. tsc baseline stayed **15**.

### Steps 3b.1 – 3b.7 — Eliminator10 lobby, naming, promo + polish (21 June 2026)

A run of UX work on top of the step-3b Eliminator launch. tsc baseline stayed **15** throughout; all front-end + seed/docs, no schema change.

- **League tiers cut to three (step 3b.3).** The Fiver (£5) retired alongside the already-retired Pound (£1) — small stakes don't clear fees vs the 75% player pool. League tiers are now **The Tenner (£10) / The Pony (£25) / The Big One (£50)**, applied to PL and Championship. WC stays a single £30 tier. Swept all conflicting refs in arch §3 + roadmap principle #4. The `fiver` seed row stays `is_active=false`.
- **Eliminator10 lobby (`/eliminator`).** Home now shows a single **Eliminator10 mode tile** (under a "More ways to play" band, below the WC competition) that routes to the lobby — not auto-enter. New `EliminatorLobbyPage.tsx` + a Predict-tab strip of games you're in. Reuses `fetchEliminatorOverviews()` (GET /api/eliminator) — no backend change.
- **Lobby simplified to three self-contained tabs (3b.7):** Your games / Open to join / Finished. The floating "new game" action prompt was **removed** — each tab stands alone, CTAs live on the cards (**Make pick** on a pick-due row in Your games; **Join** on a joinable row in Open to join). Lands on Your games by default if you're in any. Each card shows its **current round** (e.g. "Round 1 · Picked · locks in 9h"; "Free · Round of 32 · Starts <when>"). Open rows use "**Starts <when>**" — for an Eliminator the game starts and entries close at the same instant (first kick-off), so one line covers both.
- **WC Knockout Eliminator added (3b.4).** `world-cup-2026-knockout-eliminator`, free, `knockoutOnly: true`, gated by **stage** not date (`ne(events.fdStage, "GROUP_STAGE")`) so rounds run LAST_32 → Final. **Stage-based round naming** via `knockoutStageName()` (Round of 32 / Last 16 / Quarter-finals / Semi-finals / Third-place play-off / Final; multi-day stages get "(N)"). Verified in DB: reads "Round of 32 (1)…(6)" etc. NOTE: round names are baked at game creation — `pnpm seed` skips existing rounds, so renaming needs delete+reseed *after* the new seed code is deployed.
- **"Game N" naming convention locked (3b.7).** Future staggered weekly games (PL/Champ) are named **"{Competition} · Game N"** (N in opening order, per comp/season) so they're trackable everywhere (lobby/history/your-games). Applies when weekly seeding is built (nothing to seed until those seasons are live). The two WC games kept descriptive names — **OPEN DECISION: Wez hasn't confirmed whether to renumber them into Game 1/Game 2.**
- **TEMPORARY launch promo (3b.6).** `EliminatorPromoModal.tsx` — one-time welcome modal on app open (sentinel-fenced, mounted in HomePage). Device-scoped (localStorage `p10_elim_promo_seen_v1`), only shows while a game is open to join, **auto-hides after 28 Jun 19:00 UTC**, routes to the lobby (never auto-enter), deliberately gentle (RG-safe). Teardown ~Mon 29 Jun — see `docs/eliminator-promo-teardown.md`. Roadmap has the dated task.
- **Back button (`BackButton.tsx`).** Replaced the "← Home" links on the lobby / play / survivors pages with a shared **Back** that returns to the *actual previous page* (`window.history.back()`, sensible fallback on cold load).
- **Scroll-to-top fix (AppShell).** Some pages opened part-scrolled because the browser restored the previous scroll position after the reset, and the old reset targeted `<main>` (which never scrolls — the document does, the column is `min-h-screen`). Fix: `history.scrollRestoration = "manual"` + reset the **window** (and roots/main defensively) on every navigation, repeated after paint. Every page now opens pinned to top. **Shared shell — affects all pages** (intended); not vite.config/index.html, so no crossorigin risk.

New client files this session: `EliminatorLobbyPage.tsx`, `EliminatorPromoModal.tsx`, `BackButton.tsx`. New route: `/eliminator` (lobby). Open decisions/concerns carried forward: WC Game-N renumber (decided 21 Jun — **NO**, the two WC games keep descriptive names; "Game N" applies only to future weekly PL/Champ games); **knockout rounds-vs-teams maths** — R32 is split into ~6 daily pick-rounds and "one-team-once" gets very tight in the thin late knockout rounds; flagged, not actioned, worth a proper think before paid.

### Step 3b.8 — App-wide scroll-to-top fix: single fixed-height scroll container (21 June 2026)

The recurring "pages open slightly scrolled down, top text tucked under the sticky bar" bug — finally fixed, and the fix is confirmed working on Wez's phone. History: the step-3b.7 AppShell reset and a follow-up `scroll-behavior: smooth` removal both failed to hold; pages still landed part-scrolled, and the offset tracked how far the *previous* page had been scrolled.

**Root cause.** The **whole document** was the scroll container. The AppShell column was `min-h-screen`, so content grew the page past the viewport and the window/document scrolled. On same-document (SPA) navigation the browser carries that document scroll position into the next page, and the reset couldn't reliably beat it (worst on data-fetching pages like Eliminator, where async content reflows after the reset).

**Fix — turn the portal into a fixed-height app frame so only the content area scrolls, never the document.** In `AppShell.tsx`:
- Outer is now `h-[100dvh] overflow-hidden` (was `min-h-screen`); the centred column is `h-full`; `<main>` is the **single** scroller (`flex-1 min-h-0 overflow-y-auto overscroll-contain`). Top bar + bottom nav are fixed-height flex siblings (their existing `sticky` is now redundant but harmless, and helps the no-`dvh` fallback).
- Scroll reset targets `main.scrollTop = 0` in a **`useLayoutEffect`** (before paint, no flash), plus a `requestAnimationFrame` + 80ms follow-up to beat late async content. Window / `documentElement` resets kept as a harmless fallback for any browser that ignores `dvh`.
- `scroll-behavior: smooth` removed from `html` in `index.css` (it had been turning the reset into an interruptible animation).
- `100dvh` + `overscroll-contain` are also the **correct native pattern** for the future iOS/Android (Capacitor) wrap — `dvh` tracks the usable height as mobile toolbars show/hide. So this fixes today's web bug and a guaranteed future native one.

**Verified clear of the step-2v crossorigin fix:** `vite.config.ts` and `client/index.html` were untouched (diffed byte-for-byte against the prior build); the freshly built `index.html` still strips `crossorigin` from the module script + stylesheet and keeps it only on the font preconnect. `pnpm build` exit 0; tsc baseline unchanged (15).

Files: `AppShell.tsx`, `index.css`.

> **If this ever bites again — the invariant:** the portal must have exactly ONE scroll container (`main`); the app frame height must be fixed (`100dvh`, not `min-h-screen`); the scroll reset must target `main`, not the window. Do **not** reintroduce `min-h-screen` on the AppShell column, and do not add a second `overflow-y-auto` ancestor above `main` (a page may have its own inner scroller — e.g. the chat — that's fine, but the shell stays single-scroller).

### Step 3b.9 — Juice pass #1: RG-safe polish (21 June 2026)

First batch of "juice" (see arch §23 for the full design rules + UKGC red lines). The guiding rule: celebrate **skill, anticipation and standing**, never spending or urgency-to-spend. Batch 1 is all front-end, no schema, no backend, no new deps:
- **Tap feedback** — a gentle press-state (slight scale + dim) on buttons and links, app-wide via `index.css`. Makes the whole app feel responsive in one change.
- **Animated count-up numbers** — new reusable `AnimatedNumber.tsx`; numbers tick up to their value instead of snapping. Wired into the finished-prediction points first; reusable for pot/points elsewhere.
- **Exact-score reveal** — a one-shot sheen on the points pill in the Predict-screen `FinishedView` when you land an exact score (5 pts). Celebrates a correct *prediction*, not a stake.
- **Shimmer skeleton** — a `.p10-skeleton` utility (shimmer keyframes in `index.css`) to replace bare spinners on loading states going forward.
- All animations are gated behind `prefers-reduced-motion` (accessibility + store-readiness).

Files: `index.css`, `AnimatedNumber.tsx` (new), `PredictMatchRow.tsx`. Queued for later batches (need backend / data / paid feed / native wrap): skill **streaks + badges + form sparkline**; the **"against the grain"** reveal on pick distribution; the **settling-table row-climb** animation; **live "N matches live"** ticker (gated on the paid football-data livescores add-on); **pull-to-refresh**; **haptics** (Capacitor only).

### Step 3b.10 — Juice pass #2: the buildable-now batch (21 June 2026)

Built the rest of the RG-safe juice list that didn't need a paid feed or the native wrap. All front-end, no schema, no backend, no new deps; `prefers-reduced-motion` respected throughout; tsc baseline unchanged (15); crossorigin fix re-verified intact.

- **Against-the-grain reveal** — on a finished match, if you backed a result the table mostly didn't *and* you were right, the distribution block shows an emerald "Against the grain — you called it" banner (with the exact-score pop). Computed in `MatchDistribution` (`PredictMatchRow.tsx`) from the outcome + your pick + the distribution majority; new `resultOf()` helper.
- **Settling-table row-climb** — `PoolStandingsTable.tsx` now FLIP-animates rows to their new position whenever the standings re-order between renders (settle / refetch). Each visible row is wrapped in a ref'd div; a `useLayoutEffect` measures old vs new top and slides the delta. Reduced-motion skips it.
- **Podium shield badges** — top-3 rank cells in `PoolStandingsTable.tsx` now render shield-shaped badges in distinct bold colours (gold 1st / blue 2nd / red 3rd) via a new `RankBadge` sub-component (inline SVG, no Tailwind colour classes so the three never read alike; green avoided as it's the "you"/active colour), replacing the old flat amber number. Pure standing/skill recognition — RG-safe.
- **Form sparkline + earned badges** — on `AccountHistoryPage.tsx`, a points-per-round mini SVG chart (`FormSparkline`, pure SVG, no deps) plus derived badges (`badgesFor`): Champion / Podium / In the money / Regular / Top score. All computed from existing settled-history data — no backend. (NOTE: an *exact-scores-in-a-row* streak still needs a per-prediction results read the client doesn't get yet — flagged below.)
- **Shimmer skeletons** — new reusable `Skeleton.tsx` (`Skeleton`, `SkeletonRows`) using the `.p10-skeleton` utility; first applied to the Eliminator play loading state (replaced the spinner). Roll out to other loading states as touched.
- **Haptics** — new `lib/haptics.ts` (`tap`, `success`) wired to the deliberate Eliminator team-pick. Honest support note: `navigator.vibrate` fires on Android web now, **no-ops on iOS Safari/PWA** (so nothing on Wez's iPhone web), and the call site is ready to swap to Capacitor Haptics for a real iPhone tap once the native wrap lands. Deliberately NOT wired to the predict screen (auto-save, no single lock-in moment) or to join/enter (RG: never celebrate the stake/entry action).

New client files: `Skeleton.tsx`, `lib/haptics.ts`. Edited: `PredictMatchRow.tsx`, `PoolStandingsTable.tsx`, `AccountHistoryPage.tsx`, `EliminatorPlayPage.tsx`.

**Still not done (genuine prerequisites, not deferral-by-preference):**
- **Live "N matches live" ticker** — blocked on the paid football-data livescores add-on; the free tier carries no in-play scores, and the top-bar `LiveBadge` stays the hard-zero placeholder until that feed is bought.
- **Exact-scores-in-a-row streak** — needs a small new read endpoint aggregating the user's per-prediction results (exact/result, chronological); not in any current client payload. Round-by-round *form* (sparkline) ships now as the available form feature. Build the streak endpoint as a focused follow-up if wanted.
- **Pull-to-refresh** — held deliberately: a custom pull gesture on the new single fixed-height scroller is iOS-overscroll-sensitive and needs real-device iteration to feel right and not fight Safari; worth its own focused pass.

### Step 3b.11 — Eliminator Home-tile messaging clarity (21 June 2026)

Fairness/clarity fix prompted by the Home tile reading as if a *running* Eliminator was still open to join for a week. Investigation outcome: the entry-close **logic is correct** — `seed.ts` sets each game's `entryClosesAt = firstRoundDeadline` (round 1's first kick-off; comment: "nobody banks a survival on a round they didn't actually play"). The running group-stage WC game (`world-cup-2026-eliminator`) closed when R1 locked. The "Entries close Sun 28 Jun" the tile showed was the **separate knockout game** (`world-cup-2026-knockout-eliminator`), which is fair to keep open until R32 because everyone in it starts together at the Round of 32. So: no logic bug — but the tile blurred the two games together, which for a UKGC-bound product is unacceptable (info must be clear and not misleading).

Fix (`HomePage.tsx`, `EliminatorModeTile`): every line now names its game. `startingNextNote` split into `nextPickNote` (your due pick, in a game you're in) and `joinNote` (a separate joinable game), each carrying a `shortGameName` (strips the redundant "Eliminator10 ·" prefix → "World Cup" / "WC Knockout"). The status line names the single game you're alive in ("You're still in World Cup"); the join note renders as its own row with the eyebrow **"Another game open to join"** when you're already in a game (just "Open to join" otherwise), and always shows "{game} · Entries close {time}". Pick note and join note are separate boxes, so your next pick and a different open game can never be read as the same thing. Front-end only; no schema; tsc baseline 15; build clean; crossorigin fix intact.

> **Operational must-check (not a code issue): `BYPASS_LATE_ENTRY`.** The join guard is `now <= entryClosesAt || BYPASS_LATE_ENTRY()` (server). Repo default is `false` (`env.example`). It's a **Render dashboard** env var — if it was ever set to `true` (e.g. to let mates join late during the casual run), late entry to a *running* game becomes possible, which would be the actual fairness hole. Confirm it's absent/false in Render (also surfaced in Admin as `bypassLateEntry`). With it off, the close-at-round-1 rule holds.

### Step 3b.12 — Lock the late-entry bypass to testing only + licence-first principle (21 June 2026)

Licence-integrity hardening. The `BYPASS_LATE_ENTRY` switch (which, when on, let users join an Eliminator after round 1 locked, and enter a pool after its window closed) is now **honoured only outside production**. New `server/lib/late-entry.ts` exports `lateEntryBypassActive()` = `NODE_ENV !== "production" && BYPASS_LATE_ENTRY === "true"`. All four read sites now go through it (`eliminator-data.ts`, `portal-data.ts` ×2, `routes/portal.ts`). In the live app the entry/late-entry deadlines are **always** enforced — no env var, admin, or anything can override a fairness rule in production. The switch stays usable for local/staging testing only; the client "Dev mode: late-entry override active" warning can now only ever appear off-production. Front-end untouched; tsc baseline 15 (the one `portal-data.ts` baseline error shifted from L1610→L1611 due to an added import — same error, not new); build clean; crossorigin intact.

Why: a UK pool-betting licence expects fairness rules applied consistently with no silent override path on the live service. A deploy-flippable bypass was a governance smell even though it was off and not an in-app admin toggle.

**Licence-first prime directive (now canon — arch §1 top).** Every feature, flow, and architecture decision must hold UK pool-betting / gambling-licence rules in the highest regard (fairness, clear/non-misleading info, RG protections, consistent rule application, clean audit trail). Licence-clean beats nicer/faster/more-engaging whenever they conflict. No mechanism may silently override a fairness rule on the live product. Check new work against this before shipping. **Wez will share the full licence application with Claude once purchased**, so Claude can act as a domain expert and help get the application approved — treat that as a standing goal.

### Step 3b.13 — tsc baseline to zero, score-integrity fix: confirm-before-commit + divergence alert + correction tool (21 June 2026)

A foundational session. Started as a tidy, became the most important data-integrity fix in the product so far.

**1. tsc baseline 15 → 0.** Deleted two dead, never-imported client files (`client/src/lib/fixture-sync.ts`, `client/src/lib/outcome-sync.ts` — a sealed pair that only referenced each other; the real versions live in `server/lib/`), and added the missing `liveStatusLabel` field to `PoolEntriesPoolDto` in `server/lib/portal-data.ts` (the client already read it). New baseline is **0** — the "zero new errors" gate is now "zero errors".

**2. Live scoring incident — Spain 4-0 Saudi recorded as 5-0.** football-data briefly published the WC opener as FINISHED at 5-0 (a goal then disallowed for offside via VAR); the 5-min outcome-sync caught the transient 5-0, wrote it first-write-wins, and scored against it. FD corrected to 4-0 but first-write-wins kept the 5-0. NickyD + Les (both 4-0) got 2 pts instead of 5. Fixed live via a new deliberate, audited correction tool (see below): corrected to 4-0, re-scored, audit row written. WC pool was not settled, so no payouts affected. Eliminator unaffected (Spain won either way).

**3. The permanent fix — outcome-recording integrity (full canon now in arch §24).** Three layers, defence in depth:
   - **Confirm-before-commit (prevention).** A FINISHED score is buffered in a new `event_outcome_observations` table and only promoted to `event_outcomes` (and used to score) once seen unchanged across sync passes ≥ `CONFIRM_MIN_AGE_MS` (3 min; ~5–10 min to confirm with the 5-min cron). A transient/incorrect score is never committed because the next pass sees it change and the clock resets. Constant has no env/admin override (fairness rule, §1).
   - **First-write-wins immutability (kept).** A committed outcome is never silently overwritten.
   - **Divergence alert + correction tool (backstop).** Each sync compares FD's current score to the committed one; if different, raises a `audit_log` "outcome_divergence" alert, surfaced in **Admin → Score alerts**. Never auto-overwrites. Admin reviews and applies `server/scripts/correct-outcome.ts` (dry-run → `--apply`; re-scores via the real `scorePrediction`; audit row). Detector suppresses alerts for admin-set scores and de-dupes.
   - **Key invariant:** `event_outcomes` only ever holds confirmed/final scores, so display + prediction-scoring + pool-settle (`findReadyPoolIds`) + eliminator-settle (`findReadyRoundIds`) are all unchanged — they key off `event_outcomes` existence and simply wait through the short confirmation window. The provisional buffer is never read by display or settlement.
   - Visible effect: a finished match shows "awaiting result" for ~5–10 min longer before its score + points appear. That delay is the safety window.

**4. `.gitattributes` added.** Forces LF line endings repo-wide (the repo standard — `.prettierrc` `endOfLine: lf`), so a Windows download/drag-and-drop can't introduce CRLF churn in diffs. One-time hygiene.

Files this session: deleted `client/src/lib/fixture-sync.ts` + `client/src/lib/outcome-sync.ts`; edited `server/lib/portal-data.ts`, `server/lib/outcome-sync.ts`, `server/db/schema/sports.ts` (new `event_outcome_observations` table — **`pnpm db:push` ran in Render**), `server/scripts/sync-outcomes.ts`, `server/routes/admin-portal.ts` (`GET /score-alerts`), `client/src/lib/portal-api.ts` (`fetchScoreAlerts` + `ScoreAlert`), `client/src/pages/portal/AdminPage.tsx` (Score alerts panel); new `server/scripts/correct-outcome.ts`; new `.gitattributes`. tsc **0** throughout, build exit 0, crossorigin fix intact (`vite.config.ts`/`index.html` untouched). DB op: `pnpm db:push` for the new table (no seed change).

> **Operational note:** the WC opener correction was applied with `pnpm tsx server/scripts/correct-outcome.ts --apply` (no team args → defaults to Spain v Saudi → 4-0). For any future correction, pass args: `--home-like= --away-like= --home= --away= --reason= [--apply]`. Always dry-run first.

### Step 3b.14 — Admin "Remove from pool" = audited entry void (22 June 2026)

The first player-removal tool, built licence-clean from the start. Prompted by the friendly WC run having an entrant ("terterter") who never paid their £10 and never predicted, so needed removing — but built future-proof so it serves the licensed product unchanged.

**The principle.** A licensed operator never hard-deletes a player or stake — records are retained (≈5 years post-relationship under the MLRs; GDPR erasure is overridden for legally-retained records), and removals must be **recorded, reasoned admin actions**, not raw DB edits. So "remove" = **void + retain**, never delete. Pre-licence this doesn't strictly bite (informal exemption), but per §1 we build it the licensed way now. Full canon: **architecture §25**.

**What shipped.** `pool_entries` gains `voided_at` / `voided_by` / `void_reason` (nullable; `pnpm db:push` **already run in Render** — confirmed: 3 columns + the `voided_by→users` FK applied). A voided entry is excluded from the **three** entry-count sites (so the pot — `fee × COUNT(*)` — and the 60/25/15 splits self-correct live), the standings build, the player's own live-entries list, the two entrant access-gates, the opponent-picks read, and **settlement scoring/ranking**. The row, its payment, and the audit trail are retained. Admin route `POST /entries/:entryId/void` (reason ≥3 chars required; **409 on a settled entry**; idempotent on already-voided; audited as `admin.action` / `entityType: "pool_entry"` with reason + acting admin) plus `GET /users/:id/entries` to list a player's current entries. Admin UI: a "Remove from pool" button per user opens a modal listing live entries, each with a reason box + Remove.

**Key invariant:** `voided_at IS NULL` = the entry counts. Any new consumer that counts entries / builds standings / scores must add `isNull(poolEntries.voidedAt)`.

**Known limitation (deferred):** the temporary per-pool chat entrant-gate (§21) is not voided-aware — a removed player could still open old chat. Harmless for the free run (chat is itself scheduled for teardown); fold a void check in only if chat goes into the licensed product.

Files this step: `server/db/schema/pools.ts` (3 void columns — **`pnpm db:push` done**), `server/lib/portal-data.ts` (8 read sites), `server/lib/pool-settle.ts` (scoring/ranking gather), `server/routes/admin-portal.ts` (2 new routes), `client/src/lib/portal-api.ts` (`fetchAdminUserEntries` + `voidAdminPoolEntry`), `client/src/pages/portal/AdminPage.tsx` ("Remove from pool" button + modal). tsc **0** throughout, build exit 0, crossorigin intact (`vite.config.ts`/`index.html` untouched). No seed.

## Decisions made in earlier chats — DO NOT relitigate

From arch doc Decided Rules §13 + decisions made in build chats:

- Round = 4-5 GW tournament block. PL has 9 Rounds (4-4-4-4-4-4-4-5-5 GWs). Champ has 9 Rounds (5-5-5-5-5-5-5-5-6 MDs).
- One stake per Round covers all matches in it.
- Late entry allowed for 7 days after Round opens, with explicit warning modal.
- Predictions lock 1 hour before each match's individual kickoff. Server rejects predictions for already-played matches with HTTP 403.
- Tie-breaker: pts → exact-score count → correct-result count → split.
- 4 tiers visible from Round 10 onwards: The Fiver (£5), The Tenner (£10), The Pony (£25), The Big One (£50). The Pound (£1) was in the original arch but retired in step 2m — see "Decisions made this session" below.
- Multi-entry: one entry per pool, but multiple tiers and multiple competitions concurrent OK.
- MVP competitions: Premier League + EFL Championship only. World Cup, League One, all other comps out of scope.
- Settled pools archive immediately to `/account/history`.
- Combined Pool/Predict screen on one URL: was `/pools/:competitionSlug/:poolId`. Moved to `/predict/:entryId` in step 2m (so the bottom nav highlights Predict, not Pools, when a user is on the prediction screen).
- Prize structure (% splits, operator commission): TBD — defer until pre-launch. Placeholder splits in seed.
- **Settlement gate (Decided Rule #13)**: a pool settles when every event is `finished + outcome` OR `cancelled/void`. `postponed` blocks. Predictions on cancelled/void events keep `points_awarded = null`.
- **Payout rounding (Decided Rule #14)**: line items rounded to 2dp, any residual penny goes to rank 1, books must balance to `pot × sum(splits)`.
- **Zero-entry pools (Decided Rule #15)**: still mark settled, no payments rows.
- **Settled-state default tab**: GW1 chronological (matches deferred decision §14.2 default; still open to reconsidering pre-launch).
- **"Cashed" copy** on history cards is placeholder per arch §14.4 until prize splits + commission are decided.
- **No more mock data. Everything is live from DB / football-data.**
- **Resend deferred to pre-launch.** No verification emails sent yet. Signup creates an unverified account that can use the product. `RESEND_API_KEY` not in env yet.
- **`BYPASS_LATE_ENTRY=true` in Render env** allows entries after the 7-day late-entry window has closed. Used for testing Round 9 of 2025/26 right now (real window closed Apr 28). Per-match anti-cheat lock (Decided Rule #7) always on regardless.
- **`ADMIN_SECRET` env var** gates `/api/admin/*` endpoints. Sent as `X-Admin-Token` header. Closed by default (401) if unset.

### Decisions made this session (May 2026) — locked, DO NOT relitigate

These are Wez's explicit choices from the IA redesign / Pound retirement / auth fix conversation. They override anything earlier in this doc that contradicts them.

**Bottom nav becomes HOME / PREDICT / TABLES / ACCOUNT.** Pools tab is repurposed, not removed. Trophy icon stays, label changes from POOLS to TABLES.

**Tier list reduced to 4 tiers from Round 10 onwards.** The Pound (£1) is retired. Reasoning: Stripe + merchant fees on a £1 entry leave negative margin after 90% prize-pool payout. Wez's existing Round 9 Pound entry plays out and settles normally on Sun 24 May 2026; the tier becomes inactive after that. Going forward, only Fiver (£5) / Tenner (£10) / Pony (£25) / Big One (£50).

**PREDICT tab tap-through stays on Predict tab.** Today tapping an entry on `/predict` routes to `/pools/:slug/:poolId`, which highlights Pools in the bottom nav. The fix moves the prediction screen to `/predict/:entryId`. Same component, new URL path so the nav stays correct.

**Pools-as-browse flow is killed.** `/pools`, `/pools/:competitionSlug`, and `/pools/:competitionSlug/:poolId` cease to exist as primary destinations. The first two are deleted outright; the third's component (PoolDetailPage) becomes the prediction screen at `/predict/:entryId`. Old URLs may need short-term redirects — TBD with Wez before implementation.

**TABLES tab is the new Pools tab.** Design picked: Option C (sub-tabs, one tier at a time).
- Top row: competition pills (Premier League, Championship, future comps added here).
- Second row: tier sub-tabs (Fiver / Tenner / Pony / Big One).
- A small emerald dot prefixes the sub-tab label when the viewer is entered in that tier for the current Round. Absent otherwise — at-a-glance summary of where you're in.
- Header right-side widget switches on entry status:
  - Entered: "You — Nth · X pts" in emerald (small two-line block).
  - Not entered: solid emerald "Enter · £NN →" button. Tapping it goes into the entry flow.
- Below: the standings table (#, Player, Ex, R, Pts columns; gold rank 1-3; emerald "You" row when entered; "↓ N more ↓" footer when truncated).
- Default landing tier: leftmost where viewer is entered (Fiver if in, else Tenner if in, etc.); first tier if entered in none.

**Entry CTAs now exist in two places, on purpose.**
- Home shows "Play a Round" cards for *every* tier the viewer hasn't entered (sweep view).
- Tables shows an entry CTA only for the tier you're currently looking at, when you're not entered (contextual). Not a duplicate — different intent.

**Cold-start auth tolerance is locked.** `/api/auth/me` boot-time round-trip has no hard timeout. Retries 5xx/network up to 3 times (2s/5s/10s). 401 is immediate "logged-out", no retry. LoadingSplash escalates copy at 2s/8s/30s, surfaces a Reload button at 60s. Mid-session 401 anywhere in `portal-api.ts` flips the auth context to logged-out and triggers the redirect-to-login flow.

**Logged-out users on portal URLs redirect to login.** `/predict/*`, `/pools/*` (legacy), `/account/*` all match the portal-URL regex. RedirectToLogin sends them to `/login?redirect=<original-url>`. LoginPage / RegisterPage read the param after success and bring the user back. Open-redirect guard: param must start with single `/`, not `//`.

**Operator commission = 25% of every tier's gross pot.** Player pot is whatever's left (75%). Locked across all four active tiers. Retired Pound pool unaffected — it settles under the rules it was opened under (no commission, 70/20/10).

**Top-3 prize split = 60 / 25 / 15 of the player pot.** Locked across all four active tiers — Fiver, Tenner, Pony, and Big One all use the same structure. The prior Pony / Big One top-5 split (50/25/15/7/3) is retired. Reasoning: simpler model, easier marketing, 3rd place still covers entry (15% of 75% × £entry ≈ stake), 1st feels rewarding at ~4.5× entry.

**Tables and Home show per-rank £ amounts, not gross pot or percentages.** Display format: "1st £22.49 · 2nd £9.38 · 3rd £5.63". Numbers are live — recompute every time `/api/competitions` or `/api/pools/:id` is hit, reflecting current entry count. Server and settlement share the same rounding helper (`computeDisplayBreakdown` in `pool-settle.ts`) so displayed amounts match payouts to the penny.

**World Cup 2026 added as third competition (step 3a, locked May 2026).** Tournament-style (1 Round = whole tournament, 104 matches). Single dedicated tier `world-cup-2026` at £30 — no tier picker, one Enter button. Inherits 60/25/15 + 25% house. Retires via `RETIRED_TIER_SLUGS` after the Final settles (~22 July 2026). Future tournaments (Euros 2028 etc.) will reuse the same pattern. **Backend deployed and verified 20 May 2026** (3a.1-3a.4); UI work pending (3a.6+).

**FT scores only for WC.** No extra time, no penalties — settlement reads the same `event_outcomes.home_score` / `away_score` columns as PL/Champ. Schema has knockout-extension columns (`home_score_extra_time` etc.) but they go unused in V1.

**Postponed-event policy is per-competition (arch §13 Rule #16).** `competitions.postponedPolicy` enum: `'wait'` (PL/Champ default — pool waits for reschedule, blocks settlement) or `'forfeit'` (WC — postponed match counts as 0 pts until/unless football-data emits a future kickoff, in which case predictions reopen and re-score). Stops a single postponement from deadlocking the 104-match WC pool for weeks.

**WC knockout fixtures expose null teams from football-data, not placeholder strings.** Arch §13 Rule #17 originally said "placeholder team names"; reality (confirmed in step 3a.3 deploy crash + 3a.4 fix) is that FD sends `homeTeam: null` / `awayTeam: null` for unresolved R32/R16/QF/SF/F slots. Schema columns `events.home_team` and `events.away_team` are now nullable. UI renders these as "TBD" via `displayTeamName(null)`. Predict UI must gate prediction inputs on `homeTeam !== null && awayTeam !== null` — not yet implemented (3a.9 todo).

**Home redesigned to be entry-discovery only (arch §8.1).** No more live entries on Home — one card per open competition. Tap PL-style card → tier picker (Tables tab); tap WC-style card → `/enter/world-cup-2026` confirm screen (§8.6.1). Predict tab gains a "YOUR LIVE ENTRIES" persistent header + new TOURNAMENT section. Mockups locked, code pending (3a.6 + 3a.8).

### Decisions made in steps 3a.12 – 3a.15 (June 2026) — locked, DO NOT relitigate

**WC entry fee reduced to £10 for the pre-licence informal run.** Locked via seed config (`entryFee: "10.00"`) and synced to the existing DB row by the new sync-existing-tier branch in `seedTiers()`. UKGC-relevant framing: WC is being played between friends informally at £10 stakes, payments handled offline (the app itself does not process real money). This sits inside the private-betting exemption (Gambling Act 2005). Friends know each other; no public promotion; offline payments; admin-tracked `is_paid` flag confirms receipt. Will be disclosed proactively on the UKGC licence application.

**Real first/last names are KYC fields, never displayed publicly.** Schema columns `users.first_name` and `users.last_name` (varchar 40, nullable for legacy rows). Public display is always the nickname or its fallback. Real names appear only in AccountPage's "Full name" row (the user's own view) and in the admin portal's user list. No edit UI in V1 — KYC update flow will live on the Settings sub-page when it ships.

**Nicknames are unique and user-editable** with the same validation as signup (3–15 chars, `[A-Za-z0-9_]`, case-insensitive uniqueness, reserved-list block). Edit is audit-logged (`user.profile_update`, before/after) so the audit trail is the historical record. League tables reflect the current nickname on every fetch; settled rounds also reflect current nickname (audit log is the historical reference). 90-day cooldown deferred until licence grant / public launch — fine for the informal friends' run.

**Marketing consent is opt-in only; checkbox removed from signup.** UK GDPR requires explicit opt-in. Absence of a tick = no consent. Hardcoded `marketingConsent: false` in the signup payload. Existing rows with `true` from the old form stay as-is. When/if email marketing is ever wired up (post-licence), reintroduce the checkbox.

**Logged-out marketing surface is WC-only for the duration of the informal run.** `.tsx.bak` backups of original multi-tier marketing components (Home, HeroSection, LeagueShowcase, HowItWorks, MarketingShell) sit alongside their replacements. Restoring is a rename operation when PL/Champ pools come back online for 2026/27. Nav trimmed to Play + Rules.

**Admin grants are managed via seed.ts, not from in-app.** Founding admin allowlist hardcoded in `FOUNDING_ADMIN_EMAILS` constant: Wez, James, Jason. `seedAdmins()` is idempotent and bidirectional — promotes matches, demotes non-matches. Future admins are added by editing this constant + redeploying + `pnpm seed`. No in-app promote/demote UI in V1.

**Admin portal is session-gated, role-gated, audit-logged.** Three layers of defence: tab hidden in nav for non-admins (`user?.isAdmin === true` strict check), server returns 404 (not 403) to non-admins, client guards the page render. Every paid toggle + password reset writes to `audit_log` with the acting admin's id+email in metadata. Demonstrable record-keeping for the licence application.

## Known follow-ups / pre-launch flags

Carry forward, none urgent for the next step:

- **`pool_entries` `(pool_id, user_id)` unique index — RESOLVED in step 3a.16.** `pool_entries_pool_user_idx` is now live (Decided Rule #2 enforced at the DB layer); `enterPool` catches the `23505` collision and resolves to "already entered". No longer a pre-launch flag.
- **First-write-wins on `event_outcomes`** — score corrections from football-data not re-recorded automatically (P3). **June 2026 decision: deliberately left as-is.** Auto-correction is the dangerous path — a transient bad FD value could flip a settled result and rewrite the leaderboard. An admin-only "stored score diverges from FD" alert was considered and deferred (not built). Revisit as a *manual-review* tool, never silent auto-overwrite, before public launch.
- **Manual late-entry override has no app-side feature** — late predictions for Waynebow/bert (step 3a.16) were inserted by raw shell SQL, tagged `ip_address='admin-shell-late-entry'`. Fine for the informal friends' run and Wez's call, but every override is a post-lock prediction with no in-app record of *why*. Before licence grant, build a proper governed "admin late-entry" action (reason field, audit row) rather than carrying the shell habit forward — a regulator would expect lock exceptions to be ruled, not ad-hoc.
- **No `DELETE` for predictions** — overwrite-only after first save; "half-saved" is a UI-only state. Matches Decided Rule #12. Confirm at pre-launch.
- **Audit log volume** — every prediction save writes a `prediction.updated` row. Pool settlement writes one row per pool with full ranks + payouts in metadata. Indexed but disk grows. Revisit before public launch.
- **`/api/pools`, `/api/tiers`, `/api/pools/competition/:slug` from arch §11** — collapsed into `/api/competitions`. Decide before pre-launch whether separate endpoints are needed.
- **Championship seed gap** — `pickCurrentRound` requires `futureMatchesCount >= 5`. Champ 2025/26 ended early May, so no Champ Round qualifies as current, so no Champ pools exist right now. Resolves naturally when 2026/27 fixtures load in August.
- **Render build command** still reads `corepack enable && pnpm install && pnpm build`. Tighten to `--frozen-lockfile` in the same dashboard pass as cron setup.
- **Stage reassignment on matchday change** — `upsertEventFromFootballData()` doesn't remap `events.stageId` when football-data changes a match's matchday (rare; only matters if Round structure ever changes mid-season).
- **401 interceptor is module-level singleton** — fine for the current single-AuthProvider app; flag if multiple providers ever spin up (tests, SSR).
- **Cold-start retry tops out at ~17s elapsed** — beyond that, treated as logged-out (the redirect-to-login flow takes over). On Starter, cold starts only occur on deploy / crash recovery (not on idle), so this safety net is rarely exercised in practice. Bump the backoff schedule if a legit cold start ever exceeds it.
- **Resend / email templates** — still no transactional email. Signup creates an unverified account that can use the product. `RESEND_API_KEY` not in env yet.
- **Legacy `/pools/*` redirects** — `/pools`, `/pools/:slug`, and `/pools/:slug/:poolId` all redirect to new step-2m URLs. Hard-switch (remove the redirect handlers) once inbound `/pools/*` traffic disappears from logs (~30 days post-launch). `/pools/:slug/:poolId/table` is NOT in the redirect set — PoolTablePage is mounted there and Account History's `[Table →]` still links to it.
- **`/tables` deep links** — Tables tab currently has no URL state for the selected (comp, tier). Home's Available Tier rows all land on plain `/tables` and require the user to manually tap the right sub-tab to enter. Add `/tables/:competitionSlug/:tierSlug` or `?comp=&tier=` query support so the Home flow is one-tap end-to-end. Low priority — the Tenner (now the lowest league tier) is the most common entry.
- **Marketing tier names** — `leagueTiers` in `client/src/lib/mockData.ts` still uses old branding (Matchday Five / Premier Ten / Grand Twenty / Elite Fifty with prices £5/£10/£20/£50). Portal **league** tiers are now Tenner/Pony/Big One at £10/£25/£50 — the Fiver (£5) and Pound (£1) were retired (step 3b.3). WC is a single £30 tier. Marketing `leagueTiers` names + prices should be aligned pre-launch — kept misaligned to avoid scope creep.

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
- **Render deploys with `--frozen-lockfile`** (target — see follow-up flag above). Whenever `package.json` changes, ship `pnpm-lock.yaml` in the same batch or the build fails with `ERR_PNPM_OUTDATED_LOCKFILE`.
- **Schema changes need `pnpm db:push` after deploy** (drizzle-kit syncs schema → live Postgres). Flag this explicitly whenever a step touches `server/db/schema/`. If matchday is missing or any new column is missing, the user has likely skipped this step.

## What's next — post step 3a.15

**World Cup feature work is complete and live.** Pre-licence informal-run prep is complete (£10 pricing, real-name + nickname split, marketing simplified, admin portal). 11 users on the platform, WC entries flowing in.

Remaining items split between operational (retirement after the Final) and pre-licence application work.

### Operational — World Cup retirement (after the Final settles, ~22 July 2026)

When the WC Final settles and the pool reaches `status='settled'`, the comp + tier should be retired from the active surfaces. Existing entries stay accessible via `/account/history`. **See `docs/portal-architecture.md` §15 for the full retirement runbook.** Summary:

1. After the WC pool flips to `settled`, edit `server/scripts/seed.ts`:
   - Add `"world-cup-2026"` to `RETIRED_TIER_SLUGS`.
   - Optionally set `COMPETITIONS` entry for `world-cup-2026` to `isActive: false` (stops football-data fetches after the tournament ends).
2. Push the change. Deploy.
3. Run `pnpm seed` in Render Shell. The seed will flip the WC tier to `isActive: false`; existing pool / entries / payments rows are untouched.
4. Verify on `/`: WC card no longer appears. Verify on `/account/history`: settled WC entries still listed with final rank + payout.

No schema changes required. No code-path changes required outside seed config.

**PRE-FINAL CODE TASK (not yet built, agreed step 3a.18, needs Wez's go):** before the Final settles, change `getCompetitionsWithOpenPools` so a settled pool stays visible on the active surfaces (Home / Tables) while its competition is still `isActive=true`. Today it filters `pools.status='open'`, so the WC would auto-vanish the instant the Final settles — the end-of-season disappearance Wez disliked on PL. After the fix, removal from the active surfaces only happens at the manual retirement step above (operator-triggered). Nothing is ever deleted either way; settled data stays in `/account/history` and at the settled-table URL. Generic — also fixes the PL end-of-season vanish. See arch §15.

### Pre-licence application work

- **SiteFooter "test mode" banner — RESOLVED in step 3a.18.** The "free-to-play / virtual credits / no real money" copy was deleted outright from `SiteFooter.tsx`, `AuthShell.tsx` and `RegisterPage.tsx`. No longer a pre-application blocker.
- **UKGC application narrative** — assemble: informal WC private-betting evidence, audit-log dumps showing admin actions are recorded, schema readiness for the licensed flip (the dormant `licensed.ts` tables), responsible-gambling tooling status, KYC plan. Aim for application ~1 month into the new domestic season after WC retires.
- **Resend + email verification** — signup currently creates an unverified account. Wire up `RESEND_API_KEY`, transactional templates, magic-link flow. Pre-licence-grant blocker (UKGC expects email verification to be live before real money). **This is now the last remaining pre-licence-grant code blocker** — the `pool_entries` unique index (previously listed here) was shipped in step 3a.16.
- **Settlement-grade data + dual-source result verification (pre-licence-grant requirement, arch §24).** football-data.org is a free, hobbyist-grade feed — fine for the free run, NOT acceptable as the settlement source once real money is staked. Before the licensed flip: (1) move settlement to a settlement-grade feed (we're pool betting not a bookmaker, so we need accurate fixtures + final results only — no live odds — which is cheaper; shortlist e.g. SportsDataIO settlement-verification, Sportmonks, Enetpulse, LSports, or an official feed); (2) add a **second source as cross-check** so a result auto-confirms only when both agree, and on disagreement settlement **holds + alerts** (generalises confirm-before-commit to two-source agreement; reuses the Admin → Score alerts surface); (3) keep the audited manual correction tool as the human-resolution step; (4) document sources, agreement rule, hold-and-review and claim window in the published rules (LCCP 4.2.9) + licence narrative. This is the industry-standard model (Entain/Ladbrokes/Coral run exactly this via a settlement-verification feed). Two sources, not three.

### Carried-forward (lower priority, not licence-blocking)

- **Tie-break visualisation in standings** — when two players have the same points, surface *why* one is ranked higher (more exact scores → more correct results → tied split). Currently the data is in the table (Exact / Res columns) and the tie-break rule is in the footer, but there's no visual cue tying them together. Add a subtle indicator for tied clusters in `PoolStandingsTable.tsx`.
- **Tables tab deep links** — `/tables/:competitionSlug/:tierSlug` (or `?comp=&tier=` query) so Home's Available Tier rows land on the right tier in one tap.
- **Marketing tier name alignment** — `leagueTiers` in `client/src/lib/mockData.ts` still uses old branding. Less urgent now that marketing is WC-only; will matter again when PL/Champ pools come back online and the .tsx.bak files are restored.
- **Live in-play scores** — currently locked matches stay locked through the match with no live score visible; users see their prediction then jump straight to FT result after the scheduler fires. Real in-play score display (HT, 60', live goals) worth queueing for pre-launch.
- **Render build command tightening to `--frozen-lockfile`** — verify the dashboard setting.
- **Predict screen progress denominator includes null-team events** (cosmetic) — auto-corrects as bracket fills, but a fully-entered WC entry will read "72 / 104" until R32 teams populate. Not breaking.
- **Capacitor app store wrap** — eventually, for Google Play and Apple App Store delivery. Gated on UKGC licence, KYC, responsible-gambling tooling, real payments.

Routes as of step 3a.15:
| URL | Page |
|---|---|
| `/` | Home — competition cards (one per open comp, persistent-after-entry visual state). 75/25 prize-fund disclosure at bottom |
| `/predict` | Predict tab — YOUR LIVE ENTRIES, three sections (Closing Soon / This Round / Tournament) |
| `/predict/:entryId` | Prediction screen — group letters on rows, knockout sub-headings (Round of 32, etc.) for tournament comps |
| `/tables` | Tables tab — competition pills + tier sub-tabs + per-tier standings (with Pot label) |
| `/enter/:competitionSlug` | Tournament entry confirm (currently only `world-cup-2026`) |
| `/account` | Profile summary with editable nickname + read-only full name |
| `/account/history` | Settled-rounds history |
| `/admin` | Admin portal (founding admins only — Wez/James/Jason). User list + Paid checkbox + password reset |
| `/pools/:slug/:poolId/table` | Standalone league table with tournament-aware status pill. Rows are tappable → opponent predictions |
| `/pools/:slug/:poolId/table/:entryId` | Read-only view of another player's picks for the pool, lock-gated (step 3a.18) |
| `/pools/:slug/:poolId/chat` | Per-pool table chat (step 3a.19, **temporary WC feature** — see `wc-chat-teardown.md`). Entrant-gated |
| `/eliminator` | Eliminator10 **lobby** (step 3b.7) — mode hub; three tabs (Your games / Open to join / Finished), round shown per card, Back returns to previous page |
| `/eliminator/:slug` | Eliminator10 play screen (step 3b) — join, current round, one-team pick, used-teams, eliminated/won states |
| `/eliminator/:slug/survivors` | Eliminator10 survivors board (step 3b) — still-in / out; picks hidden until the round locks |
| `/pools/:slug/:poolId` | Legacy — redirects to `/predict/:entryId` |
| `/pools`, `/pools/:slug` | Legacy — redirect to `/tables` |
| `/login`, `/register` | unchanged — `/register` now collects first/last/nickname instead of display name |

Server admin endpoints:
| URL | Auth model | Purpose |
|---|---|---|
| `POST /api/admin/sync-outcomes` | `X-Admin-Token` header | Machine-to-machine outcome-sync trigger (cron) |
| `POST /api/admin/settle-pools` | `X-Admin-Token` header | Machine-to-machine pool-settle trigger (cron) |
| `GET /api/admin/state` | `X-Admin-Token` header or `?token=` | DB inventory: competitions + tiers + counts. Browser-friendly |
| `GET /api/admin-portal/users` | Session + `is_admin=true` | List users for the in-app admin UI |
| `POST /api/admin-portal/users/:id/password` | Session + `is_admin=true` | Reset a user's password (Argon2-hashed; audit-logged) |
| `PATCH /api/admin-portal/users/:id/paid` | Session + `is_admin=true` | Toggle the WC off-platform paid flag (audit-logged) |
| `GET /api/admin-portal/users/:id/entries` | Session + `is_admin=true` | List a player's current (live, non-voided) entries for the removal UI (step 3b.14) |
| `POST /api/admin-portal/entries/:entryId/void` | Session + `is_admin=true` | Remove a player from a pool — voids the entry (reason required; 409 if settled; audited). Pot/standings/scoring self-correct; nothing deleted (step 3b.14, arch §25) |
| `PATCH /api/account/nickname` | Session (any user) | User updates their own nickname (audit-logged) |
| `GET /api/pools/:poolId/entries/:entryId/predictions` | Public when settled; session + entrant when live | Lock-gated read of one entrant's picks (step 3a.18). Unlocked picks omitted from payload |
| `GET /api/pools/:id/distribution` | Public when settled; session + entrant when live | Pick distribution (step 3a.19). Locked events only; returns entrant count + per-event home/draw/away + top scorelines |
| `GET /api/pools/:id/messages` | Session + entrant | Table chat read (step 3a.19, temporary). Hidden messages excluded |
| `POST /api/pools/:id/messages` | Session + entrant | Post a chat message (step 3a.19, temporary). Rate-limited, self-exclusion-gated, 500-char cap |
| `POST /api/admin-portal/messages/:id/hide` | Session + `is_admin=true` | Soft-delete (hide) a chat message (step 3a.19, temporary; audit-logged) |
| `GET /api/eliminator/:slug` | Public (viewer-aware if signed in) | Eliminator10 overview (step 3b) — Home-card DTO: counts, entry state, current round, canJoin |
| `POST /api/eliminator/:slug/enter` | Session | Join the game (step 3b). Free = no payment; paid = mock payment row. Audit `eliminator.entry_created` |
| `GET /api/eliminator/:slug/pick` | Session + entrant | Pick screen (step 3b) — current round fixtures, used-team flags, your pick, your used-teams |
| `POST /api/eliminator/:slug/pick` | Session + entrant | Submit/change the round pick (step 3b). Lock + team-used + one-per-round guarded. Audit `eliminator.pick_submitted` |
| `GET /api/eliminator/:slug/survivors` | Public when settled; session + entrant while live | Survivors board (step 3b) — still-in / out; current picks hidden until the round locks |

## What to do first

1. Read all docs in `/docs/` (architecture first, then this handoff, then roadmap, then pre-launch). Arch sections to note: §15 WC retirement playbook, §16 Users/nicknames/KYC, §17 Admin portal, §18 Player-predictions view + live status, §19 Pick distribution, §20 Predict-screen states & ordering, §21 Table chat (temporary), **§22 Eliminator10 (the second game mode — full canon)**. Also read `wc-chat-teardown.md`. **Most recent state is the Eliminator10 lobby + polish session (steps 3b.1–3b.7), 21 June 2026** — lobby at `/eliminator`, three league tiers (Fiver retired), temporary launch promo (teardown ~29 Jun), app-wide scroll-to-top fix.
2. Skim the step 3b files (see arch §22 "Server + client files"): `db/schema/eliminator.ts`, `lib/eliminator-data.ts`, `lib/eliminator-settle.ts`, `routes/eliminator.ts`, seed Phase 6, and client `EliminatorPlayPage.tsx` / `EliminatorSurvivorsPage.tsx` / `EliminatorRules.tsx` / Home card / `portal-api.ts`. Step 3a.20 was a one-file Predict-card tweak (`PredictMatchRow.tsx`).
3. Ask Wez what's next. Likely candidates: **(a)** Eliminator10 follow-ups (paid-PL flip = real fee + 75/25 pot + the LCCP 4.2.9 rules-display copy: commission %, no-winner/carry-over, claim window — see arch §22 regulatory posture; engagement extras); **(b)** the pre-Final settled-pool-visibility change (operational, agreed, awaiting go — arch §15); **(c)** WC retirement after the Final (~19–22 July, trigger "Read arch §15 and prepare the WC retirement files" — note this is the pools' WC; the Eliminator game is separate and retires on its own); **(d)** Resend + email verification (last pre-licence-grant code blocker); **(e)** UKGC application narrative.
4. Eliminator launch state: `world-cup-2026-eliminator` is seeded live (24 rounds, Round 1 = Spain matchday, locks Sun 21 Jun 17:00). To re-time, **delete the game** (`DELETE FROM eliminator_games WHERE slug='world-cup-2026-eliminator';` — cascades) and `pnpm seed`; the `startFrom` cutoff is self-expiring.
5. Working rules: propose file plans as **File | Folder | Action** tables with complete replacement files; verify `pnpm install --frozen-lockfile` + `pnpm build` exit 0 with **zero tsc errors (baseline is now 0 since step 3b.13)**; ship `pnpm-lock.yaml` with any `package.json` change; flag `db:push` / `pnpm seed` needs; never touch `vite.config.ts` / `client/index.html` without flagging the step-2v crossorigin fix. Wait for "go" before bulk-changing files.
