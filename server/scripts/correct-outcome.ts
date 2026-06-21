/*
Predictor10 — one-off result correction tool.

WHY THIS EXISTS
---------------
`event_outcomes` is first-write-wins (server/lib/outcome-sync.ts): once a score
is recorded it is never silently overwritten, so a transient bad football-data
value can't rewrite a finished result and reshuffle a table on its own. That is
the right default. But it means a *genuine* post-whistle correction (e.g. a goal
chalked off by VAR after football-data first published full-time) has to be
applied deliberately, by hand, and recorded — never automatically. This tool is
that deliberate, recorded path (arch §14 "score-correction reconciliation must
be a manual-review tool, never a silent auto-overwrite").

WHAT IT DOES
------------
1. Finds ONE event by competition slug + team-name match.
2. Shows the currently-stored outcome and every prediction that would change if
   the outcome were the corrected score — WITHOUT writing anything (dry run).
3. Only when run with `--apply` does it, in a single transaction:
     - correct the stored `event_outcomes` row to the right score,
     - re-score every prediction on that event using the SAME `scorePrediction`
       function the live engine uses (so the re-score can never drift from it),
     - write an `audit_log` row recording who/what/before/after/why.

It does NOT call football-data and does NOT trust any external feed — you supply
the correct score in the CONFIG block below, so the result is deterministic.

SAFETY
------
- Dry run is the default. Nothing changes unless you pass `--apply`.
- Aborts unless EXACTLY ONE event matches (no guessing).
- Aborts if the event's pool is already `settled` (payouts may be banked) unless
  you also pass `--force` — settled corrections need a separate, considered pass.
- Idempotent: if the stored score already equals the correct score and every
  prediction is already scored to match, it reports "nothing to do" and exits.

RUN
---
  Dry run (safe preview):   pnpm tsx server/scripts/correct-outcome.ts
  Apply the correction:     pnpm tsx server/scripts/correct-outcome.ts --apply

Reads DATABASE_URL from env (set on Render, or .env locally). Exit 0 on success.
*/

import "dotenv/config";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { db, client } from "../db";
import {
  competitions,
  events,
  eventOutcomes,
  predictions,
  pools,
  poolEntries,
  users,
  auditLog,
} from "../db/schema";
import { scorePrediction } from "../lib/outcome-sync";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — defaults for the current incident. Each can be overridden by a CLI
// flag (see below), so future corrections need no file edit:
//
//   pnpm tsx server/scripts/correct-outcome.ts \
//     --comp=world-cup-2026 --home-like=Brazil --away-like=Serbia \
//     --home=2 --away=0 --reason="VAR correction" [--apply] [--force]
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULTS = {
  competitionSlug: "world-cup-2026",
  // Case-insensitive substring match on the stored team names.
  homeTeamLike: "Spain",
  awayTeamLike: "Saudi",
  // The CORRECT 90-minute (regulation) score. Predictor10 scores on FT only.
  correctHome: 4,
  correctAway: 0,
  // Recorded in the audit trail. Be specific — this is the regulator-facing why.
  reason:
    "VAR correction: football-data briefly published full-time as 5-0 before a " +
    "goal was disallowed for offside; first-write-wins recorded the 5-0. " +
    "Corrected to the official 90-minute result 4-0 and re-scored affected " +
    "predictions. World Cup pool not settled at time of correction.",
} as const;

function argVal(name: string): string | undefined {
  const pre = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pre));
  return hit ? hit.slice(pre.length) : undefined;
}

const CONFIG = {
  competitionSlug: argVal("comp") ?? DEFAULTS.competitionSlug,
  homeTeamLike: argVal("home-like") ?? DEFAULTS.homeTeamLike,
  awayTeamLike: argVal("away-like") ?? DEFAULTS.awayTeamLike,
  correctHome: argVal("home") !== undefined ? Number(argVal("home")) : DEFAULTS.correctHome,
  correctAway: argVal("away") !== undefined ? Number(argVal("away")) : DEFAULTS.correctAway,
  reason: argVal("reason") ?? DEFAULTS.reason,
} as const;

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

function log(s = "") {
  console.log(s);
}

