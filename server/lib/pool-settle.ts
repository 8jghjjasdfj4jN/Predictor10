/*
Predictor10 — pool settlement (step 2j).

What it does:
  1. Finds pools where status != 'settled' AND the settlement gate passes
     (Decided Rule #13 — every event is either finished+outcome OR
     cancelled/void; postponed/scheduled/live still block).
  2. For each ready pool, in a single transaction:
       - Sums points per entry. Counts exacts + correct-results for tie-break.
       - Ranks entries by (points desc, exacts desc, correct desc) using
         standard competition ranking (1, 2, 2, 4).
       - Computes mock payouts per pool.prizeStructure.splits, tied positions
         sharing their combined slice evenly. Rounds each line item to 2dp;
         any residual penny goes to rank 1 (Decided Rule #14).
       - Writes credit-direction `payments` rows for paying ranks only.
       - Updates pool_entries.{finalRank, finalPoints, payoutId, settledAt}.
       - Updates predictions.settledAt for every prediction in the pool.
       - Sets pools.status = 'settled'.
       - Writes a single `pool.settlement` audit row.

Zero-entry pools (Decided Rule #15) still mark settled — no payments, audit
records entryCount: 0. Handles the rare race between stale-pool cleanup and
outcome sync.

Idempotent (Decided Rule #1): pools already at status='settled' are filtered
out at the gate check, and the per-pool transaction takes a row-level lock
on `pools` so a concurrent run can't double-process the same pool. Re-runs
never double-pay.

Scheduling: unscheduled in step 2j. Runnable manually via `pnpm settle-pools`
(CLI) or `POST /api/admin/settle-pools` (HTTP, X-Admin-Token gated). External
scheduler can be wired up alongside sync-outcomes whenever convenient.
*/

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { pools, poolEntries, predictions } from "../db/schema/pools";
import { payments } from "../db/schema/payments";
import { leagues } from "../db/schema/leagues";
import { writeAudit } from "./audit";

// ─── Public result shape ─────────────────────────────────────────────────

export type SettleResult = {
  poolsChecked: number; // pools considered (not yet settled)
  poolsReady: number; // pools passing the gate clause
  poolsSettled: number; // pools that completed settlement in this run
  entriesSettled: number;
  payoutsWritten: number;
  zeroEntryPools: number;
  errors: { poolId: string; message: string }[];
};

// ─── Internal shapes ──────────────────────────────────────────────────────

type PrizeStructure = {
  model: string;
  splits: number[];
  /**
   * Operator commission as a 0..1 fraction of the gross pot. Step 2n: every
   * active tier carries `houseFeePct: 0.25`. Older snapshots from before
   * step 2n omit this — when missing, treated as 0 so legacy pools settle
   * at gross pot (preserving the rules they were opened under). The Pound's
   * retired Round 9 pool is the practical case for this fallback.
   */
  houseFeePct?: number;
};

function isPrizeStructure(v: unknown): v is PrizeStructure {
  if (typeof v !== "object" || v === null) return false;
  const rec = v as Record<string, unknown>;
  if (!Array.isArray(rec.splits) || !rec.splits.every((s) => typeof s === "number")) return false;
  // houseFeePct optional; if present, must be a finite number in [0, 1).
  if (rec.houseFeePct !== undefined) {
    if (typeof rec.houseFeePct !== "number") return false;
    if (!Number.isFinite(rec.houseFeePct)) return false;
    if (rec.houseFeePct < 0 || rec.houseFeePct >= 1) return false;
  }
  return true;
}

/**
 * Pure helper for non-settlement consumers (portal-data.ts, mostly) that
 * need to display the prize-per-rank breakdown for an open pool before
 * any settlement has run. Mirrors the rounding rule used by
 * `computePayouts` so display amounts agree with what the user will
 * actually be paid to the penny — including the Decided Rule #14
 * residual-to-rank-1 quirk.
 *
 * Inputs are the *player pot* (already net of house fee) and the same
 * `splits` array stored on the pool. Returns one entry per split slot.
 * Empty result if pot ≤ 0 or splits is empty.
 *
 * Pure function — no I/O, safe to call hot from API handlers.
 */
