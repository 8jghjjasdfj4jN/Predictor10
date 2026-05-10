# Predictor10 — Pre-Launch

Working doc tracking everything that must be decided, built, or verified before:
- **Round 1** (closed test): earliest target Sat 22 Aug → ~Sat 19 Sep 2026
- **Round 2** (public launch, mock-money): earliest target ~Sat 26 Sep 2026

Both targets slide if not ready. No hard deadlines.

> Companion docs: `roadmap.md` (build phases), `portal-architecture.md` (design canon).
> When new work surfaces that blocks launch, add it here. When work is done, mark it ✅ and link the commit.

---

## How to use this doc

- **§1 — Decisions** — captures every choice not yet made. Each one has an owner (always solo dev for now), a deadline gate (when it must be decided), and a default if not decided in time.
- **§2-§5 — Readiness checklists** — discrete items that must be ✅ before specific milestones. Don't add nice-to-haves; only add things that genuinely block.
- **§6 — Operational readiness** — non-code work (support inbox, monitoring, comms).
- **§7 — Explicit non-goals** — things that are NOT required pre-launch. Keeps scope creep visible.
- **§8 — Sign-off** — final go/no-go criteria.

---

## §1 — Decisions still to make

### 1.1 Pre-launch (gating public Round 2)

These must be decided before public registration opens. If undecided by mid-July 2026, fall back to the noted default and revisit post-launch.

| # | Decision | Default if not decided | Source |
|---|---|---|---|
| 1.1.a | Prize split (1st / 2nd / 3rd %) | TBD | arch §13 #9 |
| 1.1.b | Operator commission % | TBD | arch §13 #9 |
| 1.1.c | Default tab on settled-state Pool screen (GW1 / last-viewed / highest-scoring) | GW1 chronological | arch §14 #2 |
| 1.1.d | Archive header stats (3 cells) — current: Rounds / Cashes / Best rank | Keep current | arch §14 #3 |
| 1.1.e | Settled-pool "Cashed" copy — keep generic or show £ amount | Keep "Cashed" generic until commission % settled | arch §14 #4 |
| 1.1.f | Settlement → archive grace period (immediate / 24h / 48h) | Immediate | arch §14 #5 |

### 1.2 Post-launch / Week 5+ build

| # | Decision | Owner | Source |
|---|---|---|---|
| 1.2.a | Push/email notification triggers, copy, frequency | Solo dev | arch §14 #6 |
| 1.2.b | Multi-competition Home behaviour when user has live entries in PL + Champ | Solo dev | arch §14 #7 |
| 1.2.c | Live scores polling cadence (currently 60s server / 30s client) | Solo dev, after R1 ops | arch §14 #8 |

### 1.3 Q4 2026 / post-licence

| # | Decision | Owner | Source |
|---|---|---|---|
| 1.3.a | GAMSTOP integration cadence | Compliance counsel | arch §14 #9 |
| 1.3.b | AML rule thresholds | Compliance counsel | arch §14 #10 |
| 1.3.c | KYC provider selection (Onfido / Veriff / GBG / Jumio) | Solo dev after sandboxes | arch §14 #11 |
| 1.3.d | Real-money rollout strategy at licence flip (big-bang / cohort) | Solo dev + counsel | arch §14 #12 |

---

## §2 — Core build readiness (Weeks 1-4)

These ship the playable product end-to-end. Without these, no closed test.

- [ ] **Week 1 — DB and auth** — Render Postgres provisioned · Drizzle migrations applied · sign-up / login / logout / verify-email working with real email · audit log middleware wired
- [ ] **Week 2 — Tiers, pools, predictions** — 5 tiers seeded · PL + Championship competitions and stages synced · 9 Rounds per competition generated · pool generation cron tested · `/api/pools/:id/enter` endpoint with mock-payment + late-entry 7-day check · `PUT /api/predictions/:id` with anti-cheat 403 enforcement · auto-save debounced 800ms
- [ ] **Week 3 — UI build** — Home (live entries + available tiers) · canonical Pool/Predict screen with GW tabs · League Table page · History archive page · late-entry warning modal
- [ ] **Week 4 — Settlement and basic RG** — settlement cron at 5min cadence · idempotent · tie-breaker enforced · pool moves to archive on settlement · deposit limits + self-exclusion UI · email templates (verification, welcome, pool-entered, pool-settled, late-entry-confirmation) · Sentry deployed

---

## §3 — UKGC compliance readiness (Weeks 5-8)

Without these, the licence application has nothing to show. Closed test (Round 1) can run with §3 partial; public launch (Round 2) needs §3 complete.

- [ ] Deposit limits — daily / weekly / monthly · decrease immediate · increase 24h cooling-off
- [ ] Self-exclusion — 6mo / 12mo / 5yr · account lock + redirect
- [ ] Reality checks — 30/60min interval · session-time + net-spend modal
- [ ] GAMSTOP scaffolding — stub client + nightly sync (returns empty during V1)
- [ ] AML monitoring rule engine — reads `payments`, writes `aml_reviews` flags
- [ ] Customer interactions admin tool — writes `customer_interactions`
- [ ] KYC document upload UI — stores to `kyc_documents`
- [ ] Audit log review tool — read-only admin dashboard
- [ ] Policy documents drafted: T&Cs · Privacy · Responsible Gambling · AML
- [ ] Schema-to-feature mapping documented for licence application

