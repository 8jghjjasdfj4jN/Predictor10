/*
Predictor10 — in-process scheduler (step 2o).

Runs the two background jobs on intervals directly inside the Express
server process:
  - syncOutcomes() every 5 minutes — football-data.org → DB, predictions
    scored, fixture metadata refreshed.
  - settleAllReadyPools() every 15 minutes — closes finished Rounds, ranks
    entries, writes mock payouts, archives to history.

Why in-process rather than Render Cron Jobs:
  - Predictor10 runs on Render Starter ($7/mo) — the web service is
    always-on (no idle spin-down). The same Node process that serves user
    requests also runs the scheduler; no separate cron service required.
  - Saves the $1/job/month minimum on Render Cron Jobs (2 jobs → $2/mo).
  - Logs flow into the existing web service log stream — one place to look,
    not two.
  - Same DB connection pool, same env vars, zero HTTP overhead — the
    scheduler calls the same library functions the admin endpoints call.

Tradeoffs accepted:
  - Horizontal scaling would cause duplicate runs. Starter is single-
    instance, so fine. If we ever move to Standard with autoscaling, the
    scheduler must relocate (Render Cron Jobs, instance-leader election,
    or a separate background worker service).
  - Deploys / restarts skip up to one interval. Both jobs are idempotent
    (Decided Rule #1), so the next tick catches up — no double-pay risk.

Concurrency guard:
  - Each job carries a `running` flag. If a tick fires while the previous
    run is still in-flight, the new tick is skipped and a note logged.
    Prevents pile-up on a slow run (e.g. a settle pass with many ready
    pools, or a sync stuck on a slow football-data response).

Gating:
  - Only registers when NODE_ENV === "production". `pnpm dev` (which uses
    `tsx watch`) skips the scheduler — avoids football-data.org calls
    during development and prevents repeated tsx restarts from spawning
    duplicate cron registrations.
  - Set DISABLE_SCHEDULER=true in Render env to disable in production
    (fall back to manual triggering via the admin endpoints). Useful for
    debugging or one-off pauses.

Logging policy:
  - Successful no-op ticks are silent — typical of 95% of runs (no match
    finished in the last 5 minutes; no pool ready to settle). Keeps logs
    readable.
  - Any tick that writes outcomes / scores predictions / inserts or
    updates fixtures / settles a pool / hits an error logs a single
    summary line. Errors additionally log per-cause stderr lines.
*/

import cron from "node-cron";
import { syncOutcomes } from "./outcome-sync";
import { settleAllReadyPools } from "./pool-settle";
import { settleAllReadyEliminatorRounds } from "./eliminator-settle";

// Cron expressions. node-cron uses 5-field POSIX cron (min hour dom mon dow).
const SYNC_SCHEDULE = "*/5 * * * *"; // every 5 minutes
const SETTLE_SCHEDULE = "*/15 * * * *"; // every 15 minutes

let syncRunning = false;
let settleRunning = false;

function log(msg: string) {
  console.log(`[scheduler] ${msg}`);
}

async function runSync() {
  if (syncRunning) {
    log("sync skipped — previous run still in flight");
    return;
  }
  syncRunning = true;
  const startedAt = Date.now();
  try {
    const result = await syncOutcomes();
    const dur = Date.now() - startedAt;
    const interesting =
      result.outcomesWritten > 0 ||
      result.predictionsScored > 0 ||
      result.fixturesInserted > 0 ||
      result.fixturesUpdated > 0 ||
      result.errors.length > 0;
    if (interesting) {
      log(
        `sync ${dur}ms — outcomes: ${result.outcomesWritten}, ` +
          `predictions scored: ${result.predictionsScored}, ` +
          `fixtures +${result.fixturesInserted}/~${result.fixturesUpdated} ` +
          `(${result.errors.length} errors)`,
      );
      for (const e of result.errors) {
        console.error(
          `[scheduler] sync error for ${e.competition}: ${e.message}`,
        );
      }
    }
  } catch (err) {
    console.error("[scheduler] sync fatal:", err);
  } finally {
    syncRunning = false;
  }
}

async function runSettle() {
  if (settleRunning) {
    log("settle skipped — previous run still in flight");
    return;
  }
  settleRunning = true;
  const startedAt = Date.now();
  try {
    const result = await settleAllReadyPools();
    const elim = await settleAllReadyEliminatorRounds();
    const dur = Date.now() - startedAt;
    if (result.poolsSettled > 0 || result.errors.length > 0) {
      log(
        `settle ${dur}ms — ${result.poolsSettled} pools settled, ` +
          `${result.entriesSettled} entries, ` +
          `${result.payoutsWritten} payouts ` +
          `(${result.errors.length} errors)`,
      );
      for (const e of result.errors) {
        console.error(
          `[scheduler] settle error for pool ${e.poolId}: ${e.message}`,
        );
      }
    }
    if (elim.roundsSettled > 0 || elim.gamesSettled > 0 || elim.errors.length > 0) {
      log(
        `eliminator ${dur}ms — ${elim.roundsSettled} round(s) settled, ` +
          `${elim.eliminated} eliminated, ${elim.gamesSettled} game(s) won ` +
          `(${elim.errors.length} errors)`,
      );
      for (const e of elim.errors) {
        console.error(`[scheduler] eliminator error for round ${e.roundId}: ${e.message}`);
      }
    }
  } catch (err) {
    console.error("[scheduler] settle fatal:", err);
  } finally {
    settleRunning = false;
  }
}

/**
 * Wire the two cron schedules. Call once on server startup.
 * Safe to call in any environment — internally gated on NODE_ENV.
 */
export function startScheduler() {
  if (process.env.NODE_ENV !== "production") {
    log(`not started — NODE_ENV='${process.env.NODE_ENV ?? "undefined"}' (dev/test)`);
    return;
  }
  if (process.env.DISABLE_SCHEDULER === "true") {
    log("not started — DISABLE_SCHEDULER=true");
    return;
  }
  cron.schedule(SYNC_SCHEDULE, runSync);
  cron.schedule(SETTLE_SCHEDULE, runSettle);
  log(
    `started — sync ${SYNC_SCHEDULE} (every 5m), settle ${SETTLE_SCHEDULE} (every 15m)`,
  );
}
