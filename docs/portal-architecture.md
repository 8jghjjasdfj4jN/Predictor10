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
| Price/skill band | `leagues` | **Tier** | The Pound (£1), Tenner (£10), Big One (£50) |
| Stage of a competition | `stages` | **Round** | A 4-5 gameweek block (PL R1 = GW1-4) |
| A weekend of fixtures within a round | (no table — derived from `events.kickoffAt`) | **Gameweek** (PL) / **Matchday** (Champ) | GW1, GW2, MD3 |
| Specific buy-in instance | `pools` | **Pool** | "Premier League · Tenner · Round 12" |
| User's stake in a pool | `pool_entries` | **Entry** | "My Tenner R12 entry" |
| User's score guess for one match | `predictions` | **Prediction** | Liverpool 2-1 Arsenal |
| Match | `events` | **Match** or **Fixture** | Liverpool vs Arsenal |

**Refactor required:** today's frontend uses "League" for both Competition and Tier. Rename in UI copy. Schema unchanged. `LeaguesPage.tsx` becomes `PoolsPage.tsx`. The brand names ("The Pound", "The Tenner") become tier labels, not league names.

---

## 3. Competitions (MVP)

| Competition | football-data.org code | Status | Notes |
|---|---|---|---|
| Premier League | `PL` | ✅ Free tier | Year-round backbone. Already integrated. |
| EFL Championship | `ELC` | ✅ Free tier | Add alongside PL. |

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

A user enters a Round once (one stake) and predicts every match across all GWs / MDs in that Round.

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
| 1 | Home | `/` | house | State-aware Next Action |
| 2 | Predict | `/predict` | list | Open entries, ordered by deadline |
| 3 | Pools | `/pools` | trophy | Browse / join — competition picker at top |
| 4 | Account | `/account` | person | Profile, payments, RG, settings |

---

## 7. Page hierarchy

```
/                                       Home (live entries shortcuts + available tiers)
/predict                                Open entries — deep-links to pool screens
/pools                                  Competition picker landing
/pools/:competitionSlug                 Open pools for one competition
/pools/:competitionSlug/:poolId         Combined Pool detail + Predict (canonical)
/pools/:competitionSlug/:poolId/table   Live or final league table for that pool

/account                                Profile + summary
/account/payments                       Payment history (mock + live unified)
/account/history                        Archive — settled pools, your final results
/account/responsible-gambling           Deposit limits, time-outs, self-exclusion, GAMSTOP
/account/settings                       Email prefs, password, marketing consent

/login, /register, /verify-email        Auth pages (no AppShell, no nav)
```

The Pool detail and Predict screens are unified — one URL, one layout, state changes by entry status:
- **Pre-entry**: shows fixtures grouped by GW, empty score boxes, "Enter — £X" CTA at bottom
- **Post-entry**: same screen, score boxes editable (auto-save), no big CTA, "Auto-saving" footer
- **Round in progress**: locked matches show FT score + your prediction + points pill; future matches still editable
- **Round settled**: read-only mode; banner at top "Final results — view league table"; pool moves to `/account/history` archive after a few days

---

## 8. Page details

### 8.1 Home (`/`)

The Home tab unifies "your live entries in this round" with "tiers still available to enter" into one continuous view. State emerges from data, not a discrete state machine.

```
┌─────────────────────────────────┐
│ Round 1 · Premier League        │
│ GWs 1-4 · Closes Sat 29 Aug     │
├─────────────────────────────────┤
│ YOUR LIVE ENTRIES               │
│ ┌─────────────────────────────┐ │
│ │ PL · The Tenner             │ │
│ │ 12/40 saved · in play       │ │
│ │ [Predictions]    [Table]    │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ AVAILABLE TIERS                 │
│ The Pound      £1   24 entries  │
│ The Fiver      £5   18 entries  │
│ The Pony      £25    4 entries  │
│ The Big One   £50    1 entry    │
└─────────────────────────────────┘
```

Two sections, each can be empty:
- **Your live entries** — one card per pool the user is in for the current round. Two CTAs per card: jump to predictions, jump to live league table.
- **Available tiers** — tiers in the current round the user has NOT yet entered. New users see all 5.