export function computeDisplayBreakdown(
  playerPotPence: number,
  splits: number[],
): { rank: number; amountPence: number }[] {
  if (playerPotPence <= 0 || splits.length === 0) return [];
  const lines: { rank: number; amountPence: number }[] = [];
  let splitsSum = 0;
  for (let i = 0; i < splits.length; i++) {
    lines.push({ rank: i + 1, amountPence: Math.round(playerPotPence * splits[i]) });
    splitsSum += splits[i];
  }
  // Residual → rank 1 (Decided Rule #14, mirrors computePayouts exactly).
  const expected = Math.round(playerPotPence * splitsSum);
  const got = lines.reduce((acc, l) => acc + l.amountPence, 0);
  const residual = expected - got;
  if (residual !== 0) lines[0].amountPence += residual;
  return lines;
}

export type EntryScore = {
  entryId: string;
  userId: string;
  points: number;
  exacts: number;
  results: number;
};

export type RankedEntry = EntryScore & {
  finalRank: number;
};

export type PayoutLine = {
  entryId: string;
  userId: string;
  rank: number;
  amountPence: number; // integer pence — converted to "X.YY" string at insert time
};

// ─── Ranking ──────────────────────────────────────────────────────────────

/**
 * Standard competition ranking with the tie-breaker from Decided Rule #10:
 *   pts → exact-count → correct-result-count → split.
 *
 * Ties share the best rank; the next slot skips by the tie size
 * (e.g. 1, 2, 2, 4 — there is no rank 3 when two entries tie at rank 2).
 *
 * Pure function — no I/O. Input list is not mutated.
 */
export function rankEntries(scores: EntryScore[]): RankedEntry[] {
  const sorted = [...scores].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.exacts !== a.exacts) return b.exacts - a.exacts;
    return b.results - a.results;
  });

  const ranked: RankedEntry[] = [];
  let currentRank = 0;
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : null;
    const isTieWithPrev =
      prev !== null &&
      prev.points === s.points &&
      prev.exacts === s.exacts &&
      prev.results === s.results;
    if (!isTieWithPrev) currentRank = i + 1;
    ranked.push({ ...s, finalRank: currentRank });
  }
  return ranked;
}

// ─── Payout maths ─────────────────────────────────────────────────────────

/**
 * Compute mock payouts from ranked entries + prize splits.
 *
 * Approach:
 *   - Group ranked entries by finalRank (rank 1 may have N tied entries).
 *   - Walk splits in order, paying ranks in order (rank 1 takes splits[0],
 *     rank 2 takes splits[1], …). Tied entries within a rank share their
 *     position's splits *combined* across the tie's width — e.g. two entries
 *     tied for rank 1 in a top-3 split [0.70, 0.20, 0.10] share (0.70 + 0.20)
 *     evenly, 0.45 each; rank 3 still pays 0.10 to whoever sits there.
 *   - Each line item rounds to 2dp at storage. Sum-vs-expected residual
 *     (typically ±1p) goes to rank 1 (Decided Rule #14).
 *
 * Unallocated splits (more splits than entries) silently fall away — mock
 * dead-money, mirrors what a real operator would book to commission.
 *
 * Integer pence internally — no float drift. Converted to "X.YY" decimal
 * strings at the insert site.
 *
 * Pure function — no I/O.
 */
