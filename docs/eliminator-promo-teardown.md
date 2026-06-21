# Eliminator10 launch promo — teardown runbook

**What:** A temporary, one-time welcome modal (step 3b.6) that announces
Eliminator10 on app open, points to the lobby, and shows the soonest "entries
close" date. Device-scoped (localStorage), shows once per browser.

**Target removal:** ~**Mon 29 Jun 2026** (after the WC Knockout entries close,
Sun 28 Jun 19:00 UTC). Delete it then.

## Safety nets (so it's harmless if teardown slips)
- **Auto-hides** after `PROMO_EXPIRES_AT` = `2026-06-28T19:00:00Z`
  (in `EliminatorPromoModal.tsx`).
- **Only shows while a game is open to join** — once entries close everywhere it
  won't appear, and it never shows to players already entered.
- **Once per device** — `localStorage` key `p10_elim_promo_seen_v1`, then never
  again.

## To remove cleanly (code-only — no DB / seed / schema)
1. Delete `client/src/components/predictor10/EliminatorPromoModal.tsx`.
2. In `client/src/pages/portal/HomePage.tsx`, remove the two sentinel-fenced
   blocks (search `BEGIN TEMP: Eliminator10 launch promo`):
   - the `import { EliminatorPromoModal } …` block, and
   - the `<EliminatorPromoModal />` mount block.
3. Verify: `pnpm install --frozen-lockfile`, `pnpm build` (exit 0),
   `pnpm check` (tsc baseline **15**, zero new).

No `vite.config.ts` / `index.html` touched. The players' leftover
`localStorage` flag is harmless and can be left in place.
