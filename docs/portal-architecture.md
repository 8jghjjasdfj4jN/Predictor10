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
| Stage of a competition | `stages` | **Round** | Round 12, Round 13 |
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
/                              Home (state-aware)
/predict                       List of open entries
/predict/:entryId              Make/edit predictions for one entry

/pools                         Competition picker landing
/pools/:competitionSlug        Open pools for one competition
/pools/:competitionSlug/:poolId    Pool detail (fixtures · entries · my entry)

/account                       Profile + summary
/account/payments              Payment history (mock + live unified view)
/account/responsible-gambling  Deposit limits, time-outs, self-exclusion, GAMSTOP
/account/settings              Email prefs, password, marketing consent

/login, /register, /verify-email   Auth pages (no AppShell, no nav)
```

---

## 8. Page details

### 8.1 Home (`/`)

State-aware hero card + secondary content. Hero swaps based on user's current state across all competitions.

| State | Trigger | Hero card content | Secondary |
|---|---|---|---|
| **A. New** | 0 entries lifetime | "Welcome — Pick your first Tier" + 5 tier cards from the next open round (PL or Championship) | How scoring works (5 / 2 / 0), upcoming fixtures preview |
| **B. Pending** | Has open entries with no predictions saved | "Round X closes Fri 18:00 — Make your predictions" + Predict CTA, deadline countdown | Live now strip if any matches in-play, recent form |
| **C. Live** | Predictions submitted, matches in-play | Live position card: "You're 8th of 24 · 6 pts so far" + match-by-match live ticker showing prediction vs current score | Other entries summary, leaderboard preview |
| **D. Settled** | Round complete, new round not yet open | "Round X settled — you scored 14, finished 8th of 24" + see full leaderboard | Recent form, payment summary |
| **E. Between** | All settled, next round not yet open | "Round X+1 opens Mon 12:00" + your form line | Upcoming fixtures, "Re-enter Tenner" shortcut |

**State detection** (one helper):

```ts
type HomeState = 'new' | 'pending' | 'live' | 'settled' | 'between';

function deriveHomeState(
  entries: UserEntry[],
  now: Date
): HomeState {
  if (entries.length === 0) return 'new';
  const open = entries.filter(e => !e.allPredictionsSubmitted && e.lockAt > now);
  if (open.length > 0) return 'pending';
  const live = entries.filter(e => e.hasMatchesInPlay);
  if (live.length > 0) return 'live';
  const justSettled = entries.filter(e => e.settledAt && (now - e.settledAt < 48h));
  if (justSettled.length > 0) return 'settled';
  return 'between';
}
```

When user has entries across multiple competitions, hero shows the most-pressing single state (priority: live > pending > settled > between > new).

### 8.2 Predict (`/predict`)

Lists every open entry the user holds, grouped by close time.

```
┌─────────────────────────────────┐
│ CLOSING SOON                    │
│ ┌─────────────────────────────┐ │
│ │ Championship · Big One      │ │
│ │ Round 38 · 12 matches       │ │
│ │ ⏱ Closes in 2h 14m          │ │
│ │ 0/12 predictions made       │ │
│ │ [   Make Predictions   ]    │ │
│ └─────────────────────────────┘ │
│                                  │
│ THIS WEEK                       │
│ ┌─────────────────────────────┐ │
│ │ Premier League · Tenner     │ │
│ │ Round 12 · 10 matches       │ │
│ │ ⏱ Closes Fri 18:00          │ │
│ │ 7/10 predictions saved      │ │
│ │ [   Continue   ]            │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

Empty state: "No open entries. Browse pools →" linking to `/pools`.

### 8.3 Predict detail (`/predict/:entryId`)

The prediction-entry screen. One screen, all matches in the round.

```
┌─────────────────────────────────┐
│ ← Premier League · Tenner R12   │
│   Closes Fri 18:00 · 2h 14m     │
├─────────────────────────────────┤
│ Liverpool   [2] - [1]   Arsenal │
│ Sat 15:00 · Anfield             │
├─────────────────────────────────┤
│ Chelsea     [1] - [1]   Spurs   │
│ Sat 17:30 · Stamford Bridge     │
├─────────────────────────────────┤
│ ... (8 more)                    │
├─────────────────────────────────┤
│ 7/10 saved · [ Save & Submit ]  │
└─────────────────────────────────┘
```

