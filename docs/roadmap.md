# Predictor10 — roadmap

Written: May 2026.
Owner: solo developer.
Target launch: **No hard date.** Earliest-possible: Round 1 of PL 2026/27 (Sat 22 Aug → ~Sat 19 Sep 2026) as closed test, then public launch at start of Round 2 (~Sat 26 Sep 2026). Both slide if not ready. Build window: 15+ weeks available from May 2026; pace dictated by readiness, not deadline.

---

## Guiding principles

1. **Build the real flow, mock the money.** Every screen, endpoint and ledger entry behaves as if real money is moving. Behind the scenes, payments are recorded with `mode = "mock"` and never hit a PSP. When the UKGC licence lands, the same code paths flip to `mode = "live"`.
2. **Compliance-ready schema from day one — no structural migrations at licence flip.** All tables a licensed operator needs (KYC, AML, withdrawals, customer interactions, GAMSTOP, payment provider events) are in the schema from the first migration. They sit dormant during V1; the licensed work populates them rather than creating them.
3. **Simplest viable architecture.** Single repo. Render hosting. Postgres + Drizzle. No Redis, no queue infrastructure — Render Cron Jobs handle settlement. The existing `football-data.org` feed stays untouched.
4. **One product, one scoring rule.** Match-by-match score prediction. 5 points for exact score, 2 for correct result, 0 otherwise. Five league tiers from £1 to £50.

---

## Schema readiness — what's in the database from day one

The schema lives in `server/db/schema/` split across seven files. Every table the product needs across its full lifecycle is present from the first migration. Tables fall into three groups:

**Active in V1** — written to during normal test-mode operation:
- `users`, `sessions`, `email_verifications`, `password_resets` — auth
- `leagues` — the five tier definitions (Kickoff One through Elite Fifty)
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

**Leagues, pools, payments, predictions.**

- Seed the `leagues` table with the five tiers.
- Sync Premier League and EFL Championship competitions, stages, events from the existing `football-data.org` integration.
- Compute `predictionLockAt` for each event = kickoff minus 30 minutes.
- Create one pool per (league × stage) for each active competition.
- Endpoints:
  - `GET /api/leagues` — list active leagues.
  - `GET /api/pools` — list pools (joined and joinable for current user).
  - `GET /api/pools/:id` — pool detail with events and the user's picks.
  - `POST /api/pools/:id/enter` — creates a debit `payments` row (mock mode, auto-succeeded), creates a `pool_entry`. Refuses if user is self-excluded, account is suspended, or `closesAt` has passed.
  - `GET /api/pools/:id/predictions` — user's picks.
  - `POST /api/pools/:id/predictions` — bulk upsert. Server-side per-event lock check rejects late picks with 403.
  - `GET /api/pools/:id/leaderboard` — current standings.
- Lock enforcement is server-side. The UI's locked state is cosmetic; backend always re-checks.

**Definition of done:** A logged-in user can enter a Premier League round at the £5 tier (mock), set scorelines, see them persist. Late picks return 403.

---

## Week 3 — May 24 to 31

**UI rebuild — the post-login experience.**

- Rebuild `client/src/pages/Dashboard.tsx`. Replace leaderboard-as-landing with a proper home: welcome block, active pools, recent activity, leaderboard preview below.
- Split into components in `client/src/components/predictor10/`: `DashboardHome`, `ActivePoolCard`, `MakePicksScreen`, `LeagueEntryModal`, `PoolLeaderboard`. shadcn primitives, no inline `style={}`.
- Pool entry flow: tile → modal "Enter Round 12 — Tenner for £10?" → confirm → API call → "You're in" state with link to make picks.
- Predictions UI: per-event card with score inputs. Saved/Locked/Open states reflect server truth.
- Pool leaderboard view: real data, your row highlighted, top N visible.
- Code-split routes with `React.lazy()` so logged-out homepage doesn't ship the dashboard bundle.
- Account page: display name, email (with verified badge), sign out. Stub the rest.

**Definition of done:** Full loop works in UI — sign up, browse leagues, enter one, make picks, see leaderboard. No mock data on authenticated screens.

---

## Week 4 — May 31 to June 7

**Settlement, responsible-play scaffolding, polish.**

- Settlement worker, deployed as a Render Cron Job hitting `POST /api/admin/settle` every 10 minutes:
  - Find finished events without `event_outcomes` rows.
  - Pull final scores from `football-data.org`.
  - Insert `event_outcomes`, mark event `finished`.
  - Score every prediction: 5 exact, 2 result, 0 wrong. Write `points_awarded`, `is_exact`, `is_correct_result`.
  - When all events in a pool are finished, compute `final_rank` per entry, generate credit-direction `payments` (mock) for winners per `prize_structure`, mark pool `settled`.
  - Idempotent — re-running must not double-pay.
- Responsible play scaffolding:
  - `/account/limits` — set daily/weekly/monthly spend limits. Decrease immediate, increase pending 24h.
  - `/account/self-exclude` — pick duration, confirm, lock account.
  - "Take a break" link in footer.
- Email templates: verification, welcome, pool-entered, pool-settled, password-reset.
- Sentry for client and server.

**Definition of done:** When a fixture finishes, predictions get scored within 10 minutes. Winners see mock payouts. Self-exclusion form closes the account.

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

- **Bracket pools, survivor pools, top-scorer side markets.** Skill-and-feature creep. One product type means less to test, less to break, less to explain.
- **World Cup pools.** Dropped from MVP scope.
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
- **Render tier limits** — check Postgres connection pool, web service cold starts. Bump to a paid tier by Week 8.

---

## What to do before week 1 starts

Three things, none of them coding:

1. **Provision Render Postgres.** Smallest paid tier. Get `DATABASE_URL` into Render env.
2. **Sign up for Resend.** Free tier. Get API key into Render env.
3. **Note launch targets (not deadlines).** Earliest-possible: Round 1 = Sat 22 Aug → ~Sat 19 Sep 2026 (PL GWs 1-4, closed test). Round 2 = ~Sat 26 Sep 2026 (public launch, mock-money). Both slide if not ready. 15+ weeks of build window available from May 2026.
