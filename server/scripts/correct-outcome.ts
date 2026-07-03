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
import { and, eq, ilike } from "drizzle-orm";
import { db, client } from "../db";
import { competitions, events } from "../db/schema";
import { previewCorrection, applyCorrection } from "../lib/outcome-correction";

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

  // 3-6. Preview via the SHARED correction lib — the exact same compute the
  // admin panel uses, so the CLI and the panel can never drift.
  const preview = await previewCorrection(ev.id, CONFIG.correctHome, CONFIG.correctAway);
  if (!preview.hasStoredOutcome) {
    throw new Error("No stored outcome for this event yet — nothing to correct.");
  }
  log(`Stored result:    ${preview.storedHome}-${preview.storedAway}`);
  log(`Correct result:   ${CONFIG.correctHome}-${CONFIG.correctAway}`);
  if (preview.anySettled && !FORCE) {
    throw new Error(
      "A pool on this event is already settled — payouts may be banked. " +
        "Re-run with --force only after a considered settled-correction plan.",
    );
  }
  log("─".repeat(64));

  if (preview.outcomeAlreadyRight && preview.changedCount === 0) {
    log("Nothing to do — stored result is already correct and all points match.");
    return;
  }

  // Show the change table.
  log(`Predictions on this match: ${preview.changes.length}`);
  log("");
  log("  Player                Pick    Old → New   ");
  log("  ──────────────────────────────────────────");
  for (const c of preview.changes) {
    const name = (c.name ?? "—").padEnd(20).slice(0, 20);
    const pick = c.pick.padEnd(6);
    const arrow = c.changed ? `${c.oldPoints ?? "—"} → ${c.newPoints}` : `${c.newPoints} (same)`;
    const flag = c.changed ? "  ✱" : "";
    log(`  ${name}  ${pick}  ${arrow}${flag}`);
  }
  log("");
  log(`${preview.changedCount} prediction(s) would change. ✱ = changes.`);
  log("─".repeat(64));

  if (!APPLY) {
    log("DRY RUN — nothing written. Re-run with --apply to commit the correction.");
    return;
  }

  // 7. Apply via the shared lib (transaction + audit row inside).
  const result = await applyCorrection({
    eventId: ev.id,
    correctHome: CONFIG.correctHome,
    correctAway: CONFIG.correctAway,
    reason: CONFIG.reason,
    force: FORCE,
    actorUserId: null,
    actorLabel: "admin-shell",
    source: "admin-shell",
  });

  log(
    `APPLIED — result corrected to ${result.correctHome}-${result.correctAway}, ` +
      `${result.rescored} prediction(s) re-scored, audit row written.`,
  );
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