---

## §4 — Polish and integrations (Weeks 9-11)

- [ ] Email templates finalised
- [ ] Mobile responsiveness pass on every screen
- [ ] Accessibility audit — WCAG 2.1 AA basics (keyboard nav, focus rings, alt text, contrast)
- [ ] Edge case testing — postponed fixtures, voided fixtures, late corrections from `football-data.org`, settlement double-run safety
- [ ] Sentry tuned — quiet for 7 consecutive days under simulated load
- [ ] Performance — connection pool sizing, cache headers, bundle size analysis
- [ ] Stripe Checkout integration in staging (off-by-default flag)
- [ ] KYC provider sandbox setup

---

## §5 — Closed beta (Weeks 12-13)

- [ ] 10–20 invited beta users signed up and tested
- [ ] Full sign-up → enter pool → predict → settle loop completed without intervention by at least 5 users
- [ ] Beta feedback captured and triaged
- [ ] All P0/P1 beta bugs fixed

---

## §6 — Round 1 readiness (closed test)

To start the closed test:

- [ ] PL Round 1 stage row created in DB with all GW 1-4 events
- [ ] 5 PL tier pools generated for Round 1 (Pound / Fiver / Tenner / Pony / Big One)
- [ ] Championship Round 1 stage + pools generated
- [ ] Late-entry warning flow tested end-to-end
- [ ] Settlement worker idempotency verified by deliberate double-run
- [ ] Per-match prediction lock verified by attempting to predict a kicked-off match (must 403)
- [ ] Anti-cheat verified — server rejects predictions for matches with `kickoff_at < now()`
- [ ] Invitation list of ~50–100 testers prepared
- [ ] Invitation email template + signup-with-invite-code flow tested
- [ ] Mid-round retros scheduled (after GW1, GW2, GW3, GW4)

---

## §7 — Round 2 readiness (public launch)

To open public registration:

- [ ] Round 1 settled cleanly — every pool reached `settled` state, every entry has `final_rank` and `final_points`
- [ ] Round 1 issues triaged and fixed (or explicitly accepted as won't-fix)
- [ ] Public registration flow tested without invite code
- [ ] Marketing site copy reviewed and live
- [ ] Footer disclosures: "test mode · no real money · pre-licence" clearly visible (anti-misleading-advert compliance)
- [ ] FAQ page covers: how scoring works, what tiers cost, what "test mode" means, when payouts happen
- [ ] §1.1 decisions all answered or defaults locked in
- [ ] §3 compliance items all ✅
- [ ] Round 2 stage + pools generated and tested
- [ ] Round 2 launch communications prepared (email to closed-test users, social, etc.)

---

## §8 — Operational readiness (continuous)

Not coding work, but blocks launch.

- [ ] `hello@predictor10.com` → real inbox someone reads
- [ ] Status page / incident comms channel decided (could be just a Twitter/X account)
- [ ] On-call rotation — solo dev for now; flag if/when scaling
- [ ] Escalation policy — what happens if settlement breaks during a live round
- [ ] Backup verification — Render Postgres daily backups, restore tested once
- [ ] Domain + DNS configured and verified
- [ ] SSL certificate auto-renewing
- [ ] `predictor10.com` resolves cleanly to Render service

---

## §9 — Explicit non-goals (NOT required pre-launch)

To prevent scope creep, these are deferred and **must not** block launch:

- Real KYC integration (live document checks)
- Real Stripe charges (mock mode is fine)
- Real GAMSTOP enforcement (scaffolding only)
- Real AML auto-flagging (logging only)
- Push notifications (V1.1)
- Native mobile app (V3+)
- Multi-currency (UK only)
- Bonus codes / referrals / friend leagues
- League One competition (deferred — no provider coverage)
- World Cup pools (out of scope)
- Live websocket updates (polling sufficient)

---

## §10 — Sign-off

Single-tickbox launch criteria. Each must be true before launch.

### Round 1 (closed test) sign-off

- [ ] All §2 (Core build) items ✅
- [ ] §3 (Compliance) — at least deposit limits and self-exclusion ✅
- [ ] §4 (Polish) — Sentry deployed, basic mobile pass done
- [ ] §5 (Beta) — 5+ users completed full loop
- [ ] §6 (Round 1 readiness) — all items ✅
- [ ] Solo-dev confirms: "I'm ready to invite real users"

### Round 2 (public launch) sign-off

- [ ] Round 1 settled cleanly
- [ ] All §2-§4 items ✅
- [ ] §3 (Compliance) — fully ✅
- [ ] §7 (Round 2 readiness) — all items ✅
- [ ] §8 (Operational) — all items ✅
- [ ] §1.1 decisions resolved
- [ ] Solo-dev confirms: "I'm ready to take the public"
