import {
  pgTable, uuid, varchar, text, timestamp, integer, boolean, decimal, jsonb, pgEnum, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { leagues } from "./leagues";
import { competitions, stages, events } from "./sports";

export const poolStatusEnum = pgEnum("pool_status", [
  "draft",
  "open",
  "locked",
  "settled",
  "void",
]);

export const pools = pgTable(
  "pools",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // What this pool covers
    leagueId: uuid("league_id").notNull().references(() => leagues.id),
    competitionId: uuid("competition_id").notNull().references(() => competitions.id),
    stageId: uuid("stage_id").notNull().references(() => stages.id),

    // Display
    name: varchar("name", { length: 200 }).notNull(),

    // Timeline
    opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),

    // Scoring (locked to 5 exact / 2 correct result for V1, but stored as JSONB for future flex)
    scoringRule: jsonb("scoring_rule").default({ exactScore: 5, correctResult: 2 }).notNull(),

    // Prize structure (e.g. { model: "top_n", splits: [0.6, 0.25, 0.15] })
    prizeStructure: jsonb("prize_structure").notNull(),

    status: poolStatusEnum("status").default("draft").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    leagueStageIdx: uniqueIndex("pools_league_stage_idx").on(t.leagueId, t.stageId),
    competitionIdx: index("pools_competition_idx").on(t.competitionId),
    statusIdx: index("pools_status_idx").on(t.status),
  }),
);

export const poolEntries = pgTable(
  "pool_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poolId: uuid("pool_id").notNull().references(() => pools.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),

    // What the user paid (mock or real, both flow through the same payments table)
    paymentId: uuid("payment_id").notNull(),

    // Settlement results
    finalRank: integer("final_rank"),
    finalPoints: integer("final_points"),
    payoutId: uuid("payout_id"),

    enteredAt: timestamp("entered_at", { withTimezone: true }).defaultNow().notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),

    // Admin removal (void). A licensed operator never hard-deletes an entry —
    // it is voided: dropped from the pot, the standings, the player's own
    // entries and from settlement scoring, while the row (and its payment +
    // audit trail) is retained. voidedAt IS NULL means the entry is live.
    // Set only via the admin "Remove from pool" action (audit-logged).
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => users.id),
    voidReason: text("void_reason"),
  },
  (t) => ({
    poolIdx: index("pool_entries_pool_idx").on(t.poolId),
    userIdx: index("pool_entries_user_idx").on(t.userId),
    poolRankIdx: index("pool_entries_pool_rank_idx").on(t.poolId, t.finalRank),
    paymentIdx: index("pool_entries_payment_idx").on(t.paymentId),
    // P1 (June 2026): one entry per user per pool, enforced at the DB layer
    // (Decided Rule #2). Closes the concurrent double-tap race that the
    // app-layer pre-flight check in enterPool() can't fully prevent. Adding
    // this requires the live DB to be free of existing duplicates first —
    // run the dedupe-check query before `pnpm db:push` or the index build
    // fails. enterPool() catches the resulting 23505 and resolves to
    // "already entered" so the user-facing flow is unchanged.
    poolUserIdx: uniqueIndex("pool_entries_pool_user_idx").on(t.poolId, t.userId),
  }),
);

export const predictions = pgTable(
  "predictions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poolEntryId: uuid("pool_entry_id").notNull().references(() => poolEntries.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    poolId: uuid("pool_id").notNull().references(() => pools.id),
    eventId: uuid("event_id").notNull().references(() => events.id),

    // The prediction
    homeScorePredicted: integer("home_score_predicted").notNull(),
    awayScorePredicted: integer("away_score_predicted").notNull(),

    // Computed at settlement
    pointsAwarded: integer("points_awarded"),
    isExact: boolean("is_exact"),
    isCorrectResult: boolean("is_correct_result"),

    // Audit (LCCP 13.1.2 — equipment identification)
    ipAddress: text("ip_address").notNull(),
    userAgent: text("user_agent"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => ({
    entryEventIdx: uniqueIndex("predictions_entry_event_idx").on(t.poolEntryId, t.eventId),
    userIdx: index("predictions_user_idx").on(t.userId),
    poolIdx: index("predictions_pool_idx").on(t.poolId),
    eventIdx: index("predictions_event_idx").on(t.eventId),
  }),
);