export function computePayouts(
  ranked: RankedEntry[],
  potPence: number,
  splits: number[],
): PayoutLine[] {
  if (ranked.length === 0 || potPence <= 0 || splits.length === 0) return [];

  // Group entries by finalRank, preserving rank order.
  const byRank: { rank: number; entries: RankedEntry[] }[] = [];
  for (const r of ranked) {
    const last = byRank[byRank.length - 1];
    if (last && last.rank === r.finalRank) last.entries.push(r);
    else byRank.push({ rank: r.finalRank, entries: [r] });
  }

  const lines: PayoutLine[] = [];
  let splitCursor = 0;
  let payingSplitsSum = 0;

  for (const group of byRank) {
    if (splitCursor >= splits.length) break;
    const tieWidth = group.entries.length;
    // Combine this group's slice across the tie's width.
    let combined = 0;
    for (let k = 0; k < tieWidth && splitCursor + k < splits.length; k++) {
      combined += splits[splitCursor + k];
    }
    payingSplitsSum += combined;
    splitCursor += tieWidth;

    if (combined <= 0) continue;
    const perEntryPence = Math.round((potPence * combined) / tieWidth);
    for (const e of group.entries) {
      lines.push({
        entryId: e.entryId,
        userId: e.userId,
        rank: e.finalRank,
        amountPence: perEntryPence,
      });
    }
  }

  // Residual penny → rank 1 (Decided Rule #14).
  if (lines.length > 0) {
    const expected = Math.round(potPence * payingSplitsSum);
    const got = lines.reduce((acc, l) => acc + l.amountPence, 0);
    const residual = expected - got;
    if (residual !== 0) lines[0].amountPence += residual;
  }

  return lines;
}

