# Predictor10 — Portal Architecture

Last updated: June 2026 (post step 3a.19) · Status: Step 3a complete; World Cup live end-to-end; group-stage engagement features shipped.

This doc describes the post-login user portal: navigation, pages, data, and the path from "user clicks a tier" to "predictions submitted." It assumes the schema in `server/db/schema/` and the public-facing pages in `client/src/components/predictor10/`.

---

## 1. First principles

> **Prime directive — licence-first (added 21 Jun 2026).** Predictor10 is heading for a UK Gambling Commission pool-betting licence. Every feature, every user flow, and every architectural decision must hold UK pool-betting / gambling-licence rules in the highest regard — fairness, clear and non-misleading information, responsible-gambling protections, consistent rule application, and a clean audit trail. When a choice trades off "nicer/faster/more engaging" against "licence-clean," licence-clean wins. There must be **no mechanism — env var, admin toggle, or otherwise — that can silently override a fairness rule on the live product** (see §22 entry deadlines, the dev-only late-entry lock in `server/lib/late-entry.ts`, and §23 the RG-safe juice rules). New work is checked against this before it ships. Wez will share the full licence application with Claude once purchased, so Claude can act as a domain expert through the application process.

1. **Build the real flow, mock the money.** Every screen, button, and database row that exists in the licensed product exists today, with `payments.mode = 'mock'` flipping to `'live'` on licence grant. No screens are added at flip; no screens are removed.
2. **One pool entry = one stake on one round.** Users do not "join a tier" once and stay forever. They enter a specific pool (Competition × Tier × Round) round-by-round.
3. **Mobile-first, max 480px column on desktop.** Already established by `Dashboard.tsx`. Hold the line.
4. **Live data is a state, not a destination.** No "Live" tab. Live scores surface contextually in three places (top bar, competition pages, home hero).
5. **Server is the source of truth for time.** `predictionLockAt` on every event is enforced server-side. Frontend countdowns are display-only.

---

## 2. Domain language

| What | Schema | UI label | Examples |
|---|---|---|---|
| Football competition | `competitions` | **Competition** | Premier League, Championship |
| Price/skill band | `leagues` | **Tier** | Tenner (£10), Pony (£25), Big One (£50). The Pound (£1) and The Fiver (£5) retired — see §3. |
| Stage of a competition | `stages` | **Round** | A 4-5 gameweek block (PL R1 = GW1-4) |
| A weekend of fixtures within a round | (no table — derived from `events.kickoffAt`) | **Gameweek** (PL) / **Matchday** (Champ) | GW1, GW2, MD3 |
| Specific buy-in instance | `pools` | **Pool** | "Premier League · Tenner · Round 12" |
| User's stake in a pool | `pool_entries` | **Entry** | "My Tenner R12 entry" |
| User's score guess for one match | `predictions` | **Prediction** | Liverpool 2-1 Arsenal |
| Match | `events` | **Match** or **Fixture** | Liverpool vs Arsenal |

**Refactor required:** today's frontend uses "League" for both Competition and Tier. Rename in UI copy. Schema unchanged. (Step 2m note: `LeaguesPage.tsx` originally became `PoolsPage.tsx` in step 2c then deleted entirely in step 2m when the Pools-as-browse flow was killed — Home + Tables cover it now.) The brand names ("The Tenner", "The Big One") are tier labels, not league names.

---

## 3. Competitions (MVP)

| Competition | football-data.org code | Status | Notes |
|---|---|---|---|
| Premier League | `PL` | ✅ Free tier | Year-round backbone. Already integrated. |
| EFL Championship | `ELC` | ✅ Free tier | Add alongside PL. |
| World Cup 2026 | `WC` | ✅ Free tier | Added step 3a. Runs 11 Jun → 19 Jul 2026. Tournament-style: one whole-tournament Round, single tier, bracket fills in progressively. Retires post-final via `RETIRED_TIER_SLUGS` (`world-cup-2026`). See Round structure below + Decided Rules #16-#18. |

Free-tier rate limit: 10 req/min. Existing 1-hour cache (`TTL` in `server/index.ts`) keeps usage well under budget. Live cache is 60s.

### Round structure — Premier League (38 GWs, 9 Rounds)

| Round | Gameweeks | # GWs | ~Match count |
|---|---|---|---|
| 1 | 1-4 | 4 | ~40 |
| 2 | 5-8 | 4 | ~40 |
| 3 | 9-12 | 4 | ~40 |
| 4 | 13-16 | 4 | ~40 |
| 5 | 17-20 | 4 | ~40 |
| 6 | 21-24 | 4 | ~40 |
| 7 | 25-28 | 4 | ~40 |
| 8 | 29-33 | 5 | ~50 |
| 9 | 34-38 | 5 | ~50 |

### Round structure — EFL Championship (46 MDs, 9 Rounds)

| Round | Matchdays | # MDs | ~Match count |
|---|---|---|---|
| 1-8 | varies | 5 each | ~60 each |
| 9 | last 6 MDs | 6 | ~72 |

### Round structure — World Cup 2026 (104 matches, 1 Round)

| Stage | Match count | Dates (UTC) | Notes |
|---|---|---|---|
| Group Stage (MD 1-3) | 72 | 11 Jun → 27 Jun | 12 groups of 4. All teams known up front. |
| Round of 32 | 16 | 27 Jun → 1 Jul | Top 2 per group + 8 best 3rd-placed. Placeholder teams until groups resolve. |
| Round of 16 | 8 | 4 Jul → 7 Jul | Placeholder until R32 resolves. |
| Quarter-finals | 4 | 9 Jul → 11 Jul | Placeholder until R16 resolves. |
| Semi-finals | 2 | 14 Jul → 15 Jul | Placeholder until QFs resolve. |
| 3rd Place Final | 1 | 18 Jul | Placeholder until SFs resolve. |
| Final | 1 | 19 Jul | Placeholder until SFs resolve. |

A user enters a Round once (one stake) and predicts every match across all GWs / MDs / Stages in that Round. For WC, "every match" = the 104-match bracket that fills in over the tournament.

### Tiers (entry prices)

From step 3b.3 onwards there are **3 tiers per competition per Round** for league-style competitions (PL, Champ):

| Tier | Entry |
|---|---|
| The Tenner | £10 |
| The Pony | £25 |
| The Big One | £50 |

**Tournament competitions (WC 2026) carry a single dedicated tier** (`world-cup-2026`, £30) — one Enter button, no tier choice. Reasoning: a tournament-length pool is itself the commitment, and splitting 100 expected entrants across 3 tier-pools dilutes pots to the point where most settle near zero. One pool keeps the WC pot meaningful. The WC tier is retired via `RETIRED_TIER_SLUGS` after the Final settles (~22 July 2026).

