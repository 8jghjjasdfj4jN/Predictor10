/*
Eliminator10 — play data layer (step e3).

The elimination game's server side. Mirrors the pools' conventions:
discriminated { ok } results mapped to HTTP at the route layer, the 23505
unique-violation backstop on entry creation, deadline-as-the-authoritative-lock
(arch §13 Rule #7), and the settled-public / live-entrant access gate used by
the league table (§8.6) and the opponent-picks view (§18).

Anti-cheat: a round's picks are only disclosed once the round has locked
(deadline passed). Before that, every player's pick is withheld — same
symmetric-lock argument as §18/§19: by the time you can see a rival's pick,
your own pick for that round is locked too, so seeing it can't help you.

Survival scoring (who won / lost / drew) is computed by the engine in e4; this
module only reads survival state and enforces the pick rules. Everything is
competition-agnostic — it carries to the Premier League unchanged.
*/

import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { competitions, events } from "../db/schema/sports";
import { users } from "../db/schema/users";
import { payments } from "../db/schema/payments";
import {
  eliminatorGames,
  eliminatorRounds,
  eliminatorRoundEvents,
  eliminatorEntries,
  eliminatorPicks,
} from "../db/schema/eliminator";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

export type EliminatorEntryState = "none" | "alive" | "eliminated" | "won";
export type PickSide = "home" | "away";

// ─── Shared loaders ───────────────────────────────────────────────────────

type GameRow = typeof eliminatorGames.$inferSelect;

async function loadGameBySlug(slug: string): Promise<GameRow | null> {
  const [game] = await db
    .select()
    .from(eliminatorGames)
    .where(eq(eliminatorGames.slug, slug));
  return game ?? null;
}

/** The active round = lowest-ordinal round that hasn't settled. Null once the
    whole game is done. (The engine in e4 flips statuses round to round; here
    we just take the next unsettled one.) */
async function loadActiveRound(gameId: string) {
  const [round] = await db
    .select()
    .from(eliminatorRounds)
    .where(and(eq(eliminatorRounds.gameId, gameId), ne(eliminatorRounds.status, "settled")))
    .orderBy(asc(eliminatorRounds.ordinal))
    .limit(1);
  return round ?? null;
}

async function loadViewerEntry(gameId: string, userId: string | null) {
  if (!userId) return null;
  const [entry] = await db
    .select()
    .from(eliminatorEntries)
    .where(and(eq(eliminatorEntries.gameId, gameId), eq(eliminatorEntries.userId, userId)));
  return entry ?? null;
}

async function countEntries(gameId: string): Promise<{ total: number; alive: number }> {
  const [row] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      alive: sql<number>`COUNT(*) FILTER (WHERE ${eliminatorEntries.status} IN ('alive','won'))::int`,
    })
    .from(eliminatorEntries)
    .where(eq(eliminatorEntries.gameId, gameId));
  return { total: Number(row?.total ?? 0), alive: Number(row?.alive ?? 0) };
}

function isFreeGame(game: GameRow): boolean {
  return Number(game.entryFee) === 0;
}

// ─── Overview (Home card) ─────────────────────────────────────────────────

export type EliminatorOverviewDto = {
  slug: string;
  name: string;
  status: string;
  isFree: boolean;
  entryFee: string;
  currency: string;
  competitionName: string;
  competitionSlug: string;
  entrantCount: number;
  aliveCount: number;
  roundCount: number;
  entryClosesAt: string;
  entry: {
    state: EliminatorEntryState;
    eliminatedRoundOrdinal: number | null;
    eliminatedReason: string | null;
  };
  canJoin: boolean;
  currentRound: {
    id: string;
    ordinal: number;
    name: string;
    deadlineAt: string;
    isLocked: boolean;
    needsPick: boolean;
  } | null;
};

const BYPASS_LATE_ENTRY = () => process.env.BYPASS_LATE_ENTRY === "true";

