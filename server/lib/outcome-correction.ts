/*
Predictor10 — shared result-correction logic (step 3b.16).

WHY THIS EXISTS
---------------
Correcting a recorded result is a deliberate, audited act — never a silent
auto-overwrite from the feed (arch §24). There are now TWO deliberate entry
points that must behave IDENTICALLY:
  • the admin panel ("Correct score" on a live-pool score alert), and
  • the command-line tool (server/scripts/correct-outcome.ts).
Both call the functions here, so the re-score can never drift between them. The
actual per-prediction scoring always goes through the same `scorePrediction`
the live engine uses.

WHAT A CORRECTION DOES (unchanged from the CLI):
  1. Sets `event_outcomes` to the supplied correct score.
  2. Re-scores EVERY prediction on that event via `scorePrediction` — points are
     both removed (from players who matched the old wrong score) and added (to
     players who match the corrected score). The league table is the sum of
     these, so it self-corrects on next read; the pot is untouched.
  3. Writes an audit row (who/what/before/after/why).

SAFETY
  • Refuses if there's no stored outcome to correct (NO_OUTCOME).
  • Refuses if any pool on the event is already `settled` unless `force` is set
    (SETTLED) — settled pools have banked ranks/payouts and need the separate,
    considered settled-correction pass (not built; see pre-launch §3). The admin
    panel never passes force; only the CLI can, deliberately.
  • Idempotent: if the stored score already equals the correct score and every
    prediction already matches, `changedCount` is 0 and apply is a no-op write
    of the (identical) outcome + audit.
*/

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { events, eventOutcomes } from "../db/schema/sports";
import { predictions, pools } from "../db/schema/pools";
import { users } from "../db/schema/users";
import { auditLog } from "../db/schema/compliance";
import { scorePrediction } from "./outcome-sync";

export type CorrectionErrorCode = "NOT_FOUND" | "NO_OUTCOME" | "SETTLED" | "BAD_SCORE";

export class CorrectionError extends Error {
  code: CorrectionErrorCode;
  constructor(code: CorrectionErrorCode, message: string) {
    super(message);
    this.name = "CorrectionError";
    this.code = code;
  }
}

export type CorrectionChange = {
  predictionId: string;
  name: string;
  pick: string; // "2-1"
  oldPoints: number | null;
  newPoints: number;
  isExact: boolean;
  isCorrectResult: boolean;
  changed: boolean;
};

export type CorrectionPreview = {
  eventId: string;
  match: string; // "Portugal v Croatia"
  storedHome: number | null;
  storedAway: number | null;
  correctHome: number;
  correctAway: number;
  hasStoredOutcome: boolean;
  outcomeAlreadyRight: boolean;
  changes: CorrectionChange[];
  changedCount: number;
  poolStatuses: string[];
  anySettled: boolean;
};

function assertValidScore(home: number, away: number): void {
  if (
    !Number.isInteger(home) ||
    !Number.isInteger(away) ||
    home < 0 ||
    away < 0 ||
    home > 99 ||
    away > 99
  ) {
    throw new CorrectionError("BAD_SCORE", "Scores must be whole numbers from 0 to 99.");
  }
}

/**
 * Compute what a correction WOULD do — no writes. Powers the panel preview and
 * the CLI dry-run.
 */
