/*
═══════════════════════════════════════════════════════════════════════════
WC CHAT (temporary) — remove after the World Cup. See docs/wc-chat-teardown.md.
═══════════════════════════════════════════════════════════════════════════

Per-pool chat for the informal World Cup friends' run. One row per message,
scoped to a pool, authored by an entrant. Read/post are entrant-gated at the
query layer (server/lib/chat-data.ts).

Compliance-ready bones even though most of it is dormant at 11 players:
  - Append-only. Messages are never hard-deleted by users.
  - Soft-delete moderation: an admin "hides" a message by stamping hiddenAt /
    hiddenBy / hiddenReason. Hidden rows stay in the table (record-keeping) but
    are filtered out of the read payload.
  - createdAt timestamps every message for the audit trail.

This whole file is deleted at teardown — no sentinel fences needed inside it.
*/

import { pgTable, uuid, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { pools } from "./pools";

export const poolMessages = pgTable(
  "pool_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    poolId: uuid("pool_id")
      .notNull()
      .references(() => pools.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),

    // Plain text + emoji (Unicode). No links are auto-linkified, no images —
    // the body is rendered verbatim as text on the client. 500-char cap is
    // enforced both here and in postMessage().
    body: varchar("body", { length: 500 }).notNull(),

    // Moderation — soft delete. Dormant for the friends' run; an admin hides a
    // message by stamping these. Filtered out of the read payload.
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenBy: uuid("hidden_by").references(() => users.id),
    hiddenReason: text("hidden_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // Primary read path: messages for a pool, oldest→newest.
    poolCreatedIdx: index("pool_messages_pool_created_idx").on(t.poolId, t.createdAt),
    // Rate-limit lookup: this user's recent messages.
    userIdx: index("pool_messages_user_idx").on(t.userId),
  }),
);
