/*
Predictor10 — portal data layer.

Query helpers for the post-login portal pages. Returns API-shaped data
ready to JSON-serialise; routes layer just wraps these in Express handlers.

These helpers will get reused by Pools landing, Pool detail, Predict, and
History as those screens get built. Keep the queries here, not inline in
route handlers.
*/

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { competitions, stages, events } from "../db/schema/sports";
import { leagues } from "../db/schema/leagues";
import { pools, poolEntries } from "../db/schema/pools";
import { ROUNDS_BY_CODE } from "./rounds";

// ─── API response shapes ──────────────────────────────────────────────────

export type CurrentRoundDto = {
  stageId: string;
  name: string;
  ordinal: number;
  matchdays: number[]; // e.g. [34, 35, 36, 37, 38]
  matchdayLabel: "GW" | "MD"; // PL uses gameweek, Championship uses matchday
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;
};

export type TierDto = {
  slug: string;
  name: string;
  entryFee: string; // numeric — "1.00", "10.00" etc.
  ordinal: number;
};

export type PoolDto = {
  id: string;
  name: string;
  tier: TierDto;
  opensAt: string; // ISO timestamp
  closesAt: string; // ISO timestamp (late-entry close, opens + 7 days)
  entryCount: number;
  status: "draft" | "open" | "locked" | "settled" | "void";
};

export type CompetitionDto = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  externalCode: string; // "PL", "ELC"
  currentRound: CurrentRoundDto;
  pools: PoolDto[]; // 5 tiers, ordered by ordinal
};

export type UserEntryDto = {
  id: string;
  poolId: string;
  competitionId: string;
  competitionSlug: string;
  competitionShortName: string;
  poolName: string;
  tierName: string;
  enteredAt: string;
  predictionsTotal: number;
  predictionsMade: number;
};

// ─── Queries ──────────────────────────────────────────────────────────────

/**
 * Competitions that currently have at least one open pool, with their current
 * Round details and 5 tier pools embedded. Used by /api/competitions and the
 * Home page.
 *
 * Returns [] if no competition has an open Round (entire site is between
 * seasons). UI shows an empty state in that case.
 */
