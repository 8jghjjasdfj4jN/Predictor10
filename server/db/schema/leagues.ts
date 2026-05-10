import {
  pgTable, uuid, varchar, text, timestamp, decimal, integer, boolean,
} from "drizzle-orm/pg-core";

export const leagues = pgTable("leagues", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),

  // Entry economics
  entryFee: decimal("entry_fee", { precision: 14, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("GBP").notNull(),
  maxEntriesPerUser: integer("max_entries_per_user").default(1).notNull(),

  // Display
  accentColor: varchar("accent_color", { length: 30 }),
  ordinal: integer("ordinal").notNull(),

  isActive: boolean("is_active").default(true).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