- Auto-save on each input change (debounced 800ms) → `PUT /api/predictions/:id`
- "Save & Submit" sets all predictions for this entry to final
- Server enforces `predictionLockAt` per match; refuses any prediction posted after lock
- After lock, screen flips to read-only "Watch" mode (live scores beside predictions)

### 8.4 Pools landing (`/pools`)

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

### 8.5 Pools by competition (`/pools/:competitionSlug`)

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

### 8.6 Pool detail (`/pools/:competitionSlug/:poolId`)

```
┌─────────────────────────────────┐
│ ← Premier League · Tenner R12   │
│ Entry £10 · Prize pool £180     │
│ Closes Fri 18:00 · 18 entries   │
├─────────────────────────────────┤
│ [ Fixtures ] [ Entries ] [ Me ] │
├─────────────────────────────────┤
│ (tab content)                   │
├─────────────────────────────────┤
│ [    Enter — £10    ]           │
└─────────────────────────────────┘
```

- **Fixtures tab**: 10 matches in this round with kickoff times
- **Entries tab**: list of who's entered (display name only — never reveal predictions before lock)
- **Me tab**: empty if not entered, else shows my predictions + live status
- **CTA**: "Enter — £10" → mock payment flow (Section 4)

### 8.7 Account (`/account`)

```
┌─────────────────────────────────┐
│ STEVE RODGERS                   │
│ steve@example.com               │
│ Member since May 2026           │
├─────────────────────────────────┤
│ → Payment history               │
│ → Responsible gambling          │
│ → Settings                      │
│ → Sign out                      │
└─────────────────────────────────┘
```

### 8.8 Responsible gambling (`/account/responsible-gambling`)

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

### Auth (Week 1)
```
POST   /api/auth/signup
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/verify-email
POST   /api/auth/resend-verification
POST   /api/auth/request-password-reset
POST   /api/auth/reset-password
```

### Catalogue (Week 2)
```
GET    /api/competitions              → list active competitions
GET    /api/competitions/:slug        → one competition + current/next stage
GET    /api/tiers                     → list of tiers (£1-£50)
```

### Pools (Week 2-3)
```
GET    /api/pools                     → all open pools across competitions
GET    /api/pools/competition/:slug   → open pools in one competition
GET    /api/pools/:id                 → pool detail (fixtures, entries count, prize)
GET    /api/pools/:id/entries         → entries list (display names only)
POST   /api/pools/:id/enter           → mock-payment + create entry
```

### Predictions (Week 3)
```
GET    /api/entries/me                → user's entries
GET    /api/entries/:id               → entry detail (predictions + matches)
PUT    /api/predictions/:id           → upsert one prediction
POST   /api/entries/:id/submit        → finalise all predictions for this entry
```

### Live (Week 3)
```
GET    /api/live                      → all live matches
GET    /api/live/:competitionCode     → live matches per competition
```

### Account (Week 4)
```
GET    /api/account/payments          → payment history
PUT    /api/account/profile
PUT    /api/account/responsible-gambling/limits
POST   /api/account/responsible-gambling/timeout
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
2. **Multi-entry rule.** A user may hold concurrent entries across multiple Tiers and multiple Competitions. **Cap: one entry per Pool per user.** Since Pool = Competition × Tier × Round, this means a user can simultaneously hold (PL · Pound · R12) + (PL · Tenner · R12) + (Champ · Tenner · R38) — three pools, three entries — but never two entries in the same pool.
3. **Tier visibility.** All 5 tiers (Pound, Fiver, Tenner, Pony, Big One) are visible to every user from day one. No progressive unlock. The £1 Pound is the natural starter tier; choice is the user's.
4. **Competitions in MVP.** Premier League and EFL Championship only. World Cup dropped from scope. League One deferred (no provider coverage on free tier).
5. **Launch plan.** Round 1 of PL 2026/27 (Sat 22 Aug 2026) = closed test, ~50–100 invited users. Round 2 (Sat 29 Aug 2026) = public launch (mock-money). 15-week build window from May 2026, with UKGC compliance scaffolding built in Weeks 5-8 (see `roadmap.md`).

---

## 14. Open questions

1. **Push/email notifications** — round-opens, predictions-due-soon, results-in. Out of scope for portal architecture but noted for Week 5+.
