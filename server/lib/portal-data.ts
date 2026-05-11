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
import { payments } from "../db/schema/payments";
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

export type PoolDetailDto = {
  id: string;
  name: string;
  status: "draft" | "open" | "locked" | "settled" | "void";
  opensAt: string;
  closesAt: string;
  entryCount: number;
  tier: TierDto;
  competition: {
    id: string;
    slug: string;
    name: string;
    shortName: string;
    externalCode: string;
  };
  currentRound: CurrentRoundDto;
  // Window state — what the user can do right now.
  //   open    — within the 7-day late-entry window, entries allowed
  //   late    — past the window but BYPASS_LATE_ENTRY=true, OR first kickoff
  //             has happened (modal warning required before entering)
  //   closed  — pool not enterable (status ≠ open, or window expired without bypass)
  entryWindow: "open" | "late" | "closed";
  firstKickoffAt: string | null;
  matchesLocked: number;
  matchesTotal: number;
  bypassActive: boolean;
  myEntry: { id: string; enteredAt: string } | null;
};

export type EnterPoolError =
  | "POOL_NOT_FOUND"
  | "POOL_NOT_OPEN"
  | "LATE_ENTRY_CLOSED";

export type EnterPoolOutcome =
  | { ok: true; entryId: string; paymentId: string; alreadyEntered: boolean }
  | { ok: false; error: EnterPoolError };

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
  // TODO: when /api/predictions ships, swap this in.
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

/**
 * Full pool detail for the Pool detail / Predict screen (arch §8.5).
 *
 * Public — no auth required to browse. Pass `userId` when the caller is
 * signed in so the response includes `myEntry` (the user's existing
 * pool_entries row, if any).
 *
 * Returns null when no pool exists with that id.
 *
 * Window-state computation (arch §4 / Decided Rule #8):
 *   status ≠ open                     → "closed"
 *   now > closesAt && !bypass         → "closed"
 *   now > closesAt &&  bypass         → "late"  (dev-only; warning modal required)
 *   now > firstKickoffAt              → "late"  (warning modal required)
 *   otherwise                         → "open"
 */
export async function getPoolDetail(
  poolId: string,
  userId: string | null,
): Promise<PoolDetailDto | null> {
  const [row] = await db
    .select({
      poolId: pools.id,
      poolName: pools.name,
      poolStatus: pools.status,
      poolOpensAt: pools.opensAt,
      poolClosesAt: pools.closesAt,
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
    .where(eq(pools.id, poolId));

  if (!row) return null;

  // Entry count for this pool.
  const [entryAgg] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(poolEntries)
    .where(eq(poolEntries.poolId, poolId));
  const entryCount = Number(entryAgg?.count ?? 0);

  // Event aggregates: total matches in stage, earliest kickoff, count locked.
  // "Locked" = predictionLockAt < now (kickoff − 1hr per arch §1.5). Used in
  // the late-entry warning copy as "N matches you can no longer predict".
  const [eventAgg] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      firstKickoff: sql<Date | null>`MIN(${events.kickoffAt})`,
      locked: sql<number>`COUNT(*) FILTER (WHERE ${events.predictionLockAt} < NOW())::int`,
    })
    .from(events)
    .where(eq(events.stageId, row.stageId));
  const matchesTotal = Number(eventAgg?.total ?? 0);
  const matchesLocked = Number(eventAgg?.locked ?? 0);
  const firstKickoffDate = eventAgg?.firstKickoff ? new Date(eventAgg.firstKickoff) : null;

  // myEntry for the auth'd caller.
  let myEntry: PoolDetailDto["myEntry"] = null;
  if (userId) {
    const [existing] = await db
      .select({ id: poolEntries.id, enteredAt: poolEntries.enteredAt })
      .from(poolEntries)
      .where(and(eq(poolEntries.poolId, poolId), eq(poolEntries.userId, userId)));
    if (existing) {
      myEntry = { id: existing.id, enteredAt: existing.enteredAt.toISOString() };
    }
  }

  // Window state.
  const bypassActive = process.env.BYPASS_LATE_ENTRY === "true";
  const nowMs = Date.now();
  const closesAtMs = row.poolClosesAt.getTime();
  const firstKickoffMs = firstKickoffDate ? firstKickoffDate.getTime() : null;

  let entryWindow: "open" | "late" | "closed";
  if (row.poolStatus !== "open") {
    entryWindow = "closed";
  } else if (nowMs > closesAtMs) {
    entryWindow = bypassActive ? "late" : "closed";
  } else if (firstKickoffMs !== null && nowMs > firstKickoffMs) {
    entryWindow = "late";
  } else {
    entryWindow = "open";
  }

  const externalCode = row.competitionExternalId ?? "";
  const matchdays =
    externalCode && ROUNDS_BY_CODE[externalCode]
      ? (ROUNDS_BY_CODE[externalCode].find((rd) => rd.round === row.stageOrdinal)?.matchdays ?? [])
      : [];
  const matchdayLabel = externalCode === "ELC" ? "MD" : "GW";

  return {
    id: row.poolId,
    name: row.poolName,
    status: row.poolStatus,
    opensAt: row.poolOpensAt.toISOString(),
    closesAt: row.poolClosesAt.toISOString(),
    entryCount,
    tier: {
      slug: row.leagueSlug,
      name: row.leagueName,
      entryFee: row.leagueEntryFee,
      ordinal: row.leagueOrdinal,
    },
    competition: {
      id: row.competitionId,
      slug: row.competitionSlug,
      name: row.competitionName,
      shortName: row.competitionShortName ?? row.competitionName,
      externalCode,
    },
    currentRound: {
      stageId: row.stageId,
      name: row.stageName,
      ordinal: row.stageOrdinal,
      matchdays,
      matchdayLabel,
      startDate: row.stageStartDate,
      endDate: row.stageEndDate,
    },
    entryWindow,
    firstKickoffAt: firstKickoffDate ? firstKickoffDate.toISOString() : null,
    matchesLocked,
    matchesTotal,
    bypassActive,
    myEntry,
  };
}