Empty-state combinations:
- 0 live entries + N available = new or returning user (welcome copy + "Pick your first Tier")
- N live entries + 0 available = "All tiers entered for Round 1 · Round 2 opens [date]"
- 0 + 0 = no current open round (show next round's expected open date)

Home shows the **current round only**. Settled rounds live in `/account/history` (Section 8.8).

### 8.2 Predict (`/predict`)

Lists every open entry the user holds, grouped by close time. Each card is a deep-link into the canonical combined Pool / Predict screen (Section 8.5) for that entry's pool.

```
┌─────────────────────────────────┐
│ CLOSING SOON                    │
│ ┌─────────────────────────────┐ │
│ │ Championship · Big One      │ │
│ │ Round 1 · 60 matches        │ │
│ │ ⏱ Late entry closes 2h 14m  │ │
│ │ 12/60 predictions saved     │ │
│ │ [   Continue   ]            │ │
│ └─────────────────────────────┘ │
│                                  │
│ THIS ROUND                      │
│ ┌─────────────────────────────┐ │
│ │ PL · The Tenner             │ │
│ │ Round 1 · 40 matches        │ │
│ │ Round closes Sat 19 Sep     │ │
│ │ 24/40 predictions saved     │ │
│ │ [   Continue   ]            │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

Empty state: "No open entries. Browse pools →" linking to `/pools`.

Tapping a card routes to `/pools/:competitionSlug/:poolId` — the same URL as the Pool detail / Predict screen.

### 8.3 Pools landing (`/pools`)

Competition picker at top. Body shows currently-relevant pools across all competitions.

```
┌─────────────────────────────────┐
│ [Premier League]  [Championship]│
├─────────────────────────────────┤
│ OPEN NOW                        │
│ Premier League · Round 12       │
│ Closes Fri 18:00 · 5 tiers      │
│ [ See pools → ]                 │
├─────────────────────────────────┤
│ Championship · Round 38         │
│ Closes Sat 14:30 · 5 tiers      │
│ [ See pools → ]                 │
└─────────────────────────────────┘
```

### 8.4 Pools by competition (`/pools/:competitionSlug`)

```
┌─────────────────────────────────┐
│ ← Premier League                │
├─────────────────────────────────┤
│ 🔴 LIVE NOW (if applicable)     │
│ Liverpool 2-1 Arsenal · 67'     │
├─────────────────────────────────┤
│ ROUND 12 · CLOSES FRI 18:00     │
│ ┌─────────────────────────────┐ │
│ │ ● The Pound      £1   42 in │ │
│ │ ● The Fiver      £5   28 in │ │
│ │ ● The Tenner    £10   18 in │ │
│ │ ● The Pony      £25    9 in │ │
│ │ ● The Big One   £50    3 in │ │
│ └─────────────────────────────┘ │
│                                  │
│ ROUND 13 · OPENS MON            │
│ (preview, no enter button yet)  │
└─────────────────────────────────┘
```

Tier rows show entry-fee, current entry count, prize pool. Tap → pool detail.

### 8.5 Pool detail / Predict (`/pools/:competitionSlug/:poolId`) — CANONICAL

This is the single most important screen in the product. Pre-entry browsing AND post-entry predicting use the same URL and the same layout, with state changes by entry status. Top-tab GW navigation (Variant B refined). See Decided Rule #12 for the locked-in design choices.

```
┌─────────────────────────────────┐
│ ← Pools                         │
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

**State transitions:**

| State | Top section | Match rows | Bottom |
|---|---|---|---|
| Pre-entry (browsing) | Pool meta + entry stats (entry £X · N entrants) | Empty score boxes, "Tap to predict" hint | `[ Enter — £X ]` CTA |
| Post-entry, round not started | "0/40 saved" | Editable boxes | Auto-save indicator |
| Post-entry, round in progress | "X pts total · Rank Y of Z" | Mix of finished + live + locked + editable | Auto-save indicator |
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

Routing: settled pools remain accessible at the same URL but are reached primarily via `/account/history` (Section 8.8) since they no longer surface on Home or Pools.

### 8.6 League table (`/pools/:competitionSlug/:poolId/table`)

Pool leaderboard. Live during round (rank updates as matches finish), final after settlement.

```
┌─────────────────────────────────┐
│ ← PL · The Tenner R1            │
│ 18 entries · Round in progress  │
├─────────────────────────────────┤
│ # │ Player    │ Exact│ Res │ Pts│
│ 1 │ Mike P.   │ 14   │ 22  │114 │
│ 2 │ Sarah K.  │ 12   │ 19  │ 98 │
│ 3 │ James W.  │  9   │ 23  │ 91 │
│ 4 │ You       │ 11   │ 21  │ 87 │ ← highlighted
│ 5 │ Tom B.    │  8   │ 22  │ 84 │
│ 6 │ Priya R.  │  9   │ 19  │ 83 │
│ ...                             │
├─────────────────────────────────┤
│ Tie-break: pts → exact → result │
└─────────────────────────────────┘
```

- Top 3 highlighted (gold rank numbers, prize-tag badges if/when payouts finalised)
- User row highlighted in emerald wherever it sits in the table
- Footer explains tie-breaker (Decided Rule #10)
- During round: status pill ("Round in progress · GW2 of 4")
- After settlement: status pill ("Final · Settled Sun 20 Sep") + "View results" link → Pool detail in read-only mode

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

When a Round settles, its pools disappear from Home and Pools (active surfaces). They land here. Per-user archive: every pool the user ever entered, with their final stats and a link back to the read-only Pool detail and League Table for that pool.

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
│ │ Champ · The Pound · No prize│ │
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
- **Per-pool card** — pool name (competition · tier), final stats (pts, rank, prize/no-prize), two CTAs: Results (read-only Pool detail with FT scores + your predictions + points) and Table (read-only League Table).
- **Cashed pools** (1st/2nd/3rd) get an amber-tinted card + trophy badge with rank label. "No prize" pools stay neutral.
- **Empty state**: "No settled rounds yet. Your first results will appear here when Round 1 settles."
- **Settlement → archive timing**: a pool moves to the archive immediately on settlement. The Pool detail URL stays valid but discoverability is via the archive (decided rule #11).

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
| Pools competition page | In-play match in that competition | Strip above pool list |
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

Run once, server-side, on first deploy:

```
sports        : ['football']
competitions  : ['premier-league', 'championship', 'world-cup-2026']
                  + extId mapping to football-data.org codes
leagues       : 5 tier rows
                  - The Pound  £1   prize=top_3 split [70/20/10]
                  - The Fiver  £5   prize=top_3 split [70/20/10]
                  - The Tenner £10  prize=top_3 split [70/20/10]
                  - The Pony   £25  prize=top_5 split [50/25/15/7/3]
                  - The Big One £50 prize=top_5 split [50/25/15/7/3]
```

`stages` and `events` populated by sync cron (Render Cron Jobs) calling football-data.org.

`pools` created by cron when a stage opens: 5 tiers × 1 stage × 1 competition per cron run = 5 rows. Cron runs per competition stage transition.

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
                                 (5 tiers per competition × Round). Public.
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
2. **Multi-entry rule.** A user may hold concurrent entries across multiple Tiers and multiple Competitions. **Cap: one entry per Pool per user.** Since Pool = Competition × Tier × Round, this means a user can simultaneously hold (PL · Pound · R1) + (PL · Tenner · R1) + (Champ · Tenner · R1) — three pools, three entries — but never two entries in the same pool.
3. **Tier visibility.** All 5 tiers (Pound, Fiver, Tenner, Pony, Big One) are visible to every user from day one. No progressive unlock. The £1 Pound is the natural starter tier; choice is the user's.
4. **Competitions in MVP.** Premier League and EFL Championship only. World Cup dropped from scope. League One deferred (no provider coverage on free tier).
5. **Launch plan.** No hard launch date — public launch happens when the build is ready and the operator is ready. Earliest-possible target: Round 1 of PL 2026/27 (Sat 22 Aug → ~Sat 19 Sep 2026) as a closed test for invited users; public launch (mock-money) at the start of Round 2 (~Sat 26 Sep 2026). Both dates slide if not ready. See `roadmap.md` for the build phases that gate readiness.
6. **Round structure.** A Round is a multi-gameweek tournament block. PL: 9 Rounds (4-4-4-4-4-4-4-5-5 GWs). Champ: 9 Rounds (5-5-5-5-5-5-5-5-6 MDs). See Section 3 for the full schedule. **Entry fee covers the whole Round** — one stake, all matches in the Round.
7. **Per-match prediction lock.** Each match's predictions lock 1 hour before its individual kickoff. A user can edit predictions for un-kicked-off matches at any time. Predictions for already-played matches are never accepted — server enforces by rejecting with HTTP 403. Prevents cheating via late entry seeing results.
8. **Late-entry window.** Pool entry stays open for **exactly 7 days after the Round's first match kicks off**. Late entrants must confirm a warning modal explaining the handicap (forfeited matches = 0 pts) before payment. After +7 days, pool is closed; server rejects new entries.
9. **Prize structure — TBD.** Top 3 per pool win money; specific splits and operator commission are not yet decided and will be finalised before public launch. Splits stored in `pools.prizeStructure` jsonb so they can be tuned per-tier or per-promotion later. **Test mode behaviour:** all transactions recorded as `payments.mode = 'mock'` — no real money charged, no real money paid. Prize calculations and "winners" still compute and display in UI for end-to-end testing of the settlement engine. At licence flip, the same code path becomes real: charges via Stripe, payouts via configured rail, commission posted to operator account.
10. **Tie-breaker.** Order of comparison when entries are tied on points: (1) **Total exact-score predictions** (5pt entries) — more wins. (2) **Total correct-result predictions** (2pt entries) — more wins. (3) Still tied → split prize evenly between tied entries.
11. **Settled rounds → archive.** Once a Round settles, its pools no longer appear in the active Pools tab or Home tab. They move to `/account/history` — a per-user archive of every pool the user entered, with their final rank, points, and any payout. The Pool detail URL stays accessible in read-only mode so users can deep-link to old results, but discoverability is via the archive, not the active surfaces.
12. **Predict screen design — locked.** Combined Pool detail + Predict on a single URL (`/pools/:competitionSlug/:poolId`). Top tabs for each Gameweek in the Round (e.g. `GW1 24 pts ✓ | GW2 5/10 | GW3 0/10 | GW4 0/10`). Default tab on load = the current Gameweek (the first GW that hasn't fully completed). All matches in the selected GW shown in full — no "+N more" truncation. Day groupers within a GW for chronology (Sat/Sun/Mon). Match rows render four states: **finished** (FT score + your prediction + points pill), **saved & locked** (kickoff <1hr away, no edits), **half-saved** (one score entered), **editable** (empty boxes, "tap to predict"). Auto-save on every input change (debounced ~800ms) with a footer indicator confirming persistence. No manual "Save" button.
13. **Settlement gate for non-played fixtures.** A pool settles when every event in its Round is either `finished` with an `event_outcomes` row, OR in a terminal non-played state (`cancelled` / `void`). `Postponed` events still block settlement — they may yet be rescheduled inside the Round window. Predictions on cancelled or void events keep `points_awarded = null` and render as "Missed — 0 pts" (no match means no score to compare against). Without this rule, a single postponement could deadlock a pool indefinitely.
14. **Payout rounding.** Each rank's payout is computed as `pot × split ÷ tied_count`, rounded to 2 decimal places at storage. After all line items are computed, any 1-2p rounding residual goes to rank 1 — line items must sum exactly to `pot × sum(splits)` so the books balance. This is cosmetic precision for `mode='mock'`; real-money operation post-licence will switch to integer-pence arithmetic for proper accounting.
15. **Zero-entry pools settle silently.** A pool reaching its settlement gate with `entry_count = 0` still gets marked `settled` — pot is 0, no `payments` rows are written, audit log records the settlement with `entryCount: 0`. Handles the rare race between the stale-pool cleanup script and outcome sync, and gives the settlement engine a single uniform exit path.

---

## 14. Open questions and deferred decisions

### Deferred until pre-launch (gating public launch)

1. **Prize splits and operator commission.** Top 3 paid (Decided #9), but exact percentages TBD. Affects test-mode display copy and post-licence go-live calculations. Decision needed before Round 2 public launch.
2. **Default tab on settled-state Pool/Predict screen.** Currently defaults to GW1 (chronological start). Alternatives: last-viewed (sticky), highest-scoring GW (lead with user's best), or most recent GW (last week's matches still in memory).
3. **Archive header stats.** Currently shows `Rounds played · Cashes · Best rank`. Alternatives: best round (pts), highest tier won, longest cashing streak. Three-cell space available, copy and metrics under review.
4. **"Cashed" copy** on archive cards. Used while payouts are TBD; once operator commission and prize amounts are decided, may switch to specific amount or "1st place · £X" format.
5. **Settlement → archive timing.** Currently moves immediately on settlement. Consider a 24-48hr "fresh results" grace period where settled pools stay on Home with a "Round X complete" hero, then move to archive. Improves engagement on settlement day.

### Deferred to post-launch / Week 5+ build

6. **Push and email notifications.** Round-opens, late-entry-window-closing, predictions-due-soon (per-match lock approaching), results-in. Out of scope for portal architecture; spec needed in Week 5+ build.
7. **Multi-competition Home behaviour.** When a user has live entries in PL Round 1 AND Champ Round 1 simultaneously, how does Home present them? Options: tabbed by competition, both visible stacked, default to whichever has more pressing deadline. Defer until we have multi-comp users to learn from.
8. **Live scores polling cadence.** Currently 60s server cache, 30s client refresh on visible pages. May tighten during in-play windows. Decision after first round operations.

### Deferred to Q4 2026 (post-licence)

9. **GAMSTOP integration cadence.** Current scaffolding runs nightly sync; UKGC may require more frequent checks during sessions. Confirm with compliance counsel.
10. **AML rule thresholds.** Velocity, single-transaction size, deposit-to-stake ratios — specific numbers tuned during licence application review.
11. **KYC provider selection.** Onfido / Veriff / GBG / Jumio. Decision after sandbox evaluations in Weeks 9-11.
12. **Per-user `real_money_enabled` rollout strategy.** Big-bang on licence day, or gradual cohort-by-cohort. Probably gradual for risk control.