async function main() {
  if (!Number.isInteger(CONFIG.correctHome) || !Number.isInteger(CONFIG.correctAway)) {
    throw new Error("--home and --away must be whole numbers (e.g. --home=4 --away=0).");
  }
  log(`Predictor10 result correction — ${APPLY ? "APPLY" : "DRY RUN"}`);
  log("─".repeat(64));

  // 1. Resolve the competition.
  const [comp] = await db
    .select({ id: competitions.id, name: competitions.name })
    .from(competitions)
    .where(eq(competitions.slug, CONFIG.competitionSlug))
    .limit(1);
  if (!comp) {
    throw new Error(`No competition with slug '${CONFIG.competitionSlug}'.`);
  }

  // 2. Find the event — must be exactly one.
  const matched = await db
    .select({
      id: events.id,
      homeTeam: events.homeTeam,
      awayTeam: events.awayTeam,
      kickoffAt: events.kickoffAt,
      status: events.status,
    })
    .from(events)
    .where(
      and(
        eq(events.competitionId, comp.id),
        ilike(events.homeTeam, `%${CONFIG.homeTeamLike}%`),
        ilike(events.awayTeam, `%${CONFIG.awayTeamLike}%`),
      ),
    );

  if (matched.length === 0) {
    throw new Error(
      `No event in ${comp.name} matching home ~ '${CONFIG.homeTeamLike}', away ~ '${CONFIG.awayTeamLike}'.`,
    );
  }
  if (matched.length > 1) {
    log("Refusing to run — more than one event matched:");
    for (const e of matched) {
      log(`  • ${e.homeTeam} v ${e.awayTeam} (${e.kickoffAt.toISOString()})`);
    }
    throw new Error("Narrow the team-name filters in CONFIG so exactly one matches.");
  }
  const ev = matched[0];
  log(`Match:   ${ev.homeTeam} v ${ev.awayTeam}`);
  log(`Kickoff: ${ev.kickoffAt.toISOString()}`);
  log(`Status:  ${ev.status}`);

  // 3. Current stored outcome.
  const [outcome] = await db
    .select({ home: eventOutcomes.homeScore, away: eventOutcomes.awayScore })
    .from(eventOutcomes)
    .where(eq(eventOutcomes.eventId, ev.id))
    .limit(1);
  if (!outcome) {
    throw new Error("No stored outcome for this event yet — nothing to correct.");
  }
  log(`Stored result:    ${outcome.home}-${outcome.away}`);
  log(`Correct result:   ${CONFIG.correctHome}-${CONFIG.correctAway}`);
  log("─".repeat(64));

  // 4. Pool settled guard — find the pool(s) these predictions belong to.
  const predRows = await db
    .select({
      id: predictions.id,
      poolId: predictions.poolId,
      home: predictions.homeScorePredicted,
      away: predictions.awayScorePredicted,
      oldPoints: predictions.pointsAwarded,
      userName: users.nickname,
      userDisplay: users.displayName,
    })
    .from(predictions)
    .innerJoin(users, eq(users.id, predictions.userId))
    .where(eq(predictions.eventId, ev.id));

  const poolIds = Array.from(new Set(predRows.map((p) => p.poolId)));
  if (poolIds.length > 0) {
    const poolRows = await db
      .select({ id: pools.id, status: pools.status })
      .from(pools)
      .where(inArray(pools.id, poolIds));
    const settled = poolRows.filter((p) => p.status === "settled");
    if (settled.length > 0 && !FORCE) {
      throw new Error(
        `${settled.length} pool(s) on this event are already settled — payouts may be banked. ` +
          `Re-run with --force only after a considered settled-correction plan.`,
      );
    }
  }

  // 5. Compute the re-score for each prediction (using the real engine).
  const corrected = { homeScore: CONFIG.correctHome, awayScore: CONFIG.correctAway };
  const changes = predRows.map((p) => {
    const s = scorePrediction({ homeScore: p.home, awayScore: p.away }, corrected);
    return {
      ...p,
      name: p.userName ?? p.userDisplay,
      newPoints: s.points,
      isExact: s.isExact,
      isCorrectResult: s.isCorrectResult,
      changed: p.oldPoints !== s.points,
    };
  });

  const outcomeAlreadyRight =
    outcome.home === CONFIG.correctHome && outcome.away === CONFIG.correctAway;
  const anyPredChanges = changes.some((c) => c.changed);

  if (outcomeAlreadyRight && !anyPredChanges) {
    log("Nothing to do — stored result is already correct and all points match.");
    return;
  }

  // 6. Show the change table.
  log(`Predictions on this match: ${changes.length}`);
  log("");
  log("  Player                Pick    Old → New   ");
  log("  ──────────────────────────────────────────");
  for (const c of changes) {
    const name = (c.name ?? "—").padEnd(20).slice(0, 20);
    const pick = `${c.home}-${c.away}`.padEnd(6);
    const arrow = c.changed ? `${c.oldPoints ?? "—"} → ${c.newPoints}` : `${c.newPoints} (same)`;
    const flag = c.changed ? "  ✱" : "";
    log(`  ${name}  ${pick}  ${arrow}${flag}`);
  }
  log("");
  const changedCount = changes.filter((c) => c.changed).length;
  log(`${changedCount} prediction(s) would change. ✱ = changes.`);
  log("─".repeat(64));

  if (!APPLY) {
    log("DRY RUN — nothing written. Re-run with --apply to commit the correction.");
    return;
  }

  // 7. Apply, transactionally, with an audit row.
  await db.transaction(async (tx) => {
    await tx
      .update(eventOutcomes)
      .set({ homeScore: CONFIG.correctHome, awayScore: CONFIG.correctAway })
      .where(eq(eventOutcomes.eventId, ev.id));

    for (const c of changes) {
      if (!c.changed) continue;
      await tx
        .update(predictions)
        .set({
          pointsAwarded: c.newPoints,
          isExact: c.isExact,
          isCorrectResult: c.isCorrectResult,
        })
        .where(eq(predictions.id, c.id));
    }

    await tx.insert(auditLog).values({
      userId: null,
      action: "admin.action",
      entityType: "event_outcome",
      entityId: ev.id,
      before: {
        homeScore: outcome.home,
        awayScore: outcome.away,
      },
      after: {
        homeScore: CONFIG.correctHome,
        awayScore: CONFIG.correctAway,
      },
      ipAddress: "admin-shell-outcome-correction",
      metadata: {
        match: `${ev.homeTeam} v ${ev.awayTeam}`,
        reason: CONFIG.reason,
        predictionsRescored: changedCount,
        tool: "server/scripts/correct-outcome.ts",
      },
    });
  });

  log(`APPLIED — result corrected to ${CONFIG.correctHome}-${CONFIG.correctAway}, ` +
    `${changedCount} prediction(s) re-scored, audit row written.`);
}

main()
  .then(async () => {
    await client.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("\nCorrection failed:", err instanceof Error ? err.message : err);
    await client.end();
    process.exit(1);
  });