**The Pound (£1) was retired in step 2m.** Reasoning: Stripe + merchant processing fees against the player-pool payout (now 75% of gross after step 2n's 25% commission) leave negative margin. Wez's existing Round 9 Pound entry plays out and settles normally on Sun 24 May 2026 under the original (pre-step 2n) 70/20/10 split with no commission; from Round 10 onwards no Pound pools are created. The `leagues.slug='pound'` row stays in the DB for historical reference, marked `is_active=false`.

**The Fiver (£5) was retired in step 3b.3.** Same fee-margin reasoning as The Pound — small stakes don't clear Stripe/merchant fees against the 75% player pool. League-style competitions (PL, Champ) now run **three tiers — Tenner (£10), Pony (£25), Big One (£50)**. The `leagues.slug='fiver'` row stays in the DB marked `is_active=false` (applied when PL Round 1 is seeded; no live Fiver pool exists today).

**Upcoming competitions on Home (step 3b.3).** New-season competitions whose fixtures are announced but whose entry isn't open yet show on Home as **Upcoming, display-only cards** — no CTA, not tappable — grouped under an *Upcoming* heading at the **bottom** of Home, below the game-modes band. Premier League and Championship both appear there (PL first, Championship below), each listing the three tiers (£10 / £25 / £50 per round). They are static teasers (`UpcomingCompetitionCard` in `HomePage.tsx`), each suppressed automatically once a real active competition with open Round 1 pools is in the data (then it renders through the normal `LeagueCard`).

Tier visibility: all three PL/Champ tiers are visible to every user from day one. No progressive unlock. Tier choice is the user's.

**Prize structure (step 2n, locked).** Every active tier carries a flat **25% operator commission** on the gross pot. The remaining 75% (the player pot) pays out top 3 at **60% / 25% / 15%**. So on a gross £100 pot, £25 goes to the operator and £75 splits as £45 / £18.75 / £11.25. WC inherits the same 60/25/15 + 25% pattern. Settlement applies the commission first then distributes the player pot per the splits — see §13 Decided Rules #9 / #14 for the exact rounding and Decided Rule #14 for residual-penny handling.

---

## 4. The mock-money flow

```
User taps "Enter Tenner — £10" on Pool card
       │
       ▼
POST /api/pools/:id/enter
       │
       ▼
[Server creates payment row: { mode: 'mock', status: 'succeeded', amount: 1000 }]
       │
       ▼
[Server creates pool_entry row pointing at that payment]
       │
       ▼
Redirect to /predict/:entryId
       │
       ▼
User makes predictions for matches in that round, submits before lock
```

**Post-licence flip** (no code change to the flow above; only to `mode`):

```
"Enter Tenner — £10" → POST /api/pools/:id/enter
       → Server creates payment { mode: 'live', status: 'pending', amount: 1000 }
       → Server returns Stripe Checkout URL
       → User pays, Stripe webhook updates payment.status = 'succeeded'
       → Webhook handler creates pool_entry, fires entry-confirmation email
       → User redirected to /predict/:entryId
```

The frontend never knows the difference. Same buttons, same screens, same redirects. Only `payments.mode` changes.

### Late-entry rule

A Round's pool stays open for **7 days after the Round's first match kicks off**. After that, no new entries.

If a user attempts to enter during the late-entry window (between first kickoff and +7 days), they must confirm a warning modal before payment proceeds:

```
┌──────────────────────────────────────┐
│ Late entry — you'll be behind        │
│                                       │
│ Round 1 has been live for 3 days.    │
│ • 12 matches have already finished.  │
│ • You can't predict matches that     │
│   have already kicked off — you'll   │
│   score 0 on those.                  │
│ • Existing entrants are ahead of     │
│   you on points.                     │
│                                       │
│ Continue with late entry?            │
│                                       │
│ [ Cancel ]    [ I understand · £10 ] │
└──────────────────────────────────────┘
```

After +7 days, the pool is closed. UI shows "Round 1 closed — Round 2 opens [date]". No payment endpoint accepts new entries; server enforces.

---

## 5. Top bar (sticky, all post-login pages)

```
┌─────────────────────────────────────────────┐
│ [P10] Predictor10    🔴 3 LIVE      Hi Steve [SR] │
└─────────────────────────────────────────────┘
```

- **Logo (left)** — links to `/`
- **Live badge (centre, conditional)** — appears only when ≥1 match is `IN_PLAY` or `PAUSED` across active competitions. Shows count. Tap → bottom sheet listing all live matches grouped by competition; user's predictions highlighted.
- **Greeting + avatar (right)** — links to `/account`

---

## 6. Bottom nav (4 tabs)

| # | Tab | Route | Icon | Purpose |
|---|---|---|---|---|
| 1 | Home | `/` | house | State-aware Next Action; sole sweep entry point ("Play a Round" CTAs for tiers not yet entered) |
| 2 | Predict | `/predict` | checklist | Open entries, ordered by deadline. Tap an entry → `/predict/:entryId` stays on this tab. |
| 3 | Tables | `/tables` | trophy | League standings for every tier across active competitions. Competition pills + tier sub-tabs (see §8.6). |
| 4 | Account | `/account` | person | Profile, payments, RG, settings |

The third tab was originally "Pools" (browse + join flow). Step 2m repurposed it: the entry flow consolidated onto Home, and the slot now hosts league standings. The trophy icon stays.

---

## 7. Page hierarchy

```
/                                       Home (live entries + Play CTAs for tiers not entered)
/predict                                Open entries — tap → /predict/:entryId
/predict/:entryId                       Prediction screen (canonical, formerly /pools/:slug/:poolId)
/tables                                 Tables tab — competition pills + tier sub-tabs

/account                                Profile + summary
/account/payments                       Payment history (mock + live unified) — planned
/account/history                        Archive — settled pools, your final results
/account/responsible-gambling           Deposit limits, time-outs, self-exclusion, GAMSTOP — planned
/account/settings                       Email prefs, password, marketing consent — planned

/login, /register, /verify-email        Auth pages (no AppShell, no nav). Honour ?redirect=<internal-path>.
```

Step 2m retired these routes:
- `/pools` (was: competition picker) — now 302 to `/tables`
- `/pools/:competitionSlug` (was: pools landing for one competition) — now 302 to `/tables`
- `/pools/:competitionSlug/:poolId` (was: canonical predict screen) — now resolves to `/predict/:entryId` via `LegacyPoolRedirect` (falls back to `/tables` if no entry)

Step 2m retained:
- `/pools/:competitionSlug/:poolId/table` — standalone league table view; still mounted on `PoolTablePage`. Account History's `[Table →]` button links here for settled pools.

The `/predict/:entryId` screen is **entered-state only** post step 2m — by the time a user is on this URL they've already entered the pool. State varies by Round phase:
- **Round in progress, before all matches lock**: editable score boxes, auto-save on change, "Auto-saving" footer
- **Round in progress, matches kicked off**: locked rows show FT score + your prediction + points pill; future matches still editable
- **Round settled**: read-only mode; banner at top "Round complete · View league table"; pool moves to `/account/history` archive after a few days

The **pre-entry flow** (browsing a tier, late-entry modal, "Enter — £X" CTA, POST to `/api/pools/:id/enter`) lives on the **Tables tab** (§8.6). Tapping the "Enter · £NN →" button there walks through the same entry confirmation that used to live on the combined screen, then navigates to `/predict/:entryId` on success.

---

## 8. Page details

### 8.1 Home (`/`)

**Redesigned in step 3a.** Home is the entry-discovery surface: every competition currently available to enter. Live entries moved entirely to the Predict tab (§8.2) — Home no longer duplicates them.

```
┌─────────────────────────────────┐
│ COMPETITIONS                    │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ PREMIER LEAGUE              │ │
│ │ 2026/27 · Round 1           │ │
│ │ GWs 1-4 · Closes Sat 29 Aug │ │
│ │ 3 tiers from £10             │ │
│ │ [ Choose your tier → ]      │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ WORLD CUP 2026              │ │
│ │ 11 Jun → 19 Jul · 104 matches│ │
│ │ One bracket, one £30 entry  │ │
│ │ Late entry closes 18 Jun    │ │
│ │ [ Enter World Cup → ]       │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

Each card represents one open competition the user can enter. Cards display:

- **Competition name** (Barlow Condensed, uppercase, accent).
- **Period / scope** (current Round for league-style, tournament dates for WC).
- **Entry summary**: "3 tiers from £10" for PL/Champ, "One bracket, one £30 entry" for WC.
- **Late-entry deadline** when the window is open or closing soon.
- **CTA**: "Choose your tier →" routes to the tier picker (Tables tab with the competition pre-selected). "Enter World Cup →" routes to the single-tier confirm screen (§8.6.1).

Card behaviour by competition type:

- **League-style (PL / Champ)** — taps the card → tier picker. Same 3 tiers / pool-card layout as today's Tables tab, scoped to the chosen competition's current Round. Each tier card shows live entry count and per-rank prize breakdown computed from the current pot.
- **Tournament-style (WC)** — taps the card → single-screen confirm (§8.6.1) with the explainer copy (FT scores only, postponement rule, bracket fills progressively, late-entry deadline). One [ Enter — £30 ] button, mock-money entry, user is in the pool.

Hiding rules:
- A competition disappears from Home once the user has entered every active pool in it (e.g. user entered PL Tenner+Pony+Big One, no more PL tiers to choose → PL card hides). They access their live entries via the Predict tab.
- WC card disappears once entered (only one pool to be in) or once the late-entry window closes without entry.
- Competition with `is_active=false` (e.g. retired tournament) never shows.

Empty states:
- 0 competitions to enter + 0 live entries (Predict empty too) = "Nothing open right now. Round 1 of PL 2026/27 opens [date]."
- 0 competitions to enter + N live entries = "All current competitions entered. Head to Predict to make your picks." with a link.
- N competitions + N live entries = both surfaces have content; no special copy.

Home shows currently-open competitions only. Settled history lives at `/account/history` (§8.8).

### 8.2 Predict (`/predict`)

**Refreshed in step 3a.** Predict is the active-play surface — every open entry the user holds. Live entries moved here from Home (§8.1); Predict gains a clearer top-of-screen identity.

```
┌─────────────────────────────────┐
│ YOUR LIVE ENTRIES               │
├─────────────────────────────────┤
│ CLOSING SOON                    │
│ ┌─────────────────────────────┐ │
│ │ Championship · The Big One  │ │
│ │ Round 1 · 60 matches        │ │
│ │ ⏱ Late entry closes 2h 14m  │ │
│ │ 12/60 predictions saved     │ │
│ │ [   Open   ]                │ │
│ └─────────────────────────────┘ │
│                                 │
│ THIS ROUND                      │
│ ┌─────────────────────────────┐ │
│ │ PL · The Tenner             │ │
│ │ Round 1 · 40 matches        │ │
│ │ Round closes Sat 19 Sep     │ │
│ │ 24/40 predictions saved     │ │
│ │ [   Open   ]                │ │
│ └─────────────────────────────┘ │
│                                 │
│ TOURNAMENT                      │
│ ┌─────────────────────────────┐ │
│ │ World Cup 2026              │ │
│ │ Group Stage · MD2 in play   │ │
│ │ 38/72 predictions saved     │ │
│ │ Knockout bracket: locked    │ │
│ │ [   Open   ]                │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

Persistent screen header "YOUR LIVE ENTRIES" (Barlow Condensed, uppercase). Below it, entries are grouped by status; sections only render when they have entries:

- **CLOSING SOON** — late-entry window closes < 48h. Sorted by close time, soonest first.
- **THIS ROUND** — currently-playing league-style Rounds (PL / Champ).
- **TOURNAMENT** — currently-playing tournament-style competitions (WC). Card line 2 surfaces the current stage / state ("Group Stage · MD2 in play", "Knockouts · QFs", "Knockouts · Final").

Each card includes a single [Open] CTA routing to `/predict/:entryId` — the canonical prediction screen (§8.5). Step 2m introduced this URL so the Predict bottom-nav tab stays highlighted while the user is making picks.

Empty state: "No live entries. Head to Home to pick a competition →" linking to `/`.

### 8.3 Pools landing (`/pools`) — REMOVED in step 2m

The standalone competition-picker landing page was killed in step 2m. The browse-tier flow now lives on Home (sweep view of Available Tiers across all active competitions) and the Tables tab (one tier at a time with the contextual entry CTA — §8.6). The legacy URL 302-redirects to `/tables` for any old bookmarks; the `PoolsPage.tsx` file is deleted.

### 8.4 Pools by competition (`/pools/:competitionSlug`) — REMOVED in step 2m

The per-competition tier-listing page was killed in step 2m alongside §8.3. Same rationale: Home and Tables together cover everything this page did. The legacy URL 302-redirects to `/tables`; the `PoolsCompetitionPage.tsx` file is deleted.

### 8.5 Prediction screen (`/predict/:entryId`) — CANONICAL

This is the canonical prediction screen (the single most important screen in the product). Step 2m made it entered-state only — by the time a user is here, they have an entry. Top-tab GW navigation (Variant B refined). See Decided Rule #12 for the locked-in design choices.

```
┌─────────────────────────────────┐
│ ← Home                          │
│ PL · The Tenner · Round 1       │
│ 36 pts total · Rank 8 of 50     │
├─────────────────────────────────┤
│ [GW1 ✓ 24pts][GW2 5/10][GW3][GW4]│
├─────────────────────────────────┤
│ Sat 29 Aug                      │
│ Man City  [3]-[1]  Wolves       │
│   12:30 · FT  · You: 2-1  +2pts │
│ Liverpool [2]-[0]  Brighton     │
│   15:00 · FT  · You: 2-0  +5pts │
│ ... (more matches in GW2)       │
│ Sun 30 Aug                      │
│ Newcastle [1]-[0]  C. Palace    │
│   14:00 · KO 22h · Saved        │
│ Bournemouth [_]-[_]  Forest     │
│   14:00 · Tap to predict        │
│ ... (more matches)              │
├─────────────────────────────────┤
│ ✓ Auto-saving · Last saved 2s   │
└─────────────────────────────────┘
```

**State transitions** (post step 2m, entered-state only — pre-entry lives on Tables now):

| State | Top section | Match rows | Bottom |
|---|---|---|---|
| Entered, round not started | "0/40 saved" | Editable boxes | Auto-save indicator |
| Entered, round in progress | "X pts total · Rank Y of Z" | Mix of finished + live + locked + editable | Auto-save indicator |
| Round settled | "Final: X pts · Y of Z · view table" banner | Read-only: FT scores, your predictions, points pills | "View league table" link |

**Match row variants:**
- **Finished**: muted background, FT score in solid boxes, your prediction pill + points pill (`+5 pts` emerald, `+2 pts` amber, `0 pts` red)
- **Saved & locked** (kickoff in <1hr): "Saved" emerald tag, no input, prediction read-only
- **Half-saved**: amber "Half-saved" tag, one box filled
- **Editable**: empty boxes, "Tap to predict" hint
- **Live (in-play)**: live-score badge, current score, your prediction shown, "Predictions locked" tag
- **Awaiting teams** (tournament-only — step 3a.9): both teams render "TBD", inputs disabled, meta tag "Awaiting teams". Used for unresolved knockout slots; resolves automatically when football-data populates real teams.

**GW tabs:**
- Past GWs: total pts earned, checkmark icon, slightly muted (`GW1 24 pts ✓`)
- Active GW (default open): emerald highlight, save progress (`GW2 5/10`)
- Future GWs: neutral, save progress (`GW3 0/10`)
- **Tournament labelling (step 3a.11, Decided Rule #20)**: tournament-style comps replace `"GW"` with `"Group MD"` for numbered group-stage matchdays. The null-matchday bucket is always present (the home of every knockout) and labelled `"Knockout Stages"`, positioned LAST in the tab strip.

**Match-row meta line — tournament additions:**
- **Group letter (step 3a.11, Decided Rule #21)**: group-stage matches show "Group A · 20:00 · ..." (or B, C, ... L). Knockouts and league matches omit this segment.

**Knockout Stages tab sub-headings (step 3a.11+, Decided Rule #22)**: instead of day-grouping, matches are grouped by stage with headers "Round of 32" / "Round of 16" / "Quarter-finals" / "Semi-finals" / "Third-place playoff" / "Final" (sorted in tournament order regardless of FD's kickoff ordering).

**Prediction-lock note (step 3a.16)**: live (non-settled) entries show a single muted line under the saved-count row — "Each match locks 1 hour before kick-off. Edit your picks any time until then." It surfaces Decided Rule #7's per-match lock in plain language so players (especially late entrants, who have permanently missed points on already-kicked-off matches) understand why some rows are locked while others stay editable. Settled entries don't show it. Client copy only in `PoolDetailPage.tsx` — no logic change, does not touch `vite.config.ts` / `client/index.html` (step 2v crossorigin refresh fix unaffected).

**Lock-rejection input revert (step 3a.17)**: if a match locks between page-load and an edit (the row arrived with `isLocked=false`, the user changes a score after the per-match lock has passed), the server rejects the write with 403 and the row reverts its inputs to the last saved prediction rather than leaving the typed value on screen. The server is the authoritative lock (Decided Rule #7); the client just handles the rejection cleanly — the rejected value is never persisted and no longer lingers as a phantom until refresh. Fix is in `PredictMatchRow.tsx`'s auto-save catch path.

**Day groupers** within a numbered GW (`Sat 29 Aug`, `Sun 30 Aug`, `Mon 31 Aug`) — chronological dividers since GWs span multiple days. Tournament Knockout Stages tab uses stage groupers instead (see above).

**Auto-save** debounces to 800ms after the last input change; PUTs to `/api/predictions/:id`. Server validates against `predictionLockAt`; rejects with 403 if past lock. Footer shows "Auto-saving · Last saved 2s ago".

#### Settled state (Round complete)

Same screen, but every match is read-only. Tabs all show checkmarks and per-GW totals; default tab on load = GW1 (chronological start). Banner at top links to the league table. Auto-save footer is replaced with a "Settled · Read-only" lock indicator.

```
┌─────────────────────────────────┐
│ ← History                       │
│ PL · The Tenner · Round 1       │
│ Final · Settled 20 Sep · 87 pts │
│ Rank 4/18                       │
├─────────────────────────────────┤
│ Round complete · view table  →  │  banner
├─────────────────────────────────┤
│ [GW1 ✓ 29pt][GW2 ✓ 12pt]        │  all green / done
│ [GW3 ✓ 26pt][GW4 ✓ 20pt]        │
├─────────────────────────────────┤
│ Sat 22 Aug                      │
│ Man City  [2]-[0]  Wolves       │
│   12:30 · FT  · You: 2-0  +5pts │
│ ... (all matches read-only)     │
├─────────────────────────────────┤
│ 🔒 Settled · Read-only          │
└─────────────────────────────────┘
```

Routing: settled pools' prediction screens remain accessible at `/predict/:entryId` but are reached primarily via `/account/history` (Section 8.8) since they no longer surface on Home or Tables.

### 8.6 Tables tab (`/tables`)

Replaces the old Pools-browse flow and the standalone per-pool league table page. One destination for "how am I doing across every tier and competition." Standings are entrant-only (per the `/api/pools/:id/entries` access rule from step 2k); non-entrants see the header with the contextual `Enter · £NN →` button and the prize breakdown line but no standings table.

Layout (top to bottom):

```
┌─────────────────────────────────┐
│ Tables                          │
├─────────────────────────────────┤
│ [Premier League] [Championship] │ ← competition pills
├─────────────────────────────────┤
│ ●Tenner  Pony  Big One          │ ← tier sub-tabs; dot = you're entered
├─────────────────────────────────┤
│ ROUND 9                         │
│ The Tenner            ┌───────┐ │
│ £10 · 32 players      │ You   │ │
│ 1st £144 · 2nd £60    │ 4th · │ │
│      · 3rd £36        │ 19pts │ │
│                       └───────┘ │
├─────────────────────────────────┤
│ # │ Player   │ Ex │ R │ Pts    │
│ 1 │ Dave M.  │  4 │ 3 │ 26     │
│ 2 │ Lou H.   │  3 │ 4 │ 23     │
│ 3 │ Ben S.   │  3 │ 3 │ 21     │
│ 4 │ You      │  2 │ 3 │ 19     │ ← emerald row
│ 5 │ Sam T.   │  1 │ 5 │ 15     │
│ ...                             │
│ ↓ 22 more ↓                     │
└─────────────────────────────────┘
```

Not-entered state (same tier sub-tab tapped, viewer is not in this tier):

```
┌─────────────────────────────────┐
│ ROUND 9                         │
│ The Pony              ┌───────┐ │
│ £25 · 18 players      │Enter ·│ │ ← solid emerald button
│ 1st £202.50           │£25 →  │ │
│ · 2nd £84.37          └───────┘ │
│ · 3rd £50.63                    │
├─────────────────────────────────┤
│ (standings hidden — entrant-    │
│ only per arch §8.6 access rule) │
└─────────────────────────────────┘
```

Rules:
- **Competition pills**: one per active competition. Selected pill is solid emerald (#34d399 fill, dark text). Others are faded ghost style. Pills are tappable to switch.
- **Tier sub-tabs**: one per tier in the current Round for the selected competition. From step 2m onwards that's three tiers (Tenner / Pony / Big One). Selected sub-tab has an emerald underline. A small emerald dot prefixes the label when the viewer is entered in that tier for the current Round; absent otherwise.
- **Header**: Round label (small eyebrow) + tier name (h2) + meta line (`£NN · N players`) + per-rank prize breakdown line (`1st £X · 2nd £Y · 3rd £Z`, step 2n — amounts net of 25% commission). Header right-side widget:
  - Entered: small two-line block — uppercase eyebrow "YOU" + emerald "Nth · X pts".
  - Not entered: solid emerald button "Enter · £NN →". Tap walks through the entry flow (window check → late-entry modal if needed → POST `/api/pools/:id/enter` → navigate to `/predict/:entryId`).
- **Standings table**: same component used in step 2k's PoolTablePage. Five columns (# / Player / Exact / Result / Pts). Gold rank numbers for 1-3 (amber-300). Emerald-tinted row for the viewer when entered. `↓ N more ↓` footer when truncated; tap expands inline (or the page scrolls, depending on what fits — implementation choice). Tie-break footer copy mirrors Decided Rule #10 verbatim per step 2k.
- **Default landing tier** when arriving at `/tables`: leftmost sub-tab where the viewer is entered. If entered in none, fall back to the first tier (Tenner). Persists across navigations within the same session.
- **Default landing competition** when arriving at `/tables`: leftmost pill where the viewer has at least one entry. If none, Premier League.
- **Empty state** (competition has no pools for the current Round, e.g. Championship between seasons): single-line "No active pools yet — opens August" message in place of the table.
- **Refresh policy**: page-load fetch + window-focus refetch. No polling.

Endpoint: existing `GET /api/pools/:id/entries` (built in step 2k). Tables fetches per (competition, tier) pair. The portal API needs no schema changes for this surface — only routing on the client.

### 8.6.1 Tournament entry confirm (`/enter/:competitionSlug`) — step 3a

Single-screen entry flow for tournament-style competitions (WC). Linked from the WC card on Home (§8.1). Replaces the tier picker for competitions where there's only one pool.

```
┌─────────────────────────────────┐
│ ← Home                          │
│                                 │
│ WORLD CUP 2026                  │
│ 11 Jun → 19 Jul · 104 matches   │
│                                 │
│ One entry. £30. Whole tournament│
│ across group stage and          │
│ knockouts. Top 3 win money from │
│ the pot.                        │
│                                 │
│ HOW IT WORKS                    │
│ • Predict every match's full-   │
│   time score (90 min only — no  │
│   extra time, no penalties).    │
│ • 5 pts for exact score, 2 pts  │
│   for correct result.           │
│ • Knockout fixtures fill in as  │
│   the tournament progresses —   │
│   you'll predict each round as  │
│   the teams resolve.            │
│ • Predictions lock 1 hour       │
│   before each kickoff.          │
│ • Postponed matches score 0     │
│   unless rescheduled — then     │
│   they reopen for prediction.   │
│ • Late entry closes Thu 18 Jun  │
│   (7 days after first kickoff). │
│                                 │
│ PRIZE BREAKDOWN                 │
│ £30 entry · 47 players so far   │
│ Gross pot £1,410 · House £352.50│
│ 1st £634.50 · 2nd £264.37       │
│ 3rd £158.63                     │
│                                 │
│ [    Enter — £30    ]           │
└─────────────────────────────────┘
```

Behaviour:
- Static explainer above the dynamic prize breakdown. Copy locked in step 3a; live amounts computed live from current pool entry count.
- Single CTA. Tap → late-entry window check → POST `/api/pools/:id/enter` (mock-money) → navigate to `/predict/:entryId`.
- Once user has entered, this route 302-redirects to `/predict/:entryId` for that user's WC entry. Home's WC card is hidden for the user (no further action available there).
- Late-entry window closed (>7 days after first kickoff): CTA disabled, copy switches to "Late entry closed — see the live table in Tables tab", link out.

### 8.7 Account (`/account`)

```
┌─────────────────────────────────┐
│ STEVE RODGERS                   │
│ steve@example.com               │
│ Member since May 2026           │
├─────────────────────────────────┤
│ → History (settled rounds)      │
│ → Payment history               │
│ → Responsible gambling          │
│ → Settings                      │
│ → Sign out                      │
└─────────────────────────────────┘
```

### 8.8 History — settled rounds archive (`/account/history`)

When a Round settles, its pools disappear from Home and Tables (active surfaces). They land here. Per-user archive: every pool the user ever entered, with their final stats and a link back to the read-only prediction screen and league table for that pool.

```
┌─────────────────────────────────┐
│ ← Account                       │
│ History                         │
│ All settled rounds              │
├─────────────────────────────────┤
│ [12]      [7]       [2nd]       │  stat summary
│ Rounds    Cashes    Best rank   │
├─────────────────────────────────┤
│ ROUND 2 · Oct 2026              │
│ ┌─────────────────────────────┐ │
│ │ PL · The Tenner    🏆 1st   │ │  ← amber tint
│ │ 95 pts · 1 of 22 · Cashed   │ │
│ │ [Results →]  [Table →]      │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ Champ · The Tenner · No prize│
│ │ 64 pts · 5 of 30            │ │
│ │ [Results →]  [Table →]      │ │
│ └─────────────────────────────┘ │
│ ROUND 1 · Sep 2026              │
│ ┌─────────────────────────────┐ │
│ │ PL · The Tenner             │ │
│ │ 87 pts · 4 of 18 · No prize │ │
│ │ [Results →]  [Table →]      │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

- **Header stat summary** — three cells: total settled rounds played, total cashes (any podium finish), best-ever rank. Stat copy/labels are still under review (see Section 14).
- **Grouped by Round, newest first.** Round headers show round number + month/year.
- **Per-pool card** — pool name (competition · tier), final stats (pts, rank, prize/no-prize), two CTAs: `Results →` (read-only prediction screen at `/predict/:entryId` with FT scores + your predictions + points) and `Table →` (standalone league table at `/pools/:slug/:poolId/table`).
- **Cashed pools** (1st/2nd/3rd) get an amber-tinted card + trophy badge with rank label. "No prize" pools stay neutral.
- **Empty state**: "No settled rounds yet. Your first results will appear here when Round 1 settles."
- **Settlement → archive timing**: a pool moves to the archive immediately on settlement. The prediction screen URL stays valid but discoverability is via the archive (decided rule #11).

### 8.9 Responsible gambling (`/account/responsible-gambling`)

Required page from day one (LCCP foundation). UI fully built; backend writes to `licensed.ts` tables that exist dormant. On licence flip, the same UI starts enforcing real limits.

- Deposit limits (daily / weekly / monthly)
- Time-outs (24h / 7d / 30d)
- Self-exclusion (6mo / 12mo / 5yr)
- GAMSTOP link
- Reality checks (every 30/60 min during session)

---

## 9. Live scores integration

### 9.1 Where live shows

| Surface | Trigger | Content |
|---|---|---|
| Top-bar badge | Any match in-play across active competitions | Count + bottom-sheet of all live matches |
| Tables tab | In-play match for the selected competition + tier | Strip above the standings table |
| Home hero (State C) | User has predictions on currently-live matches | Match-by-match: prediction vs live score, points-on-pace |
| Predict detail (after lock) | After `predictionLockAt`, if matches live | Read-only "Watch" view |

### 9.2 Endpoints

```
GET /api/live                   → all live matches across active competitions
GET /api/live/:competitionCode  → live matches for one competition
```

Both server-cached at 60s (existing `LIVE_TTL`). Polling: clients re-fetch every 30s while view is mounted; visibility-API pause when tab is hidden.

### 9.3 Match status mapping

football-data.org → internal:
- `SCHEDULED` / `TIMED` → `scheduled`
- `IN_PLAY` / `PAUSED` → `live`
- `FINISHED` → `finished`
- `POSTPONED` / `CANCELLED` → `postponed` / `cancelled`
- `SUSPENDED` → `void`

---

## 10. Seed data plan

Run via `pnpm seed`, idempotent across re-runs:

```
sports        : ['football']
competitions  : ['premier-league', 'championship', 'world-cup-2026']
                  + extId mapping to football-data.org codes (PL / ELC / WC)
                  + externalSeasonId for season-bound API queries
                  + postponedPolicy per competition:
                      premier-league   : 'wait'    (arch §13 Rule #13)
                      championship     : 'wait'    (arch §13 Rule #13)
                      world-cup-2026   : 'forfeit' (arch §13 Rule #16)
leagues       : league tiers Tenner/Pony/Big One active; Pound + Fiver retired (is_active=false)
                  Active (league-style — PL/Champ pools use these 3):
                  - The Tenner £10  splits=[0.60, 0.25, 0.15]  houseFeePct=0.25
                  - The Pony   £25  splits=[0.60, 0.25, 0.15]  houseFeePct=0.25
                  - The Big One £50 splits=[0.60, 0.25, 0.15]  houseFeePct=0.25
                  Active (tournament — WC 2026 pool uses this single tier):
                  - World Cup 2026  £30  splits=[0.60, 0.25, 0.15]  houseFeePct=0.25
                                         (slug='world-cup-2026', retires after Final settles)
                  Retired (is_active=false, kept for historical entries):
                  - The Pound  £1   splits=[0.70, 0.20, 0.10]  (no houseFeePct)
```

`stages` and `events` populated by the fixture-sync inside `pnpm seed` itself (calls football-data.org once per competition; well under the 10 req/min free-tier ceiling). For WC, the sync also picks up placeholder fixtures for unresolved knockout slots ("Group A Winner vs Best Third Placed") and updates them as the tournament progresses — see §13 Rule #17.

`pools` created by the same seed run for the **current Round only** (the lowest-ordinal Round still having at least 5 future kickoffs). For PL/Champ: 4 active tier pools × 1 stage × 1 competition per run. For WC: 1 pool (the single dedicated tier × the tournament-Round) created when the tournament becomes the current Round. The seed also re-syncs `prize_structure` JSON on any existing open pools to match the current tier value (step 2n) — settled pools are deliberately left alone (Decided Rule #14: payouts immutable once banked).

---

## 11. API surface (Express endpoints)

This section is a living map of endpoints. Status markers: **✓** = shipped, **~** = deferred (gated on Resend / live-sync wiring / post-licence work), no marker = planned but not yet built.

### Auth
```
✓  POST   /api/auth/signup
✓  POST   /api/auth/login
✓  POST   /api/auth/logout
✓  GET    /api/auth/me
~  POST   /api/auth/verify-email               (Resend deferred to pre-launch)
~  POST   /api/auth/resend-verification        (Resend deferred to pre-launch)
~  POST   /api/auth/request-password-reset     (Resend deferred to pre-launch)
~  POST   /api/auth/reset-password             (Resend deferred to pre-launch)
```

### Catalogue (read)
```
✓  GET    /api/competitions   → competitions with an open Round, each with
                                 their current stage and embedded pool list
                                 (4 active tiers per competition × Round —
                                 retired tiers filtered out via
                                 leagues.is_active). Public.
✓  GET    /api/pools/:id      → full pool detail (round meta, tier meta,
                                 entry count, late-entry window state,
                                 matchesLocked/Total, bypassActive flag;
                                 plus `myEntry` when the caller is authed).
                                 Public — myEntry is null when unauthed.
   GET    /api/pools/:id/entries → entries list (display names only).
                                    Built when the league-table page lands.
```

Earlier draft endpoints `/api/competitions/:slug`, `/api/tiers`, `/api/pools` (top-level listing), and `/api/pools/competition/:slug` have been collapsed into `/api/competitions` — pools and tiers are always queried in competition context, so a single richer endpoint replaces four. Bring them back as separate resources only if a future surface needs them.

### Pool entry
```
✓  POST   /api/pools/:id/enter → mock-payment + create entry. Atomic
                                  (payment → entry → backfill payment.referenceId).
                                  Idempotent — returns existing entryId on duplicate.
                                  Late-entry window enforced server-side with
                                  BYPASS_LATE_ENTRY=true dev override (per-match
                                  anti-cheat lock stays on regardless).
```

### Predictions
```
✓  GET    /api/entries/me                                → user's open entries
                                                            (filters settledAt IS NULL).
✓  GET    /api/entries/:id                               → entry detail: every match in
                                                            the Round + the user's
                                                            predictions + outcomes when
                                                            present + per-prediction
                                                            scoring + per-GW aggregates.
                                                            Owner-only — returns 404 for
                                                            anyone else (no info leak).
✓  PUT    /api/entries/:entryId/predictions/:eventId     → upsert one prediction.
                                                            Validates ownership, event
                                                            belongs to entry's stage,
                                                            and predictionLockAt > now
                                                            (Decided Rule #7).
```

`PUT /api/entries/:entryId/predictions/:eventId` replaces the earlier-drafted `PUT /api/predictions/:id`. Predictions have no stable id before first save; `(pool_entry_id, event_id)` is the schema's natural unique key (uniqueIndex `predictions_entry_event_idx`).

No `POST /api/entries/:id/submit`. Per Decided Rule #12 predictions auto-save on every input change; there is no finalise step.

### Admin (machine-to-machine; token-gated)

Every request must carry `X-Admin-Token: <ADMIN_SECRET>` (env var). When `ADMIN_SECRET` is unset, every endpoint returns 401 — closed by default.

```
✓  POST   /api/admin/sync-outcomes  → pull FT scores from football-data.org,
                                       upsert event_outcomes (first-write-wins),
                                       mark events finished, score any unscored
                                       predictions (5/2/0 per Decided Rule #10).
                                       Idempotent. Also runnable from the CLI
                                       via `pnpm sync-outcomes`.
✓  POST   /api/admin/settle-pools   → for pools where every event is either
                                       finished+outcome OR cancelled/void
                                       (Decided Rule #13): compute final ranks
                                       (Decided Rule #10 tie-break), write mock
                                       payouts (Decided Rule #14 rounding),
                                       mark pool + entries + predictions settled.
                                       Zero-entry pools settle silently
                                       (Decided Rule #15). Idempotent. Also
                                       runnable from CLI via `pnpm settle-pools`.
```

### Live (deferred — gated on live-sync wiring)
```
~  GET    /api/live                      → all live matches
~  GET    /api/live/:competitionCode     → live matches per competition
```

### Account
```
   GET    /api/account/payments                       → payment history (mock + live unified) — planned
✓  GET    /api/account/history                        → settled entries (the archive)
   PUT    /api/account/profile                                                                — planned
   PUT    /api/account/responsible-gambling/limits                                            — planned
   POST   /api/account/responsible-gambling/timeout                                           — planned
```

---

## 12. Build order

1. **Domain language refactor** — UI copy + rename `LeaguesPage.tsx` → `PoolsPage.tsx`
2. **Seed data + admin script** — `pnpm tsx scripts/seed.ts`
3. **State-aware Home hero** — switch on `HomeState`, 5 hero variants
4. **Pools landing page** — competition picker + pool list (mock data first, real after #5)
5. **Pool detail page + mock-payment endpoint** (`POST /api/pools/:id/enter`)
6. **Predict tab + Predict detail page** — auto-save predictions
7. **Live scores top-bar badge** — sticky, polling, bottom-sheet
8. **Pool/competition embedded live strip**
9. **Home State C live hero** (predictions vs live score)
10. **Account pages** — profile, payment history, RG basics

Each step ships independently and is testable in isolation.

---

## 13. Decided rules

These resolve previously-open questions. They flow into build:

1. **Settlement timing.** A pool settles automatically when **all** its matches have full-time scores from football-data.org. Implementation: settlement cron polls every 5 minutes, finds pools where every match status is `FINISHED` and `event_outcomes` rows exist, computes ranks, writes mock payouts, marks pool `settled`. Idempotent — re-running must not double-pay.
2. **Multi-entry rule.** A user may hold concurrent entries across multiple Tiers and multiple Competitions. **Cap: one entry per Pool per user.** Since Pool = Competition × Tier × Round, this means a user can simultaneously hold (PL · Tenner · R1) + (PL · Pony · R1) + (Champ · Tenner · R1) — three pools, three entries — but never two entries in the same pool. **DB-enforced since step 3a.16** via the `pool_entries_pool_user_idx` unique index on `(pool_id, user_id)`; `enterPool` catches the resulting Postgres `23505` and resolves a lost concurrent race to "already entered" (transaction rolls back, no orphan payment). The app-layer pre-flight check remains as a fast path.
3. **Tier visibility.** All 3 tiers (Tenner, Pony, Big One) are visible to every user from day one. No progressive unlock. £10 is the natural starter tier; choice is the user's. The Pound (£1) and The Fiver (£5) were retired (steps 2m and 3b.3).
4. **Competitions in MVP.** Premier League, EFL Championship, and World Cup 2026. **WC added in step 3a** as a tournament-style competition (single Round = whole tournament, single dedicated `world-cup-2026` £30 tier, retired post-Final). League One deferred (no provider coverage on free tier). Future tournaments (Euros 2028, etc.) will follow the same single-tier + retire-after pattern.
5. **Launch plan.** No hard launch date — public launch happens when the build is ready and the operator is ready. Earliest-possible target: Round 1 of PL 2026/27 (Sat 22 Aug → ~Sat 19 Sep 2026) as a closed test for invited users; public launch (mock-money) at the start of Round 2 (~Sat 26 Sep 2026). Both dates slide if not ready. See `roadmap.md` for the build phases that gate readiness.
6. **Round structure.** A Round is a multi-gameweek tournament block. PL: 9 Rounds (4-4-4-4-4-4-4-5-5 GWs). Champ: 9 Rounds (5-5-5-5-5-5-5-5-6 MDs). See Section 3 for the full schedule. **Entry fee covers the whole Round** — one stake, all matches in the Round.
7. **Per-match prediction lock.** Each match's predictions lock 1 hour before its individual kickoff. A user can edit predictions for un-kicked-off matches at any time. Predictions for already-played matches are never accepted — server enforces by rejecting with HTTP 403. Prevents cheating via late entry seeing results.
8. **Late-entry window.** Pool entry stays open for **exactly 7 days after the Round's first match kicks off**. Late entrants must confirm a warning modal explaining the handicap (forfeited matches = 0 pts) before payment. After +7 days, pool is closed; server rejects new entries.
9. **Prize structure (locked in step 2n).** Top 3 per pool win money. Splits applied to the **player pot** (= gross pot × 0.75 after the 25% operator commission): 60% / 25% / 15%. Identical across all four active tiers. Splits + houseFeePct stored in `pools.prizeStructure` jsonb (snapshotted at pool creation) so tier-level changes can be tuned later without retroactive effects on settled pools. **Test mode behaviour:** all transactions recorded as `payments.mode = 'mock'` — no real money charged, no real money paid. Prize calculations and "winners" still compute and display in UI for end-to-end testing of the settlement engine. At licence flip, the same code path becomes real: charges via Stripe, payouts via configured rail, commission posted to operator account. **Retired tiers (Pound):** keep their original `prizeStructure` snapshot (70/20/10, no houseFeePct) so existing open pools settle under the rules they were opened under.
10. **Tie-breaker.** Order of comparison when entries are tied on points: (1) **Total exact-score predictions** (5pt entries) — more wins. (2) **Total correct-result predictions** (2pt entries) — more wins. (3) Still tied → split prize evenly between tied entries.
11. **Settled rounds → archive.** Once a Round settles, its pools no longer appear in the active Tables tab or Home tab. They move to `/account/history` — a per-user archive of every pool the user entered, with their final rank, points, and any payout. The prediction screen (`/predict/:entryId`) stays accessible in read-only mode so users can deep-link to old results, but discoverability is via the archive, not the active surfaces. The settled-pool league table URL (`/pools/:slug/:poolId/table`) is also preserved as the `[Table →]` target from Account History.
12. **Predict screen design — locked.** Entered-state-only screen at `/predict/:entryId` (step 2m URL — keeps the Predict bottom-nav tab highlighted; was `/pools/:competitionSlug/:poolId` pre-step-2m, which mixed pre-entry and post-entry states). Top tabs for each Gameweek in the Round (e.g. `GW1 24 pts ✓ | GW2 5/10 | GW3 0/10 | GW4 0/10`). Default tab on load = the current Gameweek (the first GW that hasn't fully completed). All matches in the selected GW shown in full — no "+N more" truncation. Day groupers within a GW for chronology (Sat/Sun/Mon). Match rows render four states: **finished** (FT score + your prediction + points pill), **saved & locked** (kickoff <1hr away, no edits), **half-saved** (one score entered), **editable** (empty boxes, "tap to predict"). Auto-save on every input change (debounced ~800ms) with a footer indicator confirming persistence. No manual "Save" button. The pre-entry flow (window check → late-entry modal → POST `/enter`) lives on the Tables tab now (§8.6). **Refined step 3a.18:** the day groupers and knockout stage headers *inside* a tab were removed in favour of a single ordered feed — **live (top, pulsing LIVE badge) → still-predictable (soonest deadline first) → locked-about-to-start ("Locked · awaiting kick-off") → finished (most recent first) → awaiting-teams**. Each row now carries its own full date and, for knockouts, its round inline (no headers). A finished live game drops into the historical block automatically. The GW/round tabs and default-tab logic are unchanged. Competition-agnostic (one code path for PL/cups/WC). See §18. **Refined again step 3a.19:** the feed order was corrected and given live/timing treatments — see §20 (the step 3a.18 order wrongly ranked about-to-start below still-predictable; now: live → about-to-start → recently-finished → still-predictable → older-played → awaiting).
13. **Settlement gate for non-played fixtures.** A pool settles when every event in its Round is either `finished` with an `event_outcomes` row, OR in a terminal non-played state (`cancelled` / `void`). `Postponed` events still block settlement — they may yet be rescheduled inside the Round window. Predictions on cancelled or void events keep `points_awarded = null` and render as "Missed — 0 pts" (no match means no score to compare against). Without this rule, a single postponement could deadlock a pool indefinitely. **Scoring-completeness guard (step 3a.16):** the gate additionally requires that no prediction on a `finished` event still has `points_awarded IS NULL`. Outcome-write and prediction-scoring are separate, non-transactional steps in `outcome-sync`, and the scheduler runs sync (5 min) and settle (15 min) as independent crons that can overlap — so without this guard a settle pass racing a mid-flight sync (or a crash between the two writes) could count a real, correct prediction as 0, worst case on the Final. Cancelled/void and forfeit-postponed predictions deliberately stay null, but their events aren't `finished`, so they don't trip the guard; the next sync scores any pending finished-event predictions and the pool settles on the following pass.
14. **Payout rounding.** Operator commission is computed first (`houseFeePence = floor(grossPotPence × houseFeePct)`, so players are never overpaid from sub-penny remainders). The remaining `playerPotPence` is split across paying ranks: `playerPot × split ÷ tied_count`, rounded to 2 decimal places at storage. After all line items are computed, any 1-2p rounding residual goes to rank 1 — line items must sum exactly to `playerPotPence × sum(splits)` so the books balance. The same `computeDisplayBreakdown` helper feeds both settlement and the API display amounts, so the breakdown shown on Tables / Home matches what actually gets paid to the penny. Cosmetic precision for `mode='mock'`; real-money operation post-licence switches to integer-pence arithmetic throughout.
15. **Zero-entry pools settle silently.** A pool reaching its settlement gate with `entry_count = 0` still gets marked `settled` — pot is 0, no `payments` rows are written, audit log records the settlement with `entryCount: 0`. Handles the rare race between the stale-pool cleanup script and outcome sync, and gives the settlement engine a single uniform exit path.
16. **Postponed-event policy is per-competition (step 3a).** `competitions.postponedPolicy` is one of `'wait'` (default — current PL/Champ behaviour, Rule #13) or `'forfeit'` (WC). Under `'forfeit'`: a postponed match counts as 0 pts for every prediction until/unless football-data emits a future kickoff for the same fixture. If a future kickoff appears, the match returns to normal predict flow (per-match 1hr lock applies) and any final FT result re-scores the prediction. If no future kickoff is ever issued, the 0 stands and the match counts as "accounted for" by the settlement gate (Rule #17). Reasoning: a 104-match tournament-Round cannot afford a single postponement to deadlock the pool for weeks; forfeit-then-reopen-if-rescheduled is the cleanest user-facing model.
17. **Tournament-style competition behaviour (step 3a).** Competitions flagged tournament-style (currently: WC) deviate from league-style behaviour in three ways. (a) **Single Round = whole tournament.** One pool per dedicated tier, all matches in one stake. (b) **Bracket fills progressively.** Knockout fixtures exist as scheduled slots from day one; football-data sends `homeTeam: null` and `awayTeam: null` for unresolved slots (not placeholder strings — confirmed in step 3a.3 deploy crash + 3a.4 fix). As prior rounds resolve, FD updates the team fields to real names; outcome-sync's update path overwrites the nulls (step 3a.4 explicit bracket-fill handling). Schema columns `events.home_team` and `events.away_team` are nullable to support this. UI renders null-team fixtures as "TBD" (via `displayTeamName(null)`) with "Awaiting teams" copy and disabled prediction inputs. Predict UI gates the predict window on **both teams being non-null AND the per-match 1hr lock not yet passed**. Players see the road ahead but can't predict blind. (c) **Settlement gate uses Rule #16's policy.** A WC pool settles when every match is either FINISHED-with-outcomes OR POSTPONED-without-future-kickoff. No grace window — the cron's existing 15-min cadence handles tail-end propagation from football-data within ~20 minutes of the Final's full-time whistle.
18. **Home / Predict separation (step 3a).** Home is entry discovery only — one card per competition currently open for entry, no live-entry duplication. Tapping a league-style card routes to the tier picker; tapping a tournament-style card routes to a single-Enter confirm screen (§8.6.1). Predict is the active-play surface — every open entry the user holds, grouped by status (Closing Soon / This Round / Tournament), each card linking to `/predict/:entryId`. Pre-step-3a, both surfaces showed entries; the duplication is removed. The Tables tab continues to list per-pool league standings independently and is unchanged by this rule.
19. **Home competition cards stay visible after entry (step 3a.11, supersedes part of Rule #18).** The originally-locked "hide-on-entry" model from Rule #18 was reversed after Wez observed it left a sparse Home for fully-entered users. Cards now persist with a brighter emerald border, bg tint, inset ring, and a "✓ You're in {tier names}" line. Primary CTA becomes smart-routing: 1 entry → `/predict/:entryId` direct; 2+ entries → `/predict` tab. A secondary ghost button is always shown on entered cards — label adapts: "Pick another tier" when at least one tier is still enterable, "View all tiers" otherwise. Rule #18's entry-discovery framing still applies; the visual just doesn't disappear once entered.
20. **Tournament tab labelling (step 3a.11).** For competitions with `postponedPolicy='forfeit'` (i.e. tournament-style), Predict-screen tab labels use **"Group MD"** for numbered group-stage matchdays and **"Knockout Stages"** for the null-matchday bucket. League-style comps keep their original labels (`"GW"` for PL, `"MD"` for ELC). The null-matchday bucket always sorts LAST in the tab strip, regardless of comp type.
21. **Group letter per match (step 3a.11).** `events.group_label` column (`varchar(16)`, nullable) stores the football-data group letter ("A" through "L" for WC 2026) for tournament group-stage matches. Knockouts and league matches stay null. The Predict screen renders "Group A · TIME · ..." in the match-row meta line when set. Source: football-data's `match.group` field, stripped of the "GROUP_" prefix.
22. **Tournament stage per match + status pill (step 3a.11+).** `events.fd_stage` column (`varchar(32)`, nullable) stores football-data's `match.stage` string verbatim (`"GROUP_STAGE"` / `"LAST_32"` / `"LAST_16"` / `"QUARTER_FINALS"` / `"SEMI_FINALS"` / `"THIRD_PLACE_PLAYOFF"` / `"FINAL"`). League matches store `"REGULAR_SEASON"`; the field is otherwise nullable. Two consumers: (a) the Predict screen's Knockout Stages tab groups matches under sub-headings ("Round of 32", "Round of 16", "Quarter-finals", "Semi-finals", "Third-place playoff", "Final") via `knockoutStageOrder()` + `knockoutStageDisplay()` helpers in `fixture-sync.ts`; (b) the standings status pill on `/pools/:slug/:poolId/table` reads a server-computed `liveStatusLabel` for tournament comps that resolves to "Group MD2 of 3" during group stage, "Round of 32" / "Round of 16" / etc. during knockouts, "Awaiting settlement" when all events are terminal. League comps keep the matchday-driven label (`"GW2 of 4"`).

---

## 14. Open questions and deferred decisions

### Deferred until pre-launch (gating public launch)

1. **Default tab on settled-state Prediction screen.** Currently defaults to GW1 (chronological start). Alternatives: last-viewed (sticky), highest-scoring GW (lead with user's best), or most recent GW (last week's matches still in memory).
2. **Archive header stats.** Currently shows `Rounds played · Cashes · Best rank`. Alternatives: best round (pts), highest tier won, longest cashing streak. Three-cell space available, copy and metrics under review.
3. **"Cashed" copy** on archive cards. Now that step 2n locked prize amounts (60/25/15 of player pot, 25% commission), this could switch to a specific value — e.g. `1st · £22.49` — instead of the generic "Cashed" pill. Decision pending visual design pass.
4. **Settlement → archive timing.** Currently moves immediately on settlement. Consider a 24-48hr "fresh results" grace period where settled pools stay on Home with a "Round X complete" hero, then move to archive. Improves engagement on settlement day.
5. **Tie-break visualisation in standings.** Two players with equal points are ranked by exact-score count → correct-result count, but the table doesn't currently surface *why* one is higher. Add a subtle column highlight or `↑` marker for the deciding column in `PoolStandingsTable.tsx`. Spec'd but deferred.
6. **Tables tab deep links.** Add `/tables/:competitionSlug/:tierSlug` (or `?comp=&tier=` query) so Home's Available Tier rows can land on the right tier in one tap. Currently they all land on plain `/tables` and require manual sub-tab selection.

### Deferred to post-launch / Week 5+ build

7. **Push and email notifications.** Round-opens, late-entry-window-closing, predictions-due-soon (per-match lock approaching), results-in. Out of scope for portal architecture; spec needed in Week 5+ build.
8. ~~**Multi-competition Home behaviour.**~~ **Resolved in step 3a.** Home no longer shows live entries — it's pure entry-discovery (one card per open competition). The "PL Round 1 AND Champ Round 1 simultaneously" problem dissolves: those become two cards on Home → two cards on Predict once entered. The deferred design tension is gone.
9. **Live scores polling cadence.** Currently 60s server cache, 30s client refresh on visible pages. May tighten during in-play windows. Decision after first round operations.

### Deferred to Q4 2026 (post-licence)

10. **GAMSTOP integration cadence.** Current scaffolding runs nightly sync; UKGC may require more frequent checks during sessions. Confirm with compliance counsel.
11. **AML rule thresholds.** Velocity, single-transaction size, deposit-to-stake ratios — specific numbers tuned during licence application review.
12. **KYC provider selection.** Onfido / Veriff / GBG / Jumio. Decision after sandbox evaluations in Weeks 9-11.
13. **Per-user `real_money_enabled` rollout strategy.** Big-bang on licence day, or gradual cohort-by-cohort. Probably gradual for risk control.

### Decisions logged in step 3a.16 (June 2026 audit)

- **Score-correction reconciliation (P3) — deliberately NOT automated.** `event_outcomes` is first-write-wins; a football-data score correction after the first write is never re-applied, so a corrected result won't re-score predictions or re-rank the table. This was reviewed and left as-is by choice: silently auto-overwriting a recorded score is the dangerous path — a transient bad FD value could flip a settled result and rewrite the whole leaderboard. An admin-only "stored score diverges from FD" alert was considered and deferred. If reconciliation is ever built, it must be a **manual-review** tool (surface the divergence, admin decides), never a silent auto-overwrite. Open.
- **Manual late-entry override has no governed in-app path.** During the WC opener, two late entrants were allowed past the per-match 1hr lock (Rule #7) by inserting their predictions directly via Render Shell SQL, tagged `ip_address='admin-shell-late-entry'` for the audit trail, orientation computed from the event row (not hardcoded) to prevent a reversed scoreline. Acceptable operator discretion for the informal friends' run. Before licence grant this should become a proper governed admin action (explicit reason field, audit row, ideally a bounded override window) rather than raw DB access — a regulator expects lock exceptions to be ruled and recorded, not improvised. Open.

---

## 15. World Cup 2026 retirement playbook

The World Cup 2026 pool is a one-off. Once it's done it should leave the active surfaces (Home, Predict, Tables) while staying browsable from `/account/history` for everyone who entered. This section documents the exact mechanics so a future build session (or a successor) can execute the retirement without breaking adjacent things.

> **Removal is operator-triggered, never automatic (added June 2026, Wez's call).** Settlement and retirement are two different things. *Settlement* is automatic (~20 min after the Final) and computes final ranks + payouts — that must happen. *Retirement* (taking WC off the active surfaces) must NOT happen until Wez explicitly runs the steps below. **This needs a behaviour change that is not yet built:** today `getCompetitionsWithOpenPools` filters `pools.status='open'`, so a settled pool drops off Home/Tables the instant it settles — the WC would auto-vanish at the Final whistle, exactly the way the final Premier League round vanished at season end (which Wez flagged as bad). The fix is to keep a settled pool visible on the active surfaces while its competition is still `isActive=true`, so the *only* thing that removes WC from view is the manual retirement step. **Nothing is ever deleted** either way: settlement and retirement both leave `pools` / `pool_entries` / `predictions` / `event_outcomes` fully intact — "removed" only ever means "hidden from the active tabs," and the data stays in `/account/history` and at the settled-table URL.

> **Gameplay features are competition-agnostic — they carry to the Premier League for free (added June 2026, Wez's call).** The features built during the WC run — the lock-gated "see another player's picks" view (tap a row on the league table), the pulsing LIVE / "Locked · awaiting kick-off" / finished status states, and the Predict-screen ordering that floats the next still-predictable games to the top (soonest deadline first) — all run through shared, competition-agnostic code paths (`OpponentPredictionsPage`, `PoolStandingsTable` link-through, `PredictMatchRow`, `PoolDetailPage` ordering). There are no tournament-specific branches. When the Premier League (and any cup) comes back online for 2026/27 these apply automatically with zero gameplay work. Restoring PL is a **marketing-only** job (rename the `.tsx.bak` files per the playbook below); the gameplay surfaces need nothing.

### When to retire

When the WC pool reaches `pools.status = 'settled'`. The settlement engine flips this automatically when every match is either FINISHED-with-outcomes or POSTPONED-without-future-kickoff (Decided Rule #16 + Rule #17). Expected window: within ~20 minutes of the Final's full-time whistle on Sun 19 Jul 2026. Allow a buffer day for any tournament-end anomalies (FD delays, manual outcome corrections) before retiring.

Recommended timing: any time from Mon 20 Jul 2026 onwards, once the pool is confirmed `settled` and payouts have been audited.

### What's already in place

The `RETIRED_TIER_SLUGS` mechanism is the same one that retired The Pound in step 2m. It lives in `server/scripts/seed.ts` and is the canonical retirement vehicle:

```ts
// server/scripts/seed.ts (around line 71)
const RETIRED_TIER_SLUGS = ["pound"] as const;
```

The seed run flips every listed slug's `leagues.is_active` to `false` on each pass. Two key queries respect this flag:
- `getCompetitionsWithOpenPools` (Home + Tables data source) filters pools via `.where(and(eq(pools.status, "open"), eq(leagues.isActive, true)))` — so retired-tier pools vanish from `/api/competitions` immediately.
- `/api/entries/me` does NOT filter by tier `isActive`; settled entries with `settledAt IS NOT NULL` are already excluded, and any leftover open entry in a now-retired tier still surfaces in Predict (ghost entry, harmless for WC since the pool is by definition settled when we retire it).

### Steps to retire — exact change list

After the WC pool flips to `settled`:

**1. Edit `server/scripts/seed.ts`:**

```ts
// Add 'world-cup-2026' to the retired tier list.
const RETIRED_TIER_SLUGS = ["pound", "world-cup-2026"] as const;
```

**2. In the same file, optionally set the WC competition to inactive** (stops the outcome-sync cron from making pointless football-data calls for a finished tournament — saves a few KB/day):

```ts
// In COMPETITIONS:
{
  externalId: "WC",
  name: "World Cup 2026",
  shortName: "World Cup",
  slug: "world-cup-2026",
  postponedPolicy: "forfeit",
  season: 2026,
  tiers: ["world-cup-2026"],
  isActive: false,  // ← change from true to false
},
```

**3. Verify locally** (optional, fast): `pnpm build` — sanity check no TS errors. No DB-touching commands locally; verification happens in Render.

**4. Push + deploy.** Render rebuilds. The web service comes up; nothing user-visible changes yet because no seed has run.

**5. Run `pnpm seed` in Render Shell.** This is the activation step. Expected log lines:

```
[seed] retired tier 'World Cup 2026' already deactivated  (if seed has run twice)
  — or —
[seed] retired tier 'World Cup 2026' deactivated  (first run)
```

Plus, if step 2 was done: `[seed] World Cup 2026 already exists (re-synced policy/isActive)`.

**6. Verify the user-facing result.** On `/`:
- WC card no longer appears in the "OPEN NOW / COMPETITIONS" list (the comp is filtered out because all its tiers are inactive).
- PL and any other active comps remain unaffected.

On `/account/history`:
- Settled WC entries still appear with their final rank + payout (the history query joins on `pool_entries.settledAt`, not tier `isActive`).
- `[Results →]` deep-links into the read-only `/predict/:entryId` still work.
- `[Table →]` deep-links into the settled-state `/pools/:slug/:poolId/table` still work.

On `/predict`:
- No WC entries shown (all settled).
- No TOURNAMENT section header (empty section auto-hides).

### What MUST stay untouched

Don't delete or update any of:

- `pools` rows for `world-cup-2026` — the standalone table page at `/pools/world-cup-2026/{poolId}/table` and `/account/history` deep-link both rely on them.
- `pool_entries` rows for `world-cup-2026` — same reason; final ranks + payouts live here.
- `payments` rows tied to those entries — financial audit trail.
- `events` + `event_outcomes` for the 104 WC matches — the read-only Predict screen pulls them for `/account/history`.
- `competitions.world-cup-2026` row itself — even after `isActive=false`, the row stays so joined queries from `pool_entries` → `competitions` continue to resolve.
- The `world-cup-2026` `leagues` row — same reason.

In short: retirement is **isActive=false flips only**, never a delete.

### Rollback if something goes wrong

To un-retire (e.g. if a settlement audit needs to be re-run), reverse the seed config change and run `pnpm seed` again. The retired-tier loop only deactivates; it doesn't re-activate. So you'd need to either:
- Remove `'world-cup-2026'` from `RETIRED_TIER_SLUGS` AND set `COMPETITIONS` entry back to `isActive: true`. The seed's tier-upsert path includes an `existing.isActive === false` re-activation branch (line ~200), so the tier will flip back to active on the next run.
- Or manually update the `leagues` row in Postgres: `UPDATE leagues SET is_active = true WHERE slug = 'world-cup-2026';`.

### Future tournaments (Euros 2028, WC 2030, etc.)

The same pattern applies. For each new tournament:

1. Add the competition to `COMPETITIONS` with `postponedPolicy: "forfeit"`, `isActive: true` (or `false` until close to kickoff).
2. Add a dedicated tier to `TIERS` with the tournament's slug (e.g. `"euros-2028"`).
3. Set `tiers: ["euros-2028"]` on the competition.
4. Confirm the football-data code (`externalId`) and season number.
5. `pnpm db:push` (no-op if no schema change) → `pnpm seed`.
6. After the Final settles: add the tier slug to `RETIRED_TIER_SLUGS`, flip the competition to `isActive: false`, deploy, re-seed.

The `RETIRED_TIER_SLUGS` array grows over time. That's fine — each slug only takes one `UPDATE` per seed run, and the list of retired tiers is itself useful audit metadata.


## 16. Users, names, nicknames, KYC

Added in step 3a.13 to clean up the legacy single-`display_name` model where users had been inconsistently entering full names (`"James Woodhouse"`) and handles (`"Jason"`) into the same field.

### Column model

The `users` table now carries three name-shaped columns alongside the original `display_name`:

| Column | Purpose | Public? | Required at signup? |
|---|---|---|---|
| `first_name` (varchar 40, nullable) | KYC field | NO — admin view + own profile only | YES (NOT NULL at app layer; nullable in DB only to let legacy rows survive `db:push`) |
| `last_name` (varchar 40, nullable) | KYC field | NO — admin view + own profile only | YES (same as above) |
| `nickname` (varchar 20, nullable) | Public handle | YES — league tables, history, leaderboards | YES (3–15 chars, `[A-Za-z0-9_]`, unique) |
| `display_name` (varchar 24, NOT NULL) | Legacy column; kept populated to nickname for backwards compat | Fallback if `nickname` is NULL | Auto-set from nickname during signup |

Uniqueness on nickname is a **partial unique index** on `lower(nickname) WHERE nickname IS NOT NULL`. Case-insensitive; NULLs (legacy rows pre-backfill, anonymised users) are excluded so multiple `NULL`s don't collide.

### Validation rules

- **Nickname pattern**: `^[A-Za-z0-9_]{3,15}$`. No spaces, no punctuation, no emoji — keeps league-table column rendering clean and predictable across mobile widths.
- **Reserved list** (case-insensitive): `admin`, `administrator`, `moderator`, `mod`, `predictor10`, `predictor`, `support`, `system`, `staff`, `official`, `help`, `you`. Defined in both `server/routes/auth.ts` (signup) and `server/routes/account.ts` (edit) — kept in sync manually. Refactor into a shared module if the list grows further.
- **First / last name**: 1–40 chars each, trimmed. No further restrictions in V1 — KYC verification (which would check against ID document) happens at licence grant.

### Standings display

`server/lib/portal-data.ts` standings query returns `COALESCE(users.nickname, users.display_name)` as the entry's public name. DTO field is still called `displayName` for backwards compatibility, but the value is the nickname when set. The audit log preserves the historical nickname-at-time-of-settlement; live standings reflect the current nickname.

### Edit flow

`PATCH /api/account/nickname` — session-gated, validates against the same rules as signup, returns 409 on collision. Writes `audit_log` row with action `user.profile_update`, before/after = `{nickname: old, new}`, metadata `{field: "nickname"}`. The audit log is the historical record for any post-settlement renames; LCCP 3-year retention applies (survives anonymisation).

90-day cooldown not yet enforced — current need is small and audit-logged. Tighten before public launch / licence grant.

First/last names are not user-editable in V1. The Settings sub-page (placeholder under AccountPage's NAV_ROWS) will host the edit flow once it ships. Until then, admin SQL or the seed script handles corrections.

### Backfill

`server/scripts/backfill-names.ts` is the one-shot script that populated the 11 pre-step-3a.13 users. Splits legacy `display_name` on whitespace into first/last; strips non-alphanumeric chars from `display_name` to seed the nickname (with `1`, `2`, … suffix on collision). Idempotent — only touches rows where `first_name IS NULL`. Safe to re-run.


## 17. Admin portal

Added in step 3a.15. First user-facing administrative surface. Distinct from `/api/admin/*` (machine-to-machine, X-Admin-Token gated, for cron jobs / maintenance) which still exists.

### Access model

Two new boolean columns on `users`:

- `is_admin BOOLEAN NOT NULL DEFAULT false` — gates the `/admin` route and the Admin bottom-nav tab.
- `is_paid BOOLEAN NOT NULL DEFAULT false` — admin-tracked confirmation of off-platform £10 receipt during the WC informal run. Cleared when WC retires (or repurposed for the next informal-payment competition).

Admin grants are managed via `seed.ts`, not from in-app. The `FOUNDING_ADMIN_EMAILS` constant in `server/scripts/seed.ts` is the canonical allowlist. `seedAdmins()` is idempotent and bidirectional — promotes any user whose email matches, demotes any user with `is_admin=true` whose email doesn't match. To add a future admin: edit the constant, deploy, run `pnpm seed`.

### Defence-in-depth

Three independent layers gate admin functionality. All three must agree the user is an admin for the surface to be visible / usable:

1. **Client — tab visibility**: `AppShell.BottomNav` uses `user?.isAdmin === true` (strict equality) to decide whether to render the 5th "Admin" tab. Non-admins see the original 4-tab nav with no indication an admin tab exists. Grid swaps from `grid-cols-4` to `grid-cols-5` dynamically.
2. **Server — request gating**: `requireAdmin` middleware on `/api/admin-portal/*` returns **HTTP 404**, not 403, to non-admins. The surface is masked entirely — non-admins can't even confirm the endpoints exist.
3. **Client — page guard**: `AdminPage.tsx` checks `user?.isAdmin !== true` at mount and refuses to call the API; renders "Not found." immediately. Direct navigation to `/admin` therefore yields the same result as any other unknown URL.

The decision to return 404 (not 403) on the server is deliberate. 403 signals "this exists but you can't have it"; 404 keeps the surface invisible.

### Endpoints (server-side, `server/routes/admin-portal.ts`)

| Endpoint | Body | Effect | Audit action |
|---|---|---|---|
| `GET /api/admin-portal/users` | — | List all users with id, email, names, nickname, signup date, country, status flags. Password hashes never returned. | — (read-only) |
| `POST /api/admin-portal/users/:id/password` | `{newPassword}` | Argon2-hashes and writes the new password. Password value is NEVER written to logs. | `user.password_change` with `{performedBy, performedByEmail, adminInitiated: true}` |
| `PATCH /api/admin-portal/users/:id/paid` | `{isPaid}` | Toggle the `is_paid` flag. No-op when state already matches (no audit row written in that case). | `admin.action` with `{field: "isPaid", performedBy, performedByEmail}` and before/after |

### UI (`client/src/pages/portal/AdminPage.tsx`)

Mobile-first user list. Each row is a card with:
- Public handle (nickname or display_name fallback) + Admin pill if applicable
- Full name + email + country + join date
- Right-side controls: "Paid" checkbox (optimistic update with rollback on server error) + "Reset password" button (opens modal)

Password reset modal is intentionally simple — admin types the new value, taps Save, sees "Saved" confirmation, modal auto-closes. The user is told the new password out of band (the platform doesn't email it).

No search / sort / pagination in V1 — 11 users fits comfortably on one mobile screen. Revisit if the user base grows past ~50.

### Audit-log impact

Every paid toggle and every password reset writes to `audit_log` with the acting admin's id and email in metadata. Provides demonstrable record-keeping for the UKGC licence application — proves admin actions are tracked and attributable.

### Test-user cleanup

Removing a test user completely from the platform (e.g. an admin spinning up a throwaway account to verify a flow) follows this transactional psql pattern from Render Shell:

```bash
psql "$DATABASE_URL" <<'EOF'
BEGIN;
DELETE FROM payments      WHERE user_id = (SELECT id FROM users WHERE email = '<test-email>');
DELETE FROM pool_entries  WHERE user_id = (SELECT id FROM users WHERE email = '<test-email>');
DELETE FROM audit_log     WHERE user_id = (SELECT id FROM users WHERE email = '<test-email>');
DELETE FROM users         WHERE email   = '<test-email>' RETURNING email, nickname;
COMMIT;
EOF
```

Order matters: `payments` first (no cascade from anywhere else hits it), then `pool_entries` (cascades `predictions` via the `pool_entry_id` FK), then `audit_log` (no compliance value for a test user). The final `DELETE FROM users` cascades `sessions`, `email_verifications`, `password_resets`, `session_minutes`, `user_limits`, `self_exclusions` via their `ON DELETE CASCADE` FKs.

For real (non-test) users who need to leave the platform, the licensed anonymisation flow (dormant — built into the schema, exposed at licence grant) is the correct path. This SQL block is only for clean test-account removal during development.

---

## 18. Player-predictions view + live status (step 3a.18)

Players can see each other's picks — but only after the anti-cheat lock makes it safe.

### Entry point

Every row on the league table (`PoolStandingsTable`) is tappable when given a `linkTo` prop. Wired on both the standalone table (`PoolTablePage`) and the Tables tab (`TablesPage`). Tapping a player opens `/pools/:competitionSlug/:poolId/table/:entryId` → `OpponentPredictionsPage`, a read-only view of that entrant's picks.

### Anti-cheat (the core invariant)

Visibility reuses arch §13 Rule #7 (the 1-hour prediction lock) as a *disclosure* rule. The server (`getEntryPredictionsForViewer` → `GET /api/pools/:poolId/entries/:entryId/predictions`) includes a pick's scores **only** when that match has locked (`predictionLockAt <= now`, i.e. `predictionVisible = isLocked || ownEntry`). Unlocked picks are omitted from the payload entirely — not sent and hidden, simply absent — so they can't be read off the wire.

This is safe because the lock is **symmetric**: a match locks at the same instant for everyone, so by the time you can see another player's pick, your own pick for that match is already locked too. There is no window in which seeing a rival's pick lets you change yours. The only requirement is the server-side per-match filter; nothing on the client enforces secrecy.

Access mirrors the league table itself: public once the pool is `settled`; `session + entrant` while live (401 if not signed in, 403 if not entered); 404 for an unknown pool or an entry that isn't in this pool. Display is nickname-only (never the KYC real name, per §16).

### What the view shows

Only locked-or-later matches appear (anything still open is filtered out — its picks are hidden anyway). Order: **live → about-to-start → finished**. Each row clearly labels the prediction as "Pick" so it can't be mistaken for a real score, and finished rows show the actual result as a prominent "FT" scoreline plus the pick and points pill. There is **no live in-play score** — the app only records a match's score at full time (the scheduler writes the outcome ~5 min after FT), so an actual score appears only once a game finishes.

### Live status (also on the Predict screen)

A pulsing red **"LIVE"** badge (radar-ping dot + faint red row tint) marks in-play matches on both the player-predictions view and the Predict screen (`PredictMatchRow`). A distinct calm amber **"Locked · awaiting kick-off"** status marks the hour between lock and kickoff. "Live" = kicked off (`kickoffAt <= now`) + not finished + not terminal; it relies on the scheduler's `status='live'` sync (every 5 min) plus the kickoff-time derivation, so it appears within a few minutes of real kickoff and flips to the result a few minutes after FT.

### Competition-agnostic

All of the above (`OpponentPredictionsPage`, the `PoolStandingsTable` link-through, `PredictMatchRow`, and the `PoolDetailPage` feed ordering) runs through shared code with no tournament-specific branches. It applies to the Premier League and any cup automatically when those come back online — see the §15 carry-across note. Restoring PL is a marketing-only job.

---

## 19. Pick distribution — "How the table called it" (step 3a.19)

A tap-to-expand panel rendered **inside each match card** on the Predict screen, showing how the whole table predicted a **locked** match. Permanent and competition-agnostic.

### What it shows
- A home / draw / away split bar (percentages of all picks for that match).
- The top three most-predicted exact scorelines, with counts.
- The viewer's own pick highlighted when it appears.
- An **"x/y picks"** header (e.g. "21/23 picks") — predictions made over total pool entrants, so the entrants who didn't get a pick in are visible.

### Anti-cheat (reuses §13 Rule #7)
Distribution is computed **only for locked events** (`predictionLockAt <= now`). The server (`getPoolPredictionDistribution` in `server/lib/insight-data.ts` → `GET /api/pools/:id/distribution`) never returns an unlocked event, so the crowd's picks can't influence anyone whose own pick is still open. Same symmetry argument as §18: by the time you see the distribution, your own pick for that match has locked too.

### Access & data
Mirrors the table / §18 rule: public when the pool is `settled`; `session + entrant` while live (401/403). Pure read over `predictions` (scoped by `pools.stageId`), aggregated in JS. The denominator is the pool's `pool_entries` count. No schema change.

### Placement
Rendered inside the match card (not as a separate panel) via the `MatchDistribution` helper in `PredictMatchRow`, so on multi-match days (PL Saturdays) each distribution is unmistakably tied to its match. `PoolDetailPage` fetches the pool distribution once, refetches on focus while unsettled, and passes the per-event slice + entrant count down to each row.

---

## 20. Predict-screen match states, countdowns & ordering (step 3a.19)

Refines §13 Rule #12. All in `PredictMatchRow` (state treatments) + `PoolDetailPage` (`predictTier`/`comparePredict`).

### Per-row state treatments (the "heat ladder")
- **Open / predictable** — neutral card; meta line shows a **"Locks in …"** countdown (day-aware: `1d 05:00` past 24h, then `5h 30m`, `42m`, `38s`). Turns **amber + slow pulse** under 6h.
- **About to start** (locked, not yet kicked off) — **amber card, bright team names, pulsing "STARTS SOON" badge, amber pulsing "Kicks off in …" countdown**. Per-match, so several simultaneous imminent games each light up. A clear notch below LIVE.
- **Live** (kicked off, no result) — dedicated rose card (`LivePredictionView`): the predicted scoreline in big boxes labelled **"Your pick"** + the pulsing red LIVE badge. **No live in-play score** (see §9 / parked livescores add-on) — this keeps the *pick* prominent through the match.
- **Finished** — FT scoreline + "You: x-y" + points pill (unchanged from §8).

Countdowns self-tick; on expiry they fire an `onLockElapsed` callback that refetches the entry, so a row flips state (open→locked, about-to-start→live) on its own without a manual refresh.

### Feed ordering (tiers, top → bottom)
1. **Live** (newest kick-off first)
2. **About to start** — locked, imminent (soonest kick-off first)
3. **Recently finished** — ended within the last hour (most recent first); lingers here an hour so you see your result before it drops to history
4. **Still predictable** — open (soonest deadline first)
5. **Played** — finished over an hour ago / terminal (newest first)
6. **Awaiting teams** — unresolved knockout slots (bottom)

The "happening now / next / just gone" cluster (1–3) sits above the upcoming still-to-predict games. Re-sorts on refetch (focus / countdown expiry), not a live ticking clock. Competition-agnostic.

### Live in-play scores — still parked (cost)
`football-data.org` free tier does **not** provide real-time scores (delayed); real-time needs the paid **livescores add-on (~€12/month)**. Points-on-pace (predicted line tracking a live match) is deferred until that's taken on. When built: the live score must stay **out of the settlement path** (`eventOutcomes` / `extractRegulationScore` stay FT-only; live score in a separate display-only store) and needs a faster (~30–60s) tick gated to pools with a live match. The §20 live card is the layout it drops onto.

---

## 21. Table chat — TEMPORARY WC feature (step 3a.19)

Per-pool chat for the informal World Cup friends' run. **Built to be removed after the WC** — see `docs/wc-chat-teardown.md` (trigger: "Read the WC chat teardown doc and remove the chat"). Every shared-file edit is sentinel-fenced (`// ── WC CHAT (temporary) ── start/end`); the new files (`messages.ts`, `chat-data.ts`, `PoolChatPage.tsx`) delete outright.

### Behaviour
Reached from a "Table chat" button on Tables (entrants only, under the You/position card) → `/pools/:competitionSlug/:poolId/chat`. Entrant-gated read + post. Plain text + emoji only (no images, no link auto-linkify). `displayName` author (matches the league table). 500-char cap, 5-msg/10s rate limit, self-excluded users blocked from posting. Admins get a per-message **Hide** (soft-delete, audited as `admin.action`). **Polling, not websockets** (5s while open + focus refetch) — matches the app's polling philosophy; no Redis/queue. Data in one table, `pool_messages` (append-only; soft-delete columns; the message row is itself the record, so no per-message audit row).

### Moderation — minimal now, scalable later
Admin-hide is the only moderation at 11 mates. **Deferred to scale/licence:** report queue, automated content filtering (the free OpenAI moderation endpoint slots into the POST path), richer retention/anonymisation wiring. The schema carries the compliance bones (soft-delete, timestamps, attribution) from day one.

### Regulatory note (the real cost of chat)
Chat is the **only** Predictor10 feature that makes it a **"user-to-user service" under the Online Safety Act 2023, regulated by Ofcom** — a *second* regulator on top of the UKGC, applying regardless of size. It brings an illegal-harms risk assessment, a reporting/complaints route, message-log retention, and CSAM detection duties. Acceptable for the informal WC run (low practical risk; admin-hide + retention in place), but it is a **documented line item before chat ships in the licensed product** (see pre-launch §3). Every other engagement feature stays purely inside the UKGC frame.

---

## 22. Eliminator10 — last-survivor game mode (step 3b)

A second game mode alongside the score-prediction pools: a survivor / **elimination** game. Pick one team to win each round; survive and go through; lose, draw or miss the deadline and you're out; the last entrant left wins. It has its **own** Home card, pick screen and survivors board — it is **not** folded into the Predictor10 prediction grid. It reuses login, payments, fixtures and compliance. **Free** for the WC friends' demo; built **PL-ready** (free now → real fee + 75/25 pot later, mirroring the pools' mock→live flip).

**Wording (trademark caution):** never "last man / player standing" (too close to a registered mark). The product reads **"elimination game"**, **"outlast the field"**, **"still in"**, **"you outlasted the field"**. The internal prize-model id `last_standing` is retained — it is a stored code constant, never shown to players, and is not the mark.

### Player rules (the 12 + tactics)
Last entrant in wins · pick one team to win each round · picks lock at the round's first kick-off · the team must **win in normal time** (90 min — ET/pens don't count) · you're out on a loss, a draw, or no pick by the deadline · **one team, once** for the whole competition · a round per fixture day to the Final · postponed/abandoned picks **roll forward** (not eliminated) · no re-entry unless advertised · multiple survivors at the end share/continue · free for the WC · decisions final. Plus a **tactical warning**: one-team-once means a late survivor can run out of usable teams in the thin knockout rounds (1–2 games/day) and be forced out — so don't burn strong sides early.

### Schema (`server/db/schema/eliminator.ts`) — 5 tables
- `eliminatorGames` — competitionId, slug, name, entryFee (default `'0'`), currency, prizeStructure jsonb (`{model:"last_standing", houseFeePct}`), reentryAllowed, opensAt, entryClosesAt, status (draft/open/running/settled/void), isActive.
- `eliminatorRounds` — gameId, ordinal, name, deadlineAt (= round's first kick-off), status (pending/open/locked/settled), settledAt. Unique (gameId, ordinal).
- `eliminatorRoundEvents` — roundId ↔ eventId. Unique (roundId, eventId).
- `eliminatorEntries` — gameId, userId, paymentId (nullable), status (alive/eliminated/won), eliminatedRoundId, eliminatedReason, finalRank, payoutId, enteredAt, settledAt. Unique (gameId, userId) — one entry per game.
- `eliminatorPicks` — entryId, gameId, roundId, userId, eventId, pickedSide, pickedTeam (snapshot), survived (nullable), ip/ua, scoredAt. Unique (entryId, roundId) [one pick/round] **and** unique (entryId, pickedTeam) [one-team-once].
- Enums: `eliminator_game_status`, `eliminator_round_status`, `eliminator_entry_status`, `eliminator_pick_side`. Audit actions appended to `auditActionEnum`: `eliminator.entry_created`, `eliminator.pick_submitted`.

### Rounds = UK matchday (the lock-time fix)
One round per **UK matchday**, where a matchday runs **06:00 → 06:00 the next day** (NOT the UTC calendar day). Late-night US games (UK small hours) therefore bundle into the **previous** evening's round instead of starting a new round that would lock at ~2am while the UK's asleep. The round's `deadlineAt` = its earliest kick-off, and the **whole round locks at that first whistle** (same fairness lock as the pools, §13 #12 / §18). Implemented in the seed via `matchdayKey()` — a net −5h shift (+1h BST, −6h cut-off), which matches the verified SQL `(kickoff AT TIME ZONE 'Europe/London') − interval '6 hours'`. Verified across the whole WC: **every** round locks 17:00–22:00 UK, group stage and knockouts. (The earlier UTC-day grouping locked several rounds at 1–3am UK — abandoned for this reason.)

### `startFrom` launch cutoff
The WC game config carries an optional `startFrom` ISO datetime; round generation only includes fixtures at/after it (otherwise from "now"). Set to `2026-06-21T06:00:00Z` so Round 1 opens on the **Spain v Saudi** matchday (locks Sun 21 Jun 17:00) and the small-hours Sunday games drop off. **Self-expiring** — once now > startFrom it behaves as a normal "from now" seed, so no cleanup is needed. Rounds are generated **once** (skipped if any exist); to re-time, **delete the game** (cascades) and reseed.

### Picks
One pick per round (a team to win). **One team once** across the whole game (unique constraint + server check). **Hidden from other players until the round locks** (symmetric lock, same anti-cheat as §18/§19) — surfaced on the pick screen as a note. A player's **own used-teams list is shown privately** on the pick screen (aids tactics; never exposed to others). Optimistic submit on the client; a 403 lock / 409 team-used rejection reverts the tap and toasts. Postponed/abandoned picks **roll forward** (survive) rather than eliminate (Rule 8).

### Survival engine (`server/lib/eliminator-settle.ts`)
Runs on the existing 15-min settle tick, after pool settle. `findReadyRoundIds()` gates a round ready when: game active/not-settled, round not settled, **previous round settled** (sequential), and **every fixture resolved** (finished-with-outcome OR cancelled/void OR forfeit-postponed-past-kickoff — same gate as pool settle). `settleOneRound()` (tx + FOR UPDATE, idempotent): scores each alive entry's pick — **win in normal time** (FT regulation read from `eventOutcomes.home/awayScore`; ET/pens never count, so a knockout decided on penalties is a **DRAW = out**) survives; draw/loss/no-pick eliminates (reason `lost`/`draw`/`no_pick`); cancelled/void/postponed survives (rolls forward). Progression: 1 alive → **crown** (status `won`, finalRank 1, game settled); 0 alive → **co-winners** = those eliminated this round (split, Rule 11); survivors but no next round → split; else open the next round + game `running`.

### Server + client files
- **Server:** `db/schema/eliminator.ts`; `lib/eliminator-data.ts` (overview / pick-screen / survivors DTOs, join, submit-pick — discriminated `{ok}` results, `yourUsedTeams` on the pick screen); `routes/eliminator.ts` (`GET /api/eliminator/:slug`, `POST /:slug/enter`, `GET /:slug/pick`, `POST /:slug/pick`, `GET /:slug/survivors`); `lib/eliminator-settle.ts`; seed Phase 6 `seedEliminatorGames` (`matchdayKey`, `startFrom`).
- **Client:** `lib/portal-api.ts` Eliminator section (types + fetchers + `SubmitEliminatorPickError`); `pages/portal/EliminatorPlayPage.tsx` (`/eliminator/:slug` — join, current round, pick grid with used-greying + your-pick highlight + lock countdown, private used-teams list, eliminated/won states, **green** Survivors/Rules header pills); `pages/portal/EliminatorSurvivorsPage.tsx` (`/eliminator/:slug/survivors` — still-in/out, picks hidden until lock); `components/predictor10/EliminatorRules.tsx` (rules sheet + tactics callout); Home card in `pages/portal/HomePage.tsx` (FREE badge, "still in" count, **"Starting soon"** note + lock time, How-it-works + state-aware CTA). Routes in `App.tsx` (survivors before play).

### Join / payments
Free game: no payment row, entry created directly. Paid (PL later): mock payment row, `referenceType "eliminator_entry"`, mirroring the pools' mock→live endpoint flip; 75/25 pot via `prizeStructure.houseFeePct`.

### Regulatory posture (paid version)
Eliminator-for-money **is pool betting** (entry fee + prizes + forecasting → Pool Betting Duty + a UKGC pool betting operating licence; football-pools record-keeping under LCCP 13.1.2). Fair-and-open: picks **hidden until lock** (built). Others' picks revealed **by nickname after lock** (data protection via nicknames, §16). Used-teams list **private** to the player. For the paid flip the rules must publish (LCCP 4.2.9): commission %, dividend rounding, the **no-winner / carry-over** procedure (maps to the co-winner / split outcomes), and the claim window. The free WC demo is not betting. Confirm specifics at licence application.

### Multiple games, the lobby, and cadence (step 3b)
Eliminator is **multi-game**: a competition can run more than one game, and the lobby (`/eliminator`) buckets them into three tabs (Your games / Open to join / Finished). No floating banner (step 3b.7): each tab stands alone, so the screen always matches the tab. The call-to-action lives on the card it belongs to — a game you're in that needs a pick shows **Make pick** in Your games; a joinable game shows **Join** in Open to join with "Starts <when>" (for an Eliminator the game starts and entries close at the same moment — the first kick-off, so one line covers both). Tab counts always match the rows shown. Each game row shows its **current round** alongside its state (e.g. "Round 1 · Picked · locks in 9h", or for a joinable game "Free · Round of 32 · Starts <when>"). The **Back** link on every Eliminator page (lobby, play, survivors) returns to the *previous* page via browser history — not Home — falling back to a sensible route only on a cold load (`BackButton` component). Rounds are named by **stage** for knockout games ("Round of 32", "Last 16", …) so they never collide with another game's generic "Round 1". "Open to join" only has content when there's a game you're not in that's still taking entries — so it's sparse for a single tournament-long game once you've joined, and lively under the weekly model below.

- **WC — two games (step 3b.4).** `world-cup-2026-eliminator` (the tournament-long game, one round per matchday, join before Round 1 locks) **plus** `world-cup-2026-knockout-eliminator` ("Eliminator10 · WC Knockout") — a separate free game that starts fresh at the **Round of 32** (clean slate: all teams available again) and runs to the Final. It's gated in the seed by **stage** (`knockoutOnly` → `fdStage <> 'GROUP_STAGE'`), not a date, so it always begins at the first knockout fixture. It gives latecomers a way in and keeps "Open to join" populated mid-tournament.
- **PL / Championship — weekly (planned).** When those seasons are live (fixtures loaded; they show on Home as Upcoming until then), seed **one new elimination game per gameweek / matchday** — each opens for entry ahead of its first kick-off, runs, settles, and the next opens. This is what keeps "Open to join" churning all season. Staggered games are named **"{Competition} · Game N"** (N in the order they open within a competition/season) so players can always tell which game they're in — the name lives on the game record and renders unchanged across Open to join, Your games and Finished. (The two WC games keep their descriptive names: World Cup, WC Knockout.) Real fee + 75/25 pot on licence (the mock→live flip). Seed gating will group by gameweek rather than by day (`ELIMINATOR_GAMES` config + the PL-ready branch in `seedEliminatorGames`).

### Launch promo (step 3b.6 — TEMPORARY)
A one-time welcome modal (`EliminatorPromoModal.tsx`, sentinel-fenced, mounted in `HomePage.tsx`) announces Eliminator10 on app open: what it is, free to enter, the soonest "entries close" date, and a **View games** button to the lobby (never auto-enter). Shows **once per device**, only while a game is **open to join**, and **auto-hides after 28 Jun 19:00 UTC**. Deliberately gentle (no pressure tactics). It is temporary — delete per `docs/eliminator-promo-teardown.md` (~29 Jun). When Eliminator goes paid/licensed, any such promo must be frequency-capped and hidden from players with deposit/activity limits or self-exclusion.

### Launch state (20 June 2026)
Seeded live: `world-cup-2026-eliminator`, **24 rounds**, Round 1 = Spain matchday (Spain v Saudi, Belgium v Iran, Uruguay v Cape Verde, New Zealand v Egypt), locks **Sun 21 Jun 17:00**, entries close then. Free, open public registration. The WC **Knockout** game (`world-cup-2026-knockout-eliminator`) is added in step 3b.4 — seeded via `pnpm seed` (no schema change), opens for entry and starts at the Round of 32. e5 deployed and phone-tested. tsc baseline unchanged at **15**.

## 23. Juice — engagement polish within UKGC limits (step 3b.9)

"Juice" = the satisfying feedback (motion, reveals, count-ups, status) that makes the app feel alive. For a product heading to a UKGC pool-betting licence, juice has a hard fence: **celebrate skill, anticipation and standing — never spending, and never urgency to spend.**

### The one rule
The UKGC restricts celebratory effects that misrepresent outcomes — specifically dressing up a return below the stake as a win ("losses disguised as wins"), because feedback that mimics winning more often than it truly happens nudges players into a heightened, harm-prone state. The newer direction also pushes operators to keep real spend and session time visible rather than hidden. So: the safe place for celebration is a **correct prediction** and a **rising rank**; the unsafe place is the **act of entering / paying**.

### Green — build freely
- **Result reveals:** score flip-in on settle, points-pill sheen on an exact score, table rows climbing to their new rank, shield badges in distinct bold colours (gold/blue/red) for the top-3 leaderboard places. Tied to skill outcomes / standing.
- **Live texture:** the pulsing LIVE badge; a "N matches live" ticker; factual goal nudges ("Goal — Liverpool 1-0, your pick 2-1"). (Real-time goals need the paid football-data livescores add-on — the free tier has none.)
- **Status / mastery:** skill streaks ("3 exact scores running"), skill badges ("called the upset"), a form sparkline, the planned Predictor Elo. Frame streaks as pride in past results, never "keep entering or lose your streak."
- **"Against the grain":** after lock, surface where the table went vs the player, then the reveal when the contrarian was right. Reuses the pick-distribution data.
- **Pure polish (zero RG risk):** count-up numbers, tap/press feedback, shimmer skeletons, smooth transitions, pull-to-refresh, light haptics — provided haptics/whooshes land on *locking a prediction* or navigation, never on payment.

### Red — do not build
- No celebratory effect (flash, sheen, sound, haptic) on **entering or paying**.
- No urgency/pressure on **entry deadlines** (no flashing "pool closing!" countdowns to spend). Urgency to *finish predictions you've already entered* is fine; urgency to *spend* is not.
- No **losses disguised as wins** — never present a 0-point or out-of-the-money result as a celebration; show people their true standing.
- Nothing with **strong appeal to under-18s** (keep styling adult).
- Never gamify away the **responsible-gambling tools** or hide real spend/session info.
- Keep **social features light and inside the betting frame** (full fusion with a social product risks regulatory collision — see ideas.md / roadmap).
- **Sound:** default off, opt-in, never on the stake, never loss-disguised-as-win. Deprioritised until post-licence with RG sign-off.

### Accessibility
All motion gates behind `prefers-reduced-motion` (also store-readiness).

### Build batches
- **Batch 1 (step 3b.9, shipped):** app-wide tap feedback; reusable `AnimatedNumber` count-up; exact-score points-pill sheen in `PredictMatchRow` `FinishedView`; `.p10-skeleton` shimmer utility. Front-end only, no schema, `prefers-reduced-motion` respected.
- **Batch 2 (step 3b.10, shipped):** against-the-grain reveal (finished-match banner when you backed a minority result and were right); settling-table row-climb (FLIP) in `PoolStandingsTable`; shield-shaped podium badges in distinct bold colours — gold/blue/red — for top-3 (`RankBadge` in `PoolStandingsTable`); form sparkline + earned badges on `AccountHistoryPage` (from existing settled history); reusable `Skeleton`/`SkeletonRows` applied to the Eliminator loading state; `lib/haptics.ts` wired to the Eliminator pick (Android web + future native; no-op on iOS web). Front-end only, no schema.
- **Still blocked / needs prerequisites:** live "N matches live" ticker (paid football-data livescores add-on); exact-scores-in-a-row streak (needs a per-prediction results read endpoint — round-form sparkline covers form for now); pull-to-refresh (custom gesture on the single fixed-height scroller — iOS-overscroll-sensitive, needs on-device iteration).
