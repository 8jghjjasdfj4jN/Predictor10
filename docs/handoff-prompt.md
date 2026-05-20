# Predictor10 — handoff prompt for a new chat

> Save this file. Copy everything below the `---` line into a fresh Claude chat. Upload the latest Predictor10 zip alongside it.

---

# Predictor10 build — picking up after step 3a.11 (World Cup UI complete)

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


### Live deployment state (post step 3a.11+)
- Render web service deployed at `https://predictor10.com`. Build green.
- **Render plan: Starter ($7/month)**. Always-on — no idle spin-down. Cold starts only occur on deploy / crash recovery. Single instance.
- **Render Postgres state**:
  - Schema includes `postponedPolicy` enum + column on competitions, nullable `home_team`/`away_team` on events, `group_label` and `fd_stage` columns on events.
  - 3 competitions: `premier-league` (active, wait, 9 stages, 380 events, 5 pools incl. retired Pound), `championship` (active, wait, 9 stages, 552 events, 0 pools — between seasons), `world-cup-2026` (active, forfeit, 1 stage, 104 events, 1 pool).
  - 6 tiers (leagues): Pound £1 (inactive), Fiver £5, Tenner £10, Pony £25, Big One £50, World Cup 2026 £30.
- **WC end-to-end live and verified parity with Premier League**:
  - Home shows WC card with explainer + "Open World Cup" CTA.
  - `/enter/world-cup-2026` confirm screen routes to entry.
  - `/predict/:entryId` for WC shows tabs "Group MD1 / Group MD2 / Group MD3 / Knockout Stages".
  - Group rows show group letter ("Group A · TIME · ..."). Knockout tab is grouped under sub-headings (Round of 32 / Round of 16 / Quarter-finals / Semi-finals / Third-place playoff / Final).
  - Knockout rows render "TBD - TBD" with "Awaiting teams" copy + disabled inputs until FD populates real teams after group stage ends June 27.
  - FT-only scoring confirmed in code path (`extractRegulationScore` reads `score.regularTime` when `duration !== 'REGULAR'`).
  - League table at `/pools/world-cup-2026/{poolId}/table` shows entrants with tournament-aware status pill ("Round in progress · Group MD1 of 3" during group stage; "Round in progress · Round of 32" during R32; etc.).
- **Active-tier prize structure**: 25% house fee, top 3 paid at 60/25/15 of the player pot. Identical across Fiver / Tenner / Pony / Big One / WC. **Pound's open pool still on legacy 70/20/10 with no commission** — deliberate, retired tier settles under original rules. Round 9 Pound settles Sun 24 May 2026; from Round 10 onwards no Pound pools are created.
- Bottom nav: HOME / PREDICT / TABLES / ACCOUNT.
- Render env vars: `DATABASE_URL`, `FOOTBALL_API_KEY`, `NODE_ENV`, `BYPASS_LATE_ENTRY=true`, `ADMIN_SECRET`, `SESSION_SECRET`. Optional: `DISABLE_SCHEDULER=true` pauses the in-process scheduler.
- Node pinned `22.20.0` via `.nvmrc` + `engines.node`. Build command reads `corepack enable && pnpm install --frozen-lockfile && pnpm build` (verify in Render dashboard).
- **Automated scheduler running in-process** (step 2o). Score sync every 5 min, pool settle every 15 min, both inside the Express server.
- **iPhone refresh stability**: step 3a.11's analytics-script removal eliminated the boot-derailment vector. Wez confirmed reload works reliably.

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

## Known follow-ups / pre-launch flags

Carry forward, none urgent for the next step:

- **`pool_entries` has no `uniqueIndex(pool_id, user_id)`** — Decided Rule #2 enforcement at the DB layer. Pre-flight check in `enterPool` catches double-tap; a true concurrent race could still produce two rows. Schema migration needed before public launch.
- **First-write-wins on `event_outcomes`** — score corrections from football-data not re-recorded automatically. Step 2l added fixture-metadata refresh; outcome reconciliation is still a separate pass needed before public launch.
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
- **`/tables` deep links** — Tables tab currently has no URL state for the selected (comp, tier). Home's Available Tier rows all land on plain `/tables` and require the user to manually tap the right sub-tab to enter. Add `/tables/:competitionSlug/:tierSlug` or `?comp=&tier=` query support so the Home flow is one-tap end-to-end. Low priority — Fiver (the default) is also the most common entry tier.
- **Marketing tier names** — `leagueTiers` in `client/src/lib/mockData.ts` still uses old branding (Matchday Five / Premier Ten / Grand Twenty / Elite Fifty with prices £5/£10/£20/£50). Portal tiers are now Fiver/Tenner/Pony/Big One at £5/£10/£25/£50. Names + prices should be aligned pre-launch — kept misaligned in step 2m to avoid scope creep.

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

## What's next — post step 3a

