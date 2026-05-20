# Predictor10 — roadmap

Written: May 2026.
Owner: solo developer.
Target launch: **No hard date.** Earliest-possible: Round 1 of PL 2026/27 (Sat 22 Aug → ~Sat 19 Sep 2026) as closed test, then public launch at start of Round 2 (~Sat 26 Sep 2026). Both slide if not ready. Build window: 15+ weeks available from May 2026; pace dictated by readiness, not deadline.

> **Companion doc:** `docs/portal-architecture.md` is the design canon — terminology, page layouts, decided rules, deferred decisions. This roadmap is the build plan; the architecture doc is the spec. When they drift, the architecture doc wins.

---

## Guiding principles

1. **Build the real flow, mock the money.** Every screen, endpoint and ledger entry behaves as if real money is moving. Behind the scenes, payments are recorded with `mode = "mock"` and never hit a PSP. When the UKGC licence lands, the same code paths flip to `mode = "live"`.
2. **Compliance-ready schema from day one — no structural migrations at licence flip.** All tables a licensed operator needs (KYC, AML, withdrawals, customer interactions, GAMSTOP, payment provider events) are in the schema from the first migration. They sit dormant during V1; the licensed work populates them rather than creating them.
3. **Simplest viable architecture.** Single repo. Render hosting. Postgres + Drizzle. No Redis, no queue infrastructure — Render Cron Jobs handle settlement. The existing `football-data.org` feed stays untouched.
4. **One product, one scoring rule.** Match-by-match score prediction. 5 points for exact score, 2 for correct result, 0 otherwise. Four tiers from £5 to £50 — The Fiver / The Tenner / The Pony / The Big One. (The Pound (£1) was in the original five-tier plan but retired in step 2m — see Build progress below.)
5. **Round = multi-gameweek tournament block.** PL: 9 Rounds of 4-5 GWs each (38 GWs total). Champ: 9 Rounds of 5-6 MDs each (46 MDs total). One stake per Round; user predicts every match across all GWs in that Round. See architecture doc Section 3.
6. **Anti-cheat by design.** Predictions for matches already kicked off are never accepted. Late entry is allowed up to 7 days into a Round but with explicit warning that already-played matches score 0. Lock = kickoff minus 1 hour, server-enforced.

---

## Build progress (status as of May 2026)

The calendar weeks below were the original plan. Reality ran roughly to schedule, with the build progressing through a series of fine-grained steps inside the broader weekly themes. Current state:

- **Step 1** (Portal shell): ✅
- **Step 2a** (DB foundation, Drizzle, first migration, Argon2): ✅
- **Step 2b** (Real auth — signup/login/logout/me, sessions, audit, age gate, Vite proxy dev workflow): ✅
- **Step 2c** (Seed: PL + Champ, 5 tiers, 2025/26 fixtures, 9 Rounds per comp, current-Round pools): ✅
- **Step 2d** (Real Home — `/api/competitions`, `/api/entries/me`): ✅
- **Step 2e** (Pool entry flow — `POST /api/pools/:id/enter`, late-entry modal, three pre-entry states): ✅
- **Step 2f** (Canonical Predict screen — GW tabs, day-grouped rows, 800ms auto-save, per-match lock): ✅
- **Step 2g** (Predict tab — open entries grouped by close-time, 48h "Closing soon"): ✅
- **Step 2h** (Pools landing + per-competition page): ✅
- **Step 2i** (Outcome sync + per-prediction scoring — `pnpm sync-outcomes`, `POST /api/admin/sync-outcomes`, FT row variant, points pills): ✅
- **Step 2j** (Pool settlement + history archive — `pnpm settle-pools`, `POST /api/admin/settle-pools`, Rules 13/14/15, settled-state PoolDetailPage, `/account/history`): ✅
- **Step 2k** (League Table page — `/pools/:competitionSlug/:poolId/table`, `GET /api/pools/:id/entries`, gold top-3, emerald "You" row, tie-break footer mirroring Rule #10 verbatim, two-CTA live-entry cards on Home, `[Table]` deep-links from History): ✅
- **Step 2l** (Football-data sync extended to refresh scheduled fixtures, not just outcomes — shared `fixture-sync.ts` helper, finished-is-terminal safety rail, legacy `/api/fixtures*` proxy + `footballService.ts` + unmounted `Dashboard.tsx` removed): ✅
- **Step 2l.1** (Refresh-on-portal cold-start fix — 30s `AbortController` removed, retry-on-network in `loadCurrentUser`, 401 interceptor in portal-api.ts, `RedirectToLogin` component, `LoginPage`/`RegisterPage` `?redirect=` handling, longer `LoadingSplash` escalation with 60s Reload button): ✅
- **Step 2m** (Menu / IA restructure + Pound retirement — bottom nav becomes HOME/PREDICT/TABLES/ACCOUNT, prediction screen moves to `/predict/:entryId`, Pools tab repurposed as TABLES with competition pills + tier sub-tabs + entry CTA, Pound tier retired from Round 10 onwards): ✅
- **Step 2n** (Prize splits standardised + commission + per-rank breakdown UI — all four active tiers move to 60/25/15 splits on the player pot with 25% operator commission, prize breakdowns surface on Tables and Home as "1st £X · 2nd £Y · 3rd £Z" lines computed live from current entry counts, settlement applies commission before payouts): ✅
- **Step 2o** (In-process scheduler — `server/lib/scheduler.ts` runs `syncOutcomes()` every 5 min and `settleAllReadyPools()` every 15 min directly inside the Express server. `node-cron` dep added. Gated on `NODE_ENV=production`; `DISABLE_SCHEDULER=true` env flag for emergency pause. Picked over Render Cron Jobs because Starter ($7/mo) keeps the web service always-on — saves $2/mo and keeps logs in one place): ✅
- **Step 2p** (Manus runtime stripped from production build — `vite.config.ts` switched to function-form `defineConfig` so the four Manus dev plugins only register when `mode !== "production"`. Production `index.html` dropped from 368 KB to 1.27 KB. **ROLLED BACK in step 2q** — broke the signed-in refresh path on iPhone for reasons not yet fully understood): ↩️
- **Step 2q** (Reverted step 2p — `vite.config.ts` restored to original form, Manus dev plugins back in production builds, `index.html` back to 368 KB. Step 2o scheduler untouched. Re-attempting the strip is a candidate for a later step, this time with an inline error reporter in `client/index.html` so any underlying error surfaces visibly): ✅
- **Step 2r** (Inline boot-time error reporter in `client/index.html` — captures `window.error` + `unhandledrejection` before React mounts, renders a visible dark-themed fallback into `#root` with stack + UA + Reload + Copy-diagnostic when boot fails. 200ms mount-check guard means healthy boots are a no-op. Adds ~7 KB of inline HTML/JS. Designed to make any future failed boot diagnosable instead of presenting a white screen): ✅
- **Step 2s** (Re-attempted the Manus strip — same `vite.config.ts` change as step 2p, now safe because the 2r reporter is in place. Production HTML drops from 376 KB → 8.84 KB. Step 2p's signed-in-iPhone bug returned; the reporter caught it this time with `bootStarted=false` + a `<script>` resource-load failure or a 10-second silent stall): ✅
- **Step 2t** (Reporter tightened — error listener gains `useCapture: true` so script-load failures (which target the `<script>` element, don't bubble to window) are caught. `main.tsx` gains three boot checkpoints `__p10_bootStarted` / `__p10_renderStarted` / `__p10_renderReturned`; reporter reads them and reports how far boot got. Safety-net diagnostic copy adapts to which checkpoint was reached): ✅
- **Step 2u** (Reporter adds fetch-status follow-up — on a captured resource error, the reporter immediately re-fetches the same URL via `fetch()` and appends `status / content-type / content-length` to the diagnostic. Distinguishes server failure (4xx/5xx) from browser module-load rejection (200 OK with wrong MIME, etc.). First step that produced a confirmed remote-resource failure log on a real iPhone refresh): ✅
- **Step 2v** (Stripped `crossorigin` attribute from Vite's emitted `<script type="module">` and `<link rel="stylesheet">` in production HTML via a `transformIndexHtml` post-order plugin. Vite emits this by default for CDN/cross-origin asset hosting; Predictor10 serves all assets same-origin from Express, so the attribute is unnecessary. On iOS WebKit it can trigger a silent CORS-adjacent failure mode where module scripts stall without firing `error` events — caught in 2u's diagnostics. Safety net also enhanced to auto-fetch the bundle URL when fires + main.tsx never executed. Step 3a-onwards iPhone refresh failures now diagnose to specific HTTP responses rather than white-screening): ✅ *(monitored — intermittent residual reported via WhatsApp 20 May; reporter remains in place to capture recurrence)*
- **Step 3a.1** (World Cup 2026 schema + seed prep — prepared in a prior chat but Wez's local changes sat unpushed until 3a.3 forced the deploy. Adds `postponedPolicyEnum('wait'|'forfeit')` + `postponedPolicy` column on `competitions`. Adds WC competition entry to `COMPETITIONS` (initially `isActive: false`) + WC tier `world-cup-2026` £30 to `TIERS`. Per-competition `tiers` array selects which TIER slugs apply (PL/Champ: 4 league tiers; WC: 1 dedicated tier)): ✅
- **Step 3a.2** (Admin state inspection endpoint — `GET /api/admin/state` returns competitions + tiers + pool/event/stage counts + schema probe. Token via `X-Admin-Token` header OR `?token=` query for browser-friendly verification. Used to confirm what's in production after each schema/seed change without psql access): ✅
- **Step 3a.3** (Turn World Cup on, backend foundation — flips WC `isActive: true`, adds `WC_ROUNDS = [{ round: 1, matchdays: "all" }]` to `rounds.ts` with `RoundSpec.matchdays` accepting the "all" sentinel, adds per-comp `season` field to `COMPETITIONS` (PL/Champ 2025, WC 2026), wraps each comp's fetch in try/catch so WC outage can't break PL/Champ, pool generator respects per-comp `tiers` array. `portal-data.ts` gets `matchdaysForRound()` helper coercing "all" → [] for the DTO. **Deploy crashed on first knockout-fixture insert** — football-data sends `homeTeam: null` for unresolved knockouts, but `events.home_team` was NOT NULL. 72 group-stage events inserted before crash. Required step 3a.4 hotfix to complete): ✅
- **Step 3a.4** (Null-team handling for unresolved knockout slots — `events.home_team` and `events.away_team` made nullable. `FDMatch` type allows null. Insert path writes nulls cleanly. **Update path now overwrites team fields** (essential for bracket fill-in: null → real team as FD resolves prior round). `UpsertEventInput.existing` gains optional team fields; seed's batched lookup includes them. Client + server DTO types updated to `string | null`. `displayTeamName(null) → "TBD"`. After deploy + `pnpm db:push` + `pnpm seed`: WC has all 104 events (72 with teams, 32 placeholder) + 1 pool. Verified via `/api/admin/state` 20 May 2026): ✅
- **Step 3a.5** (Outcome-sync per-comp season — `outcome-sync.ts` hardcoded `SEASON=2025` replaced with `comp.externalSeasonId` from the DB row. Drops `m.matchday != null` guard from the FD match loop. WC now syncs season 2026 correctly): ✅
- **Step 3a.6** (Home redesign — `HomePage.tsx` rewritten to competition cards per arch §8.1. Card variant discriminated by `comp.postponedPolicy`. PL/Champ cards: "Choose your tier" CTA → tier picker. WC card: "Enter World Cup" CTA → `/enter/world-cup-2026`. Live entries removed from Home): ✅
- **Step 3a.7** (`/enter/:competitionSlug` confirm screen — NEW `EnterPage.tsx` per arch §8.6.1. Single-screen explainer + Enter CTA. POST-entry → `/predict/:entryId`. Already-entered users get a client redirect. Route registered in `App.tsx`, `PORTAL_PATH` regex extended): ✅
- **Step 3a.8** (Predict tab refresh — `PredictPage.tsx` rewritten. "ACTIVE PLAY / YOUR LIVE ENTRIES" header. Three sections: CLOSING SOON (amber, AlarmClock countdown), THIS ROUND, TOURNAMENT. Progress bars per card. Stage pills on tournament cards. `UserEntryDto.postponedPolicy` enriched server-side for bucketing): ✅
- **Step 3a.9** (Null-team gating end-to-end — `PredictMatchRow` `awaitingTeams` variant: disabled inputs, "Awaiting teams" meta. Server `upsertPrediction` returns `EVENT_AWAITING_TEAMS` 409 when either team is null. Players see the bracket ahead but can't predict blind, server enforces too): ✅
- **Step 3a.10** (Settlement gate forfeit branch — `pool-settle.ts` `findReadyPoolIds` gate SQL extended with `OR (c.postponed_policy='forfeit' AND e.status='postponed' AND e.kickoff_at <= NOW())`. WC pool can now settle when all 104 events are FINISHED-with-outcomes OR POSTPONED-without-future-kickoff): ✅
- **Step 3a.10b** (FT-only scoring for WC knockouts — `FDMatch.score` extended with `duration` + `regularTime` / `extraTime` / `penalties`. New helper `extractRegulationScore(match)` returns `regularTime` when `duration !== 'REGULAR'`. WC knockouts that go to ET or penalties are scored from the 90-minute result only. PL/Champ always `duration='REGULAR'`, behaviour unchanged): ✅
- **Step 3a.11** (Persistent-after-entry Home + tab labelling + group letters + refresh-bug fix — `HomePage.tsx` rewritten with `CompState` model. Entered cards get brighter emerald accent + "✓ You're in {tier names}" line + always-shown secondary "View all tiers" / "Pick another tier" ghost button. Smart routing: 1 entry → entry direct; 2+ → /predict tab. `getEntryDetail` matchday label now "Group MD" for tournaments; null-bucket label "Knockout Stages"; null-bucket sorts LAST. NEW `events.group_label` column captures FD's `match.group` field; `PredictMatchRow` renders "Group A" in meta line. Fully-entered count bug fixed (compares visible-entered count to visible-pool count, not enterable-pools). `client/index.html` analytics-script block removed — `%VITE_ANALYTICS_ENDPOINT%` placeholder was never substituted and was derailing iOS Chrome refresh on some paths): ✅
- **Step 3a.11+** (Knockout sub-headings + tournament-aware standings pill — NEW `events.fd_stage` column captures FD's stage string. `PoolDetailPage.groupedActive` branches on `activeMatchday === -1`: groups by stage with sub-headings (Round of 32 / R16 / QF / SF / 3rd-place / Final) instead of day-grouping. `PoolEntriesPool.liveStatusLabel` server-computed for tournament comps — "Group MD2 of 3" / "Round of 32" / etc. / "Awaiting settlement". Fixes bug where status pill said "Round complete · awaiting settlement" during WC knockouts because the matchday-rollup query filtered out null-matchday events. Slot pairing labels deferred — 495 FIFA Annex C combinations make a static map impractical): ✅
- **Compliance build-out (Weeks 5-8)**: not started
- **Resend / email templates**: deferred to pre-launch

Notable deviations from the original weekly schedule:
- **League Table page** (originally Week 3) deferred to step 2k after settlement landed first. The settled-state read-only PoolDetailPage took priority because it consumes the same settlement output and validates the data model before the live-table query is built.
- **Football-data sync as fixture+outcome job** (not in original plan as a distinct step): the rebuild's outcome-only sync left a gap — rescheduled / postponed / newly-added matches silently dropped out of the DB until someone re-seeded by hand. Surfaced in step 2l by a real-world miss (Wed 13 May 2026 Man City v Crystal Palace catch-up not showing in Round 9). Fix landed as `server/lib/fixture-sync.ts` shared helper + extended `syncOutcomes()`; both seed and cron now upsert events through one implementation. Legacy `footballFetch` cache + `/api/fixtures*` proxy + unmounted Dashboard removed in the same step.
- **Cold-start auth tolerance** (step 2l.1, not in original plan): the 30s `AbortController` in `AuthContext.tsx` was dropping valid sessions during long cold starts on the previous free-tier Render service. Symptoms: iPhone Safari refresh on a portal URL showed the marketing 404 with "Sign In" nav, looking like a forced logout. Fix removes the hard timeout, adds retry-on-network, and routes logged-out users on portal URLs to `/login?redirect=<url>` via the new `RedirectToLogin` component. The site has since moved to Render Starter (always-on); the retry tolerance still applies during fresh deploys but is rarely exercised in normal operation.
- **The Pound tier retirement** (step 2m, not in original plan): the £1 tier loses money after Stripe + merchant fees against the player-pool payout (75% of gross after step 2n's 25% commission). Removed from Round 10 onwards. Wez's existing Round 9 Pound entry settles normally on Sun 24 May 2026 under the original (pre-step 2n) 70/20/10 rules.
- **Pool generation cron** (originally Week 2): replaced by an idempotent one-shot in the seed script. Pools for the current Round are generated by re-running `pnpm seed`. A cron job becomes useful when seasons roll over and new Rounds need pools as the previous ones settle; nothing forces that decision now.
- **Settlement worker** (originally Week 4 at 5-min cron): wired in step 2o as an in-process schedule running every 15 min alongside the 5-min score sync. Both run inside the Express server (Starter plan keeps the service always-on, making a separate cron service unnecessary). Manual CLI + admin-endpoint paths retained.
- **`PUT /api/predictions/:id`** (originally Week 2) was replaced by `PUT /api/entries/:entryId/predictions/:eventId` — predictions have no stable id before first save, `(entry, event)` is the natural unique key. Arch §11 updated.
- **`/api/pools`, `/api/tiers`, `/api/pools/competition/:slug`** (originally Week 2) collapsed into `/api/competitions` — pools and tiers are always queried in competition context. Bring back as separate endpoints only if a future surface needs them.
- **Bottom nav rename — Pools → Tables** (step 2m): with the entry flow consolidated onto Home and pools-as-browse killed, the third bottom-nav slot is repurposed for league standings.

---

## Step 3a — World Cup 2026 + Home / Predict redesign

**Adds the World Cup 2026 as Predictor10's third competition and resolves the multi-competition Home design that's been deferred since step 2c.** Locks the answers in arch §3 / §8.1 / §8.2 / §8.6.1 / §10 / §13 Rules #4 + #16-#18.

### Sub-step status (May 2026)

| Sub-step | Status | Summary |
|---|---|---|
| 3a.1 | ✅ shipped | Schema (postponedPolicy column) + seed config (WC entry + WC tier, gated `isActive: false`). Code prepared, deployed in 3a.3 |
| 3a.2 | ✅ shipped | `GET /api/admin/state` for browser-friendly DB inspection |
| 3a.3 | ✅ shipped | Turned WC on (`isActive: true`), `WC_ROUNDS`, per-comp season, per-comp tier list. Seed deploy crashed mid-way on null-team knockout fixture insert |
| 3a.4 | ✅ shipped | Null-team handling hotfix — schema columns nullable, fixture-sync bracket-fill-aware, DTOs `string \| null`. WC pool now created with all 104 events |
| 3a.5 | ✅ shipped | Outcome-sync per-comp season — `outcome-sync.ts` reads `comp.externalSeasonId` instead of hardcoded 2025. Drops `m.matchday != null` guard. WC now syncs season 2026 |
| 3a.6 | ✅ shipped | Home redesign per §8.1 — competition cards, no live entries. Discriminated by `postponedPolicy`: league-style card vs tournament card |
| 3a.7 | ✅ shipped | `/enter/:competitionSlug` confirm screen per §8.6.1. NEW `EnterPage.tsx`. Smart redirect for already-entered users |
| 3a.8 | ✅ shipped | Predict tab refresh per §8.2 — YOUR LIVE ENTRIES header + three sections (Closing Soon / This Round / Tournament). Progress bars on cards |
| 3a.9 | ✅ shipped | Null-team gating end-to-end. `PredictMatchRow` `awaitingTeams` variant; server `EVENT_AWAITING_TEAMS` 409 response |
| 3a.10 | ✅ shipped | Settlement gate forfeit branch per Rule #16. Postponed-without-future-kickoff counts as accounted-for, with kickoff_at <= NOW() gate |
| 3a.10b | ✅ shipped | FT-only scoring for WC knockouts. `extractRegulationScore()` reads `score.regularTime` when `duration !== 'REGULAR'` |
| 3a.11 | ✅ shipped | Persistent-after-entry Home cards (supersedes Rule #18's hide-on-entry), tab labelling for tournaments ("Group MD" + "Knockout Stages"), group letter column (`events.group_label`) with "Group A" rendered on rows, fully-entered count bug fix, refresh bug fix (broken analytics script removed) |
| 3a.11+ | ✅ shipped | Knockout Stages tab sub-headings (Round of 32 / R16 / QF / SF / 3rd-place / Final via new `events.fd_stage` column), tournament-aware standings status pill (`liveStatusLabel` server-computed). Slot pairing labels DEFERRED — 495 FIFA Annex C combinations make a static map impractical; FD auto-resolves teams June 27 |

### Original scope (preserved for context)

- **Schema**: add `competitions.postponedPolicy` (`'wait' | 'forfeit'`, default `'wait'`) and seed-define the three competition policies (PL/Champ: `'wait'`; WC: `'forfeit'`). **Shipped in 3a.1.**
- **Seed**: extend `COMPETITIONS` in `server/scripts/seed.ts` with WC (`code: "WC"`, `slug: "world-cup-2026"`, `externalSeasonId: "2026"`). Extend `TIERS` with the dedicated WC tier (`slug: "world-cup-2026"`, £30, 60/25/15, 25% house). Seed creates the single WC pool when its first matchday is < 7 days away. **Shipped in 3a.1 / 3a.3.**
- **Sync**: `outcome-sync.ts` needs to read per-comp season from the DB (it currently hardcodes 2025). `fixture-sync.ts` handles null teams (shipped 3a.4 — bracket-fill update path). Settlement gate (`settle-pools.ts`) gains the per-comp policy branch (Rule #16): for `postponedPolicy='forfeit'` competitions, a POSTPONED-without-future-kickoff event counts as "accounted for". **Sync pending in 3a.5; settlement pending in 3a.10.**
- **Predict UI per Rule #17**: prediction availability gated on (a) both team fields non-null AND (b) per-match 1hr lock not passed. Null-team fixtures render with "Awaiting teams" copy + disabled input boxes. As football-data populates real teams, fixtures unlock automatically on next portal refresh. **Pending in 3a.9.**
- **Home (`/`) — redesign per §8.1**: replace the single-competition Round hero + live entries + tier list with a list of competition cards (one per open competition). PL/Champ cards route to the tier picker; WC card routes to `/enter/world-cup-2026`. Live entries removed entirely from this surface. **Pending in 3a.6.**
- **WC entry confirm screen — new (§8.6.1)**: `/enter/:competitionSlug` route. Single-screen explainer + Enter CTA + dynamic prize breakdown computed from current pool entry count. POST-entry → `/predict/:entryId` redirect. **Pending in 3a.7.**
- **Predict (`/predict`) — refresh per §8.2**: persistent "YOUR LIVE ENTRIES" header. New "TOURNAMENT" section group. WC entry cards surface current stage state. **Pending in 3a.8.**

### Definition of done

Step 3a is complete. As of step 3a.11+, the World Cup is fully end-to-end on Predictor10 with parity to Premier League:
- A user signs in, sees PL + WC cards on Home, taps WC, reads the explainer, enters for £30 (mock).
- Their WC entry appears in the TOURNAMENT section of Predict.
- They predict every group-stage match (with knockout rows rendered as "TBD vs TBD · Awaiting teams" until FD resolves them after June 27).
- Group matches lock 1hr before each kickoff; FT-only scoring on knockouts (no ET, no penalties).
- Postponed matches (forfeit policy) score 0 unless rescheduled.
- The WC pool will settle within ~20 min of the Final's full-time whistle on Sun 19 Jul 2026, with payouts to top 3.
- PL's flow is unaffected. Championship's flow is unaffected. The retired Pound tier remains retired.

### After the Final: WC retirement

Once the WC pool flips to `settled` (~22 Jul 2026), follow `docs/portal-architecture.md` §15 to retire the comp + tier from active surfaces. Summary: add `"world-cup-2026"` to `RETIRED_TIER_SLUGS` in `server/scripts/seed.ts`, optionally flip the comp's `isActive: false`, deploy, run `pnpm seed` in Render Shell. Existing entries stay accessible via `/account/history`. No data deletion.

### Risks / lessons learned

- **football-data placeholder format**: confirmed in 3a.3 deploy crash that FD sends `homeTeam: null` / `awayTeam: null` for unresolved knockouts (not placeholder strings as initially assumed). Schema + code updated in 3a.4 to match. Architecture §13 Rule #17 description updated accordingly.
- **Per-competition policy table proliferation**: `postponedPolicy` is the first per-competition behavioural flag. If 3+ accumulate, consider a single `behaviorPolicy` jsonb column instead of one column per rule. Defer the refactor until 3+ exist.
- **WC entry count assumptions**: prize-breakdown copy says "47 players so far" in the §8.6.1 mock. At 30 entries (~£900 gross), the 3rd-place share is ~£100; at 100 (~£3,000), 3rd is ~£330. Both feel proportionate. Copy decision deferred until first invited-tester reactions.
- **Manual deploy sequencing required schema-change steps**: `pnpm db:push` and `pnpm seed` must be run in Render Shell after each deploy that touches `server/db/schema/`. Wez learned this the hard way in 3a.3 (forgot db:push) and 3a.4 (had to run a second db:push for the nullable-team migration). Worth flagging in any future schema-touching step.

---

## Schema readiness — what's in the database from day one

The schema lives in `server/db/schema/` split across seven files. Every table the product needs across its full lifecycle is present from the first migration. Tables fall into three groups:

**Active in V1** — written to during normal test-mode operation:
- `users`, `sessions`, `email_verifications`, `password_resets` — auth
- `leagues` — the four active tier definitions (The Fiver / The Tenner / The Pony / The Big One) plus one retired (The Pound, `is_active=false`)
- `sports`, `competitions`, `stages`, `events`, `event_outcomes` — fixture data
- `pools`, `pool_entries`, `predictions` — gameplay
- `payments` — every entry and every payout, in mock mode
- `audit_log` — every state change

**Active but light-touch in V1** — present, populated by edge-case flows:
- `user_limits` — schema in `compliance.ts`. UI built in week 4 if time, post-launch if not.
- `self_exclusions` — same. Form built in week 4.
- `key_events` — manual records of major operational events (data breaches, system incidents).

**Dormant until licence-active** — schema in `licensed.ts`, untouched during V1:
- `withdrawals` — withdrawal request flow, KYC gates, compliance review.
- `kyc_documents` — identity, address, source-of-funds uploads. Links to KYC provider records.
- `customer_interactions` — SR Code 3.4 records of when staff identified concerning behaviour and what action was taken.
- `payment_provider_events` — PSP webhook log for reconciliation against the `payments` table.
- `gamstop_syncs` and `gamstop_user_checks` — proof of regular and per-user checks against the GAMSTOP register.
- `aml_reviews` — flagged-transaction review queue, suspicious activity reporting (SAR) tracking.

The dormant tables consume zero runtime cost — empty tables in Postgres have negligible overhead, and the V1 application code never reads or writes them. They exist so that:

- Licence application reviewers see the data model is honest about what licensed operations require.
- When licence is granted, the work is to build the *features* (KYC integration, GAMSTOP sync job, AML monitoring rules) — not to redesign the data layer.

---

## The licence flip — what changes when the licence lands

To go live with real money, this is what happens. Note what's NOT here: structural schema migrations.

**Code/config changes:**
- Stripe (or Worldpay / Trustly) integration goes into the pool entry endpoint. Mock-mode auto-success becomes a real Checkout redirect.
- KYC provider integration (Onfido / Veriff / GBG) wires into `kyc_documents` and updates `users.kyc_status`.
- GAMSTOP API integration runs as a periodic Render Cron job, writing to `gamstop_syncs`.
- AML monitoring rules engine starts populating `aml_reviews` from `payments` patterns.
- A small admin UI for compliance review (queue of `aml_reviews`, `customer_interactions`, `withdrawals` pending review).
- Footer's licence-holder block populated with real licence number, ADR provider, registered office.

**Data changes:**
- `users.real_money_enabled` flips to `true` on per-user basis as KYC clears.
- `payments.mode` starts being `live` for new transactions.
- `users.kyc_status` starts being populated.
- `self_exclusions.source = 'gamstop'` enum value starts appearing.

**Migrations:**
- Possibly a small column addition or two as compliance counsel reviews the schema. Expected, normal, low-risk.
- No structural rewrites. No "auth has to be redone." No "wallet has to be added." No "settle into a new transaction model."

That's the test. If at licence-grant we have to rebuild a major subsystem, the principle has failed. With the schema as it stands, we don't.

---

## Week 1 — May 10 to 17

> **Note (May 2026):** The weekly sections below describe the *original build plan*. Reality diverged in places — see "Build progress" and "Notable deviations" above for current state. Endpoints, page names, and tier counts here reflect intent at the time of planning, not the shipped system. The Build progress section above is authoritative for what's actually in production.

**Foundation: database, auth, payments scaffolding.**

- Provision Render Postgres (smallest paid tier; the free one auto-suspends).
- Add `drizzle-orm`, `drizzle-kit`, `postgres-js` (or `pg`), `argon2`, `nanoid` to `package.json`.
- Run `pnpm drizzle-kit generate` then `pnpm drizzle-kit push` to apply the full schema (all tables, including the dormant ones from `licensed.ts`).
- Create `server/db/index.ts` exporting the Postgres client and Drizzle instance.
- Real auth endpoints in `server/routes/auth.ts`:
  - `POST /api/auth/signup` — creates user, email verification token, sends verification email.
  - `POST /api/auth/login` — verifies password, creates session row, sets HTTP-only cookie.
  - `POST /api/auth/logout` — invalidates session.
  - `GET /api/auth/me` — returns current user from session cookie.
  - `POST /api/auth/verify-email` — consumes token, sets `email_verified_at`.
- Argon2 password hashing. Sessions in `sessions` table, 30-day expiry, slid on each request.
- Update `client/src/contexts/AuthContext.tsx` to call the real endpoints.
- Resend account, single template for verification email.
- Audit log middleware: every state-changing endpoint writes to `audit_log` with action, before/after, IP, UA.

**Definition of done:** A user can sign up, receive a real email, click the link, sign in, and see their authenticated state. Refreshing keeps them logged in. Signing out works.

---

## Week 2 — May 17 to 24

**Tiers, pools, payments, predictions.**

- Seed the `leagues` table with the five tiers (The Pound £1 / The Fiver £5 / The Tenner £10 / The Pony £25 / The Big One £50).
- Sync Premier League (38 GWs) and EFL Championship (46 MDs) competitions and events from the existing `football-data.org` integration.
- Generate `stages` rows per portal-architecture Section 3 — PL: 9 Rounds (4-4-4-4-4-4-4-5-5 GWs). Champ: 9 Rounds (5-5-5-5-5-5-5-5-6 MDs).
- Compute `predictionLockAt` for each event = **kickoff minus 1 hour** (Decided Rule #7).
- Pool generation cron: creates 5 tier pools per Round per Competition when a Round becomes available (~10 pools per round across both competitions, far fewer rows than per-GW would have been).
- Endpoints (see portal-architecture Section 11 for full list):
  - `GET /api/competitions` — list active competitions.
  - `GET /api/tiers` — list of 5 tiers.
  - `GET /api/pools` — list open pools.
  - `GET /api/pools/:id` — pool detail (matches grouped by GW, user's predictions, entries count).
  - `POST /api/pools/:id/enter` — creates a debit `payments` row (mock mode, auto-succeeded), creates a `pool_entry`. Late-entry warning modal logic enforced server-side: refuses entry if Round has been live > 7 days (Decided Rule #8). Refuses if user is self-excluded or suspended.
  - `PUT /api/predictions/:id` — auto-save single prediction. Server validates `predictionLockAt`; rejects with 403 if past lock or for matches already played.
  - `GET /api/pools/:id/table` — current league table standings.
- Lock enforcement is server-side. The UI's locked state is cosmetic; backend always re-checks. Anti-cheat: server rejects predictions for any match whose kickoff has passed (Decided Rule #7).

**Definition of done:** A logged-in user can enter Round 1 of PL at the £10 Tenner tier (mock payment), set scorelines for all 40 matches across GWs 1-4, see them auto-save. Predictions for matches already kicked off return 403. Late entry past day 7 returns 403.

---

## Week 3 — May 24 to 31

**UI rebuild — the post-login experience.** Implements the canonical screens from `portal-architecture.md` Section 8.

- Rebuild `client/src/pages/Dashboard.tsx`. Replace leaderboard-as-landing with the Home design from arch Section 8.1: Live entries (shortcuts to entered tiers) + Available tiers (not-yet-entered tiers in the current round).
- Build the canonical Pool detail / Predict screen (arch Section 8.5, Decided Rule #12): top tabs per GW, default to current GW, all matches shown without truncation, four match-row states (finished / saved-locked / half-saved / editable), day groupers within GWs, auto-save footer, no manual save button. Late-entry warning modal when a user attempts to enter mid-round.
- Build the League Table page (arch Section 8.6) with top-3 highlighting, user-row highlighting, tie-breaker explainer.
- Build the History archive page (arch Section 8.8) — settled pools grouped by Round, newest first.
- Components in `client/src/components/predictor10/`: `Home`, `LiveEntryCard`, `AvailableTierRow`, `PoolPredictScreen`, `GwTabs`, `MatchRow`, `LateEntryModal`, `LeagueTable`, `HistoryArchive`. shadcn primitives, no inline `style={}`.
- Code-split routes with `React.lazy()` so logged-out homepage doesn't ship the dashboard bundle.
- Account page: display name, email (with verified badge), sign out, History link. Stub the rest.

**Definition of done:** Full loop works in UI — sign up, browse pools, enter a tier, predict across 4 GWs (auto-save on each input), see matches lock 1hr before kickoff, watch live league table during round, view final results in archive once settled. No mock data on authenticated screens.

---

## Week 4 — May 31 to June 7

**Settlement, responsible-play scaffolding, polish.**

- Settlement worker, deployed as a Render Cron Job hitting `POST /api/admin/settle` every 5 minutes (Decided Rule #1):
  - Find finished events without `event_outcomes` rows.
  - Pull final scores from `football-data.org`.
  - Insert `event_outcomes`, mark event `finished`.
  - Score every prediction: 5 exact, 2 result, 0 wrong. Write `points_awarded`, `is_exact`, `is_correct_result`.
  - When **all** events in a pool are finished (i.e. last match of last GW in the Round goes FT — typically 4-5 GWs / 40-50 matches per pool), compute `final_rank` per entry using tie-breaker order (Decided Rule #10): pts → exact-score count → correct-result count → split. Generate credit-direction `payments` (mock) for top 3 per pool per `prize_structure`. Mark pool `settled`. Move pool from active surfaces to archive (Decided Rule #11).
  - Idempotent — re-running must not double-pay.
- Responsible play scaffolding:
  - `/account/responsible-gambling` (limits) — set daily/weekly/monthly spend limits. Decrease immediate, increase pending 24h.
  - `/account/responsible-gambling` (self-exclude) — pick duration (6mo / 12mo / 5yr), confirm, lock account.
  - "Take a break" link in footer.
- Email templates: verification, welcome, pool-entered, pool-settled, password-reset, late-entry-confirmation.
- Sentry for client and server.

**Definition of done:** When the last match of a Round goes FT, predictions get scored within 5 minutes. Top 3 see mock payouts. Pool moves to `/account/history` archive. Self-exclusion form closes the account.

---

## Weeks 5-8 — June 7 to July 5

**UKGC compliance build-out.**

The dormant tables in `licensed.ts` get their UI and write paths. Enforcement points to mock payments — flipping to live at licence is then code-only, not screen-design.

- **Deposit limits** (`/account/limits`): daily / weekly / monthly. Decrease takes immediate effect; increase queued for 24h cooling-off.
- **Self-exclusion** (`/account/self-exclude`): 6mo / 12mo / 5yr. Locks account, redirects to landing with confirmation.
- **Reality checks**: configurable interval (30 / 60 min). Modal mid-session showing time spent + net spend, with continue / take-break / log-out options.
- **GAMSTOP integration scaffolding**: stub client + nightly sync job returns empty result; ready to swap for real API on registration.
- **AML monitoring**: rule engine reads `payments`, writes flags to `aml_reviews`. Threshold-based (velocity, single-transaction size, deposit-to-stake ratios).
- **Customer interactions log**: admin tool writes to `customer_interactions`. SR Code 3.4.
- **KYC document upload UI**: `/account/verify-identity`. Stores to `kyc_documents`; awaits provider integration.
- **Audit log review tool**: read-only admin dashboard.
- **Policy documents**: T&Cs, Privacy, Responsible Gambling, AML — drafted to UKGC standards. These are documents you produce, not buy.

**Definition of done:** Every regulated function has a working UI and writes to its compliance table. Schema-to-feature mapping documented for licence application.

---

## Weeks 9-11 — July 5 to July 26

**Polish, integration prep, edge cases.**

- Email templates finalised (verification, welcome, pool-entered, pool-settled, password-reset, RG limit-set, self-exclusion confirmation).
- Mobile responsiveness pass on every screen.
- Accessibility audit — WCAG 2.1 AA basics (keyboard nav, focus rings, alt text, contrast).
- Edge case testing: postponed fixtures, voided fixtures, late corrections from `football-data.org`, settlement double-run safety.
- Sentry deployed and tuned for client + server.
- Performance: connection pool size, cache headers, bundle size analysis.
- Stripe Checkout integration in staging (off-by-default flag — dormant until licence flip).
- KYC provider sandbox setup (Onfido / Veriff conversation started).

**Definition of done:** Product runs cleanly with Sentry quiet for 7 consecutive days under simulated load.

---

## Weeks 12-13 — July 26 to August 9

**Closed beta.**

- Invite 10–20 friends and family.
- Real predictions on pre-season friendlies + manually-loaded staging fixtures.
- Bug bash, fix, repeat.
- Final UI polish based on feedback.

**Definition of done:** Beta cohort completes a full sign-up → enter pool → predict → settle loop without intervention.

---

## Weeks 14-15 — August 9 to August 22

**Pre-launch lockdown.**

- Code freeze except critical bug fixes.
- Premier League fixtures synced (released Fri 19 June 2026).
- EFL Championship fixtures synced (released Thu 25 June 2026).
- Pool generation cron tested for Round 1 + Round 2 of both competitions.
- Championship Round 1 (~early-mid August) used as a private internal QA round before public-facing test.
- Final manual QA: every flow, every edge case.
- Marketing site polish, FAQ ready, support inbox ready.

---

## Round 1 — Earliest target Sat 22 Aug → ~Sat 19 Sep 2026 (CLOSED TEST · 4 weeks)

**Closed test with invited users across PL Round 1 (GWs 1-4).** Slides if build isn't ready.

- Invite-only access, ~50–100 users. Late-entry window stays open 7 days from first kickoff (Sat 29 Aug).
- PL Round 1 = ~40 matches across 4 GWs. Championship Round 1 also runs in parallel (GWs 1-5 of Championship season — different round windows).
- Live monitoring throughout the 4 weeks: settlement engine, per-match prediction lock enforcement, payment-mock flow, audit log volume, late-entry warning flow.
- Mid-Round and end-of-Round retros to capture issues for fixing before Round 2.
- ~Fri 18 Sep: final round-end checklist before public launch.

---

## Week of Sep 20-26 — Settlement and remediation

- Round 1 settles automatically when last GW4 match goes full-time (~Sun 20 Sep).
- Fix anything surfaced during the 4-week test.
- Public registration opens publicly.
- Marketing campaign goes live.
- Round 2 pool generation cron tested.

---

## Round 2 — Earliest target ~Sat 26 Sep 2026 (PUBLIC LAUNCH)

**Mock-money product live to the public — PL Round 2 = GWs 5-8.** Launch only when the build is ready and the operator is ready; this is an earliest-possible target, not a deadline.

- Public open. Anyone can sign up and enter pools.
- PL Round 2 + corresponding Championship round both active.
- Marketing site fully active.
- Press / community announcements.
- Resist feature additions during the first month unless they fix something broken.
- 380 PL matches + 552 Championship matches over the season is the real stress test for the settlement engine.
- User support: hello@predictor10.com goes to a real inbox.

---

## Post-launch — first 30 days

**Retrospective, expansion, licence application.**

- Retro: what broke, what scaled poorly, what users actually used.
- Settlement worker watched closely through the first full PL + Championship matchweek cycle.
- UKGC licence application submitted. Application asks for tech architecture, AML policy, RG policy, terms — all documents already drafted in Weeks 5-8. Six to sixteen weeks turnaround typical.
- Real-money plumbing prep, in priority order:
  1. PSP integration (Stripe default; Worldpay / Trustly worth comparing for gambling rails).
  2. KYC provider integration — Onfido / Veriff / GBG / Jumio.
  3. GAMSTOP API onboarding — has lead time, start the conversation early.

---

## Q4 2026

- Licence application progresses. Respond to UKGC queries.
- AML monitoring engine: thresholds, suspicious activity reporting workflow. Code reads from `payments`, writes to `aml_reviews`.
- HMRC Gambling Tax Service registration ready.
- Real-money plumbing complete in staging with `mode = "live"` flag.

---

## 2027 — licence grant

- Licence granted (hopefully Q1).
- Per-user `real_money_enabled = true` as KYC clears.
- Statutory levy contributions begin.
- HMRC General Betting Duty filings begin.
- ADR provider (IBAS) onboarded.
- Footer licence-holder block populated.

---

## What's NOT in V1 (and why)

- **Bracket pools, survivor pools, top-scorer side markets.** Skill-and-feature creep. One product type means less to test, less to break, less to explain. ~~**World Cup pools** dropped from MVP scope.~~ Added back as step 3a (tournament-style competition, single £30 tier, retires post-Final). Future tournaments (Euros 2028, etc.) will reuse the same pattern.
- **EFL League One.** Not covered by `football-data.org` free tier; deferred until a second provider integration is justified.
- **Bonuses, referrals, social features, friend-leagues.** Earnable with growth later.
- **Mobile app.** Web app is mobile-responsive; native app is V3+.
- **Real-time updates via websockets.** Polling on user action plus 30-second auto-refresh on visible pages is sufficient.
- **Multi-currency, internationalisation.** UK-only, GBP-only, English-only.
- **Real KYC, real payments, real AML monitoring, live GAMSTOP enforcement.** All deferred to post-licence by design — but the UI, schema, and scaffolding ship in V1 (Weeks 5-8) so the licence flip is code-only.

---

## Risk callouts

- **15 weeks solo is comfortable but not infinite.** Slippage risk is highest in Weeks 5-8 (compliance build) where scope is broad. If those weeks slip:
  1. First to drop: AML monitoring rule engine (logging only, no auto-flagging — manual review at first).
  2. Second to drop: KYC document upload UI (can use email/manual submission until provider integration).
  3. Third to drop: GAMSTOP scaffolding (UKGC won't ask for live integration before licence — registration application is what matters).
  Core RG features (deposit limits + self-exclusion) are non-negotiable and ship in Weeks 5-6.
- **Settlement worker is the riskiest technical piece.** Idempotency, edge cases (postponed fixtures, voided fixtures, late corrections from `football-data.org`). Test heavily Weeks 9-11. Have a manual override endpoint from Week 4.
- **Pre-season fixture data is sparse.** football-data.org may not have PL/Championship pre-season friendlies. Beta in Weeks 12-13 may need staging-only fixtures rather than real ones.
- **Email deliverability** — Resend's free tier shared IP is fine for hundreds of emails; thousands need an upgrade. Plan upgrade for Week 11.
- **Render tier** — already on Starter ($7/month) as of May 2026. Always-on web service; cold starts only on deploy / crash recovery, not on idle. Watch Postgres connection pool growth and bandwidth as user count grows; revisit instance size (Standard upgrade) if memory or CPU saturate, or if horizontal scaling becomes necessary (would require relocating the in-process scheduler — see step 2o).

---

## What to do before week 1 starts

Three things, none of them coding:

1. **Provision Render Postgres.** Smallest paid tier. Get `DATABASE_URL` into Render env.
2. **Sign up for Resend.** Free tier. Get API key into Render env.
3. **Note launch targets (not deadlines).** Earliest-possible: Round 1 = Sat 22 Aug → ~Sat 19 Sep 2026 (PL GWs 1-4, closed test). Round 2 = ~Sat 26 Sep 2026 (public launch, mock-money). Both slide if not ready. 15+ weeks of build window available from May 2026.
