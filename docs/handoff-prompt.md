# Predictor10 — handoff prompt for a new chat

> Save this file. Copy everything below the `---` line into a fresh Claude chat. Upload the latest Predictor10 zip alongside it.

---

# Predictor10 build — picking up at step 2k

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

### Step 2p — Manus runtime stripped from production build
- `vite.config.ts` — converted `defineConfig` to function form (`({ mode }) => ...`) and gated the four Manus dev plugins (`jsxLocPlugin`, `vitePluginManusRuntime`, `vitePluginManusDebugCollector`, `vitePluginStorageProxy`) so they only run when `mode !== "production"`. `pnpm build` → mode is `"production"` → none of them registered. `pnpm dev` → mode is `"development"` → all four registered, dev workflow unchanged.
- **Impact**: `dist/public/index.html` drops from **368 KB** to **1.27 KB** (99.65% reduction). The 367 KB removed was a giant `<script id="manus-runtime">` block previously inlined into every page load.
- **Bug this fixes**: Chrome on iPhone showed a white screen on refresh because the 368 KB HTML payload was large enough to freeze the render thread on a typical mobile connection before any of the actual app code ran. Also explained why some users saw the LoadingSplash escalate to "Server is waking up…" on legitimate paid-tier infrastructure — the HTML download alone was tripping the 8s threshold for that copy.
- **No DB schema changes**. No `pnpm db:push`. No new env vars. No new dependencies.
- **No effect on native app store builds** (web-only artifact).

### Live deployment state (post step 2p)
- Render web service deployed at `https://predictor10.com`. Build green.
- **Render plan: Starter ($7/month)**. Always-on — no idle spin-down. Cold starts only occur on deploy / crash recovery, not on user idle. Single instance (no autoscaling).
- Render Postgres: 25 tables. 1 sport, 2 competitions, 5 leagues — 4 active (Fiver / Tenner / Pony / Big One) + 1 inactive (Pound). 18 stages (9 Rounds × 2 comps), ~932 events, 5 open pools for PL Round 9 (one being The Pound, still settling 24 May), `event_outcomes` rows updated continuously by the in-process scheduler.
- **Active-tier prize structure** (post step 2n): 25% house fee, top 3 paid at 60/25/15 of the player pot. Fiver / Tenner / Pony / Big One all identical. **Pound's open pool still on legacy 70/20/10 with no commission** — deliberate, retired tier settles under original rules.
- Wez has an entry in The Pound for Round 9 with `Aston Villa 2-2 Liverpool` saved. Round 9 settles Sun 24 May 2026. After 24 May, no Pound pool will ever be created again.
- Round 9 league table viewable at `/pools/premier-league/{poolId}/table` (settled-table URL preserved post step 2m).
- Bottom nav: HOME / PREDICT / TABLES / ACCOUNT. Trophy icon for Tables.
- Render env vars: `DATABASE_URL`, `FOOTBALL_API_KEY`, `NODE_ENV`, `BYPASS_LATE_ENTRY=true`, `ADMIN_SECRET`, `SESSION_SECRET`. Optional: `DISABLE_SCHEDULER=true` pauses the in-process scheduler (admin endpoints stay available for manual triggering).
- Node pinned `22.20.0` via `.nvmrc` + `engines.node`. Build command still reads `corepack enable && pnpm install && pnpm build`.
- `pnpm settle-pools` runs clean. `POST /api/admin/settle-pools` and `POST /api/admin/sync-outcomes` verified end-to-end (401 without token, identical stats JSON to CLI with token).
- **Automated scheduler running in-process** (step 2o). Score sync every 5 min, pool settle every 15 min, both inside the Express server. CLI scripts + admin endpoints retained for manual triggering when needed.
- **Chrome on iPhone refresh shows a blank white screen** — investigated, traced to the Manus runtime preview script being inlined into the Vite production build (`dist/public/index.html` is 368KB vs 1KB source, with a giant `<script id="manus-runtime">` block). Web-only artifact, doesn't affect Safari iPhone or any of the native app store builds. Carried forward as a pre-launch task.

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

## What's next — TBD with Wez

Steps 2m, 2n, 2o, and 2p are done. Open candidates for the next step (Wez picks):

- **Tie-break visualisation in standings** — when two players have the same points, surface *why* one is ranked higher (more exact scores → more correct results → tied split). Currently the data is in the table (Exact / Res columns) and the tie-break rule is in the footer, but there's no visual cue tying them together. Add a subtle indicator (column highlight, tiny `↑`, or grouped bracket) for tied clusters in `PoolStandingsTable.tsx`. Discussed but deferred.
- **Tables tab deep links** — `/tables/:competitionSlug/:tierSlug` (or `?comp=&tier=` query) so Home's Available Tier rows land on the right tier in one tap.
- **Resend + email verification** — signup currently creates an unverified account. Wire up `RESEND_API_KEY`, transactional templates, magic-link flow.
- **`pool_entries` unique index `(pool_id, user_id)`** — DB-level Decided Rule #2 enforcement, closing the concurrent-double-tap race. Pre-launch blocker eventually.
- **Marketing tier name alignment** — `leagueTiers` mock data still uses old branding (Matchday Five / Premier Ten / Grand Twenty / Elite Fifty at £5/£10/£20/£50). Should align with portal reality (Fiver / Tenner / Pony / Big One at £5/£10/£25/£50).
- **Live in-play scores** — currently locked matches stay locked through the match with no live score visible; users see their prediction then jump straight to FT result after the scheduler fires. Real in-play score display (HT, 60', live goals) is "step 2j+" per arch and worth queueing for pre-launch — it's the moment users naturally have the app open.
- **App store wrap (Capacitor)** — eventually, for Google Play and Apple App Store delivery. Adds `ios/` and `android/` folders to the repo. Gated on UKGC licence, KYC, responsible-gambling tooling, and real payment integration. Don't start until those are in flight.

Routes as of step 2m (unchanged in 2n):
| URL | Page |
|---|---|
| `/` | Home (logged-in: portal Home; logged-out: marketing) |
| `/predict` | Predict tab — list of entries |
| `/predict/:entryId` | Prediction screen |
| `/tables` | Tables tab |
| `/pools/:slug/:poolId` | Legacy redirect → `/predict/:entryId` (or `/tables` if no entry) |
| `/pools/:slug/:poolId/table` | Standalone league table (linked from Account History) |
| `/pools`, `/pools/:slug` | Legacy redirect → `/tables` |
| `/account`, `/account/history` | unchanged |
| `/login`, `/register` | unchanged |

## What to do first

1. Read all three docs in `/docs/` (architecture first).
2. Skim the recent file edits — `server/lib/portal-data.ts`, `server/lib/pool-settle.ts`, `client/src/pages/portal/TablesPage.tsx`, `client/src/pages/portal/HomePage.tsx`.
3. Ask Wez what's next.
4. Propose your file plan in tabular form with folder paths.
5. Wait for "go" before bulk-changing files.