**World Cup feature work is complete.** The remaining items are operational (retirement after the Final) plus carried-forward features that aren't WC-specific.

### Operational — World Cup retirement (after the Final settles, ~22 July 2026)

When the WC Final settles and the pool reaches `status='settled'`, the comp + tier should be retired from the active surfaces. Existing entries stay accessible via `/account/history`. **See `docs/portal-architecture.md` §15 for the full retirement runbook.** Summary:

1. After the WC pool flips to `settled`, edit `server/scripts/seed.ts`:
   - Add `"world-cup-2026"` to `RETIRED_TIER_SLUGS`.
   - Optionally set `COMPETITIONS` entry for `world-cup-2026` to `isActive: false` (stops football-data fetches after the tournament ends).
2. Push the change. Deploy.
3. Run `pnpm seed` in Render Shell. The seed will flip the WC tier to `isActive: false`; existing pool / entries / payments rows are untouched.
4. Verify on `/`: WC card no longer appears. Verify on `/account/history`: settled WC entries still listed with final rank + payout.

No schema changes required. No code-path changes required outside seed config.

### Carried-forward (lower priority, not WC-related)

- **Tie-break visualisation in standings** — when two players have the same points, surface *why* one is ranked higher (more exact scores → more correct results → tied split). Currently the data is in the table (Exact / Res columns) and the tie-break rule is in the footer, but there's no visual cue tying them together. Add a subtle indicator (column highlight, tiny `↑`, or grouped bracket) for tied clusters in `PoolStandingsTable.tsx`.
- **Tables tab deep links** — `/tables/:competitionSlug/:tierSlug` (or `?comp=&tier=` query) so Home's Available Tier rows land on the right tier in one tap.
- **Resend + email verification** — signup currently creates an unverified account. Wire up `RESEND_API_KEY`, transactional templates, magic-link flow. **Pre-launch blocker.**
- **`pool_entries` unique index `(pool_id, user_id)`** — DB-level Decided Rule #2 enforcement, closing the concurrent-double-tap race. **Pre-launch blocker eventually.**
- **Marketing tier name alignment** — `leagueTiers` mock data still uses old branding (Matchday Five / Premier Ten / Grand Twenty / Elite Fifty at £5/£10/£20/£50). Should align with portal reality (Fiver / Tenner / Pony / Big One at £5/£10/£25/£50).
- **Live in-play scores** — currently locked matches stay locked through the match with no live score visible; users see their prediction then jump straight to FT result after the scheduler fires. Real in-play score display (HT, 60', live goals) worth queueing for pre-launch.
- **Render build command tightening to `--frozen-lockfile`** — verify the dashboard setting.
- **Predict screen progress denominator includes null-team events** (cosmetic) — auto-corrects as bracket fills, but a fully-entered WC entry will read "72 / 104" until R32 teams populate. Not breaking.
- **Capacitor app store wrap** — eventually, for Google Play and Apple App Store delivery. Gated on UKGC licence, KYC, responsible-gambling tooling, real payments.

Routes as of step 3a.11+:
| URL | Page |
|---|---|
| `/` | Home — competition cards (one per open comp, persistent-after-entry visual state) |
| `/predict` | Predict tab — YOUR LIVE ENTRIES, three sections (Closing Soon / This Round / Tournament) |
| `/predict/:entryId` | Prediction screen — group letters on rows, knockout sub-headings (Round of 32, etc.) for tournament comps |
| `/tables` | Tables tab — competition pills + tier sub-tabs + per-tier standings |
| `/enter/:competitionSlug` | Tournament entry confirm (currently only `world-cup-2026`) |
| `/pools/:slug/:poolId/table` | Standalone league table with tournament-aware status pill |
| `/pools/:slug/:poolId` | Legacy — redirects to `/predict/:entryId` (kept for old links) |
| `/pools`, `/pools/:slug` | Legacy — redirect to `/tables` |
| `/account`, `/account/history` | unchanged |
| `/login`, `/register` | unchanged |

Admin endpoints (server-only, token-gated):
| URL | Purpose |
|---|---|
| `POST /api/admin/sync-outcomes` | Manual outcome-sync trigger |
| `POST /api/admin/settle-pools` | Manual pool-settle trigger |
| `GET /api/admin/state` | DB inventory: competitions + tiers + counts. Token via `X-Admin-Token` header OR `?token=` query (browser-friendly) |

## What to do first

1. Read all three docs in `/docs/` (architecture first, then this handoff, then roadmap).
2. Skim recent file edits — particularly `server/scripts/seed.ts`, `server/lib/fixture-sync.ts`, `server/lib/portal-data.ts`, `client/src/pages/portal/HomePage.tsx`, `client/src/pages/portal/PoolDetailPage.tsx`. These cover the step 3a changes.
3. Ask Wez what's next. If it's WC retirement, see arch §15. If something else, propose your file plan in tabular form with folder paths.
4. Wait for "go" before bulk-changing files.