export async function getEliminatorOverview(
  slug: string,
  viewerUserId: string | null,
): Promise<EliminatorOverviewDto | null> {
  const game = await loadGameBySlug(slug);
  if (!game || !game.isActive) return null;

  const [comp] = await db
    .select({ name: competitions.name, slug: competitions.slug })
    .from(competitions)
    .where(eq(competitions.id, game.competitionId));

  const [{ count: roundCount }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(eliminatorRounds)
    .where(eq(eliminatorRounds.gameId, game.id));

  const { total, alive } = await countEntries(game.id);
  const entry = await loadViewerEntry(game.id, viewerUserId);
  const active = await loadActiveRound(game.id);
  const now = Date.now();

  let eliminatedRoundOrdinal: number | null = null;
  if (entry?.eliminatedRoundId) {
    const [er] = await db
      .select({ ordinal: eliminatorRounds.ordinal })
      .from(eliminatorRounds)
      .where(eq(eliminatorRounds.id, entry.eliminatedRoundId));
    eliminatedRoundOrdinal = er?.ordinal ?? null;
  }

  const entriesOpen =
    game.status === "open" &&
    (now <= game.entryClosesAt.getTime() || BYPASS_LATE_ENTRY());
  const canJoin = !!viewerUserId && !entry && entriesOpen;

  let currentRound: EliminatorOverviewDto["currentRound"] = null;
  if (active) {
    const isLocked = active.deadlineAt.getTime() <= now;
    let needsPick = false;
    if (entry?.status === "alive" && !isLocked) {
      const [existing] = await db
        .select({ id: eliminatorPicks.id })
        .from(eliminatorPicks)
        .where(and(eq(eliminatorPicks.entryId, entry.id), eq(eliminatorPicks.roundId, active.id)));
      needsPick = !existing;
    }
    currentRound = {
      id: active.id,
      ordinal: active.ordinal,
      name: active.name,
      deadlineAt: active.deadlineAt.toISOString(),
      isLocked,
      needsPick,
    };
  }

  return {
    slug: game.slug,
    name: game.name,
    status: game.status,
    isFree: isFreeGame(game),
    entryFee: game.entryFee,
    currency: game.currency,
    competitionName: comp?.name ?? "",
    competitionSlug: comp?.slug ?? "",
    entrantCount: total,
    aliveCount: alive,
    roundCount: Number(roundCount ?? 0),
    entryClosesAt: game.entryClosesAt.toISOString(),
    entry: {
      state: (entry?.status ?? "none") as EliminatorEntryState,
      eliminatedRoundOrdinal,
      eliminatedReason: entry?.eliminatedReason ?? null,
    },
    canJoin,
    currentRound,
  };
}

// ─── Join ─────────────────────────────────────────────────────────────────

export type JoinEliminatorError = "GAME_NOT_FOUND" | "GAME_NOT_OPEN" | "ENTRIES_CLOSED";
export type JoinEliminatorOutcome =
  | { ok: true; entryId: string; alreadyEntered: boolean }
  | { ok: false; error: JoinEliminatorError };

export async function joinEliminator(opts: {
  slug: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<JoinEliminatorOutcome> {
  const { slug, userId, ipAddress, userAgent } = opts;

  const game = await loadGameBySlug(slug);
  if (!game || !game.isActive) return { ok: false, error: "GAME_NOT_FOUND" };
  if (game.status !== "open") return { ok: false, error: "GAME_NOT_OPEN" };
  if (Date.now() > game.entryClosesAt.getTime() && !BYPASS_LATE_ENTRY()) {
    return { ok: false, error: "ENTRIES_CLOSED" };
  }

  // Idempotency — return the existing entry if already joined.
  const existing = await loadViewerEntry(game.id, userId);
  if (existing) return { ok: true, entryId: existing.id, alreadyEntered: true };

  const fee = Number(game.entryFee);
  try {
    const entryId = await db.transaction(async (tx) => {
      let paymentId: string | null = null;
      // Free game (WC demo) → no payment row. Paid game (PL) → mock payment
      // through the same payments table the pools use; flips to live on licence.
      if (fee > 0) {
        const now = new Date();
        const [payment] = await tx
          .insert(payments)
          .values({
            userId,
            direction: "debit",
            amount: game.entryFee,
            currency: game.currency,
            referenceType: "eliminator_entry",
            referenceId: null,
            mode: "mock",
            status: "succeeded",
            ipAddress,
            userAgent,
            initiatedAt: now,
            completedAt: now,
          })
          .returning({ id: payments.id });
        paymentId = payment.id;
      }

      const [entry] = await tx
        .insert(eliminatorEntries)
        .values({ gameId: game.id, userId, paymentId, status: "alive" })
        .returning({ id: eliminatorEntries.id });

      if (paymentId) {
        await tx
          .update(payments)
          .set({ referenceId: entry.id })
          .where(eq(payments.id, paymentId));
      }
      return entry.id;
    });
    return { ok: true, entryId, alreadyEntered: false };
  } catch (err) {
    // Lost a concurrent double-join race — the unique (game_id, user_id) index
    // rejected the second insert; resolve to the winning entry.
    if (isUniqueViolation(err)) {
      const raced = await loadViewerEntry(game.id, userId);
      if (raced) return { ok: true, entryId: raced.id, alreadyEntered: true };
    }
    throw err;
  }
}

// ─── Pick screen ──────────────────────────────────────────────────────────

export type EliminatorFixtureDto = {
  eventId: string;
  homeTeam: string | null;
  awayTeam: string | null;
  homeTeamShort: string | null;
  awayTeamShort: string | null;
  kickoffAt: string;
  status: string;
  awaitingTeams: boolean;
  homeUsed: boolean;
  awayUsed: boolean;
};

export type EliminatorPickScreenDto = {
  game: { slug: string; name: string; isFree: boolean };
  entryState: EliminatorEntryState;
  round: {
    id: string;
    ordinal: number;
    name: string;
    deadlineAt: string;
    isLocked: boolean;
  } | null;
  yourPick: { eventId: string; side: PickSide; team: string } | null;
  // Teams this entry has locked in from prior rounds — can't be picked again
  // (Rule 6). Private to the viewer (their own pick screen).
  yourUsedTeams: string[];
  fixtures: EliminatorFixtureDto[];
};

export type GetPickScreenError = "GAME_NOT_FOUND" | "NOT_AUTHENTICATED" | "NOT_ENTRANT";
export type GetPickScreenOutcome =
  | { ok: true; data: EliminatorPickScreenDto }
  | { ok: false; error: GetPickScreenError };

export async function getEliminatorPickScreen(
  slug: string,
  viewerUserId: string | null,
): Promise<GetPickScreenOutcome> {
  const game = await loadGameBySlug(slug);
  if (!game || !game.isActive) return { ok: false, error: "GAME_NOT_FOUND" };
  if (!viewerUserId) return { ok: false, error: "NOT_AUTHENTICATED" };

  const entry = await loadViewerEntry(game.id, viewerUserId);
  if (!entry) return { ok: false, error: "NOT_ENTRANT" };

  const active = await loadActiveRound(game.id);

  // Teams this entry has already used in OTHER rounds — greyed out, can't be
  // re-picked (Rule 6). Their pick for the active round (if any) is shown
  // separately and is allowed to remain selected / be changed.
  const usedRows = active
    ? await db
        .select({ pickedTeam: eliminatorPicks.pickedTeam })
        .from(eliminatorPicks)
        .where(and(eq(eliminatorPicks.entryId, entry.id), ne(eliminatorPicks.roundId, active.id)))
    : await db
        .select({ pickedTeam: eliminatorPicks.pickedTeam })
        .from(eliminatorPicks)
        .where(eq(eliminatorPicks.entryId, entry.id));
  const usedTeams = new Set(usedRows.map((r) => r.pickedTeam));

  let fixtures: EliminatorFixtureDto[] = [];
  let yourPick: EliminatorPickScreenDto["yourPick"] = null;

  if (active) {
    const rows = await db
      .select({
        eventId: events.id,
        homeTeam: events.homeTeam,
        awayTeam: events.awayTeam,
        homeTeamShort: events.homeTeamShort,
        awayTeamShort: events.awayTeamShort,
        kickoffAt: events.kickoffAt,
        status: events.status,
      })
      .from(eliminatorRoundEvents)
      .innerJoin(events, eq(eliminatorRoundEvents.eventId, events.id))
      .where(eq(eliminatorRoundEvents.roundId, active.id))
      .orderBy(asc(events.kickoffAt));

    fixtures = rows.map((r) => ({
      eventId: r.eventId,
      homeTeam: r.homeTeam,
      awayTeam: r.awayTeam,
      homeTeamShort: r.homeTeamShort,
      awayTeamShort: r.awayTeamShort,
      kickoffAt: r.kickoffAt.toISOString(),
      status: r.status,
      awaitingTeams: r.homeTeam === null || r.awayTeam === null,
      homeUsed: r.homeTeam !== null && usedTeams.has(r.homeTeam),
      awayUsed: r.awayTeam !== null && usedTeams.has(r.awayTeam),
    }));

    const [pick] = await db
      .select({
        eventId: eliminatorPicks.eventId,
        side: eliminatorPicks.pickedSide,
        team: eliminatorPicks.pickedTeam,
      })
      .from(eliminatorPicks)
      .where(and(eq(eliminatorPicks.entryId, entry.id), eq(eliminatorPicks.roundId, active.id)));
    if (pick) yourPick = { eventId: pick.eventId, side: pick.side as PickSide, team: pick.team };
  }

  return {
    ok: true,
    data: {
      game: { slug: game.slug, name: game.name, isFree: isFreeGame(game) },
      entryState: entry.status as EliminatorEntryState,
      round: active
        ? {
            id: active.id,
            ordinal: active.ordinal,
            name: active.name,
            deadlineAt: active.deadlineAt.toISOString(),
            isLocked: active.deadlineAt.getTime() <= Date.now(),
          }
        : null,
      yourPick,
      yourUsedTeams: Array.from(usedTeams).sort((a, b) => a.localeCompare(b)),
      fixtures,
    },
  };
}

// ─── Submit pick ──────────────────────────────────────────────────────────

export type SubmitPickError =
  | "GAME_NOT_FOUND"
  | "NOT_ENTRANT"
  | "ENTRY_NOT_ALIVE"
  | "ROUND_NOT_FOUND"
  | "ENTRIES_LOCKED"
  | "EVENT_NOT_IN_ROUND"
  | "EVENT_AWAITING_TEAMS"
  | "TEAM_ALREADY_USED";

export type SubmitPickOutcome =
  | { ok: true; eventId: string; side: PickSide; team: string }
  | { ok: false; error: SubmitPickError };

export async function submitEliminatorPick(opts: {
  slug: string;
  userId: string;
  roundId: string;
  eventId: string;
  side: PickSide;
  ipAddress: string;
  userAgent: string | null;
}): Promise<SubmitPickOutcome> {
  const { slug, userId, roundId, eventId, side, ipAddress, userAgent } = opts;

  const game = await loadGameBySlug(slug);
  if (!game || !game.isActive) return { ok: false, error: "GAME_NOT_FOUND" };

  const entry = await loadViewerEntry(game.id, userId);
  if (!entry) return { ok: false, error: "NOT_ENTRANT" };
  if (entry.status !== "alive") return { ok: false, error: "ENTRY_NOT_ALIVE" };

  const [round] = await db
    .select()
    .from(eliminatorRounds)
    .where(and(eq(eliminatorRounds.id, roundId), eq(eliminatorRounds.gameId, game.id)));
  if (!round) return { ok: false, error: "ROUND_NOT_FOUND" };

  // Deadline is the authoritative lock (the round's first kick-off). Past it,
  // no picks land — even if the engine hasn't flipped the status yet.
  if (round.deadlineAt.getTime() <= Date.now() || round.status === "settled") {
    return { ok: false, error: "ENTRIES_LOCKED" };
  }

  // Event must belong to this round.
  const [inRound] = await db
    .select({ eventId: eliminatorRoundEvents.eventId })
    .from(eliminatorRoundEvents)
    .where(and(eq(eliminatorRoundEvents.roundId, roundId), eq(eliminatorRoundEvents.eventId, eventId)));
  if (!inRound) return { ok: false, error: "EVENT_NOT_IN_ROUND" };

  const [event] = await db
    .select({ homeTeam: events.homeTeam, awayTeam: events.awayTeam })
    .from(events)
    .where(eq(events.id, eventId));
  if (!event) return { ok: false, error: "EVENT_NOT_IN_ROUND" };

  const pickedTeam = side === "home" ? event.homeTeam : event.awayTeam;
  if (pickedTeam === null) return { ok: false, error: "EVENT_AWAITING_TEAMS" };

  // One team, once (Rule 6) — reject if this entry already backed this team in
  // a different round. The (entry_id, picked_team) unique index is the backstop
  // for the rare change-pick race; this is the friendly app-layer check.
  const [reused] = await db
    .select({ id: eliminatorPicks.id })
    .from(eliminatorPicks)
    .where(
      and(
        eq(eliminatorPicks.entryId, entry.id),
        eq(eliminatorPicks.pickedTeam, pickedTeam),
        ne(eliminatorPicks.roundId, roundId),
      ),
    );
  if (reused) return { ok: false, error: "TEAM_ALREADY_USED" };

  const now = new Date();
  try {
    await db
      .insert(eliminatorPicks)
      .values({
        entryId: entry.id,
        gameId: game.id,
        roundId,
        userId,
        eventId,
        pickedSide: side,
        pickedTeam,
        ipAddress,
        userAgent,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [eliminatorPicks.entryId, eliminatorPicks.roundId],
        set: { eventId, pickedSide: side, pickedTeam, ipAddress, userAgent, updatedAt: now },
      });
  } catch (err) {
    // Backstop: the (entry_id, picked_team) unique fired — the team is used in
    // another round (e.g. a change-pick race the check above just missed).
    if (isUniqueViolation(err)) return { ok: false, error: "TEAM_ALREADY_USED" };
    throw err;
  }

  return { ok: true, eventId, side, team: pickedTeam };
}

// ─── Survivors table ──────────────────────────────────────────────────────

export type EliminatorSurvivorDto = {
  entryId: string;
  displayName: string;
  currentPickTeam: string | null; // null while hidden (round open) or no pick
  isYou: boolean;
};

export type EliminatorOutDto = {
  entryId: string;
  displayName: string;
  eliminatedRoundOrdinal: number | null;
  eliminatedReason: string | null;
  eliminatedPickTeam: string | null;
  isYou: boolean;
};

export type EliminatorSurvivorsDto = {
  game: { slug: string; name: string; status: string; isFree: boolean; entrantCount: number };
  picksHidden: boolean;
  currentRound: { id: string; ordinal: number; name: string; deadlineAt: string; isLocked: boolean } | null;
  stillIn: EliminatorSurvivorDto[];
  out: EliminatorOutDto[];
};

export type GetSurvivorsError = "GAME_NOT_FOUND" | "NOT_AUTHENTICATED" | "NOT_ENTRANT";
export type GetSurvivorsOutcome =
  | { ok: true; data: EliminatorSurvivorsDto }
  | { ok: false; error: GetSurvivorsError };

export async function getEliminatorSurvivors(
  slug: string,
  viewerUserId: string | null,
): Promise<GetSurvivorsOutcome> {
  const game = await loadGameBySlug(slug);
  if (!game || !game.isActive) return { ok: false, error: "GAME_NOT_FOUND" };

  // Same gate as the league table: settled games are public; while live it's
  // auth + entrant only.
  const isSettled = game.status === "settled";
  if (!isSettled) {
    if (!viewerUserId) return { ok: false, error: "NOT_AUTHENTICATED" };
    const own = await loadViewerEntry(game.id, viewerUserId);
    if (!own) return { ok: false, error: "NOT_ENTRANT" };
  }

  const { total } = await countEntries(game.id);
  const active = await loadActiveRound(game.id);
  const now = Date.now();
  // Picks stay hidden until the active round locks (anti-cheat). Once settled,
  // there's no active round and nothing to hide.
  const picksHidden = !!active && active.deadlineAt.getTime() > now;

  // All entries with their public handle.
  const entryRows = await db
    .select({
      entryId: eliminatorEntries.id,
      userId: eliminatorEntries.userId,
      status: eliminatorEntries.status,
      eliminatedRoundId: eliminatorEntries.eliminatedRoundId,
      eliminatedReason: eliminatorEntries.eliminatedReason,
      displayName: sql<string>`COALESCE(${users.nickname}, ${users.displayName})`,
    })
    .from(eliminatorEntries)
    .innerJoin(users, eq(users.id, eliminatorEntries.userId))
    .where(eq(eliminatorEntries.gameId, game.id));

  // Current-round picks (only revealed when not hidden).
  const currentPickByEntry = new Map<string, string>();
  if (active && !picksHidden) {
    const picks = await db
      .select({ entryId: eliminatorPicks.entryId, team: eliminatorPicks.pickedTeam })
      .from(eliminatorPicks)
      .where(eq(eliminatorPicks.roundId, active.id));
    for (const p of picks) currentPickByEntry.set(p.entryId, p.team);
  }

  // Eliminating picks + round ordinals for the OUT list.
  const outEntryIds = entryRows.filter((e) => e.status === "eliminated").map((e) => e.entryId);
  const eliminatedTeamByEntry = new Map<string, string>();
  const ordinalByRoundId = new Map<string, number>();
  if (outEntryIds.length > 0) {
    const elimRoundIds = entryRows
      .filter((e) => e.status === "eliminated" && e.eliminatedRoundId)
      .map((e) => e.eliminatedRoundId as string);
    if (elimRoundIds.length > 0) {
      const ords = await db
        .select({ id: eliminatorRounds.id, ordinal: eliminatorRounds.ordinal })
        .from(eliminatorRounds)
        .where(inArray(eliminatorRounds.id, elimRoundIds));
      for (const o of ords) ordinalByRoundId.set(o.id, o.ordinal);

      const elimPicks = await db
        .select({ entryId: eliminatorPicks.entryId, roundId: eliminatorPicks.roundId, team: eliminatorPicks.pickedTeam })
        .from(eliminatorPicks)
        .where(inArray(eliminatorPicks.entryId, outEntryIds));
      for (const p of elimPicks) {
        const entry = entryRows.find((e) => e.entryId === p.entryId);
        if (entry && entry.eliminatedRoundId === p.roundId) {
          eliminatedTeamByEntry.set(p.entryId, p.team);
        }
      }
    }
  }

  const stillIn: EliminatorSurvivorDto[] = entryRows
    .filter((e) => e.status === "alive" || e.status === "won")
    .map((e) => ({
      entryId: e.entryId,
      displayName: e.displayName,
      currentPickTeam: picksHidden ? null : currentPickByEntry.get(e.entryId) ?? null,
      isYou: e.userId === viewerUserId,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const out: EliminatorOutDto[] = entryRows
    .filter((e) => e.status === "eliminated")
    .map((e) => ({
      entryId: e.entryId,
      displayName: e.displayName,
      eliminatedRoundOrdinal: e.eliminatedRoundId
        ? ordinalByRoundId.get(e.eliminatedRoundId) ?? null
        : null,
      eliminatedReason: e.eliminatedReason,
      eliminatedPickTeam: eliminatedTeamByEntry.get(e.entryId) ?? null,
      isYou: e.userId === viewerUserId,
    }))
    .sort((a, b) => (b.eliminatedRoundOrdinal ?? 0) - (a.eliminatedRoundOrdinal ?? 0));

  return {
    ok: true,
    data: {
      game: {
        slug: game.slug,
        name: game.name,
        status: game.status,
        isFree: isFreeGame(game),
        entrantCount: total,
      },
      picksHidden,
      currentRound: active
        ? {
            id: active.id,
            ordinal: active.ordinal,
            name: active.name,
            deadlineAt: active.deadlineAt.toISOString(),
            isLocked: active.deadlineAt.getTime() <= now,
          }
        : null,
      stillIn,
      out,
    },
  };
}
