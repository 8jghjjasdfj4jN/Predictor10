# Predictor10 — handoff prompt for a new chat

> Save this file. Copy everything below the `---` line into a fresh Claude chat. Upload the latest Predictor10 zip alongside it.

---

# Predictor10 build — picking up at step 2e

I'm a solo developer building Predictor10, a UK football score-prediction pool betting product. 3-person business forming around it. Targeting UKGC general pool betting licence (likely 2027 grant). **Build the real flow, mock the money** — payments table has `mode='mock'` until licence flip, then becomes `'live'`. Same code paths flip; no rewrites.

## Stack
React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui frontend · Express on Render · Postgres + Drizzle ORM · Resend for email · football-data.org for fixtures · Wouter for routing · No Redis/queue — Render Cron Jobs handle settlement.

## Already done (this is the current state — DO NOT rebuild)

### Pre-existing (before any Claude chats)
- Public marketing pages, SVG logo, auth pages (`LoginPage`, `RegisterPage`, `AuthShell`)
- Full Drizzle schema in `/server/db/schema/` — users, leagues (= tiers), sports, pools, payments, compliance, licensed (dormant tables for post-licence)
- Render Postgres provisioned · `DATABASE_URL`, `FOOTBALL_API_KEY` in Render env
- Three docs in `/docs/`: `portal-architecture.md`, `roadmap.md`, `pre-launch.md`

### Step 1 — Portal shell
- `AppShell.tsx` rebuilt: post-login shell with sticky top bar (logo · conditional live badge · greeting + avatar → `/account`) + sticky bottom 4-tab nav (Home / Predict / Pools / Account). Mobile-first, 480px max column on desktop.
- `MarketingShell.tsx` created from the previous AppShell content — wraps the public marketing routes for logged-out users.
- Stub pages at `client/src/pages/portal/`: `HomePage.tsx`, `PredictPage.tsx`, `PoolsPage.tsx`, `AccountPage.tsx`. AccountPage has a working Sign Out.
- `App.tsx` rewired: logged-in users → portal routes wrapped in AppShell. Logged-out → marketing routes wrapped in MarketingShell. Auth pages bypass both shells.

### Step 2a — DB foundation
- `server/db/index.ts` exports a Drizzle instance over postgres-js, reads `DATABASE_URL`. Imported by everything that touches the DB.
- Added deps: `drizzle-orm`, `postgres`, `@node-rs/argon2` (Rust-based, broader prebuilt binary coverage than `argon2`), `drizzle-kit` (dev), `dotenv`.
- `pnpm` scripts added: `db:generate`, `db:push`, `db:studio`.
- `.env.example` documents required env vars (`DATABASE_URL`, `FOOTBALL_API_KEY`, `SESSION_SECRET`, `BYPASS_LATE_ENTRY`, etc.).
- First migration generated and **pushed to Render Postgres**. 25 tables live (active + dormant).

### Step 2b — Real auth
- Real signup/login/logout/me endpoints under `/api/auth/*`. Argon2id password hashing (OWASP params: 19 MiB / 2 iters / parallelism 1).
- Sessions are server-stored (row in `sessions` table) with SHA-256-hashed tokens. HTTP-only cookie `p10_session`, SameSite=Lax, Secure in prod, 30-day sliding TTL (refreshed when <7 days remain).
- Audit log writes for `user.signup` / `user.login` / `user.logout`. Non-blocking — failures logged, never raised.
- Age gate: server rejects DOB < 18 years.
- Login burns a dummy argon2 verify when email isn't found, masking the email-existence timing oracle.
- `AuthContext.tsx` replaced — real fetch calls with `credentials: "include"`, restores session on mount via `/api/auth/me`, exposes `isLoading` so App.tsx can show a splash during the initial round-trip.
- LoadingSplash with progressive copy (silent → "Loading…" at 2s → "Server is waking up…" at 8s) and a 30s AbortController timeout on the `/me` call. Handles Render cold starts gracefully.
- Static-asset caching fixed in `server/index.ts`: `index.html` is `no-cache`, `/assets/*` is `immutable, max-age=1y`, SPA catch-all returns real 404 for `.css/.js/etc`. Killed the stale-cache "plain text website" issue.
- Dev workflow: `pnpm dev` now runs Vite (port 3000) + Express (port 3001) via `concurrently`, with Vite proxying `/api/*` to Express. `tsx watch` for the server side.

