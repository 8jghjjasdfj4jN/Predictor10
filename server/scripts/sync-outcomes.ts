/*
Predictor10 — outcome sync CLI.

Run: `pnpm sync-outcomes`

One-shot. Reads DATABASE_URL + FOOTBALL_API_KEY from env (set on Render, or
.env locally). Exits 0 on success, 1 if any per-competition fetch failed.

Same logic also reachable via POST /api/admin/sync-outcomes (token-gated) —
both call the shared syncOutcomes() in server/lib/outcome-sync.ts. Use the
CLI for manual runs from the Render shell; use the HTTP endpoint for an
external scheduler.
*/

import "dotenv/config";
import { syncOutcomes } from "../lib/outcome-sync";

function log(s: string) {
  console.log(`[sync-outcomes] ${s}`);
}

(async () => {
  const startedAt = Date.now();
  log("starting…");
  try {
    const result = await syncOutcomes();
    const dur = Date.now() - startedAt;
    log(
      `done in ${dur}ms: ${result.competitionsChecked} competitions, ` +
      `${result.matchesSeen} matches seen, ` +
      `${result.outcomesWritten} new outcomes, ` +
      `${result.eventsMarkedFinished} events marked finished, ` +
      `${result.predictionsScored} predictions scored`,
    );
    if (result.errors.length > 0) {
      for (const e of result.errors) {
        console.error(`[sync-outcomes] error for ${e.competition}: ${e.message}`);
      }
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    console.error("[sync-outcomes] fatal:", err);
    process.exit(1);
  }
})();
