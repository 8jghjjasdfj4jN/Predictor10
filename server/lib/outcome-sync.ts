/*
Predictor10 — outcome sync (step 2i).

What it does:
  1. Pulls FINISHED matches from football-data.org for each active competition
     with an external code (PL, ELC).
  2. For each finished match that maps to one of our `events` rows, upserts
     an `event_outcomes` row with the full-time score and updates the event's
     status to 'finished'.
  3. For every `prediction` against that event that hasn't been scored yet,
     computes points (5 exact / 2 correct result / 0 otherwise) and writes
     pointsAwarded + isExact + isCorrectResult.

Idempotent: re-running is safe.
  - event_outcomes is keyed by eventId (PK). First-write-wins — score
    corrections from football-data are not re-recorded automatically. TODO
    (todo.md): periodic reconciliation pass before public launch.
  - predictions.pointsAwarded is only written when currently null — once
    scored, a prediction stays at its first-computed value.

Network: 1 call per active competition per run (currently 2 — PL and ELC).
Free-tier ceiling is 10/min and 14,400/day; at every-5-min cron we use
≈ 4% of the daily budget.

Returns a stats object so the CLI/HTTP entry points can log a summary.
*/

import "dotenv/config";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { competitions, events, eventOutcomes } from "../db/schema/sports";
import { predictions } from "../db/schema/pools";

const FOOTBALL_API_BASE = "https://api.football-data.org/v4";
const SEASON = 2025; // football-data convention: starting year → 2025/26.
                    // TODO (step 2k+): bump per competition once 2026/27 fixtures release.

// ─── football-data response shape (subset we use) ─────────────────────────

type FDStatus =
  | "SCHEDULED" | "TIMED" | "IN_PLAY" | "PAUSED"
  | "FINISHED" | "SUSPENDED" | "POSTPONED" | "CANCELLED" | "AWARDED";

type FDMatch = {
  id: number;
  utcDate: string;
  lastUpdated?: string;
  status: FDStatus;
  score?: {
    fullTime?: { home: number | null; away: number | null };
  };
};

// ─── Sync result type (returned from the entry points) ───────────────────

export type SyncResult = {
  competitionsChecked: number;
  matchesSeen: number;
  outcomesWritten: number;
  eventsMarkedFinished: number;
  predictionsScored: number;
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

// ─── HTTP fetch helper (no shared cache — we want fresh data per run) ─────

async function fetchFinishedMatches(externalCode: string): Promise<FDMatch[]> {
  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) throw new Error("FOOTBALL_API_KEY env var not set");

  const url = `${FOOTBALL_API_BASE}/competitions/${externalCode}/matches?season=${SEASON}&status=FINISHED`;
  const res = await fetch(url, { headers: { "X-Auth-Token": apiKey } });
  if (!res.ok) {
    throw new Error(`football-data ${res.status} ${res.statusText} for ${externalCode}`);
  }
  const data = (await res.json()) as { matches: FDMatch[] };
  return data.matches ?? [];
}

// ─── Main sync entry point ────────────────────────────────────────────────

export async function syncOutcomes(): Promise<SyncResult> {
  const result: SyncResult = {
    competitionsChecked: 0,
    matchesSeen: 0,
    outcomesWritten: 0,
    eventsMarkedFinished: 0,
    predictionsScored: 0,
    errors: [],
  };

  const comps = await db.select().from(competitions).where(eq(competitions.isActive, true));

  for (const comp of comps) {
    if (!comp.externalId) continue;
    result.competitionsChecked++;

    let matches: FDMatch[];
    try {
      matches = await fetchFinishedMatches(comp.externalId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ competition: comp.externalId, message });
      continue;
    }

    if (matches.length === 0) continue;

    // Index our events by externalId for O(1) lookup.
    const extIds = matches.map((m) => String(m.id));
    const ourEvents = await db
      .select({
        id: events.id,
        externalId: events.externalId,
        status: events.status,
      })
      .from(events)
      .where(inArray(events.externalId, extIds));
    const eventByExt = new Map(ourEvents.map((e) => [e.externalId, e]));

    for (const m of matches) {
      result.matchesSeen++;

      if (m.status !== "FINISHED") continue;
      const home = m.score?.fullTime?.home;
      const away = m.score?.fullTime?.away;
      if (home == null || away == null) continue;

      const ours = eventByExt.get(String(m.id));
      if (!ours) continue;

      const finishedAt = m.lastUpdated ? new Date(m.lastUpdated) : new Date();

      // Upsert outcome (first-write-wins per the policy above).
      const inserted = await db
        .insert(eventOutcomes)
        .values({
          eventId: ours.id,
          homeScore: home,
          awayScore: away,
          finishedAt,
        })
        .onConflictDoNothing({ target: eventOutcomes.eventId })
        .returning({ eventId: eventOutcomes.eventId });
      if (inserted.length > 0) result.outcomesWritten++;

      // Mark event finished if it isn't yet.
      if (ours.status !== "finished") {
        await db
          .update(events)
          .set({ status: "finished", lastSyncedAt: new Date() })
          .where(eq(events.id, ours.id));
        result.eventsMarkedFinished++;
      }

      // Score any predictions on this event that haven't been scored yet.
      const unscored = await db
        .select({
          id: predictions.id,
          home: predictions.homeScorePredicted,
          away: predictions.awayScorePredicted,
        })
        .from(predictions)
        .where(and(eq(predictions.eventId, ours.id), isNull(predictions.pointsAwarded)));

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
