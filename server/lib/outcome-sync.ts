/*
Predictor10 — football-data.org → DB sync (step 2l; per-comp season in step 3a.5).

What it does on every run (one HTTP call per active competition):
  1. **Outcomes & scoring (the original responsibility)**
     For every FINISHED match in the response: upsert `event_outcomes`,
     mark `events.status = 'finished'`, score any unscored predictions
     (5 / 2 / 0 per Decided Rule #10).
  2. **Fixture metadata refresh (new in step 2l)**
     For every non-finished match: upsert `events` so kickoff, lock,
     matchday, and status track football-data verbatim — covers
     reschedulings, postponements, cancellations, newly-inserted
     fixtures. Previously this only happened via manual `pnpm seed`,
     which meant any late-season fixture move (e.g. the Wed 13 May 2026
     Man City v Crystal Palace catch-up) silently vanished from the
     portal until someone re-seeded by hand.

The two responsibilities share the same HTTP call and the same loop, so
adding fixture refresh costs zero extra API requests against the free-tier
budget (the response is larger but still < 100 KB per competition).

Per-competition season (step 3a.5): each row in `competitions` carries its
own `externalSeasonId` (set by the seed — PL/Champ = 2025, WC = 2026, future
comps as added). Previously the sync hardcoded `SEASON = 2025`, which meant
WC silently fetched the wrong season and returned no matches. Now the per-
comp value is read from the DB; a missing or non-numeric value is recorded
as an error against that one comp and the rest of the tick proceeds.

Safety rails (live in `fixture-sync.ts`, applied uniformly here and in seed):
  - Finished events are terminal from the fixture path. A status flip
    back to scheduled is never written, even if football-data transiently
    re-emits one. Outcome corrections go through the outcome path below.
  - Unchanged scheduled matches short-circuit to a no-op (no UPDATE).
  - Matches with a matchday outside our modelled Round structure (e.g.
    cup ties, pre-season friendlies sneaking into a league response) are
    skipped at insert time with a stat counter, never an exception.
  - Tournament-style comps (WC) accept null matchday — `roundForMatchday`
    returns the single Round number regardless (step 3a.3). League-style
    comps with a null matchday still return null here and skip safely.

Idempotent end-to-end:
  - `event_outcomes` is keyed by eventId (PK), `onConflictDoNothing` —
    first-write-wins. Score corrections from football-data are not
    re-recorded automatically (TODO: periodic reconciliation pass before
    public launch).
  - `predictions.pointsAwarded` is only written when currently null.
  - Fixture upsert compares against the existing row before writing.

Returns a `SyncResult` so the CLI, the HTTP admin endpoint, and the
scheduler logs all surface a structured summary.
*/

import "dotenv/config";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { competitions, events, eventOutcomes, eventOutcomeObservations, stages } from "../db/schema/sports";
import { predictions } from "../db/schema/pools";
import { auditLog } from "../db/schema/compliance";
import { writeAudit } from "./audit";
import { ROUNDS_BY_CODE, roundForMatchday } from "./rounds";
import {
  extractRegulationScore,
  fetchAllMatchesForSeason,
  mapFootballDataStatus,
  upsertEventFromFootballData,
  type FDMatch,
  type InternalEventStatus,
} from "./fixture-sync";

// ─── Sync result type (returned from the entry points) ───────────────────

// Confirm-before-commit window. A FINISHED full-time score must be observed
// UNCHANGED across sync passes spanning at least this long before it's promoted
// from the provisional observations buffer into event_outcomes (and used to
// score predictions). With the every-5-minutes sync cron this means a normal
// result is confirmed and scored within ~5–10 minutes of full-time, and a
// transient/incorrect score (e.g. a VAR-disallowed goal football-data briefly
// published) is never committed because the next pass sees it change. Tunable
// here only — there is no env/admin override (a fairness rule, arch §1).
const CONFIRM_MIN_AGE_MS = 3 * 60 * 1000;

