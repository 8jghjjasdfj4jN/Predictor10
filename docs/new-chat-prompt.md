# New-chat handoff prompt (paste this into a fresh chat)

I'm Wez, solo dev of **Predictor10** (predictor10.com) — a UK football pool-betting app heading for a UKGC general pool betting licence. You're picking up an in-flight build.

**Before anything else, read the docs in `/docs/` in this order:** `portal-architecture.md` (design canon — note §1 licence-first prime directive, §15 WC retirement, §22 Eliminator10, §24 outcome integrity, §25 player removal/void), `handoff-prompt.md` (chronological build history + routes/endpoints + "What to do first"), `roadmap.md`, `pre-launch.md`, and `wc-chat-teardown.md`. Don't propose changes until you've read them.

**Most recent state: step 3b.14 — admin "Remove from pool" = audited entry void (22 June 2026).** First player-removal tool, built licence-clean. A licensed operator never hard-deletes a player/stake (records retained ≈5yr; GDPR erasure overridden for legally-retained data; removals must be reasoned, audit-logged actions, not DB edits), so "remove" = **void + retain**, never delete. `pool_entries` gains `voided_at` / `voided_by` / `void_reason` (**`pnpm db:push` already run in Render**). A voided entry drops from the pot (so the displayed pot + 60/25/15 splits self-correct — pot is `fee × live entry count`), standings, the player's own entries, entrant access-gates, opponent-picks view, and settlement scoring; the row + payment + audit trail are retained. Admin route `POST /entries/:entryId/void` (reason required, 409 on settled, idempotent, audited) + `GET /users/:id/entries`, surfaced as a per-player "Remove from pool" button + reason modal. Used to remove the unpaid/non-predicting WC entrant "terterter". Full canon: **architecture §25**. **Key invariant:** any new code that counts entries / builds standings / scores must add `isNull(poolEntries.voidedAt)`. Deferred: the temporary chat entrant-gate isn't voided-aware (harmless; chat is scheduled for teardown).

**Before that, step 3b.13 — outcome-recording integrity (21 June 2026).** After a live incident (WC opener Spain 4-0 Saudi recorded as 5-0 from a transient football-data value disallowed by VAR, stuck via first-write-wins): **confirm-before-commit** (a finished score is buffered in `event_outcome_observations` and only committed/scored once stable across sync passes), first-write-wins immutability kept, a **divergence alert** (Admin → Score alerts), and an audited manual **correction tool** (`server/scripts/correct-outcome.ts`). Full canon **arch §24**. Also: tsc baseline is now **0** (was 15); `.gitattributes` forces LF. The P3 score-correction gap is **RESOLVED** — don't describe it as open, and don't re-open the "never silent auto-overwrite" principle.

**Before that, step 3b — Eliminator10, launched 20 June 2026.** A second game mode alongside the score pools: a last-survivor **elimination** game (pick one team to win each round; win in normal time survives; loss/draw/no-pick out; one team only once; last entrant wins). Full canon **arch §22**. Live for the WC as a **free** demo (`world-cup-2026-eliminator`, 24 rounds, Round 1 = the Spain matchday), built **PL-ready** (free now → real fee + 75/25 pot later). Trademark wording: an **"elimination game" / "outlast the field"**, never "last man standing".

**Stack:** TypeScript monorepo · React 19 + Vite + Tailwind v4 + Wouter · Express · Drizzle ORM · Postgres · Render. Fixtures from football-data.org. pnpm, frozen-lockfile CI, Node pinned 22.

**How I work (please follow):**
- Deliver complete replacement files (I drag them into GitHub Desktop), presented as a **File | Folder | Action** table. No partial diffs.
- **Recommend, don't give menus.** Push back once if you disagree, then execute on "go" / "gp" without relitigating. No bulk file changes before approval.
- **Verify before every delivery:** `pnpm install --frozen-lockfile` clean + `pnpm build` exit 0 + **zero tsc errors (baseline 0)**.
- Ship `pnpm-lock.yaml` in the same batch as any `package.json` change. Flag when a change needs `pnpm db:push` or `pnpm seed` (I run them in Render Shell). DB ops are psql one-liners: `psql "$DATABASE_URL" -c "..."`.
- **Never touch `vite.config.ts` or `client/index.html`** without flagging the step-2v crossorigin fix (iPhone-refresh risk).
- Mobile-first (480px max column, 44px tap targets, safe-area). I test on my phone after deploy.
- Don't relitigate locked decisions (see handoff "Decisions ... DO NOT relitigate").
- Update all docs + write a fresh new-chat prompt at the end of a working session.

**Live trip-wires:** EliminatorPromoModal auto-hides Sun 28 Jun 19:00 UTC, teardown ~29 Jun (`eliminator-promo-teardown.md`); the **pre-Final settled-pool-visibility fix (arch §15) must land before the WC Final settles ~19–22 July** or the WC pool auto-vanishes.

**Likely next candidates** (ask me which): the pre-Final settled-pool-visibility change (arch §15, agreed, awaiting go); WC retirement after the Final ~19–22 July (trigger "Read arch §15 and prepare the WC retirement files"); Eliminator paid-PL flip (real fee + 75/25 pot + LCCP 4.2.9 rules-display copy — see pre-launch §3); Resend + email verification (last pre-licence code blocker); settlement-grade dual-source data (arch §24); the governed in-app late-entry action (pre-launch §3, analogous to the §25 removal tool); UKGC application narrative.

Start by confirming you've read the docs and tell me the current state back in your own words, then ask what I want to work on.
