import {
  pgTable, uuid, varchar, text, timestamp, integer, boolean, decimal, jsonb, pgEnum, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { competitions, events } from "./sports";

// Eliminator10 — the "last player standing" game mode, separate from the
// score-prediction pools. Built for the free World Cup friends' run and
// designed to carry to the Premier League unchanged: entryFee 0 + a free
// prize model for the WC; the same tables flip to a real entry fee + 75/25
// pot for the licensed PL version, mirroring the mock→live payments flip the
// pools already use. Nothing here is WC-specific.

export const eliminatorGameStatusEnum = pgEnum("eliminator_game_status", [
  "draft",     // created, not visible
  "open",      // accepting entries; first round not yet locked
  "running",   // entries closed / a round has locked; survival underway
  "settled",   // a winner (or an end-of-game split) has been decided
  "void",
]);

export const eliminatorRoundStatusEnum = pgEnum("eliminator_round_status", [
  "pending",   // future round, not yet open for picks
  "open",      // accepting picks; before the deadline (first kick-off)
  "locked",    // deadline passed; matches in play / awaiting results
  "settled",   // all matches scored; survivors carried forward
]);

export const eliminatorEntryStatusEnum = pgEnum("eliminator_entry_status", [
  "alive",
  "eliminated",
  "won",
]);

export const eliminatorPickSideEnum = pgEnum("eliminator_pick_side", [
  "home",
  "away",
]);

// One Eliminator competition instance ("a run"). The WC has a single game
// spanning the tournament; the PL will spin up one per gameweek. Draws its
// fixtures from an existing football competition (competitionId → WC, PL …).
export const eliminatorGames = pgTable(
  "eliminator_games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id").notNull().references(() => competitions.id),

    slug: varchar("slug", { length: 100 }).notNull().unique(),
    name: varchar("name", { length: 200 }).notNull(),

    // Entry economics. Free for the WC demo (0, no payment row). The PL
    // version sets a real fee and routes through the same payments table as
    // the pools (mock now, live on licence). The prize model + house fee live
    // in prizeStructure so a settled game keeps the rules it was opened under.
    entryFee: decimal("entry_fee", { precision: 14, scale: 2 }).default("0").notNull(),
    currency: varchar("currency", { length: 3 }).default("GBP").notNull(),
    // e.g. { model: "last_standing", houseFeePct: 0 } (free WC)
    //      { model: "last_standing", houseFeePct: 0.25 } (paid PL, 75/25)
    prizeStructure: jsonb("prize_structure")
      .default({ model: "last_standing", houseFeePct: 0 })
      .notNull(),

    // Rule 7 — re-entry is off unless advertised before the game starts.
    reentryAllowed: boolean("reentry_allowed").default(false).notNull(),

    // Timeline
    opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
    entryClosesAt: timestamp("entry_closes_at", { withTimezone: true }).notNull(),

    status: eliminatorGameStatusEnum("status").default("draft").notNull(),

    // Mirrors leagues.isActive — drives active-surface visibility and the
    // (future) retirement playbook, exactly like the WC pool tier.
    isActive: boolean("is_active").default(true).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    competitionIdx: index("eliminator_games_competition_idx").on(t.competitionId),
    statusIdx: index("eliminator_games_status_idx").on(t.status),
  }),
);

// A round within a game. WC: one round per day of fixtures. PL: one per
// gameweek. deadlineAt = the earliest kick-off in the round — picks lock for
// the whole round at the first whistle so no one can pick after seeing a
// result (same fairness rule as the pools' per-match lock, arch §13 Rule #7).
export const eliminatorRounds = pgTable(
  "eliminator_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id").notNull().references(() => eliminatorGames.id, { onDelete: "cascade" }),

    ordinal: integer("ordinal").notNull(),
    name: varchar("name", { length: 100 }).notNull(),

    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),

    status: eliminatorRoundStatusEnum("status").default("pending").notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    gameIdx: index("eliminator_rounds_game_idx").on(t.gameId),
    gameOrdinalIdx: uniqueIndex("eliminator_rounds_game_ordinal_idx").on(t.gameId, t.ordinal),
  }),
);

