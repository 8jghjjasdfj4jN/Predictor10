import {
  pgTable, uuid, varchar, text, timestamp, integer, boolean, pgEnum, serial, date, index, uniqueIndex,
} from "drizzle-orm/pg-core";

export const eventStatusEnum = pgEnum("event_status", [
  "scheduled",
  "live",
  "finished",
  "postponed",
  "cancelled",
  "void",
]);

export const sports = pgTable("sports", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const competitions = pgTable(
  "competitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sportId: integer("sport_id").notNull().references(() => sports.id),

    // Mapping to external data provider (API-Football)
    externalId: varchar("external_id", { length: 50 }),
    externalSeasonId: varchar("external_season_id", { length: 50 }),

    slug: varchar("slug", { length: 100 }).notNull().unique(),
    name: varchar("name", { length: 200 }).notNull(),
    shortName: varchar("short_name", { length: 50 }),
    countryCode: varchar("country_code", { length: 2 }),

    startDate: date("start_date"),
    endDate: date("end_date"),

    isActive: boolean("is_active").default(true).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sportIdx: index("competitions_sport_idx").on(t.sportId),
    externalIdx: index("competitions_external_idx").on(t.externalId),
  }),
);

export const stages = pgTable(
  "stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id").notNull().references(() => competitions.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 50 }),
    slug: varchar("slug", { length: 100 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    ordinal: integer("ordinal").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
  },
  (t) => ({ competitionIdx: index("stages_competition_idx").on(t.competitionId) }),
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id").notNull().references(() => competitions.id, { onDelete: "cascade" }),
    stageId: uuid("stage_id").references(() => stages.id),
    externalId: varchar("external_id", { length: 50 }).notNull(),

    // Football: home / away (abstract for other sports later)
    homeTeam: varchar("home_team", { length: 100 }).notNull(),
    awayTeam: varchar("away_team", { length: 100 }).notNull(),
    homeTeamShort: varchar("home_team_short", { length: 10 }),
    awayTeamShort: varchar("away_team_short", { length: 10 }),

    kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
    venue: varchar("venue", { length: 200 }),

    // Football: which gameweek / matchday this fixture belongs to in the
    // competition's season (1-38 for PL, 1-46 for Championship). Nullable
    // because some fixtures get scheduled before football-data assigns one;
    // the seed leaves it null in that rare case and the predict screen
    // groups it into a "TBD" bucket if it ever happens.
    matchday: integer("matchday"),

    status: eventStatusEnum("status").default("scheduled").notNull(),

    // Server-enforced lock — predictions refused after this time
    predictionLockAt: timestamp("prediction_lock_at", { withTimezone: true }).notNull(),

    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    competitionIdx: index("events_competition_idx").on(t.competitionId),
    stageIdx: index("events_stage_idx").on(t.stageId),
    kickoffIdx: index("events_kickoff_idx").on(t.kickoffAt),
    externalIdx: uniqueIndex("events_external_idx").on(t.externalId),
  }),
);

export const eventOutcomes = pgTable("event_outcomes", {
  eventId: uuid("event_id").primaryKey().references(() => events.id, { onDelete: "cascade" }),
  homeScore: integer("home_score").notNull(),
  awayScore: integer("away_score").notNull(),
  // Knockout-only fields, nullable for group games
  homeScoreExtraTime: integer("home_score_extra_time"),
  awayScoreExtraTime: integer("away_score_extra_time"),
  homeScorePenalties: integer("home_score_penalties"),
  awayScorePenalties: integer("away_score_penalties"),
  // Who advances (for bracket scoring) — references team name string for now
  advancingTeam: varchar("advancing_team", { length: 100 }),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
});
