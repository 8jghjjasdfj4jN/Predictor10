/*
Predictor10 — portal data layer.

Query helpers for the post-login portal pages. Returns API-shaped data
ready to JSON-serialise; routes layer just wraps these in Express handlers.

These helpers will get reused by Pools landing, Pool detail, Predict, and
History as those screens get built. Keep the queries here, not inline in
route handlers.
*/

import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { competitions, stages, events, eventOutcomes } from "../db/schema/sports";
import { leagues } from "../db/schema/leagues";
import { pools, poolEntries, predictions } from "../db/schema/pools";
import { payments } from "../db/schema/payments";
import { users } from "../db/schema/users";
import { rankEntries, computeDisplayBreakdown, type EntryScore } from "./pool-settle";
import { ROUNDS_BY_CODE } from "./rounds";

/**
 * Resolve the matchday list for a (competition, round) pair, coerced to
 * number[] for the DTO. Tournament-style rounds (matchdays: "all") have no
 * numeric matchday list — they return [] here and the UI falls back to its
 * tournament-aware copy (e.g. "11 Jun → 19 Jul" instead of "GWs 1-4").
 * Centralises step 3a.3's "all" handling so callers stay a one-liner.
 */
function matchdaysForRound(externalCode: string, ordinal: number): number[] {
  const rounds = ROUNDS_BY_CODE[externalCode];
  if (!rounds) return [];
  const md = rounds.find((rd) => rd.round === ordinal)?.matchdays;
  return Array.isArray(md) ? md : [];
}

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

/**
 * Per-place prize amount for display (step 2n). Amounts are strings in
 * pounds.pence ("22.49") so consumers don't have to track integer pence;
 * server-side they're computed in integer pence and stringified once.
 * Includes the houseFeePct applied — `amount` is what the player actually
 * gets paid, NOT the gross share.
 */
export type PrizeBreakdownEntry = {
  rank: number; // 1, 2, 3...
  amount: string; // "22.49"
};

export type PoolDto = {
  id: string;
  name: string;
  tier: TierDto;
  opensAt: string; // ISO timestamp
  closesAt: string; // ISO timestamp (late-entry close, opens + 7 days)
  entryCount: number;
  status: "draft" | "open" | "locked" | "settled" | "void";
  /**
   * Per-rank prize breakdown for the current entry count, net of house fee.
   * Step 2n: all active tiers pay top 3 at 60/25/15 of the player pot
   * (player pot = gross × (1 - houseFeePct)). Empty array when entryCount
   * is 0 (no pot yet) or when prizeStructure is malformed.
   */
  prizeBreakdown: PrizeBreakdownEntry[];
};

export type CompetitionDto = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  externalCode: string; // "PL", "ELC", "WC"
  /**
   * Per-competition postponement policy (step 3a). League-style comps are
   * `'wait'` (PL/Champ); tournament-style are `'forfeit'` (WC). The Home
   * card UI branches on this to pick the CTA (tier picker vs single Enter).
   */
  postponedPolicy: "wait" | "forfeit";
  currentRound: CurrentRoundDto;
  pools: PoolDto[]; // active tiers only, ordered by ordinal (4 from step 2m)
};

/**
 * Convert a pool's stored prizeStructure JSON + entry count + tier fee
 * into the display-ready breakdown the API returns. Computes in integer
 * pence and stringifies once. Returns an empty array if the structure is
 * malformed, splits are empty, or the player pot is zero (entryCount=0
 * or houseFeePct rounds the pot to zero) — those edge cases render as
 * "no pot yet" on the client rather than a "£0.00 · £0.00 · £0.00" line.
 */
function buildPrizeBreakdown(
  prizeStructureJson: unknown,
  entryCount: number,
  entryFeeDecimal: string,
): PrizeBreakdownEntry[] {
  if (entryCount <= 0) return [];
  if (typeof prizeStructureJson !== "object" || prizeStructureJson === null) return [];
  const rec = prizeStructureJson as Record<string, unknown>;
  const splits = rec.splits;
  if (!Array.isArray(splits) || splits.length === 0) return [];
  if (!splits.every((s) => typeof s === "number")) return [];
  const houseFeePctRaw = rec.houseFeePct;
  const houseFeePct =
    typeof houseFeePctRaw === "number" && Number.isFinite(houseFeePctRaw)
      ? Math.min(Math.max(houseFeePctRaw, 0), 1)
      : 0;

  const tierFeePence = Math.round(parseFloat(entryFeeDecimal) * 100);
  if (!Number.isFinite(tierFeePence) || tierFeePence <= 0) return [];
  const grossPotPence = tierFeePence * entryCount;
  // Same rounding rule settlement uses — Math.floor on house fee so we
  // never overpay players from sub-penny remainders.
  const houseFeePence = Math.floor(grossPotPence * houseFeePct);
  const playerPotPence = grossPotPence - houseFeePence;

  const lines = computeDisplayBreakdown(playerPotPence, splits as number[]);
  return lines.map((l) => ({
    rank: l.rank,
    amount: (l.amountPence / 100).toFixed(2),
  }));
}