### Step 2c — Seed + sync
- `pnpm seed` script (`server/scripts/seed.ts`) — idempotent one-shot that:
  1. Inserts the football sport.
  2. Inserts PL + Championship competitions.
  3. Inserts the 5 tiers (Pound £1, Fiver £5, Tenner £10, Pony £25, Big One £50). Placeholder prize splits stored as jsonb on each tier.
  4. Fetches the 2025/26 season from football-data.org (2 API calls — well under the 10/min free-tier ceiling).
  5. Groups matches into 9 Rounds per competition (constants in `server/lib/rounds.ts` — PL 4-4-4-4-4-4-4-5-5, Champ 5-5-5-5-5-5-5-5-6). Upserts events keyed by football-data match id. Sets `predictionLockAt = kickoff − 1 hour`.
  6. Picks the "current Round" per competition (lowest-ordinal Round with ≥5 future kickoffs — filters out postponement stragglers; falls back to soonest-upcoming for pre-season).
  7. Creates 5 pools (one per tier) for the current Round. Late-entry window = `opensAt + 7 days`.
  8. Cleans up stale `status=open` pools that aren't for the current Round and have zero entries.
- Run on the Render web shell (`DATABASE_URL` already injected) — `pnpm seed`. Currently produces 5 open pools for **PL Round 9** (final round of 2025/26, GWs 34-38, ends Sun 24 May). Championship returns no pool — season fully complete; pools will appear when 2026/27 fixtures are seeded (football-data releases the new schedule ~June 25, 2026).

### Step 2d — Real Home page
- Two endpoints added under a new portal router mounted at `/api`:
  - `GET /api/competitions` — public. Returns `Competition[]` with current Round + 5 nested pool DTOs per competition. Returns `[]` if no comp has an open Round (between-seasons state).
  - `GET /api/entries/me` — requireAuth. Returns the user's open `pool_entries` with prediction progress (made/total). Empty until step 2e ships entry.
- Query layer in `server/lib/portal-data.ts` is reusable for Pools landing, Pool detail, Predict, History as those screens get built.
- `client/src/lib/portal-api.ts` — typed client wrappers (`fetchCompetitions`, `fetchMyEntries`). DTOs mirror the server side; keep in sync until/unless a shared types package lands.
- `HomePage.tsx` rebuilt to match arch §8.1:
  - Round header (competition + Round name + GW range + Round end date + late-entry badge — emerald when open, amber when closed)
  - "Your live entries" section — empty state for new users with a hint to pick a tier below; cards with save-progress when entries exist
  - "Available tiers" section — 5 rows showing tier name + entry count + fee + arrow
  - Three empty-state branches (0 entries + N tiers / N entries + 0 tiers / 0 + 0 = between seasons)