export type SyncResult = {
  competitionsChecked: number;
  matchesSeen: number;

  // Outcome-write path (FINISHED matches).
  outcomesWritten: number;
  eventsMarkedFinished: number;
  predictionsScored: number;

  // Finished scores seen but NOT yet committed — held in the confirm-before-
  // commit buffer until proven stable across sync passes (CONFIRM_MIN_AGE_MS).
  outcomesPending: number;

  // Post-record score corrections detected (football-data now reports a
  // different result than the one already recorded). Surfaced as an alert
  // for an admin to review + apply deliberately — never auto-overwritten.
  outcomeDivergencesDetected: number;

  // Fixture-refresh path (non-finished matches). Added in step 2l.
  fixturesInserted: number;
  fixturesUpdated: number;
  fixturesUnchanged: number;
  fixturesSkippedNoStage: number;
  fixturesSkippedFinished: number;

  errors: { competition: string; message: string }[];
};

// ─── Scoring ──────────────────────────────────────────────────────────────

/**
 * Scoring rules (Decided Rule #10):
 *   5 pts — exact score (both home and away match)
 *   2 pts — correct result (winner or draw matches; not exact)
 *   0 pts — wrong result
 *
 * Pure function — no I/O.
 */
export function scorePrediction(
  pred: { homeScore: number; awayScore: number },
  outcome: { homeScore: number; awayScore: number },
): { points: number; isExact: boolean; isCorrectResult: boolean } {
  if (pred.homeScore === outcome.homeScore && pred.awayScore === outcome.awayScore) {
    return { points: 5, isExact: true, isCorrectResult: true };
  }
  const predResult = Math.sign(pred.homeScore - pred.awayScore);
  const actResult = Math.sign(outcome.homeScore - outcome.awayScore);
  if (predResult === actResult) {
    return { points: 2, isExact: false, isCorrectResult: true };
  }
  return { points: 0, isExact: false, isCorrectResult: false };
}

// ─── Score-divergence detector ─────────────────────────────────────────────

/**
 * Called when first-write-wins blocked an outcome write (a score is already
 * recorded) but football-data now reports a different 90-min score. Records a
 * visible "score divergence" alert in the audit log for an admin to review and
 * correct deliberately. NEVER overwrites the stored score.
 *
 * Returns true if a NEW alert was written this run, false otherwise.
 *
 * Quiet by design — it suppresses an alert when:
 *   (a) the stored score was set by a deliberate admin correction (so a stale
 *       football-data value isn't actionable — the admin already ruled), or
 *   (b) an identical divergence alert already exists (the cron runs every few
 *       minutes; we don't re-log an unchanged divergence each tick).
 */
