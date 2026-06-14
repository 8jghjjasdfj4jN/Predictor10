/*
Predictor10 — prediction insight queries.

Read-only aggregates over `predictions` that power the "how the table called
it" view. Pure data, no scoring or settlement involvement.

Anti-cheat: distribution is only ever computed for events whose predictions
have locked (`predictionLockAt <= now`). Pre-lock events are excluded entirely
so the crowd's picks can't influence a viewer who still has an open prediction
— the same Rule #7 gate the opponent-picks view uses.

Access mirrors the league table / opponent-picks view:
  - Pool settled            → public
  - Pool live, not auth'd   → NOT_AUTHENTICATED (401)
  - Pool live, not entrant  → NOT_ENTRANT (403)
*/

import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { pools, poolEntries, predictions } from "../db/schema/pools";
import { events } from "../db/schema/sports";

export type ScorelineCount = { home: number; away: number; count: number };

export type EventDistribution = {
  total: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  /** Up to 3 most-predicted exact scorelines, highest count first. */
  topScorelines: ScorelineCount[];
};

export type PoolDistributionDto = {
  /** Total entrants in the pool — the denominator for "x/y predicted". */
  entrantCount: number;
  /** Keyed by eventId. Only locked events with at least one prediction appear. */
  byEvent: Record<string, EventDistribution>;
};

export type GetDistributionError = "POOL_NOT_FOUND" | "NOT_AUTHENTICATED" | "NOT_ENTRANT";

export type GetDistributionOutcome =
  | { ok: true; data: PoolDistributionDto }
  | { ok: false; error: GetDistributionError };

export async function getPoolPredictionDistribution(
  poolId: string,
  viewerUserId: string | null,
): Promise<GetDistributionOutcome> {
  const [meta] = await db
    .select({ stageId: pools.stageId, status: pools.status })
    .from(pools)
    .where(eq(pools.id, poolId));
  if (!meta) return { ok: false, error: "POOL_NOT_FOUND" };

  const isSettled = meta.status === "settled";
  if (!isSettled) {
    if (!viewerUserId) return { ok: false, error: "NOT_AUTHENTICATED" };
    const [own] = await db
      .select({ id: poolEntries.id })
      .from(poolEntries)
      .where(and(eq(poolEntries.poolId, poolId), eq(poolEntries.userId, viewerUserId)));
    if (!own) return { ok: false, error: "NOT_ENTRANT" };
  }

  // Pool entrant count — the denominator for "x/y predicted". Everyone in the
  // pool was eligible to predict, so a gap means they didn't get a pick in.
  const [entrantRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(poolEntries)
    .where(eq(poolEntries.poolId, poolId));
  const entrantCount = entrantRow?.count ?? 0;

  // Locked events in this Round only — the anti-cheat gate.
  const now = new Date();
  const lockedEvents = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.stageId, meta.stageId), lte(events.predictionLockAt, now)));

  const lockedIds = new Set(lockedEvents.map((e) => e.id));
  if (lockedIds.size === 0) return { ok: true, data: { entrantCount, byEvent: {} } };

  // Every prediction in this pool; filter to locked events in JS (one Round's
  // worth — small enough that a scan + filter beats building an IN list).
  const preds = await db
    .select({
      eventId: predictions.eventId,
      home: predictions.homeScorePredicted,
      away: predictions.awayScorePredicted,
    })
    .from(predictions)
    .where(eq(predictions.poolId, poolId));

  const byEvent: Record<string, EventDistribution> = {};
  const scorelineMaps: Record<string, Map<string, number>> = {};

  for (const p of preds) {
    if (!lockedIds.has(p.eventId)) continue;

    let agg = byEvent[p.eventId];
    if (!agg) {
      agg = { total: 0, homeWin: 0, draw: 0, awayWin: 0, topScorelines: [] };
      byEvent[p.eventId] = agg;
      scorelineMaps[p.eventId] = new Map();
    }

    agg.total += 1;
    if (p.home > p.away) agg.homeWin += 1;
    else if (p.home === p.away) agg.draw += 1;
    else agg.awayWin += 1;

    const key = `${p.home}-${p.away}`;
    const m = scorelineMaps[p.eventId];
    m.set(key, (m.get(key) ?? 0) + 1);
  }

  for (const eventId of Object.keys(byEvent)) {
    const top = Array.from(scorelineMaps[eventId].entries())
      .map(([key, count]) => {
        const [h, a] = key.split("-").map(Number);
        return { home: h, away: a, count };
      })
      .sort((x, y) => y.count - x.count)
      .slice(0, 3);
    byEvent[eventId].topScorelines = top;
  }

  return { ok: true, data: { entrantCount, byEvent } };
}