export async function getCompetitionsWithOpenPools(): Promise<CompetitionDto[]> {
  const rows = await db
    .select({
      poolId: pools.id,
      poolName: pools.name,
      poolOpensAt: pools.opensAt,
      poolClosesAt: pools.closesAt,
      poolStatus: pools.status,
      competitionId: competitions.id,
      competitionSlug: competitions.slug,
      competitionName: competitions.name,
      competitionShortName: competitions.shortName,
      competitionExternalId: competitions.externalId,
      stageId: stages.id,
      stageName: stages.name,
      stageOrdinal: stages.ordinal,
      stageStartDate: stages.startDate,
      stageEndDate: stages.endDate,
      leagueSlug: leagues.slug,
      leagueName: leagues.name,
      leagueEntryFee: leagues.entryFee,
      leagueOrdinal: leagues.ordinal,
    })
    .from(pools)
    .innerJoin(competitions, eq(pools.competitionId, competitions.id))
    .innerJoin(stages, eq(pools.stageId, stages.id))
    .innerJoin(leagues, eq(pools.leagueId, leagues.id))
    .where(eq(pools.status, "open"))
    .orderBy(asc(competitions.name), asc(leagues.ordinal));

  if (rows.length === 0) return [];

  // Entry counts per pool (single grouped query).
  const poolIds = rows.map((r) => r.poolId);
  const counts = await db
    .select({
      poolId: poolEntries.poolId,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(poolEntries)
    .where(inArray(poolEntries.poolId, poolIds))
    .groupBy(poolEntries.poolId);
  const countByPool = new Map(counts.map((c) => [c.poolId, Number(c.count)]));

  const byCompetition = new Map<string, CompetitionDto>();
  for (const r of rows) {
    let comp = byCompetition.get(r.competitionId);
    if (!comp) {
      const code = r.competitionExternalId ?? "";
      const matchdays =
        code && ROUNDS_BY_CODE[code]
          ? (ROUNDS_BY_CODE[code].find((rd) => rd.round === r.stageOrdinal)?.matchdays ?? [])
          : [];
      // PL uses "gameweek" (GW); EFL Championship uses "matchday" (MD).
      const matchdayLabel = code === "ELC" ? "MD" : "GW";
      comp = {
        id: r.competitionId,
        slug: r.competitionSlug,
        name: r.competitionName,
        shortName: r.competitionShortName ?? r.competitionName,
        externalCode: code,
        currentRound: {
          stageId: r.stageId,
          name: r.stageName,
          ordinal: r.stageOrdinal,
          matchdays,
          matchdayLabel,
          startDate: r.stageStartDate,
          endDate: r.stageEndDate,
        },
        pools: [],
      };
      byCompetition.set(r.competitionId, comp);
    }
    comp.pools.push({
      id: r.poolId,
      name: r.poolName,
      tier: {
        slug: r.leagueSlug,
        name: r.leagueName,
        entryFee: r.leagueEntryFee,
        ordinal: r.leagueOrdinal,
      },
      opensAt: r.poolOpensAt.toISOString(),
      closesAt: r.poolClosesAt.toISOString(),
      entryCount: countByPool.get(r.poolId) ?? 0,
      status: r.poolStatus,
    });
  }

  return Array.from(byCompetition.values());
}

/**
 * The signed-in user's open entries — pool_entries with no settled_at.
 * Includes prediction progress (made / total) for the Home "live entries"
 * cards. Returns [] for new users.
 */
export async function getUserOpenEntries(userId: string): Promise<UserEntryDto[]> {
  const rows = await db
    .select({
      entryId: poolEntries.id,
      poolId: pools.id,
      poolName: pools.name,
      enteredAt: poolEntries.enteredAt,
      competitionId: competitions.id,
      competitionSlug: competitions.slug,
      competitionShortName: competitions.shortName,
      tierName: leagues.name,
      stageId: stages.id,
    })
    .from(poolEntries)
    .innerJoin(pools, eq(poolEntries.poolId, pools.id))
    .innerJoin(competitions, eq(pools.competitionId, competitions.id))
    .innerJoin(leagues, eq(pools.leagueId, leagues.id))
    .innerJoin(stages, eq(pools.stageId, stages.id))
    .where(and(eq(poolEntries.userId, userId), isNull(poolEntries.settledAt)))
    .orderBy(asc(pools.opensAt));

  if (rows.length === 0) return [];

  // Match counts per stage (total) and prediction counts per entry (made).
  const stageIds = Array.from(new Set(rows.map((r) => r.stageId)));
  const totals = await db
    .select({
      stageId: events.stageId,
      total: sql<number>`COUNT(*)::int`,
    })
    .from(events)
    .where(inArray(events.stageId, stageIds))
    .groupBy(events.stageId);
  const totalByStage = new Map(totals.map((t) => [t.stageId ?? "", Number(t.total)]));

  // Predictions-made: count predictions where pool_entry_id is one of ours.
  // (Predictions table not built yet — placeholder zero counts for now.)
  // TODO: when step 2e+ adds /api/predictions, swap this in.
  const madeByEntry = new Map<string, number>();

  return rows.map((r) => ({
    id: r.entryId,
    poolId: r.poolId,
    competitionId: r.competitionId,
    competitionSlug: r.competitionSlug,
    competitionShortName: r.competitionShortName ?? "",
    poolName: r.poolName,
    tierName: r.tierName,
    enteredAt: r.enteredAt.toISOString(),
    predictionsTotal: totalByStage.get(r.stageId) ?? 0,
    predictionsMade: madeByEntry.get(r.entryId) ?? 0,
  }));
}