export type UserEntryDto = {
  id: string;
  poolId: string;
  competitionId: string;
  competitionSlug: string;
  competitionShortName: string;
  // Step 3a.8 — Predict tab groups tournament-style entries into their own
  // section ("TOURNAMENT"). UI branches on this field, same discriminator
  // Home uses (arch §13 Rule #16: forfeit = tournament-style).
  postponedPolicy: "wait" | "forfeit";
  poolName: string;
  tierName: string;
  roundName: string;
  closesAt: string; // ISO — pool's late-entry close (opens + 7 days)
  roundEndDate: string | null; // YYYY-MM-DD — last match date in the Round
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
  /**
   * Same shape as PoolDto.prizeBreakdown. Lets the entry-confirm modal show
   * "If you enter now you're playing for £X / £Y / £Z" with current numbers
   * — useful context before the user commits.
   */
  prizeBreakdown: PrizeBreakdownEntry[];
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
 * Round details and active tier pools embedded (4 from step 2m onwards;
 * was 5 — the Pound is retired and excluded via leagues.is_active=false).
 * Used by /api/competitions, the Home page, and the Tables tab.
 *
 * Returns [] if no competition has an open Round (entire site is between
 * seasons). UI shows an empty state in that case.
 *
 * Important: retired tiers' existing pools/entries are NOT hidden by this
 * query in /api/pools/:id or /api/entries/me — those endpoints still return
 * the user's live Pound entry from Round 9 so it can play out and settle.
 * The is_active filter only suppresses retired tiers from the browse /
 * landing surface.
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
      competitionPostponedPolicy: competitions.postponedPolicy,
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
      poolPrizeStructure: pools.prizeStructure,
    })
    .from(pools)
    .innerJoin(competitions, eq(pools.competitionId, competitions.id))
    .innerJoin(stages, eq(pools.stageId, stages.id))
    .innerJoin(leagues, eq(pools.leagueId, leagues.id))
    .where(and(eq(pools.status, "open"), eq(leagues.isActive, true)))
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
      const matchdays = matchdaysForRound(code, r.stageOrdinal);
      // PL uses "gameweek" (GW); EFL Championship uses "matchday" (MD).
      const matchdayLabel = code === "ELC" ? "MD" : "GW";
      comp = {
        id: r.competitionId,
        slug: r.competitionSlug,
        name: r.competitionName,
        shortName: r.competitionShortName ?? r.competitionName,
        externalCode: code,
        postponedPolicy: r.competitionPostponedPolicy,
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
      prizeBreakdown: buildPrizeBreakdown(
        r.poolPrizeStructure,
        countByPool.get(r.poolId) ?? 0,
        r.leagueEntryFee,
      ),
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
      poolClosesAt: pools.closesAt,
      enteredAt: poolEntries.enteredAt,
      competitionId: competitions.id,
      competitionSlug: competitions.slug,
      competitionShortName: competitions.shortName,
      competitionPostponedPolicy: competitions.postponedPolicy,
      tierName: leagues.name,
      stageId: stages.id,
      stageName: stages.name,
      stageEndDate: stages.endDate,
    })
    .from(poolEntries)
    .innerJoin(pools, eq(poolEntries.poolId, pools.id))
    .innerJoin(competitions, eq(pools.competitionId, competitions.id))
    .innerJoin(leagues, eq(pools.leagueId, leagues.id))
    .innerJoin(stages, eq(pools.stageId, stages.id))
    .where(and(eq(poolEntries.userId, userId), isNull(poolEntries.settledAt)))
    .orderBy(asc(pools.closesAt));

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

  // Predictions made per entry (real count now that /api/predictions exists).
  const entryIds = rows.map((r) => r.entryId);
  const made = await db
    .select({
      poolEntryId: predictions.poolEntryId,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(predictions)
    .where(inArray(predictions.poolEntryId, entryIds))
    .groupBy(predictions.poolEntryId);
  const madeByEntry = new Map(made.map((m) => [m.poolEntryId, Number(m.count)]));

  return rows.map((r) => ({
    id: r.entryId,
    poolId: r.poolId,
    competitionId: r.competitionId,
    competitionSlug: r.competitionSlug,
    competitionShortName: r.competitionShortName ?? "",
    postponedPolicy: r.competitionPostponedPolicy,
    poolName: r.poolName,
    tierName: r.tierName,
    roundName: r.stageName,
    closesAt: r.poolClosesAt.toISOString(),
    roundEndDate: r.stageEndDate,
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
      poolPrizeStructure: pools.prizeStructure,
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
  const matchdays = matchdaysForRound(externalCode, row.stageOrdinal);
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
    prizeBreakdown: buildPrizeBreakdown(row.poolPrizeStructure, entryCount, row.leagueEntryFee),
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

// ─── Entry detail / predictions (step 2f) ─────────────────────────────────

export type EntryMatchPredictionDto = {
  homeScore: number;
  awayScore: number;
  updatedAt: string;
  // Scored fields — null until the outcome sync runs for this match (step 2i).
  points: number | null;
  isExact: boolean | null;
  isCorrectResult: boolean | null;
};

export type EntryMatchOutcomeDto = {
  homeScore: number;
  awayScore: number;
  finishedAt: string;
};

export type EntryMatchDto = {
  eventId: string;
  matchday: number | null;
  // Nullable since step 3a.4 — tournament knockout fixtures expose null
  // teams until the bracket fills in. UI renders "Awaiting teams" and
  // disables prediction inputs when either side is null.
  homeTeam: string | null;
  awayTeam: string | null;
  homeTeamShort: string | null;
  awayTeamShort: string | null;
  kickoffAt: string;
  predictionLockAt: string;
  isLocked: boolean; // predictionLockAt <= now
  status: "scheduled" | "live" | "finished" | "postponed" | "cancelled" | "void";
  prediction: EntryMatchPredictionDto | null;
  outcome: EntryMatchOutcomeDto | null;
};

export type EntryGameweekDto = {
  matchday: number; // 1-38 PL, 1-46 Championship; -1 reserved for "Unscheduled" bucket
  label: string; // "GW 34" / "MD 38" / "Unscheduled"
  matchCount: number;
  predictionCount: number;
  lockedCount: number;
  finishedCount: number; // matches with status='finished'
  pointsTotal: number; // sum of pointsAwarded for the user's predictions in this GW
};

export type EntryDetailDto = {
  id: string;
  poolId: string;
  enteredAt: string;
  settledAt: string | null;
  finalPoints: number | null;
  finalRank: number | null;
  pool: {
    id: string;
    name: string;
    status: "draft" | "open" | "locked" | "settled" | "void";
  };
  tier: TierDto;
  competition: {
    id: string;
    slug: string;
    name: string;
    shortName: string;
    externalCode: string;
  };
  currentRound: CurrentRoundDto;
  // Top-level totals (sum across all GWs).
  matchesTotal: number;
  predictionsMade: number;
  pointsTotal: number; // sum of pointsAwarded across all the user's predictions
  // Per-GW summary for the tab strip — ordered by matchday ascending.
  gameweeks: EntryGameweekDto[];
  // Flat list of all matches in the Round, ordered by kickoff. Client groups
  // by matchday for the active GW pane.
  matches: EntryMatchDto[];
};

export type UpsertPredictionError =
  | "ENTRY_NOT_FOUND"
  | "ENTRY_NOT_OWNED"
  | "EVENT_NOT_IN_POOL"
  | "EVENT_LOCKED"
  | "EVENT_AWAITING_TEAMS"
  | "INVALID_SCORE";

export type UpsertPredictionOutcome =
  | { ok: true; prediction: EntryMatchPredictionDto; eventId: string }
  | { ok: false; error: UpsertPredictionError };

/**
 * Full entry detail — every match in the Round, plus any predictions the user
 * has already saved against this entry. Powers the canonical Predict screen
 * (arch §8.5).
 *
 * Caller must pass the auth'd `userId`; this function returns null when the
 * entry doesn't exist OR belongs to someone else. Don't leak existence by
 * distinguishing the two cases.
 *
 * One round-trip per concern (cheap on Postgres): entry+pool meta, all
 * events in the stage, all predictions for this entry. We then stitch them
 * client-side here.
 */
export async function getEntryDetail(
  entryId: string,
  userId: string,
): Promise<EntryDetailDto | null> {
  const [row] = await db
    .select({
      entryId: poolEntries.id,
      entryUserId: poolEntries.userId,
      entryEnteredAt: poolEntries.enteredAt,
      entrySettledAt: poolEntries.settledAt,
      entryFinalPoints: poolEntries.finalPoints,
      entryFinalRank: poolEntries.finalRank,
      poolId: pools.id,
      poolName: pools.name,
      poolStatus: pools.status,
      competitionId: competitions.id,
      competitionSlug: competitions.slug,
      competitionName: competitions.name,
      competitionShortName: competitions.shortName,
      competitionExternalId: competitions.externalId,
      competitionPostponedPolicy: competitions.postponedPolicy,
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
    .from(poolEntries)
    .innerJoin(pools, eq(poolEntries.poolId, pools.id))
    .innerJoin(competitions, eq(pools.competitionId, competitions.id))
    .innerJoin(stages, eq(pools.stageId, stages.id))
    .innerJoin(leagues, eq(pools.leagueId, leagues.id))
    .where(eq(poolEntries.id, entryId));

  if (!row || row.entryUserId !== userId) return null;

  // All events in the Round, ordered by kickoff. LEFT JOIN event_outcomes so
  // finished matches return their FT score alongside (null when not yet
  // synced / not finished).
  const eventRows = await db
    .select({
      id: events.id,
      matchday: events.matchday,
      homeTeam: events.homeTeam,
      awayTeam: events.awayTeam,
      homeTeamShort: events.homeTeamShort,
      awayTeamShort: events.awayTeamShort,
      kickoffAt: events.kickoffAt,
      predictionLockAt: events.predictionLockAt,
      status: events.status,
      outcomeHome: eventOutcomes.homeScore,
      outcomeAway: eventOutcomes.awayScore,
      outcomeFinishedAt: eventOutcomes.finishedAt,
    })
    .from(events)
    .leftJoin(eventOutcomes, eq(eventOutcomes.eventId, events.id))
    .where(eq(events.stageId, row.stageId))
    .orderBy(asc(events.kickoffAt));

  // Predictions for this entry only — including the scored fields populated
  // by the outcome-sync (step 2i).
  const predictionRows = await db
    .select({
      eventId: predictions.eventId,
      homeScore: predictions.homeScorePredicted,
      awayScore: predictions.awayScorePredicted,
      updatedAt: predictions.updatedAt,
      pointsAwarded: predictions.pointsAwarded,
      isExact: predictions.isExact,
      isCorrectResult: predictions.isCorrectResult,
    })
    .from(predictions)
    .where(eq(predictions.poolEntryId, entryId));

  const predByEventId = new Map<string, EntryMatchPredictionDto>(
    predictionRows.map((p) => [
      p.eventId,
      {
        homeScore: p.homeScore,
        awayScore: p.awayScore,
        updatedAt: p.updatedAt.toISOString(),
        points: p.pointsAwarded,
        isExact: p.isExact,
        isCorrectResult: p.isCorrectResult,
      },
    ]),
  );

  const now = Date.now();
  const matches: EntryMatchDto[] = eventRows.map((e) => ({
    eventId: e.id,
    matchday: e.matchday,
    homeTeam: e.homeTeam,
    awayTeam: e.awayTeam,
    homeTeamShort: e.homeTeamShort,
    awayTeamShort: e.awayTeamShort,
    kickoffAt: e.kickoffAt.toISOString(),
    predictionLockAt: e.predictionLockAt.toISOString(),
    isLocked: e.predictionLockAt.getTime() <= now,
    status: e.status,
    prediction: predByEventId.get(e.id) ?? null,
    outcome:
      e.outcomeHome != null && e.outcomeAway != null && e.outcomeFinishedAt
        ? {
            homeScore: e.outcomeHome,
            awayScore: e.outcomeAway,
            finishedAt: e.outcomeFinishedAt.toISOString(),
          }
        : null,
  }));

  // GW tab summary — group by matchday (null → -1 sentinel bucket).
  //   League comps: -1 means a match has no matchday (rare data issue) →
  //                 label "Unscheduled", placed at the end so the regular
  //                 GW1..GWN sequence reads left-to-right unaffected.
  //   Tournament comps: -1 is the normal home of every knockout fixture
  //                 (football-data sends null matchday for unresolved
  //                 brackets). Label "Knockout Stages", placed at the end
  //                 so the group-stage matchdays read in chronological
  //                 order on the left.
  const externalCode = row.competitionExternalId ?? "";
  const matchdayLabel = externalCode === "ELC" ? "MD" : "GW";
  const isTournamentStyle = row.competitionPostponedPolicy === "forfeit";
  const nullBucketLabel = isTournamentStyle ? "Knockout Stages" : "Unscheduled";

  const byMatchday = new Map<number, EntryMatchDto[]>();
  for (const m of matches) {
    const key = m.matchday ?? -1;
    const list = byMatchday.get(key) ?? [];
    list.push(m);
    byMatchday.set(key, list);
  }
  const gameweeks: EntryGameweekDto[] = Array.from(byMatchday.entries())
    .sort(([a], [b]) => {
      // -1 bucket (null matchday) always trails the numbered matchdays.
      if (a < 0 && b >= 0) return 1;
      if (b < 0 && a >= 0) return -1;
      return a - b;
    })
    .map(([matchday, group]) => ({
      matchday,
      label: matchday < 0 ? nullBucketLabel : `${matchdayLabel} ${matchday}`,
      matchCount: group.length,
      predictionCount: group.filter((m) => m.prediction !== null).length,
      lockedCount: group.filter((m) => m.isLocked).length,
      finishedCount: group.filter((m) => m.status === "finished" && m.outcome !== null).length,
      pointsTotal: group.reduce(
        (sum, m) => sum + (m.prediction?.points ?? 0),
        0,
      ),
    }));
  const matchdays = matchdaysForRound(externalCode, row.stageOrdinal);

  const predictionsMade = predictionRows.length;
  const matchesTotal = eventRows.length;
  const pointsTotal = predictionRows.reduce((sum, p) => sum + (p.pointsAwarded ?? 0), 0);

  return {
    id: row.entryId,
    poolId: row.poolId,
    enteredAt: row.entryEnteredAt.toISOString(),
    settledAt: row.entrySettledAt ? row.entrySettledAt.toISOString() : null,
    finalPoints: row.entryFinalPoints,
    finalRank: row.entryFinalRank,
    pool: {
      id: row.poolId,
      name: row.poolName,
      status: row.poolStatus,
    },
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
      matchdayLabel: matchdayLabel as "GW" | "MD",
      startDate: row.stageStartDate,
      endDate: row.stageEndDate,
    },
    matchesTotal,
    predictionsMade,
    pointsTotal,
    gameweeks,
    matches,
  };
}

/**
 * Upsert a prediction for a single match within an entry.
 *
 * Idempotent on the natural key `(pool_entry_id, event_id)` (the schema's
 * uniqueIndex). Validates four things in order:
 *
 *   1. Entry exists and belongs to the calling user.
 *   2. Event belongs to the entry's Round (otherwise the user could try to
 *      score a different Round's match).
 *   3. Match is still predictable — `predictionLockAt > now` (Decided Rule #7).
 *   4. Scores are non-negative ints. Postgres int range is fine; we cap at 99
 *      to keep the UI tidy and reject obvious mash-typing.
 *
 * The full match metadata (homeTeam, kickoffAt, etc.) is NOT echoed back —
 * the client already has it from the most recent /api/entries/:id load.
 * Just the score + updatedAt come back so the footer indicator can refresh.
 */
export async function upsertPrediction(opts: {
  entryId: string;
  eventId: string;
  userId: string;
  homeScore: number;
  awayScore: number;
  ipAddress: string;
  userAgent: string | null;
}): Promise<UpsertPredictionOutcome> {
  const { entryId, eventId, userId, homeScore, awayScore, ipAddress, userAgent } = opts;

  // Score validation — non-negative int ≤ 99.
  if (
    !Number.isInteger(homeScore) || !Number.isInteger(awayScore) ||
    homeScore < 0 || awayScore < 0 || homeScore > 99 || awayScore > 99
  ) {
    return { ok: false, error: "INVALID_SCORE" };
  }

  // Verify entry ownership + grab the stageId / poolId in one round-trip.
  const [entryRow] = await db
    .select({
      id: poolEntries.id,
      userId: poolEntries.userId,
      poolId: poolEntries.poolId,
      stageId: pools.stageId,
    })
    .from(poolEntries)
    .innerJoin(pools, eq(poolEntries.poolId, pools.id))
    .where(eq(poolEntries.id, entryId));

  if (!entryRow) return { ok: false, error: "ENTRY_NOT_FOUND" };
  if (entryRow.userId !== userId) return { ok: false, error: "ENTRY_NOT_OWNED" };

  // Verify event is in this entry's Round + still predictable.
  const [eventRow] = await db
    .select({
      id: events.id,
      stageId: events.stageId,
      predictionLockAt: events.predictionLockAt,
      homeTeam: events.homeTeam,
      awayTeam: events.awayTeam,
    })
    .from(events)
    .where(eq(events.id, eventId));

  if (!eventRow || eventRow.stageId !== entryRow.stageId) {
    return { ok: false, error: "EVENT_NOT_IN_POOL" };
  }
  // arch §13 Rule #17 — tournament knockout fixtures expose null teams
  // until the bracket fills in. Predictions on those slots aren't allowed;
  // the client also disables the inputs, so this guards against a forged
  // PUT only.
  if (eventRow.homeTeam === null || eventRow.awayTeam === null) {
    return { ok: false, error: "EVENT_AWAITING_TEAMS" };
  }
  if (eventRow.predictionLockAt.getTime() <= Date.now()) {
    return { ok: false, error: "EVENT_LOCKED" };
  }

  // Upsert. (pool_entry_id, event_id) has a uniqueIndex, so ON CONFLICT works.
  const now = new Date();
  const [pred] = await db
    .insert(predictions)
    .values({
      poolEntryId: entryId,
      userId,
      poolId: entryRow.poolId,
      eventId,
      homeScorePredicted: homeScore,
      awayScorePredicted: awayScore,
      ipAddress,
      userAgent,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [predictions.poolEntryId, predictions.eventId],
      set: {
        homeScorePredicted: homeScore,
        awayScorePredicted: awayScore,
        ipAddress,
        userAgent,
        updatedAt: now,
      },
    })
    .returning({
      homeScore: predictions.homeScorePredicted,
      awayScore: predictions.awayScorePredicted,
      updatedAt: predictions.updatedAt,
      pointsAwarded: predictions.pointsAwarded,
      isExact: predictions.isExact,
      isCorrectResult: predictions.isCorrectResult,
    });

  return {
    ok: true,
    eventId,
    prediction: {
      homeScore: pred.homeScore,
      awayScore: pred.awayScore,
      updatedAt: pred.updatedAt.toISOString(),
      // null for fresh / unscored predictions; non-null only if the user
      // somehow edited a prediction whose match has already been scored
      // (shouldn't happen — server rejects on EVENT_LOCKED first — but
      // the type contract permits it for completeness).
      points: pred.pointsAwarded,
      isExact: pred.isExact,
      isCorrectResult: pred.isCorrectResult,
    },
  };
}

// ─── Account history (step 2j) ───────────────────────────────────────────

export type SettledEntryDto = {
  id: string; // pool_entry id
  poolId: string;
  competitionSlug: string;
  competitionShortName: string;
  competitionName: string;
  tierName: string;
  tierSlug: string;
  tierOrdinal: number;
  roundOrdinal: number;
  roundName: string;
  roundEndDate: string | null;
  finalRank: number;
  finalPoints: number;
  entryCount: number; // total entries in the pool — denominator for "X of Y"
  payoutAmount: string | null; // null when no payout (e.g. rank outside the splits)
  cashed: boolean;
  settledAt: string; // ISO
};

export type AccountHistoryDto = {
  stats: {
    rounds: number; // settled entries the user has
    cashes: number; // settled entries with a payout
    bestRank: number | null; // best rank ever (null if no settled entries)
  };
  entries: SettledEntryDto[]; // newest settled first
};

/**
 * The user's settled-pools archive (arch §8.8).
 *
 * One row per `pool_entries` with `settledAt IS NOT NULL`, ordered newest
 * first. Pulls the pool's total entryCount (denominator for "X of Y") and
 * the payout amount (LEFT JOIN — only paying ranks have a row).
 *
 * Empty stats + entries when the user has no settled entries yet.
 */
export async function getAccountHistory(userId: string): Promise<AccountHistoryDto> {
  const rows = await db
    .select({
      entryId: poolEntries.id,
      finalRank: poolEntries.finalRank,
      finalPoints: poolEntries.finalPoints,
      settledAt: poolEntries.settledAt,
      payoutId: poolEntries.payoutId,
      payoutAmount: payments.amount,
      poolId: pools.id,
      competitionSlug: competitions.slug,
      competitionShortName: competitions.shortName,
      competitionName: competitions.name,
      tierSlug: leagues.slug,
      tierName: leagues.name,
      tierOrdinal: leagues.ordinal,
      stageOrdinal: stages.ordinal,
      stageName: stages.name,
      stageEndDate: stages.endDate,
    })
    .from(poolEntries)
    .innerJoin(pools, eq(poolEntries.poolId, pools.id))
    .innerJoin(competitions, eq(pools.competitionId, competitions.id))
    .innerJoin(stages, eq(pools.stageId, stages.id))
    .innerJoin(leagues, eq(pools.leagueId, leagues.id))
    .leftJoin(payments, eq(payments.id, poolEntries.payoutId))
    .where(and(eq(poolEntries.userId, userId), isNotNull(poolEntries.settledAt)))
    .orderBy(desc(poolEntries.settledAt));

  if (rows.length === 0) {
    return { stats: { rounds: 0, cashes: 0, bestRank: null }, entries: [] };
  }

  // Entry counts per pool (denominator), single grouped query.
  const poolIds = Array.from(new Set(rows.map((r) => r.poolId)));
  const counts = await db
    .select({
      poolId: poolEntries.poolId,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(poolEntries)
    .where(inArray(poolEntries.poolId, poolIds))
    .groupBy(poolEntries.poolId);
  const countByPool = new Map(counts.map((c) => [c.poolId, Number(c.count)]));

  const entries: SettledEntryDto[] = rows.map((r) => {
    const payoutAmount = r.payoutAmount; // string | null
    return {
      id: r.entryId,
      poolId: r.poolId,
      competitionSlug: r.competitionSlug,
      competitionShortName: r.competitionShortName ?? r.competitionName,
      competitionName: r.competitionName,
      tierSlug: r.tierSlug,
      tierName: r.tierName,
      tierOrdinal: r.tierOrdinal,
      roundOrdinal: r.stageOrdinal,
      roundName: r.stageName,
      roundEndDate: r.stageEndDate,
      // finalRank/finalPoints are nullable on the column but always written
      // by settlement; fall back to 0 for the rare malformed row rather
      // than crash the API.
      finalRank: r.finalRank ?? 0,
      finalPoints: r.finalPoints ?? 0,
      entryCount: countByPool.get(r.poolId) ?? 0,
      payoutAmount,
      cashed: payoutAmount !== null,
      // settledAt is non-null because of the isNotNull filter above.
      settledAt: r.settledAt!.toISOString(),
    };
  });

  const cashes = entries.filter((e) => e.cashed).length;
  const bestRank = entries.reduce<number | null>(
    (best, e) => (best === null || e.finalRank < best ? e.finalRank : best),
    null,
  );

  return {
    stats: { rounds: entries.length, cashes, bestRank },
    entries,
  };
}

// ─── League table (step 2k) ──────────────────────────────────────────────

export type PoolEntryDto = {
  entryId: string;
  rank: number;
  displayName: string;
  isYou: boolean;
  points: number;
  exacts: number;
  results: number;
};

export type PoolEntriesPoolDto = {
  id: string;
  status: "draft" | "open" | "locked" | "settled" | "void";
  competitionShortName: string;
  competitionSlug: string;
  tierName: string;
  roundName: string;
  roundOrdinal: number;
  matchdayLabel: "GW" | "MD";
  // ISO timestamp of when settlement finalised the pool. Null when still live.
  // Sourced from pools.updatedAt — settlement bumps it in the same UPDATE
  // that flips status='settled'. Works for zero-entry pools too (Rule #15),
  // which have no pool_entries.settledAt to read from.
  settledAt: string | null;
  // 1-indexed position of the current GW within this Round (e.g. "GW 2 of 4").
  // Null when every matchday in the round is terminal (finished/cancelled/void).
  // Drives the "Round in progress · GW2 of 4" status pill per arch §8.6.
  currentMatchdayOrdinal: number | null;
  totalMatchdays: number;
};

export type PoolEntriesDto = {
  pool: PoolEntriesPoolDto;
  viewer: { isEntrant: boolean };
  entries: PoolEntryDto[];
};

export type GetPoolEntriesError =
  | "POOL_NOT_FOUND"
  | "NOT_AUTHENTICATED"
  | "NOT_ENTRANT";

export type GetPoolEntriesOutcome =
  | { ok: true; data: PoolEntriesDto }
  | { ok: false; error: GetPoolEntriesError };

/**
 * League table data for a single pool (arch §8.6).
 *
 * Access rules — mapped to HTTP statuses at the route layer:
 *   - Pool not found → POOL_NOT_FOUND (404)
 *   - Pool settled → public; any caller (auth'd or not) gets the standings.
 *   - Pool live + viewer not auth'd → NOT_AUTHENTICATED (401)
 *   - Pool live + viewer not entered → NOT_ENTRANT (403)
 *
 * Ranking:
 *   - Live pools: aggregate per-entry scores from `predictions` (LEFT JOIN so
 *     zero-prediction entries still appear at the bottom) and rank with the
 *     same `rankEntries` used by settlement (Decided Rule #10). Live ranks
 *     recompute on every fetch as outcome-sync awards points.
 *   - Settled pools: use the stored `pool_entries.finalRank` / `finalPoints`
 *     so the rendered table matches what got audited, even if a late score
 *     correction nudges the underlying aggregates. Exacts/results columns are
 *     still derived from the predictions aggregate — those per-prediction
 *     flags are immutable post-scoring so they can't drift from the audit.
 *
 * Performance: three queries — pool meta, matchday rollup, entries aggregate.
 * The entries aggregate is one grouped query joining users + LEFT JOIN
 * predictions (mirrors `settleOnePool`); no per-entry loops.
 */
export async function getPoolEntries(
  poolId: string,
  viewerUserId: string | null,
): Promise<GetPoolEntriesOutcome> {
  // 1. Pool meta + competition + tier + stage.
  const [meta] = await db
    .select({
      poolId: pools.id,
      poolStatus: pools.status,
      poolUpdatedAt: pools.updatedAt,
      stageId: stages.id,
      stageName: stages.name,
      stageOrdinal: stages.ordinal,
      competitionShortName: competitions.shortName,
      competitionName: competitions.name,
      competitionSlug: competitions.slug,
      competitionExternalId: competitions.externalId,
      tierName: leagues.name,
    })
    .from(pools)
    .innerJoin(competitions, eq(pools.competitionId, competitions.id))
    .innerJoin(stages, eq(pools.stageId, stages.id))
    .innerJoin(leagues, eq(pools.leagueId, leagues.id))
    .where(eq(pools.id, poolId));

  if (!meta) return { ok: false, error: "POOL_NOT_FOUND" };

  const isSettled = meta.poolStatus === "settled";

  // 2. Access gating. Settled pools are public — anyone can view final
  // standings. Live pools require auth + an existing entry in this pool.
  if (!isSettled) {
    if (!viewerUserId) return { ok: false, error: "NOT_AUTHENTICATED" };
    const [own] = await db
      .select({ id: poolEntries.id })
      .from(poolEntries)
      .where(and(eq(poolEntries.poolId, poolId), eq(poolEntries.userId, viewerUserId)));
    if (!own) return { ok: false, error: "NOT_ENTRANT" };
  }

  // 3. Per-matchday rollup — drives the "GW2 of 4" status pill. A matchday
  // is "terminal" once every event in it is finished / cancelled / void;
  // current matchday = first matchday containing any non-terminal event.
  const matchdayRows = await db
    .select({
      matchday: events.matchday,
      nonTerminalCount: sql<number>`COUNT(*) FILTER (WHERE ${events.status} NOT IN ('finished','cancelled','void'))::int`,
    })
    .from(events)
    .where(and(eq(events.stageId, meta.stageId), isNotNull(events.matchday)))
    .groupBy(events.matchday)
    .orderBy(asc(events.matchday));

  const totalMatchdays = matchdayRows.length;
  const firstNonTerminalIdx = matchdayRows.findIndex(
    (r) => Number(r.nonTerminalCount) > 0,
  );
  const currentMatchdayOrdinal =
    firstNonTerminalIdx === -1 ? null : firstNonTerminalIdx + 1;

  // 4. Entries aggregate — one grouped query, mirrors settleOnePool's score
  // aggregate with users joined for displayName. LEFT JOIN predictions so
  // entries with zero predictions still show up (0/0/0) at the bottom.
  const rows = await db
    .select({
      entryId: poolEntries.id,
      userId: poolEntries.userId,
      displayName: users.displayName,
      finalRank: poolEntries.finalRank,
      finalPoints: poolEntries.finalPoints,
      points: sql<number>`COALESCE(SUM(${predictions.pointsAwarded}), 0)::int`,
      exacts: sql<number>`COALESCE(SUM(CASE WHEN ${predictions.isExact} THEN 1 ELSE 0 END), 0)::int`,
      results: sql<number>`COALESCE(SUM(CASE WHEN ${predictions.isCorrectResult} THEN 1 ELSE 0 END), 0)::int`,
    })
    .from(poolEntries)
    .innerJoin(users, eq(users.id, poolEntries.userId))
    .leftJoin(predictions, eq(predictions.poolEntryId, poolEntries.id))
    .where(eq(poolEntries.poolId, poolId))
    .groupBy(
      poolEntries.id,
      poolEntries.userId,
      users.displayName,
      poolEntries.finalRank,
      poolEntries.finalPoints,
    );

  // 5. Map to DTO with rank applied. For settled pools the audited
  // finalRank/finalPoints win; for live pools recompute via rankEntries().
  let entryDtos: PoolEntryDto[];
  if (isSettled) {
    entryDtos = rows.map((r) => ({
      entryId: r.entryId,
      rank: r.finalRank ?? 0,
      displayName: r.displayName,
      isYou: viewerUserId !== null && r.userId === viewerUserId,
      // Trust audited finalPoints; fall back to the aggregate only for
      // malformed rows (shouldn't happen — settlement always writes both).
      points: r.finalPoints ?? Number(r.points),
      exacts: Number(r.exacts),
      results: Number(r.results),
    }));
  } else {
    const scores: EntryScore[] = rows.map((r) => ({
      entryId: r.entryId,
      userId: r.userId,
      points: Number(r.points),
      exacts: Number(r.exacts),
      results: Number(r.results),
    }));
    const ranked = rankEntries(scores);
    const byId = new Map(rows.map((r) => [r.entryId, r]));
    entryDtos = ranked.map((rk) => {
      const row = byId.get(rk.entryId)!;
      return {
        entryId: rk.entryId,
        rank: rk.finalRank,
        displayName: row.displayName,
        isYou: viewerUserId !== null && rk.userId === viewerUserId,
        points: rk.points,
        exacts: rk.exacts,
        results: rk.results,
      };
    });
  }

  // Stable secondary sort by displayName for tied ranks so the visible
  // order doesn't flicker between fetches.
  entryDtos.sort((a, b) =>
    a.rank !== b.rank ? a.rank - b.rank : a.displayName.localeCompare(b.displayName),
  );

  const matchdayLabel: "GW" | "MD" =
    meta.competitionExternalId === "ELC" ? "MD" : "GW";

  return {
    ok: true,
    data: {
      pool: {
        id: meta.poolId,
        status: meta.poolStatus,
        competitionShortName: meta.competitionShortName ?? meta.competitionName,
        competitionSlug: meta.competitionSlug,
        tierName: meta.tierName,
        roundName: meta.stageName,
        roundOrdinal: meta.stageOrdinal,
        matchdayLabel,
        settledAt: isSettled ? meta.poolUpdatedAt.toISOString() : null,
        currentMatchdayOrdinal,
        totalMatchdays,
      },
      viewer: {
        isEntrant: viewerUserId !== null && entryDtos.some((e) => e.isYou),
      },
      entries: entryDtos,
    },
  };
}