async function maybeRaiseOutcomeDivergence(input: {
  eventId: string;
  match: string;
  footballData: { home: number; away: number };
}): Promise<boolean> {
  const [stored] = await db
    .select({ home: eventOutcomes.homeScore, away: eventOutcomes.awayScore })
    .from(eventOutcomes)
    .where(eq(eventOutcomes.eventId, input.eventId))
    .limit(1);
  if (!stored) return false;
  if (stored.home === input.footballData.home && stored.away === input.footballData.away) {
    return false; // identical — no divergence
  }

  const history = await db
    .select({
      before: auditLog.before,
      after: auditLog.after,
      ipAddress: auditLog.ipAddress,
      metadata: auditLog.metadata,
    })
    .from(auditLog)
    .where(and(eq(auditLog.entityId, input.eventId), eq(auditLog.action, "admin.action")))
    .orderBy(desc(auditLog.createdAt))
    .limit(30);

  const asScore = (v: unknown): { home?: number; away?: number } => {
    const o = (v ?? {}) as { homeScore?: number; awayScore?: number };
    return { home: o.homeScore, away: o.awayScore };
  };

  // (a) Stored score came from a deliberate admin correction → authoritative.
  const storedIsAdminSet = history.some((h) => {
    const md = (h.metadata ?? {}) as { tool?: string };
    const isCorrection =
      h.ipAddress === "admin-shell-outcome-correction" ||
      md.tool === "server/scripts/correct-outcome.ts";
    if (!isCorrection) return false;
    const a = asScore(h.after);
    return a.home === stored.home && a.away === stored.away;
  });
  if (storedIsAdminSet) return false;

  // (b) Already alerted for this exact divergence → don't duplicate.
  const alreadyAlerted = history.some((h) => {
    const md = (h.metadata ?? {}) as { kind?: string };
    if (md.kind !== "outcome_divergence") return false;
    const b = asScore(h.before);
    const a = asScore(h.after);
    return (
      b.home === stored.home &&
      b.away === stored.away &&
      a.home === input.footballData.home &&
      a.away === input.footballData.away
    );
  });
  if (alreadyAlerted) return false;

  console.warn(
    `[outcome-sync] ⚠ SCORE DIVERGENCE — ${input.match}: recorded ` +
      `${stored.home}-${stored.away}, football-data now ` +
      `${input.footballData.home}-${input.footballData.away}. Not auto-applied. ` +
      `Review in Admin → Score alerts; correct via correct-outcome.ts.`,
  );

  await writeAudit({
    action: "admin.action",
    entityType: "event_outcome",
    entityId: input.eventId,
    before: { homeScore: stored.home, awayScore: stored.away },
    after: { homeScore: input.footballData.home, awayScore: input.footballData.away },
    metadata: {
      kind: "outcome_divergence",
      source: "system-sync-divergence-detector",
      match: input.match,
      note: "football-data score differs from the recorded result; not auto-applied. Review and correct deliberately via server/scripts/correct-outcome.ts.",
    },
  });

  return true;
}

// ─── Main entry point ────────────────────────────────────────────────────

