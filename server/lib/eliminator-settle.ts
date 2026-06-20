/*
Eliminator10 — survival engine (step e4).

Runs on the same 15-minute settle tick as the pools. For each Eliminator round
that's ready, it scores every alive player's pick, eliminates the ones who
didn't survive, carries the survivors into the next round, and — when one (or
a co-surviving group) is left — settles the game.

Survival rule (Rule 4/5): the picked team must WIN in normal time. Scores are
read straight from `event_outcomes.home_score` / `away_score`, which the
outcome-sync already stores as the 90-minute regulation result (extra time and
penalties live in separate columns and never count) — so a knockout level after
90 that's decided on penalties is a DRAW here, i.e. elimination. A draw, a loss,
or no pick at all = out.

Ready-gate mirrors the pool gate (arch §13 Rules #13/#16): a round settles once
every one of its fixtures is finished-with-outcome, cancelled/void, or — under
the WC's 'forfeit' policy — postponed past its kickoff. Rounds settle in order
(a round waits for the previous one). Postponed/abandoned picks roll forward
rather than eliminating (Rule 8): with no result to judge, the player survives.

Idempotent: a settled round is filtered out of the ready set and the row is
locked FOR UPDATE while processing, so a re-run or overlapping tick can't
double-eliminate or double-crown.
*/

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { events, eventOutcomes } from "../db/schema/sports";
import {
  eliminatorGames,
  eliminatorRounds,
  eliminatorEntries,
  eliminatorPicks,
} from "../db/schema/eliminator";

export type EliminatorSettleResult = {
  roundsSettled: number;
  eliminated: number;
  gamesSettled: number;
  errors: { roundId: string; message: string }[];
};

/**
 * Rounds ready to settle. A round qualifies when its game is live, the round
 * isn't already settled, its previous round IS settled (sequential), and every
 * one of its fixtures is accounted for (finished-with-outcome / cancelled /
 * void / forfeit-postponed-past-kickoff). Ordered by ordinal so earlier rounds
 * settle first.
 */
async function findReadyRoundIds(): Promise<string[]> {
  const rows = await db.execute<{ round_id: string }>(sql`
    SELECT r.id AS round_id
    FROM eliminator_rounds r
    INNER JOIN eliminator_games g ON g.id = r.game_id
    WHERE r.status <> 'settled'
      AND g.is_active = true
      AND g.status <> 'settled'
      AND EXISTS (SELECT 1 FROM eliminator_round_events re WHERE re.round_id = r.id)
      AND NOT EXISTS (
        SELECT 1 FROM eliminator_rounds pr
        WHERE pr.game_id = r.game_id
          AND pr.ordinal = r.ordinal - 1
          AND pr.status <> 'settled'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM eliminator_round_events re
        INNER JOIN events e ON e.id = re.event_id
        INNER JOIN competitions c ON c.id = e.competition_id
        LEFT JOIN event_outcomes o ON o.event_id = e.id
        WHERE re.round_id = r.id
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
    ORDER BY r.ordinal ASC
  `);
  return rows.map((r) => r.round_id);
}

type SettleOneRoundOutcome = {
  settled: boolean;
  eliminated: number;
  gameSettled: boolean;
};

