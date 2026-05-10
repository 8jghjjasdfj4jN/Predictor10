import {
  pgTable, uuid, varchar, text, timestamp, integer, boolean, decimal, jsonb, pgEnum, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const withdrawalStatusEnum = pgEnum("withdrawal_status", [
  "requested",
  "pending_review",
  "approved",
  "processing",
  "completed",
  "rejected",
  "cancelled",
  "failed",
]);

export const withdrawals = pgTable(
  "withdrawals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),

    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("GBP").notNull(),

    status: withdrawalStatusEnum("status").default("requested").notNull(),

    methodType: varchar("method_type", { length: 50 }),
    destinationReference: text("destination_reference"),

    paymentId: uuid("payment_id"),

    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by"),
    reviewNotes: text("review_notes"),

    kycVerifiedAtRequest: boolean("kyc_verified_at_request").default(false).notNull(),

    rejectionReason: text("rejection_reason"),
    cancelledReason: text("cancelled_reason"),

    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (t) => ({
    userIdx: index("withdrawals_user_idx").on(t.userId),
    statusIdx: index("withdrawals_status_idx").on(t.status),
    requestedIdx: index("withdrawals_requested_idx").on(t.requestedAt),
  }),
);

export const kycDocumentTypeEnum = pgEnum("kyc_document_type", [
  "identity",
  "address",
  "source_of_funds",
  "source_of_wealth",
  "selfie",
]);

export const kycDocumentStatusEnum = pgEnum("kyc_document_status", [
  "uploaded",
  "in_review",
  "approved",
  "rejected",
  "expired",
]);

export const kycDocuments = pgTable(
  "kyc_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

    type: kycDocumentTypeEnum("type").notNull(),
    status: kycDocumentStatusEnum("status").default("uploaded").notNull(),

    providerName: varchar("provider_name", { length: 50 }),
    providerReference: text("provider_reference"),
    providerCheckId: text("provider_check_id"),

    storageReference: text("storage_reference"),

    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("kyc_documents_user_idx").on(t.userId),
    statusIdx: index("kyc_documents_status_idx").on(t.status),
    typeIdx: index("kyc_documents_type_idx").on(t.type),
  }),
);

export const customerInteractionTriggerEnum = pgEnum("customer_interaction_trigger", [
  "spend_threshold",
  "loss_pattern",
  "session_length",
  "frequency",
  "time_of_day",
  "self_reported",
  "third_party_concern",
  "manual_review",
]);

export const customerInteractionOutcomeEnum = pgEnum("customer_interaction_outcome", [
  "monitored",
  "soft_intervention",
  "contacted_email",
  "contacted_phone",
  "limit_imposed",
  "self_exclusion_offered",
  "self_exclusion_applied",
  "account_suspended",
]);

export const customerInteractions = pgTable(
  "customer_interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),

    trigger: customerInteractionTriggerEnum("trigger").notNull(),
    outcome: customerInteractionOutcomeEnum("outcome").notNull(),

    notes: text("notes"),
    metadata: jsonb("metadata"),

    staffMemberId: uuid("staff_member_id"),

    followUpAt: timestamp("follow_up_at", { withTimezone: true }),
    followUpCompletedAt: timestamp("follow_up_completed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("customer_interactions_user_idx").on(t.userId),
    triggerIdx: index("customer_interactions_trigger_idx").on(t.trigger),
    createdIdx: index("customer_interactions_created_idx").on(t.createdAt),
  }),
);

export const paymentProviderEvents = pgTable(
  "payment_provider_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    provider: varchar("provider", { length: 50 }).notNull(),
    externalEventId: text("external_event_id").notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(),

    paymentId: uuid("payment_id"),

    payload: jsonb("payload").notNull(),

    processedAt: timestamp("processed_at", { withTimezone: true }),
    processingError: text("processing_error"),

    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    providerEventIdx: uniqueIndex("payment_provider_events_unique_idx").on(t.provider, t.externalEventId),
    paymentIdx: index("payment_provider_events_payment_idx").on(t.paymentId),
    typeIdx: index("payment_provider_events_type_idx").on(t.eventType),
    receivedIdx: index("payment_provider_events_received_idx").on(t.receivedAt),
  }),
);

export const gamstopSyncStatusEnum = pgEnum("gamstop_sync_status", [
  "started",
  "completed",
  "failed",
]);

export const gamstopSyncs = pgTable("gamstop_syncs", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: gamstopSyncStatusEnum("status").default("started").notNull(),
  usersChecked: integer("users_checked"),
  matchesFound: integer("matches_found"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const gamstopUserChecks = pgTable(
  "gamstop_user_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

    matchFound: boolean("match_found").notNull(),
    matchReference: text("match_reference"),

    context: varchar("context", { length: 50 }),

    checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("gamstop_user_checks_user_idx").on(t.userId),
    checkedIdx: index("gamstop_user_checks_checked_idx").on(t.checkedAt),
  }),
);

export const amlReviewReasonEnum = pgEnum("aml_review_reason", [
  "high_value_single",
  "high_value_aggregate",
  "rapid_deposits",
  "structuring",
  "unusual_pattern",
  "pep_match",
  "sanctions_match",
  "third_party_funding",
  "manual",
]);

export const amlReviewStatusEnum = pgEnum("aml_review_status", [
  "open",
  "in_progress",
  "cleared",
  "escalated",
  "sar_filed",
  "account_action_taken",
]);

export const amlReviews = pgTable(
  "aml_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),

    reason: amlReviewReasonEnum("reason").notNull(),
    triggeredByPaymentId: uuid("triggered_by_payment_id"),
    triggeredByMetadata: jsonb("triggered_by_metadata"),

    status: amlReviewStatusEnum("status").default("open").notNull(),
    assignedTo: uuid("assigned_to"),

    notes: text("notes"),
    outcome: text("outcome"),
    sarReference: text("sar_reference"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    userIdx: index("aml_reviews_user_idx").on(t.userId),
    statusIdx: index("aml_reviews_status_idx").on(t.status),
    createdIdx: index("aml_reviews_created_idx").on(t.createdAt),
  }),
);
