# Predictor10 — Portal Architecture

Last updated: May 2026 · Status: Draft for Week 1 build

This doc describes the post-login user portal: navigation, pages, data, and the path from "user clicks a tier" to "predictions submitted." It assumes the schema in `server/db/schema/` and the public-facing pages in `client/src/components/predictor10/`.

---

## 1. First principles

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
| Price/skill band | `leagues` | **Tier** | The Fiver (£5), Tenner (£10), Big One (£50). The Pound (£1) retired in step 2m — see §3. |
| Stage of a competition | `stages` | **Round** | A 4-5 gameweek block (PL R1 = GW1-4) |
| A weekend of fixtures within a round | (no table — derived from `events.kickoffAt`) | **Gameweek** (PL) / **Matchday** (Champ) | GW1, GW2, MD3 |
| Specific buy-in instance | `pools` | **Pool** | "Premier League · Tenner · Round 12" |
| User's stake in a pool | `pool_entries` | **Entry** | "My Tenner R12 entry" |
| User's score guess for one match | `predictions` | **Prediction** | Liverpool 2-1 Arsenal |
| Match | `events` | **Match** or **Fixture** | Liverpool vs Arsenal |

**Refactor required:** today's frontend uses "League" for both Competition and Tier. Rename in UI copy. Schema unchanged. (Step 2m note: `LeaguesPage.tsx` originally became `PoolsPage.tsx` in step 2c then deleted entirely in step 2m when the Pools-as-browse flow was killed — Home + Tables cover it now.) The brand names ("The Fiver", "The Tenner") are tier labels, not league names.

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

From step 2m onwards there are **4 tiers per competition per Round** for league-style competitions (PL, Champ):

| Tier | Entry |
|---|---|
| The Fiver | £5 |
| The Tenner | £10 |
| The Pony | £25 |
| The Big One | £50 |

**Tournament competitions (WC 2026) carry a single dedicated tier** (`world-cup-2026`, £30) — one Enter button, no tier choice. Reasoning: a tournament-length pool is itself the commitment, and splitting 100 expected entrants across 4 tier-pools dilutes pots to the point where most settle near zero. One pool keeps the WC pot meaningful. The WC tier is retired via `RETIRED_TIER_SLUGS` after the Final settles (~22 July 2026).

