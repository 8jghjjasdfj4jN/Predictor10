import {
  pgTable, uuid, varchar, text, timestamp, boolean, jsonb, pgEnum, index, uniqueIndex, date,
} from "drizzle-orm/pg-core";

export const kycStatusEnum = pgEnum("kyc_status", [
  "not_required",
  "pending",
  "submitted",
  "verified",
  "rejected",
  "expired",
]);

export const accountStatusEnum = pgEnum("account_status", [
  "active",
  "suspended",
  "closed",
  "self_excluded",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Auth
    email: varchar("email", { length: 320 }).notNull().unique(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash").notNull(),

    // Profile
    displayName: varchar("display_name", { length: 24 }).notNull(),
    avatarInitials: varchar("avatar_initials", { length: 4 }),

    // Identity (collected at sign-up)
    dateOfBirth: date("date_of_birth").notNull(),
    countryCode: varchar("country_code", { length: 2 }).notNull(),

    // KYC — populated when real-money switches on
    kycStatus: kycStatusEnum("kyc_status").default("not_required").notNull(),
    kycVerifiedAt: timestamp("kyc_verified_at", { withTimezone: true }),
    kycProviderReference: text("kyc_provider_reference"),

    // The single flag that flips when licence is active and KYC complete
    realMoneyEnabled: boolean("real_money_enabled").default(false).notNull(),

    // Marketing — must be active opt-in (GDPR)
    marketingConsent: boolean("marketing_consent").default(false).notNull(),
    marketingConsentAt: timestamp("marketing_consent_at", { withTimezone: true }),

    // Account lifecycle
    accountStatus: accountStatusEnum("account_status").default("active").notNull(),

    // Self-exclusion shortcut (history in self_exclusions)
    selfExcludedUntil: timestamp("self_excluded_until", { withTimezone: true }),

    // AML flags (real money phase)
    pepFlag: boolean("pep_flag").default(false).notNull(),
    riskRating: varchar("risk_rating", { length: 20 }),

    // Last seen
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    lastLoginIp: text("last_login_ip"),

    // GDPR right-to-erasure: anonymise PII fields while retaining transaction records per LCCP 3-year retention.
    // When set: email becomes anonymised hash, displayName becomes "Deleted user", DOB becomes null, etc.
    // The user row stays so foreign-key integrity holds in audit_log, predictions, payments etc.
    anonymisedAt: timestamp("anonymised_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
    statusIdx: index("users_status_idx").on(t.accountStatus),
    anonymisedIdx: index("users_anonymised_idx").on(t.anonymisedAt),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
    expiresIdx: index("sessions_expires_idx").on(t.expiresAt),
  }),
);

export const emailVerifications = pgTable(
  "email_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ userIdx: index("email_verifications_user_idx").on(t.userId) }),
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ userIdx: index("password_resets_user_idx").on(t.userId) }),
);
