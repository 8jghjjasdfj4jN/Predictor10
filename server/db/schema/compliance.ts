import {
  pgTable, uuid, varchar, text, timestamp, decimal, jsonb, pgEnum, index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const auditActionEnum = pgEnum("audit_action", [
  "user.signup",
  "user.login",
  "user.logout",
  "user.password_change",
  "user.profile_update",
  "user.email_verified",
  "payment.created",
  "payment.succeeded",
  "payment.failed",
  "payment.refunded",
  "pool.entry_created",
  "pool.entry_failed",
  "pool.settlement",
  "prediction.created",
  "prediction.updated",
  "rg.limit_set",
  "rg.limit_changed",
  "rg.self_exclusion_started",
  "rg.self_exclusion_lifted",
  "admin.action",
]);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    action: auditActionEnum("action").notNull(),

    // What was acted on
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),

    // Before/after state for changes
    before: jsonb("before"),
    after: jsonb("after"),

    // Context
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("audit_log_user_idx").on(t.userId),
    actionIdx: index("audit_log_action_idx").on(t.action),
    entityIdx: index("audit_log_entity_idx").on(t.entityType, t.entityId),
    createdIdx: index("audit_log_created_idx").on(t.createdAt),
  }),
);

export const limitTypeEnum = pgEnum("limit_type", [
  "daily_spend",
  "weekly_spend",
  "monthly_spend",
  "daily_entries",
  "session_minutes",
]);

export const userLimits = pgTable(
  "user_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: limitTypeEnum("type").notNull(),

    // Current effective limit
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).defaultNow().notNull(),

    // Pending increase (RTS 13: increases have a 24h cool-off; decreases are immediate)
    pendingAmount: decimal("pending_amount", { precision: 14, scale: 2 }),
    pendingEffectiveFrom: timestamp("pending_effective_from", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userTypeIdx: index("user_limits_user_type_idx").on(t.userId, t.type),
  }),
);

export const selfExclusionSourceEnum = pgEnum("self_exclusion_source", [
  "self",
  "gamstop",
  "admin",
]);

export const selfExclusions = pgTable(
  "self_exclusions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(), // Min 6 months by SR 3.5.3

    reason: text("reason"),
    source: selfExclusionSourceEnum("source").default("self").notNull(),

    liftedAt: timestamp("lifted_at", { withTimezone: true }),
    liftedBy: text("lifted_by"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("self_exclusions_user_idx").on(t.userId),
    endsIdx: index("self_exclusions_ends_idx").on(t.endsAt),
  }),
);

export const keyEvents = pgTable(
  "key_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    category: varchar("category", { length: 100 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    reportedToCommissionAt: timestamp("reported_to_commission_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    categoryIdx: index("key_events_category_idx").on(t.category),
    occurredIdx: index("key_events_occurred_idx").on(t.occurredAt),
  }),
);