async function settleOneRound(roundId: string): Promise<SettleOneRoundOutcome> {
  return db.transaction(async (tx) => {
    const now = new Date();

    // Lock the round — prevents an overlapping tick double-processing it.
    const [round] = await tx
      .select()
      .from(eliminatorRounds)
      .where(eq(eliminatorRounds.id, roundId))
      .for("update");
    if (!round || round.status === "settled") {
      return { settled: false, eliminated: 0, gameSettled: false };
    }
    const gameId = round.gameId;

    // Players still in going into this round.
    const aliveEntries = await tx
      .select({ id: eliminatorEntries.id })
      .from(eliminatorEntries)
      .where(and(eq(eliminatorEntries.gameId, gameId), eq(eliminatorEntries.status, "alive")));

    // Their picks for this round.
    const pickRows = await tx
      .select({
        id: eliminatorPicks.id,
        entryId: eliminatorPicks.entryId,
        eventId: eliminatorPicks.eventId,
        side: eliminatorPicks.pickedSide,
      })
      .from(eliminatorPicks)
      .where(eq(eliminatorPicks.roundId, roundId));
    const pickByEntry = new Map(pickRows.map((p) => [p.entryId, p]));

    // FT (regulation) results for the picked fixtures.
    const eventIds = Array.from(new Set(pickRows.map((p) => p.eventId)));
    const eventByid = new Map<
      string,
      { status: string; homeScore: number | null; awayScore: number | null }
    >();
    if (eventIds.length > 0) {
      const evRows = await tx
        .select({
          id: events.id,
          status: events.status,
          homeScore: eventOutcomes.homeScore,
          awayScore: eventOutcomes.awayScore,
        })
        .from(events)
        .leftJoin(eventOutcomes, eq(eventOutcomes.eventId, events.id))
        .where(inArray(events.id, eventIds));
      for (const e of evRows) {
        eventByid.set(e.id, { status: e.status, homeScore: e.homeScore, awayScore: e.awayScore });
      }
    }

    let eliminated = 0;
    for (const entry of aliveEntries) {
      const pick = pickByEntry.get(entry.id);

      // No pick in by the deadline → out (Rule 5).
      if (!pick) {
        await tx
          .update(eliminatorEntries)
          .set({ status: "eliminated", eliminatedRoundId: roundId, eliminatedReason: "no_pick", settledAt: now })
          .where(eq(eliminatorEntries.id, entry.id));
        eliminated++;
        continue;
      }

      const ev = eventByid.get(pick.eventId);
      let survived: boolean;
      let reason: string | null = null;

      if (ev && ev.status === "finished" && ev.homeScore !== null && ev.awayScore !== null) {
        const mine = pick.side === "home" ? ev.homeScore : ev.awayScore;
        const theirs = pick.side === "home" ? ev.awayScore : ev.homeScore;
        if (mine > theirs) {
          survived = true;
        } else if (mine === theirs) {
          survived = false;
          reason = "draw";
        } else {
          survived = false;
          reason = "lost";
        }
      } else {
        // Cancelled / void / forfeit-postponed — no result to judge. Rule 8:
        // the pick rolls forward, the player is not eliminated.
        survived = true;
      }

      await tx.update(eliminatorPicks).set({ survived, scoredAt: now }).where(eq(eliminatorPicks.id, pick.id));

      if (!survived) {
        await tx
          .update(eliminatorEntries)
          .set({ status: "eliminated", eliminatedRoundId: roundId, eliminatedReason: reason, settledAt: now })
          .where(eq(eliminatorEntries.id, entry.id));
        eliminated++;
      }
    }

    // Round is done.
    await tx
      .update(eliminatorRounds)
      .set({ status: "settled", settledAt: now, updatedAt: now })
      .where(eq(eliminatorRounds.id, roundId));

    // ── Game progression ──────────────────────────────────────────────────
    const [{ alive }] = await tx
      .select({ alive: sql<number>`COUNT(*) FILTER (WHERE ${eliminatorEntries.status} = 'alive')::int` })
      .from(eliminatorEntries)
      .where(eq(eliminatorEntries.gameId, gameId));
    const aliveCount = Number(alive ?? 0);

    const [nextRound] = await tx
      .select({ id: eliminatorRounds.id })
      .from(eliminatorRounds)
      .where(and(eq(eliminatorRounds.gameId, gameId), eq(eliminatorRounds.ordinal, round.ordinal + 1)));

    let gameSettled = false;

    if (aliveCount === 1) {
      // Last one standing — crown them.
      await tx
        .update(eliminatorEntries)
        .set({ status: "won", finalRank: 1, settledAt: now })
        .where(and(eq(eliminatorEntries.gameId, gameId), eq(eliminatorEntries.status, "alive")));
      await tx.update(eliminatorGames).set({ status: "settled", updatedAt: now }).where(eq(eliminatorGames.id, gameId));
      gameSettled = true;
    } else if (aliveCount === 0) {
      // Everyone left went out in the same round — nobody outlasted the others,
      // so the players eliminated THIS round are co-winners (Rule 11 split).
      await tx
        .update(eliminatorEntries)
        .set({ status: "won", finalRank: 1, eliminatedRoundId: null, eliminatedReason: null, settledAt: now })
        .where(and(eq(eliminatorEntries.gameId, gameId), eq(eliminatorEntries.eliminatedRoundId, roundId)));
      await tx.update(eliminatorGames).set({ status: "settled", updatedAt: now }).where(eq(eliminatorGames.id, gameId));
      gameSettled = true;
    } else if (!nextRound) {
      // Survivors remain but the schedule is exhausted — split the win (Rule 11).
      await tx
        .update(eliminatorEntries)
        .set({ status: "won", finalRank: 1, settledAt: now })
        .where(and(eq(eliminatorEntries.gameId, gameId), eq(eliminatorEntries.status, "alive")));
      await tx.update(eliminatorGames).set({ status: "settled", updatedAt: now }).where(eq(eliminatorGames.id, gameId));
      gameSettled = true;
    } else {
      // Carry on — open the next round, mark the game running (entries closed).
      await tx.update(eliminatorRounds).set({ status: "open", updatedAt: now }).where(eq(eliminatorRounds.id, nextRound.id));
      await tx.update(eliminatorGames).set({ status: "running", updatedAt: now }).where(eq(eliminatorGames.id, gameId));
    }

    return { settled: true, eliminated, gameSettled };
  });
}

/**
 * Settle every ready Eliminator round. Called from the scheduler's settle tick.
 * One round per game per pass (the sequential gate yields the lowest unsettled
 * ready round); the next pass picks up the following round.
 */
export async function settleAllReadyEliminatorRounds(): Promise<EliminatorSettleResult> {
  const result: EliminatorSettleResult = {
    roundsSettled: 0,
    eliminated: 0,
    gamesSettled: 0,
    errors: [],
  };

  let readyIds: string[];
  try {
    readyIds = await findReadyRoundIds();
  } catch (err) {
    result.errors.push({ roundId: "(find)", message: err instanceof Error ? err.message : String(err) });
    return result;
  }

  for (const roundId of readyIds) {
    try {
      const outcome = await settleOneRound(roundId);
      if (outcome.settled) {
        result.roundsSettled++;
        result.eliminated += outcome.eliminated;
        if (outcome.gameSettled) result.gamesSettled++;
      }
    } catch (err) {
      result.errors.push({ roundId, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