/**
 * Create a new pool entry for `userId` against `poolId` — the mock-money flow
 * (arch §4).
 *
 * Flow:
 *   1. Re-validate the pool: must exist, status='open', within window (or bypass).
 *   2. Idempotency: if the user already has an entry, return it untouched
 *      (caller maps to a 200 "already entered" response).
 *   3. Inside a transaction:
 *        - Insert payments row (mode='mock', status='succeeded', direction='debit',
 *          amount = tier fee, referenceType='pool_entry', referenceId=null).
 *        - Insert pool_entries row pointing at that payment.
 *        - Backfill payments.referenceId = entry.id so the payment is
 *          discoverable from the entry side too.
 *
 * mode='mock' / status='succeeded' is the stand-in for a real PSP charge. At
 * licence flip, mode becomes 'live' and status starts as 'pending' until a
 * Stripe webhook flips it to 'succeeded' (then the webhook handler creates
 * the pool_entries row, not this function).
 *
 * Schema note: there's no unique (pool_id, user_id) index on pool_entries yet.
 * The pre-flight duplicate check protects against double-tap; a true
 * concurrent race could still produce two rows. uniqueIndex + migration is
 * a future schema step before public launch. Logged in todo.md.
 */
export async function enterPool(opts: {
  poolId: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<EnterPoolOutcome> {
  const { poolId, userId, ipAddress, userAgent } = opts;

  // Load pool + tier fee for validation and payment amount.
  const [row] = await db
    .select({
      poolId: pools.id,
      poolStatus: pools.status,
      poolClosesAt: pools.closesAt,
      stageId: pools.stageId,
      tierFee: leagues.entryFee,
    })
    .from(pools)
    .innerJoin(leagues, eq(pools.leagueId, leagues.id))
    .where(eq(pools.id, poolId));

  if (!row) return { ok: false, error: "POOL_NOT_FOUND" };
  if (row.poolStatus !== "open") return { ok: false, error: "POOL_NOT_OPEN" };

  const bypassActive = process.env.BYPASS_LATE_ENTRY === "true";
  if (Date.now() > row.poolClosesAt.getTime() && !bypassActive) {
    return { ok: false, error: "LATE_ENTRY_CLOSED" };
  }

  // Idempotency — return existing entry if one is already in place.
  const [existing] = await db
    .select({ id: poolEntries.id, paymentId: poolEntries.paymentId })
    .from(poolEntries)
    .where(and(eq(poolEntries.poolId, poolId), eq(poolEntries.userId, userId)));

  if (existing) {
    return {
      ok: true,
      entryId: existing.id,
      paymentId: existing.paymentId,
      alreadyEntered: true,
    };
  }

  // Fresh entry: payment → entry → backfill payment.referenceId, atomically.
  const result = await db.transaction(async (tx) => {
    const now = new Date();

    const [payment] = await tx
      .insert(payments)
      .values({
        userId,
        direction: "debit",
        amount: row.tierFee,
        currency: "GBP",
        referenceType: "pool_entry",
        referenceId: null,
        mode: "mock",
        status: "succeeded",
        ipAddress,
        userAgent,
        initiatedAt: now,
        completedAt: now,
      })
      .returning({ id: payments.id });

    const [entry] = await tx
      .insert(poolEntries)
      .values({
        poolId,
        userId,
        paymentId: payment.id,
      })
      .returning({ id: poolEntries.id });

    await tx
      .update(payments)
      .set({ referenceId: entry.id })
      .where(eq(payments.id, payment.id));

    return { entryId: entry.id, paymentId: payment.id };
  });

  return {
    ok: true,
    entryId: result.entryId,
    paymentId: result.paymentId,
    alreadyEntered: false,
  };
}
