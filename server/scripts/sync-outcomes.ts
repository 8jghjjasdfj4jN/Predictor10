/*
Predictor10 — football-data → DB sync CLI.

Run: `pnpm sync-outcomes`

One-shot. Reads DATABASE_URL + FOOTBALL_API_KEY from env (set on Render, or
.env locally). Exits 0 on success, 1 if any per-competition fetch failed.

As of step 2l this script doesn't only sync outcomes — the same job now also
refreshes scheduled-fixture metadata (kickoff, lock, matchday, status,
inserts new matches). The CLI name `sync-outcomes` is preserved for
backwards compatibility with anything already wired to it; the summary line
surfaces both responsibilities.

Same logic also reachable via POST /api/admin/sync-outcomes (token-gated) —
both call the shared syncOutcomes() in server/lib/outcome-sync.ts. Use the
CLI for manual runs from the Render shell; use the HTTP endpoint for the
Render Cron Job.
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
      `${result.matchesSeen} matches seen`,
    );
    log(
      `  outcomes: ${result.outcomesWritten} new, ` +
      `${result.eventsMarkedFinished} events marked finished, ` +
      `${result.predictionsScored} predictions scored`,
    );
    if (result.outcomesPending > 0) {
      log(
        `  ${result.outcomesPending} finished score(s) awaiting confirmation ` +
        `(held until stable — confirm-before-commit)`,
      );
    }
    if (result.outcomeDivergencesDetected > 0) {
      log(
        `  ⚠ ${result.outcomeDivergencesDetected} score divergence alert(s) raised — ` +
        `review in Admin → Score alerts`,
      );
    }
    log(
      `  fixtures: ${result.fixturesInserted} inserted, ` +
      `${result.fixturesUpdated} updated, ` +
      `${result.fixturesUnchanged} unchanged, ` +
      `${result.fixturesSkippedFinished} skipped-finished, ` +
      `${result.fixturesSkippedNoStage} skipped-no-stage`,
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