**The Pound (£1) was retired in step 2m.** Reasoning: Stripe + merchant processing fees against the player-pool payout (now 75% of gross after step 2n's 25% commission) leave negative margin. Wez's existing Round 9 Pound entry plays out and settles normally on Sun 24 May 2026 under the original (pre-step 2n) 70/20/10 split with no commission; from Round 10 onwards no Pound pools are created. The `leagues.slug='pound'` row stays in the DB for historical reference, marked `is_active=false`.

Tier visibility: all four PL/Champ tiers are visible to every user from day one. No progressive unlock. Tier choice is the user's.

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
│ │ 4 tiers from £5             │ │
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
- **Entry summary**: "4 tiers from £5" for PL/Champ, "One bracket, one £30 entry" for WC.
- **Late-entry deadline** when the window is open or closing soon.
- **CTA**: "Choose your tier →" routes to the tier picker (Tables tab with the competition pre-selected). "Enter World Cup →" routes to the single-tier confirm screen (§8.6.1).

Card behaviour by competition type:

- **League-style (PL / Champ)** — taps the card → tier picker. Same 4 tiers / pool-card layout as today's Tables tab, scoped to the chosen competition's current Round. Each tier card shows live entry count and per-rank prize breakdown computed from the current pot.
- **Tournament-style (WC)** — taps the card → single-screen confirm (§8.6.1) with the explainer copy (FT scores only, postponement rule, bracket fills progressively, late-entry deadline). One [ Enter — £30 ] button, mock-money entry, user is in the pool.

Hiding rules:
- A competition disappears from Home once the user has entered every active pool in it (e.g. user entered PL Fiver+Tenner+Pony+Big One, no more PL tiers to choose → PL card hides). They access their live entries via the Predict tab.
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

**GW tabs:**
- Past GWs: total pts earned, checkmark icon, slightly muted (`GW1 24 pts ✓`)
- Active GW (default open): emerald highlight, save progress (`GW2 5/10`)
- Future GWs: neutral, save progress (`GW3 0/10`)

**Day groupers** within a GW (`Sat 29 Aug`, `Sun 30 Aug`, `Mon 31 Aug`) — chronological dividers since GWs span multiple days.

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
│ ●Fiver  ●Tenner  Pony  Big One  │ ← tier sub-tabs; dot = you're entered
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
- **Tier sub-tabs**: one per tier in the current Round for the selected competition. From step 2m onwards that's four tiers (Fiver / Tenner / Pony / Big One). Selected sub-tab has an emerald underline. A small emerald dot prefixes the label when the viewer is entered in that tier for the current Round; absent otherwise.
- **Header**: Round label (small eyebrow) + tier name (h2) + meta line (`£NN · N players`) + per-rank prize breakdown line (`1st £X · 2nd £Y · 3rd £Z`, step 2n — amounts net of 25% commission). Header right-side widget:
  - Entered: small two-line block — uppercase eyebrow "YOU" + emerald "Nth · X pts".
  - Not entered: solid emerald button "Enter · £NN →". Tap walks through the entry flow (window check → late-entry modal if needed → POST `/api/pools/:id/enter` → navigate to `/predict/:entryId`).
- **Standings table**: same component used in step 2k's PoolTablePage. Five columns (# / Player / Exact / Result / Pts). Gold rank numbers for 1-3 (amber-300). Emerald-tinted row for the viewer when entered. `↓ N more ↓` footer when truncated; tap expands inline (or the page scrolls, depending on what fits — implementation choice). Tie-break footer copy mirrors Decided Rule #10 verbatim per step 2k.
- **Default landing tier** when arriving at `/tables`: leftmost sub-tab where the viewer is entered. If entered in none, fall back to the first tier (Fiver). Persists across navigations within the same session.
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
│ │ Champ · The Fiver · No prize│ │
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
leagues       : 5 active tier rows + 1 retired
                  Active (league-style — PL/Champ pools use these 4):
                  - The Fiver  £5   splits=[0.60, 0.25, 0.15]  houseFeePct=0.25
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
2. **Multi-entry rule.** A user may hold concurrent entries across multiple Tiers and multiple Competitions. **Cap: one entry per Pool per user.** Since Pool = Competition × Tier × Round, this means a user can simultaneously hold (PL · Fiver · R1) + (PL · Tenner · R1) + (Champ · Tenner · R1) — three pools, three entries — but never two entries in the same pool.
3. **Tier visibility.** All 4 tiers (Fiver, Tenner, Pony, Big One) are visible to every user from day one. No progressive unlock. £5 is the natural starter tier; choice is the user's. The Pound (£1) was retired in step 2m.
4. **Competitions in MVP.** Premier League, EFL Championship, and World Cup 2026. **WC added in step 3a** as a tournament-style competition (single Round = whole tournament, single dedicated `world-cup-2026` £30 tier, retired post-Final). League One deferred (no provider coverage on free tier). Future tournaments (Euros 2028, etc.) will follow the same single-tier + retire-after pattern.
5. **Launch plan.** No hard launch date — public launch happens when the build is ready and the operator is ready. Earliest-possible target: Round 1 of PL 2026/27 (Sat 22 Aug → ~Sat 19 Sep 2026) as a closed test for invited users; public launch (mock-money) at the start of Round 2 (~Sat 26 Sep 2026). Both dates slide if not ready. See `roadmap.md` for the build phases that gate readiness.
6. **Round structure.** A Round is a multi-gameweek tournament block. PL: 9 Rounds (4-4-4-4-4-4-4-5-5 GWs). Champ: 9 Rounds (5-5-5-5-5-5-5-5-6 MDs). See Section 3 for the full schedule. **Entry fee covers the whole Round** — one stake, all matches in the Round.
7. **Per-match prediction lock.** Each match's predictions lock 1 hour before its individual kickoff. A user can edit predictions for un-kicked-off matches at any time. Predictions for already-played matches are never accepted — server enforces by rejecting with HTTP 403. Prevents cheating via late entry seeing results.
8. **Late-entry window.** Pool entry stays open for **exactly 7 days after the Round's first match kicks off**. Late entrants must confirm a warning modal explaining the handicap (forfeited matches = 0 pts) before payment. After +7 days, pool is closed; server rejects new entries.
9. **Prize structure (locked in step 2n).** Top 3 per pool win money. Splits applied to the **player pot** (= gross pot × 0.75 after the 25% operator commission): 60% / 25% / 15%. Identical across all four active tiers. Splits + houseFeePct stored in `pools.prizeStructure` jsonb (snapshotted at pool creation) so tier-level changes can be tuned later without retroactive effects on settled pools. **Test mode behaviour:** all transactions recorded as `payments.mode = 'mock'` — no real money charged, no real money paid. Prize calculations and "winners" still compute and display in UI for end-to-end testing of the settlement engine. At licence flip, the same code path becomes real: charges via Stripe, payouts via configured rail, commission posted to operator account. **Retired tiers (Pound):** keep their original `prizeStructure` snapshot (70/20/10, no houseFeePct) so existing open pools settle under the rules they were opened under.
10. **Tie-breaker.** Order of comparison when entries are tied on points: (1) **Total exact-score predictions** (5pt entries) — more wins. (2) **Total correct-result predictions** (2pt entries) — more wins. (3) Still tied → split prize evenly between tied entries.
11. **Settled rounds → archive.** Once a Round settles, its pools no longer appear in the active Tables tab or Home tab. They move to `/account/history` — a per-user archive of every pool the user entered, with their final rank, points, and any payout. The prediction screen (`/predict/:entryId`) stays accessible in read-only mode so users can deep-link to old results, but discoverability is via the archive, not the active surfaces. The settled-pool league table URL (`/pools/:slug/:poolId/table`) is also preserved as the `[Table →]` target from Account History.
12. **Predict screen design — locked.** Entered-state-only screen at `/predict/:entryId` (step 2m URL — keeps the Predict bottom-nav tab highlighted; was `/pools/:competitionSlug/:poolId` pre-step-2m, which mixed pre-entry and post-entry states). Top tabs for each Gameweek in the Round (e.g. `GW1 24 pts ✓ | GW2 5/10 | GW3 0/10 | GW4 0/10`). Default tab on load = the current Gameweek (the first GW that hasn't fully completed). All matches in the selected GW shown in full — no "+N more" truncation. Day groupers within a GW for chronology (Sat/Sun/Mon). Match rows render four states: **finished** (FT score + your prediction + points pill), **saved & locked** (kickoff <1hr away, no edits), **half-saved** (one score entered), **editable** (empty boxes, "tap to predict"). Auto-save on every input change (debounced ~800ms) with a footer indicator confirming persistence. No manual "Save" button. The pre-entry flow (window check → late-entry modal → POST `/enter`) lives on the Tables tab now (§8.6).
13. **Settlement gate for non-played fixtures.** A pool settles when every event in its Round is either `finished` with an `event_outcomes` row, OR in a terminal non-played state (`cancelled` / `void`). `Postponed` events still block settlement — they may yet be rescheduled inside the Round window. Predictions on cancelled or void events keep `points_awarded = null` and render as "Missed — 0 pts" (no match means no score to compare against). Without this rule, a single postponement could deadlock a pool indefinitely.
14. **Payout rounding.** Operator commission is computed first (`houseFeePence = floor(grossPotPence × houseFeePct)`, so players are never overpaid from sub-penny remainders). The remaining `playerPotPence` is split across paying ranks: `playerPot × split ÷ tied_count`, rounded to 2 decimal places at storage. After all line items are computed, any 1-2p rounding residual goes to rank 1 — line items must sum exactly to `playerPotPence × sum(splits)` so the books balance. The same `computeDisplayBreakdown` helper feeds both settlement and the API display amounts, so the breakdown shown on Tables / Home matches what actually gets paid to the penny. Cosmetic precision for `mode='mock'`; real-money operation post-licence switches to integer-pence arithmetic throughout.
15. **Zero-entry pools settle silently.** A pool reaching its settlement gate with `entry_count = 0` still gets marked `settled` — pot is 0, no `payments` rows are written, audit log records the settlement with `entryCount: 0`. Handles the rare race between the stale-pool cleanup script and outcome sync, and gives the settlement engine a single uniform exit path.
16. **Postponed-event policy is per-competition (step 3a).** `competitions.postponedPolicy` is one of `'wait'` (default — current PL/Champ behaviour, Rule #13) or `'forfeit'` (WC). Under `'forfeit'`: a postponed match counts as 0 pts for every prediction until/unless football-data emits a future kickoff for the same fixture. If a future kickoff appears, the match returns to normal predict flow (per-match 1hr lock applies) and any final FT result re-scores the prediction. If no future kickoff is ever issued, the 0 stands and the match counts as "accounted for" by the settlement gate (Rule #17). Reasoning: a 104-match tournament-Round cannot afford a single postponement to deadlock the pool for weeks; forfeit-then-reopen-if-rescheduled is the cleanest user-facing model.
17. **Tournament-style competition behaviour (step 3a).** Competitions flagged tournament-style (currently: WC) deviate from league-style behaviour in three ways. (a) **Single Round = whole tournament.** One pool per dedicated tier, all matches in one stake. (b) **Bracket fills progressively.** Knockout fixtures exist with placeholder team names from day one ("Group A Winner vs Best Third Placed"); football-data updates team fields as winners are determined; outcome-sync's existing newly-added/changed-match upsert handles this with no extra code. Predict UI gates the predict window on **both teams being non-placeholder AND the per-match 1hr lock not yet passed**. Placeholder matches render visibly in the Predict screen with "Awaiting teams" copy so players see the road ahead but can't predict blind. (c) **Settlement gate uses Rule #16's policy.** A WC pool settles when every match is either FINISHED-with-outcomes OR POSTPONED-without-future-kickoff. No grace window — the cron's existing 15-min cadence handles tail-end propagation from football-data within ~20 minutes of the Final's full-time whistle.
18. **Home / Predict separation (step 3a).** Home is entry discovery only — one card per competition currently open for entry, no live-entry duplication. Tapping a league-style card routes to the tier picker; tapping a tournament-style card routes to a single-Enter confirm screen (§8.6.1). Predict is the active-play surface — every open entry the user holds, grouped by status (Closing Soon / This Round / Tournament), each card linking to `/predict/:entryId`. Pre-step-3a, both surfaces showed entries; the duplication is removed. The Tables tab continues to list per-pool league standings independently and is unchanged by this rule.

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