// Which fixtures belong to a round (the teams a player can pick from).
// Explicit mapping rather than a runtime date query — auditable (a regulator
// expects the eligible set to be defined) and flexible (PL gameweeks group
// differently from WC days).
export const eliminatorRoundEvents = pgTable(
  "eliminator_round_events",
  {
    roundId: uuid("round_id").notNull().references(() => eliminatorRounds.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  },
  (t) => ({
    roundEventIdx: uniqueIndex("eliminator_round_events_idx").on(t.roundId, t.eventId),
    eventIdx: index("eliminator_round_events_event_idx").on(t.eventId),
  }),
);

// A user's participation in one game. Survival state lives here.
export const eliminatorEntries = pgTable(
  "eliminator_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id").notNull().references(() => eliminatorGames.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),

    // Null for a free game; set for paid (mock or live) via the payments
    // table, exactly like pool_entries.paymentId.
    paymentId: uuid("payment_id"),

    status: eliminatorEntryStatusEnum("status").default("alive").notNull(),

    // Set when knocked out: which round, and why ("lost" / "draw" / "no_pick").
    eliminatedRoundId: uuid("eliminated_round_id").references(() => eliminatorRounds.id),
    eliminatedReason: varchar("eliminated_reason", { length: 16 }),

    // Settlement — winner-takes-all, or a final-round split across survivors.
    finalRank: integer("final_rank"),
    payoutId: uuid("payout_id"),

    enteredAt: timestamp("entered_at", { withTimezone: true }).defaultNow().notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => ({
    gameIdx: index("eliminator_entries_game_idx").on(t.gameId),
    userIdx: index("eliminator_entries_user_idx").on(t.userId),
    gameStatusIdx: index("eliminator_entries_game_status_idx").on(t.gameId, t.status),
    // One entry per user per game (re-entry, when advertised, is out of V1
    // scope). Mirrors pool_entries_pool_user_idx.
    gameUserIdx: uniqueIndex("eliminator_entries_game_user_idx").on(t.gameId, t.userId),
  }),
);

// One pick per round per entry. Stores the side (home / away) as the source
// of truth plus a snapshot of the team name for audit + the one-team-once rule.
export const eliminatorPicks = pgTable(
  "eliminator_picks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id").notNull().references(() => eliminatorEntries.id, { onDelete: "cascade" }),
    gameId: uuid("game_id").notNull().references(() => eliminatorGames.id),
    roundId: uuid("round_id").notNull().references(() => eliminatorRounds.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    eventId: uuid("event_id").notNull().references(() => events.id),

    pickedSide: eliminatorPickSideEnum("picked_side").notNull(),
    // Snapshot of the chosen team's name at pick time (football-data names can
    // be edited; this keeps the audit trail and the one-team-once check stable).
    pickedTeam: varchar("picked_team", { length: 100 }).notNull(),

    // Computed at settlement. survived = the picked team won in normal time
    // (FT only — extra time / penalties excluded, per the pools' FT-only
    // scoring). Null until the round is scored.
    survived: boolean("survived"),

    // Audit (LCCP 13.1.2 — equipment identification), mirrors predictions.
    ipAddress: text("ip_address").notNull(),
    userAgent: text("user_agent"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    scoredAt: timestamp("scored_at", { withTimezone: true }),
  },
  (t) => ({
    entryRoundIdx: uniqueIndex("eliminator_picks_entry_round_idx").on(t.entryId, t.roundId),
    // One-team-once (Rule 6), DB-enforced as defence-in-depth alongside the
    // app-layer check: a given entry can't pick the same team name twice.
    entryTeamIdx: uniqueIndex("eliminator_picks_entry_team_idx").on(t.entryId, t.pickedTeam),
    gameIdx: index("eliminator_picks_game_idx").on(t.gameId),
    roundIdx: index("eliminator_picks_round_idx").on(t.roundId),
    eventIdx: index("eliminator_picks_event_idx").on(t.eventId),
    userIdx: index("eliminator_picks_user_idx").on(t.userId),
  }),
);