export async function previewCorrection(
  eventId: string,
  correctHome: number,
  correctAway: number,
): Promise<CorrectionPreview> {
  assertValidScore(correctHome, correctAway);

  const [ev] = await db
    .select({ id: events.id, homeTeam: events.homeTeam, awayTeam: events.awayTeam, stageId: events.stageId })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!ev) {
    throw new CorrectionError("NOT_FOUND", "Match not found.");
  }

  const [outcome] = await db
    .select({ home: eventOutcomes.homeScore, away: eventOutcomes.awayScore })
    .from(eventOutcomes)
    .where(eq(eventOutcomes.eventId, eventId))
    .limit(1);

  const predRows = await db
    .select({
      id: predictions.id,
      home: predictions.homeScorePredicted,
      away: predictions.awayScorePredicted,
      oldPoints: predictions.pointsAwarded,
      nickname: users.nickname,
      displayName: users.displayName,
    })
    .from(predictions)
    .innerJoin(users, eq(users.id, predictions.userId))
    .where(eq(predictions.eventId, eventId));

  const corrected = { homeScore: correctHome, awayScore: correctAway };
  const changes: CorrectionChange[] = predRows.map((p) => {
    const s = scorePrediction({ homeScore: p.home, awayScore: p.away }, corrected);
    return {
      predictionId: p.id,
      name: p.nickname ?? p.displayName ?? "—",
      pick: `${p.home}-${p.away}`,
      oldPoints: p.oldPoints,
      newPoints: s.points,
      isExact: s.isExact,
      isCorrectResult: s.isCorrectResult,
      changed: p.oldPoints !== s.points,
    };
  });

  // Pool statuses on this event's Round (for the settled guard + UI context).
  let poolStatuses: string[] = [];
  if (ev.stageId) {
    const poolRows = await db
      .select({ status: pools.status })
      .from(pools)
      .where(eq(pools.stageId, ev.stageId));
    poolStatuses = poolRows.map((p) => p.status);
  }

  return {
    eventId,
    match: `${ev.homeTeam} v ${ev.awayTeam}`,
    storedHome: outcome?.home ?? null,
    storedAway: outcome?.away ?? null,
    correctHome,
    correctAway,
    hasStoredOutcome: Boolean(outcome),
    outcomeAlreadyRight: Boolean(outcome) && outcome.home === correctHome && outcome.away === correctAway,
    changes,
    changedCount: changes.filter((c) => c.changed).length,
    poolStatuses,
    anySettled: poolStatuses.includes("settled"),
  };
}

export type ApplyCorrectionInput = {
  eventId: string;
  correctHome: number;
  correctAway: number;
  reason: string;
  force?: boolean; // only the CLI passes this; the panel never does
  actorUserId?: string | null;
  actorLabel: string; // email or "admin-shell" — recorded in the audit trail
  source: "admin-panel" | "admin-shell";
};

export type ApplyCorrectionResult = {
  match: string;
  rescored: number;
  correctHome: number;
  correctAway: number;
};

/**
 * Apply a correction, transactionally, with an audit row. Throws CorrectionError
 * on the guard conditions above.
 */
export async function applyCorrection(input: ApplyCorrectionInput): Promise<ApplyCorrectionResult> {
  const reason = input.reason?.trim() ?? "";
  if (reason.length < 3) {
    throw new CorrectionError("BAD_SCORE", "A reason is required (at least 3 characters).");
  }

  const preview = await previewCorrection(input.eventId, input.correctHome, input.correctAway);
  if (!preview.hasStoredOutcome) {
    throw new CorrectionError("NO_OUTCOME", "No stored result for this match yet — nothing to correct.");
  }
  if (preview.anySettled && !input.force) {
    throw new CorrectionError(
      "SETTLED",
      "A pool on this match has already settled — its result and any payout are final. Settled corrections need the separate reversal process.",
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(eventOutcomes)
      .set({ homeScore: input.correctHome, awayScore: input.correctAway })
      .where(eq(eventOutcomes.eventId, input.eventId));

    for (const c of preview.changes) {
      if (!c.changed) continue;
      await tx
        .update(predictions)
        .set({
          pointsAwarded: c.newPoints,
          isExact: c.isExact,
          isCorrectResult: c.isCorrectResult,
        })
        .where(eq(predictions.id, c.predictionId));
    }

    await tx.insert(auditLog).values({
      userId: input.actorUserId ?? null,
      action: "admin.action",
      entityType: "event_outcome",
      entityId: input.eventId,
      before: { homeScore: preview.storedHome, awayScore: preview.storedAway },
      after: { homeScore: input.correctHome, awayScore: input.correctAway },
      ipAddress: input.source === "admin-shell" ? "admin-shell-outcome-correction" : "admin-panel-outcome-correction",
      metadata: {
        kind: "outcome_correction",
        source: input.source,
        match: preview.match,
        reason,
        predictionsRescored: preview.changedCount,
        forced: Boolean(input.force),
        performedBy: input.actorUserId ?? null,
        performedByLabel: input.actorLabel,
        tool: input.source === "admin-shell" ? "server/scripts/correct-outcome.ts" : "admin-panel",
      },
    });
  });

  return {
    match: preview.match,
    rescored: preview.changedCount,
    correctHome: input.correctHome,
    correctAway: input.correctAway,
  };
}