- Single-competition Home for now (PL only). Multi-comp Home layout is deferred (arch §14 #7).
- New stub `PoolDetailPage.tsx` at `/pools/:competitionSlug/:poolId` — clickable from Home's tier rows. Currently a "Canonical predict screen — coming soon" placeholder. Real arch §8.5 layout is step 2f+.

### Live deployment state
- Render web service deployed at `https://predictor10.com`. Build green. Renders the new Home for signed-in users showing PL Round 9 with 5 tier rows.
- Render Postgres has: 25 tables, 1 sport, 2 competitions, 5 tiers, 18 stages (9 Rounds × 2 comps), ~932 events, 5 open pools, at least 1 real user (`Wez`).
- The `ELIFECYCLE Command failed` log line ~60s after every "Service is live" is **benign Render deploy rollover** — old container being killed once the new one is healthy. Confirmed by site staying functional through it.
- Render plan: free/starter — service spins down after ~15 min idle, cold-starts take 20-60s. LoadingSplash handles this gracefully but for real users a paid tier ($7/mo Starter) eliminates it.

## Decisions made in earlier chats — DO NOT relitigate

From arch doc Decided Rules §13 + decisions made in build chats:

- Round = 4-5 GW tournament block. PL has 9 Rounds (4-4-4-4-4-4-4-5-5 GWs). Champ has 9 Rounds (5-5-5-5-5-5-5-5-6 MDs).
- One stake per Round covers all matches in it.
- Late entry allowed for 7 days after Round opens, with explicit warning modal.
- Predictions lock 1 hour before each match's individual kickoff. Server rejects predictions for already-played matches with HTTP 403.
- Tie-breaker: pts → exact-score count → correct-result count → split.
- 5 tiers visible day one: The Pound (£1), The Fiver (£5), The Tenner (£10), The Pony (£25), The Big One (£50).
- Multi-entry: one entry per pool, but multiple tiers and multiple competitions concurrent OK.
- MVP competitions: Premier League + EFL Championship only. World Cup, League One, all other comps out of scope.
- Settled pools archive immediately to `/account/history`.
- Combined Pool/Predict screen on one URL: `/pools/:competitionSlug/:poolId`.
- Prize structure (% splits, operator commission): TBD — defer until pre-launch. Placeholder splits in seed.
- **No more mock data. Everything is live from DB / football-data.** Phase 1 + Phase 2 collapsed.
- **Resend deferred to pre-launch.** No verification emails sent yet. Signup creates an unverified account that can use the product. `RESEND_API_KEY` not in env yet.
- **`BYPASS_LATE_ENTRY=true` in Render env** allows entries after the 7-day late-entry window has closed. Used for testing Round 9 of 2025/26 right now (real window closed Apr 28). Per-match anti-cheat lock (Decided Rule #7) always on regardless.

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
- **Render deploys with `--frozen-lockfile`.** Whenever `package.json` changes, ship `pnpm-lock.yaml` in the same batch or the build fails with `ERR_PNPM_OUTDATED_LOCKFILE`.

## What's next — step 2e

**Pool entry flow.** First moment a user can actually enter a pool. Files needed:
- `POST /api/pools/:id/enter` — server endpoint that:
  - Validates pool is `status='open'` and within late-entry window (or `BYPASS_LATE_ENTRY=true`)
  - Creates a `payments` row with `mode='mock'`, `status='succeeded'`, `direction='debit'`, amount = tier entry fee
  - Creates a `pool_entries` row referencing the payment
  - Returns the new entry id + a hint to redirect to the pool detail page
- Late-entry warning modal (arch §4) — appears if entering past `opensAt + 7 days` (only reachable via BYPASS in dev). Acknowledges scoring 0 on already-played matches.
- `PoolDetailPage.tsx` — replace stub with a minimal entry-flow page. Big "Enter — £X" CTA. Full canonical Predict screen (arch §8.5) is step 2f+.
- Wire `HomePage.tsx`: after successful entry, refresh `fetchCompetitions` + `fetchMyEntries` so the "Available tiers" row disappears and the "Your live entries" card appears.

## What to do first

1. Read all three docs in `/docs/` (architecture first).
2. Skim the recent file edits to understand the current shape — particularly `server/lib/portal-data.ts`, `client/src/lib/portal-api.ts`, `server/routes/auth.ts`, and the current `HomePage.tsx`.
3. Propose your file plan for step 2e in tabular form with folder paths.
4. Wait for me to say "go" before bulk-changing files.

Don't ask 5 clarifying questions before starting. Read the docs, make a recommendation, I'll push back if it's wrong.
