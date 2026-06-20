# New-chat handoff prompt (paste this into a fresh chat)

I'm Wez, solo dev of **Predictor10** (predictor10.com) — a UK football pool-betting app heading for a UKGC general pool betting licence. You're picking up an in-flight build.

**Before anything else, read the docs in `/docs/` in this order:** `portal-architecture.md` (design canon), `handoff-prompt.md` (chronological build history + routes/endpoints + "What to do first"), `roadmap.md`, `pre-launch.md`, and `wc-chat-teardown.md`. Don't propose changes until you've read them.

**Most recent state: step 3b — Eliminator10, launched 20 June 2026.** This is a second game mode alongside the score-prediction pools: a last-survivor **elimination** game (pick one team to win each round; win in normal time survives; loss/draw/no-pick out; one team only once; last entrant wins). Full canon is **architecture §22**. It's live for the WC as a **free** demo (`world-cup-2026-eliminator`, 24 rounds, Round 1 = the Spain matchday, locks Sun 21 Jun 17:00), built **PL-ready** (free now → real fee + 75/25 pot later). Note the trademark wording: it's an **"elimination game" / "outlast the field"**, never "last man standing".

**Stack:** TypeScript monorepo · React 19 + Vite + Tailwind v4 + Wouter · Express · Drizzle ORM · Postgres · Render. Fixtures from football-data.org. pnpm, frozen-lockfile CI, Node pinned 22.

**How I work (please follow):**
- Deliver complete replacement files (I drag them into GitHub Desktop), presented as a **File | Folder | Action** table. No partial diffs.
- **Recommend, don't give menus.** Push back once if you disagree, then execute on "go" / "gp" without relitigating. No bulk file changes before approval.
- **Verify before every delivery:** `pnpm install --frozen-lockfile` clean + `pnpm build` exit 0 + **zero new tsc errors (baseline 15)**.
- Ship `pnpm-lock.yaml` in the same batch as any `package.json` change. Flag when a change needs `pnpm db:push` or `pnpm seed` (I run them in Render Shell). DB ops are psql one-liners: `psql "$DATABASE_URL" -c "..."`.
- **Never touch `vite.config.ts` or `client/index.html`** without flagging the step-2v crossorigin fix (iPhone-refresh risk).
- Mobile-first (480px max column, 44px tap targets, safe-area). I test on my phone after deploy.
- Don't relitigate locked decisions (see handoff "Decisions ... DO NOT relitigate" + the P3 score-correction gap, which is closed).
- Update all docs + write a fresh new-chat prompt at the end of a working session.

**Likely next candidates** (ask me which): Eliminator paid-PL flip (real fee + 75/25 pot + the LCCP 4.2.9 rules-display copy — see pre-launch §3); the pre-Final settled-pool-visibility change (arch §15); WC retirement after the Final ~19–22 July (trigger "Read arch §15 and prepare the WC retirement files"); Resend + email verification (last pre-licence code blocker); UKGC application narrative.

Start by confirming you've read the docs and tell me the current state back in your own words, then ask what I want to work on.
