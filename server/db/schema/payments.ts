import {
  pgTable, uuid, varchar, text, timestamp, boolean, decimal, pgEnum, index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const paymentDirectionEnum = pgEnum("payment_direction", [
  "debit",   // User pays in (league entry)
  "credit",  // User receives (winnings, refund, withdrawal)
]);

export const paymentModeEnum = pgEnum("payment_mode", [
  "mock",  // Test mode — record-only, no real money
  "live",  // Real money via PSP (Stripe / Worldpay / etc.)
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "succeeded",
  "failed",
  "refunded",
  "voided",
]);

export const paymentAmlStatusEnum = pgEnum("payment_aml_status", [
  "not_required",
  "auto_cleared",
  "flagged",
  "under_review",
  "cleared",
  "blocked",
]);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),

    direction: paymentDirectionEnum("direction").notNull(),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("GBP").notNull(),

    // What this payment relates to
    referenceType: text("reference_type").notNull(),
    referenceId: uuid("reference_id"),

    // The licence-flip switch
    mode: paymentModeEnum("mode").notNull(),
    status: paymentStatusEnum("status").default("pending").notNull(),

    // External provider data (null in mock mode)
    externalProvider: varchar("external_provider", { length: 50 }),
    externalPaymentId: text("external_payment_id"),
    externalReference: text("external_reference"),

    // Refund tracking
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    refundAmount: decimal("refund_amount", { precision: 14, scale: 2 }),
    refundReason: text("refund_reason"),

    // AML monitoring (real-money phase) — most payments stay 'auto_cleared' / 'not_required'.
    // Flagged payments link to a row in aml_reviews via reverse lookup.
    amlStatus: paymentAmlStatusEnum("aml_status").default("not_required").notNull(),
    amlReviewedAt: timestamp("aml_reviewed_at", { withTimezone: true }),

    // Audit (LCCP)
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),

    initiatedAt: timestamp("initiated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    userIdx: index("payments_user_idx").on(t.userId),
    directionIdx: index("payments_direction_idx").on(t.direction),
    statusIdx: index("payments_status_idx").on(t.status),
    refIdx: index("payments_ref_idx").on(t.referenceType, t.referenceId),
    initiatedIdx: index("payments_initiated_idx").on(t.initiatedAt),
    amlIdx: index("payments_aml_idx").on(t.amlStatus),
  }),
);
