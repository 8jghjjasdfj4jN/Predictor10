/*
Predictor10 — pool settlement CLI.

Run: `pnpm settle-pools`

One-shot. Reads DATABASE_URL from env (set on Render, or .env locally).
Exits 0 on success (including "nothing ready to settle yet"), 1 if any
per-pool transaction failed.

Same logic also reachable via POST /api/admin/settle-pools (token-gated) —
both call settleAllReadyPools() in server/lib/pool-settle.ts. Use the CLI
for manual runs from the Render shell; use the HTTP endpoint for an
external scheduler.

Round 9 of 2025/26 doesn't fully complete until 24 May 2026 (real time),
so during initial testing this will report 0 settled — that confirms the
gate clause (Decided Rule #13) is doing its job and not prematurely
settling on the postponed/unscheduled tail of the Round.
*/

import "dotenv/config";
import { settleAllReadyPools } from "../lib/pool-settle";

function log(s: string) {
  console.log(`[settle-pools] ${s}`);
}

(async () => {
  const startedAt = Date.now();
  log("starting…");
  try {
    const result = await settleAllReadyPools();
    const dur = Date.now() - startedAt;
    log(
      `done in ${dur}ms: ${result.poolsChecked} unsettled, ` +
      `${result.poolsReady} ready, ` +
      `${result.poolsSettled} settled this run, ` +
      `${result.entriesSettled} entries marked, ` +
      `${result.payoutsWritten} payouts written` +
      (result.zeroEntryPools > 0 ? `, ${result.zeroEntryPools} zero-entry` : ""),
    );
    if (result.errors.length > 0) {
      for (const e of result.errors) {
        console.error(`[settle-pools] error for pool ${e.poolId}: ${e.message}`);
      }
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    console.error("[settle-pools] fatal:", err);
    process.exit(1);
  }
})();