function penceToDecimalString(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  const abs = Math.abs(pence);
  const pounds = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${sign}${pounds}.${rem.toString().padStart(2, "0")}`;
}

// ─── Settlement gate ──────────────────────────────────────────────────────

/**
 * Find pools that are ready to settle.
 *
 * Decided Rule #13: a pool is ready when every event in its stage is either
 *   (status='finished' AND has an event_outcomes row)
 *   OR status IN ('cancelled', 'void')
 *
 * Decided Rule #16 (step 3a.10): when the pool's competition has
 *   `postponed_policy = 'forfeit'` (currently WC), a `postponed` event whose
 *   scheduled kickoff has passed is also treated as accounted-for. The
 *   prediction (if any) scored 0 — pointsAwarded stays null and contributes
 *   0 in the SUM aggregate. If football-data later reschedules the match,
 *   our fixture-sync flips status back to 'scheduled' with a future
 *   kickoff, which puts the event back in the blocking set.
 *
 * status IN ('scheduled', 'live') always block. 'postponed' still blocks
 *   for 'wait' competitions (PL / Champ).
 *
 * Also requires the stage to have at least one event (defensive — guards
 * against settling a freshly-seeded stage with no fixtures attached yet).
 *
 * Excludes pools already at status='settled'.
 *
 * Returns pool IDs ordered by closesAt ASC so earlier-closing rounds settle
 * first on partial runs.
 */
async function findReadyPoolIds(): Promise<string[]> {
  const rows = await db.execute<{ pool_id: string }>(sql`
    SELECT p.id AS pool_id
    FROM pools p
    INNER JOIN stages s ON s.id = p.stage_id
    INNER JOIN competitions c ON c.id = s.competition_id
    WHERE p.status <> 'settled'
      AND EXISTS (
        SELECT 1 FROM events e WHERE e.stage_id = p.stage_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM events e
        LEFT JOIN event_outcomes o ON o.event_id = e.id
        WHERE e.stage_id = p.stage_id
          AND NOT (
            (e.status = 'finished' AND o.event_id IS NOT NULL)
            OR e.status IN ('cancelled', 'void')
            OR (
              c.postponed_policy = 'forfeit'
              AND e.status = 'postponed'
              AND e.kickoff_at <= NOW()
            )
          )
      )
      -- P2 (June 2026): never settle while any of this pool's own predictions
      -- on a FINISHED match is still unscored. Outcome-write and prediction-
      -- scoring are separate, non-transactional steps in outcome-sync; this
      -- guard stops a settle pass that races a mid-flight sync (or a crash
      -- between those two writes) from counting a real, correct prediction as
      -- 0 — the worst case being the Final, the last match to finish. Once
      -- the next sync scores those predictions, the pool becomes ready on the
      -- following pass. Cancelled/void and forfeit-postponed predictions stay
      -- null by design but their events are NOT 'finished', so they don't trip
      -- this. Scoring itself still reads the 90-minute full-time result only
      -- (extractRegulationScore) — extra time and penalties never count.
      AND NOT EXISTS (
        SELECT 1
        FROM predictions pr
        INNER JOIN events fe ON fe.id = pr.event_id
        WHERE pr.pool_id = p.id
          AND fe.status = 'finished'
          AND pr.points_awarded IS NULL
      )
    ORDER BY p.closes_at ASC
  `);
  return rows.map((r) => r.pool_id);
}

// ─── Single-pool settlement (one transaction) ────────────────────────────

type SettleOnePoolOutcome = {
  settled: boolean;
  entriesSettled: number;
  payoutsWritten: number;
  zeroEntry: boolean;
};

async function settleOnePool(poolId: string): Promise<SettleOnePoolOutcome> {
  return db.transaction(async (tx) => {
    // Lock the pool row + grab the tier fee in one round-trip. FOR UPDATE
    // prevents a concurrent worker double-processing the same pool.
    const [locked] = await tx
      .select({
        poolStatus: pools.status,
        prizeStructure: pools.prizeStructure,
        tierFee: leagues.entryFee,
      })
      .from(pools)
      .innerJoin(leagues, eq(pools.leagueId, leagues.id))
      .where(eq(pools.id, poolId))
      .for("update");

    if (!locked) {
      return { settled: false, entriesSettled: 0, payoutsWritten: 0, zeroEntry: false };
    }
    // Already settled? Another worker beat us — idempotent skip.
    if (locked.poolStatus === "settled") {
      return { settled: false, entriesSettled: 0, payoutsWritten: 0, zeroEntry: false };
    }
    if (!isPrizeStructure(locked.prizeStructure)) {
      throw new Error(
        `pool ${poolId} has malformed prizeStructure: ${JSON.stringify(locked.prizeStructure)}`,
      );
    }
    const splits = locked.prizeStructure.splits;
    // Step 2n: operator commission, applied to gross pot before payouts.
    // Missing on legacy snapshots → 0 (Pound's retired pool settles at gross).
    const houseFeePct = locked.prizeStructure.houseFeePct ?? 0;
    const tierFeePence = Math.round(parseFloat(locked.tierFee) * 100);

    // Aggregate scores per entry. LEFT JOIN predictions so entries with zero
    // predictions still appear (with 0/0/0). The SUM is bigint in Postgres
    // for COALESCE+SUM(int), but we cast to int — points sums for a single
    // round will never overflow (max ~250 pts × ~50 matches = 12,500).
    const scoreList = await tx
      .select({
        entryId: poolEntries.id,
        userId: poolEntries.userId,
        points: sql<number>`COALESCE(SUM(${predictions.pointsAwarded}), 0)::int`,
        exacts: sql<number>`COALESCE(SUM(CASE WHEN ${predictions.isExact} THEN 1 ELSE 0 END), 0)::int`,
        results: sql<number>`COALESCE(SUM(CASE WHEN ${predictions.isCorrectResult} THEN 1 ELSE 0 END), 0)::int`,
      })
      .from(poolEntries)
      .leftJoin(predictions, eq(predictions.poolEntryId, poolEntries.id))
      .where(and(eq(poolEntries.poolId, poolId), isNull(poolEntries.voidedAt)))
      .groupBy(poolEntries.id, poolEntries.userId);

    const entryCount = scoreList.length;
    const now = new Date();

    // Decided Rule #15 — zero-entry pools still settle (pot=0, no payouts).
    if (entryCount === 0) {
      await tx
        .update(pools)
        .set({ status: "settled", updatedAt: now })
        .where(eq(pools.id, poolId));
      await writeAudit({
        action: "pool.settlement",
        entityType: "pool",
        entityId: poolId,
        metadata: { entryCount: 0, potPence: 0, ranks: [], payouts: [] },
      });
      return { settled: true, entriesSettled: 0, payoutsWritten: 0, zeroEntry: true };
    }

    const potPence = tierFeePence * entryCount;
    // House fee taken off the top (Decided Rule #14 + step 2n). Math.floor
    // so we never overpay players — sub-penny remainder stays on the
    // operator side, which matches how a real merchant statement would
    // round. With current splits all four tiers settle exactly: gross
    // £NN.00 × 0.25 lands on whole pennies.
    const houseFeePence = Math.floor(potPence * houseFeePct);
    const playerPotPence = potPence - houseFeePence;

    const scores: EntryScore[] = scoreList.map((r) => ({
      entryId: r.entryId,
      userId: r.userId,
      points: Number(r.points),
      exacts: Number(r.exacts),
      results: Number(r.results),
    }));
    const ranked = rankEntries(scores);
    const payoutLines = computePayouts(ranked, playerPotPence, splits);

    // Write credit-direction `payments` rows for paying ranks only.
    // amount is decimal(14,2) — converted from integer pence at insert time.
    const payoutIdByEntry = new Map<string, string>();
    for (const line of payoutLines) {
      const [pay] = await tx
        .insert(payments)
        .values({
          userId: line.userId,
          direction: "credit",
          amount: penceToDecimalString(line.amountPence),
          currency: "GBP",
          referenceType: "payout",
          referenceId: line.entryId,
          mode: "mock",
          status: "succeeded",
          initiatedAt: now,
          completedAt: now,
        })
        .returning({ id: payments.id });
      payoutIdByEntry.set(line.entryId, pay.id);
    }

    // Update every entry — ranks + points always; payoutId only for paying ranks.
    for (const r of ranked) {
      const payoutId = payoutIdByEntry.get(r.entryId) ?? null;
      await tx
        .update(poolEntries)
        .set({
          finalRank: r.finalRank,
          finalPoints: r.points,
          payoutId,
          settledAt: now,
        })
        .where(eq(poolEntries.id, r.entryId));
    }

    // Bulk-mark all predictions in this pool as settled.
    await tx
      .update(predictions)
      .set({ settledAt: now })
      .where(and(eq(predictions.poolId, poolId), isNull(predictions.settledAt)));

    // Set pool status last so the gate clause stops matching this pool
    // on any subsequent run.
    await tx
      .update(pools)
      .set({ status: "settled", updatedAt: now })
      .where(eq(pools.id, poolId));

    // One audit row per pool — captures full settlement evidence per LCCP
    // without exploding audit_log volume.
    await writeAudit({
      action: "pool.settlement",
      entityType: "pool",
      entityId: poolId,
      metadata: {
        entryCount,
        potPence,
        houseFeePct,
        houseFeePence,
        playerPotPence,
        ranks: ranked.map((r) => ({
          entryId: r.entryId,
          userId: r.userId,
          rank: r.finalRank,
          points: r.points,
          exacts: r.exacts,
          results: r.results,
        })),
        payouts: payoutLines.map((l) => ({
          entryId: l.entryId,
          userId: l.userId,
          rank: l.rank,
          amount: penceToDecimalString(l.amountPence),
        })),
      },
    });

    return {
      settled: true,
      entriesSettled: ranked.length,
      payoutsWritten: payoutLines.length,
      zeroEntry: false,
    };
  });
}

// ─── Public entry point ───────────────────────────────────────────────────

export async function settleAllReadyPools(): Promise<SettleResult> {
  const result: SettleResult = {
    poolsChecked: 0,
    poolsReady: 0,
    poolsSettled: 0,
    entriesSettled: 0,
    payoutsWritten: 0,
    zeroEntryPools: 0,
    errors: [],
  };

  const [agg] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(pools)
    .where(sql`${pools.status} <> 'settled'`);
  result.poolsChecked = Number(agg?.n ?? 0);

  const readyIds = await findReadyPoolIds();
  result.poolsReady = readyIds.length;

  for (const poolId of readyIds) {
    try {
      const r = await settleOnePool(poolId);
      if (r.settled) {
        result.poolsSettled++;
        result.entriesSettled += r.entriesSettled;
        result.payoutsWritten += r.payoutsWritten;
        if (r.zeroEntry) result.zeroEntryPools++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[settle-pools] pool ${poolId} failed:`, err);
      result.errors.push({ poolId, message });
    }
  }

  return result;
}
