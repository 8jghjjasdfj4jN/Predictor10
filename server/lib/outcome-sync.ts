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
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { competitions, events, eventOutcomes, stages } from "../db/schema/sports";
import { predictions } from "../db/schema/pools";
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

export type SyncResult = {
  competitionsChecked: number;
  matchesSeen: number;

  // Outcome-write path (FINISHED matches).
  outcomesWritten: number;
  eventsMarkedFinished: number;
  predictionsScored: number;

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

// ─── Main entry point ────────────────────────────────────────────────────

export async function syncOutcomes(): Promise<SyncResult> {
  const result: SyncResult = {
    competitionsChecked: 0,
    matchesSeen: 0,
    outcomesWritten: 0,
    eventsMarkedFinished: 0,
    predictionsScored: 0,
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

      // ── Outcome-write path ───────────────────────────────────────────
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

      // Upsert outcome (first-write-wins).
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

      // Count status → 'finished' transitions on this run for the summary
      // line. The fixture-upsert helper already wrote the value to the DB;
      // we just decide whether to tally:
      //   - inserted as finished                          → +1
      //   - updated from a non-finished status → finished → +1
      //   - everything else (already finished, unchanged, skipped) → 0
      const mappedStatus = mapFootballDataStatus(m.status);
      const becameFinished =
        (upsert.action === "inserted" && mappedStatus === "finished") ||
        (upsert.action === "updated" && ours?.status !== "finished" && mappedStatus === "finished");
      if (becameFinished) result.eventsMarkedFinished++;

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