export async function syncOutcomes(): Promise<SyncResult> {
  const result: SyncResult = {
    competitionsChecked: 0,
    matchesSeen: 0,
    outcomesWritten: 0,
    eventsMarkedFinished: 0,
    predictionsScored: 0,
    outcomesPending: 0,
    outcomeDivergencesDetected: 0,
    fixturesInserted: 0,
    fixturesUpdated: 0,
    fixturesUnchanged: 0,
    fixturesSkippedNoStage: 0,
    fixturesSkippedFinished: 0,
    errors: [],
  };

  const comps = await db.select().from(competitions).where(eq(competitions.isActive, true));

  for (const comp of comps) {
    if (!comp.externalId) continue;

    // Per-competition season (step 3a.5). Stored as varchar in DB to
    // accommodate any future provider that uses non-numeric season ids;
    // football-data's API takes a number, so parse here.
    const seasonNum = comp.externalSeasonId ? Number(comp.externalSeasonId) : NaN;
    if (!Number.isFinite(seasonNum)) {
      result.errors.push({
        competition: comp.externalId,
        message: `externalSeasonId missing or invalid: ${comp.externalSeasonId ?? "null"}`,
      });
      continue;
    }

    result.competitionsChecked++;

    let matches: FDMatch[];
    try {
      matches = await fetchAllMatchesForSeason(comp.externalId, seasonNum);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ competition: comp.externalId, message });
      continue;
    }

    if (matches.length === 0) continue;

    // Build a matchday → stageId map for this competition. New fixtures need
    // a stage on insert; if a match's matchday isn't covered by any of our
    // modelled Rounds (rare: cup tie sneaking into a league response, or a
    // newly-added matchday football-data picked up before we updated our
    // Round structure), we skip the insert and count it.
    const stageRows = await db
      .select({ id: stages.id, ordinal: stages.ordinal })
      .from(stages)
      .where(eq(stages.competitionId, comp.id));
    const stageByRound = new Map(stageRows.map((s) => [s.ordinal, s.id]));
    const roundsConfigured = ROUNDS_BY_CODE[comp.externalId] !== undefined;

    // Pull existing events for this set in one query (avoid N+1 in the loop).
    const extIds = matches.map((m) => String(m.id));
    const ourEvents = await db
      .select({
        id: events.id,
        externalId: events.externalId,
        status: events.status,
        kickoffAt: events.kickoffAt,
        matchday: events.matchday,
        homeTeam: events.homeTeam,
        awayTeam: events.awayTeam,
        groupLabel: events.groupLabel,
        fdStage: events.fdStage,
      })
      .from(events)
      .where(inArray(events.externalId, extIds));
    const eventByExt = new Map(ourEvents.map((e) => [e.externalId, e]));

    for (const m of matches) {
      result.matchesSeen++;

      const ours = eventByExt.get(String(m.id));

      // ── Fixture-refresh path ─────────────────────────────────────────
      // Decide stageId for inserts. For existing events we keep the
      // current stageId (handled inside the helper by not updating it).
      // Tournament-style comps (WC) pass null matchday through to
      // roundForMatchday, which returns the single Round number for any
      // input (step 3a.3). League-style comps with null matchday return
      // null here and skip the insert safely.
      let stageIdForInsert: string | null = null;
      if (!ours && roundsConfigured) {
        const round = roundForMatchday(comp.externalId, m.matchday);
        if (round != null) {
          stageIdForInsert = stageByRound.get(round) ?? null;
        }
      }

      const upsert = await upsertEventFromFootballData({
        fdMatch: m,
        competitionId: comp.id,
        stageId: stageIdForInsert,
        existing: ours
          ? {
              id: ours.id,
              status: ours.status as InternalEventStatus,
              kickoffAt: ours.kickoffAt,
              matchday: ours.matchday,
              homeTeam: ours.homeTeam,
              awayTeam: ours.awayTeam,
              groupLabel: ours.groupLabel,
              fdStage: ours.fdStage,
            }
          : null,
      });

      switch (upsert.action) {
        case "inserted":          result.fixturesInserted++;        break;
        case "updated":           result.fixturesUpdated++;         break;
        case "unchanged":         result.fixturesUnchanged++;       break;
        case "skipped_no_stage":  result.fixturesSkippedNoStage++;  break;
        case "skipped_finished":  result.fixturesSkippedFinished++; break;
      }

      // Resolve the event id we now have (insert returned a fresh id;
      // skipped_no_stage means there's no row to score against — fall
      // through; every other branch carries the existing id).
      const eventId =
        upsert.action === "inserted" ? upsert.eventId :
        upsert.action === "skipped_no_stage" ? null :
        upsert.eventId;
      if (!eventId) continue;

      // ── Outcome-write path (confirm-before-commit) ───────────────────
      // Only finished matches with a complete full-time score qualify.
      // For knockouts that went to extra time or penalties (WC), we read
      // the 90-minute score only — Predictor10 settles on FT, not the
      // after-extra-time or shootout result.
      if (m.status !== "FINISHED" && m.status !== "AWARDED") continue;
      const regScore = extractRegulationScore(m);
      if (regScore === null) continue;
      const home = regScore.home;
      const away = regScore.away;

      const finishedAt = m.lastUpdated ? new Date(m.lastUpdated) : new Date();

      // Count status → 'finished' transitions on this run for the summary
      // line. The fixture-upsert helper already wrote events.status; this is
      // independent of whether the outcome is committed yet.
      const mappedStatus = mapFootballDataStatus(m.status);
      const becameFinished =
        (upsert.action === "inserted" && mappedStatus === "finished") ||
        (upsert.action === "updated" && ours?.status !== "finished" && mappedStatus === "finished");
      if (becameFinished) result.eventsMarkedFinished++;

      // Is the outcome already committed (i.e. confirmed and final)?
      const [committed] = await db
        .select({ home: eventOutcomes.homeScore, away: eventOutcomes.awayScore })
        .from(eventOutcomes)
        .where(eq(eventOutcomes.eventId, eventId))
        .limit(1);

      if (committed) {
        // Recorded & final. We never silently overwrite it (arch §14 — a
        // transient bad feed value must not be able to rewrite a finished
        // result on its own). If football-data now reports a DIFFERENT 90-min
        // score, that's a post-confirmation correction (rare): raise a visible
        // alert for an admin to review and apply deliberately via
        // server/scripts/correct-outcome.ts.
        const raised = await maybeRaiseOutcomeDivergence({
          eventId,
          match: `${ours?.homeTeam ?? "?"} v ${ours?.awayTeam ?? "?"}`,
          footballData: { home, away },
        });
        if (raised) result.outcomeDivergencesDetected++;
        continue;
      }

      // Not yet committed — run the confirm-before-commit gate. A finished
      // score must be seen UNCHANGED across sync passes (>= CONFIRM_MIN_AGE_MS
      // apart) before it's promoted to event_outcomes and used to score. This
      // is the steel-solid prevention: a transient/incorrect FT score is held
      // here and never committed, because the next pass sees it change and the
      // clock resets. event_outcomes therefore only ever holds stable scores.
      const [obs] = await db
        .select({
          home: eventOutcomeObservations.homeScore,
          away: eventOutcomeObservations.awayScore,
          observedAt: eventOutcomeObservations.observedAt,
        })
        .from(eventOutcomeObservations)
        .where(eq(eventOutcomeObservations.eventId, eventId))
        .limit(1);

      const nowMs = Date.now();

      if (!obs) {
        // First sighting of a finished score — buffer it, wait for confirmation.
        await db.insert(eventOutcomeObservations).values({
          eventId,
          homeScore: home,
          awayScore: away,
          observedAt: new Date(nowMs),
        });
        result.outcomesPending++;
        continue;
      }

      if (obs.home !== home || obs.away !== away) {
        // Score changed since the last sighting (the correction case, e.g.
        // 5-0 → 4-0). Re-buffer the new value and reset the stability clock;
        // do NOT commit. The old (transient) score is never written.
        await db
          .update(eventOutcomeObservations)
          .set({ homeScore: home, awayScore: away, observedAt: new Date(nowMs) })
          .where(eq(eventOutcomeObservations.eventId, eventId));
        result.outcomesPending++;
        continue;
      }

      if (nowMs - obs.observedAt.getTime() < CONFIRM_MIN_AGE_MS) {
        // Same score, but not stable for long enough yet — keep waiting.
        result.outcomesPending++;
        continue;
      }

      // Confirmed: the finished score has been stable. Commit it (first-write-
      // wins) and clear the provisional buffer.
      const inserted = await db
        .insert(eventOutcomes)
        .values({
          eventId,
          homeScore: home,
          awayScore: away,
          finishedAt,
        })
        .onConflictDoNothing({ target: eventOutcomes.eventId })
        .returning({ eventId: eventOutcomes.eventId });
      if (inserted.length > 0) result.outcomesWritten++;
      await db
        .delete(eventOutcomeObservations)
        .where(eq(eventOutcomeObservations.eventId, eventId));

      // Score any unscored predictions on this event.
      const unscored = await db
        .select({
          id: predictions.id,
          home: predictions.homeScorePredicted,
          away: predictions.awayScorePredicted,
        })
        .from(predictions)
        .where(and(eq(predictions.eventId, eventId), isNull(predictions.pointsAwarded)));

      for (const p of unscored) {
        const score = scorePrediction(
          { homeScore: p.home, awayScore: p.away },
          { homeScore: home, awayScore: away },
        );
        await db
          .update(predictions)
          .set({
            pointsAwarded: score.points,
            isExact: score.isExact,
            isCorrectResult: score.isCorrectResult,
          })
          .where(eq(predictions.id, p.id));
        result.predictionsScored++;
      }
    }
  }

  return result;
}
