/*
═══════════════════════════════════════════════════════════════════════════
WC CHAT (temporary) — remove after the World Cup. See docs/wc-chat-teardown.md.
═══════════════════════════════════════════════════════════════════════════

Query layer for the per-pool chat. Mirrors server/lib/portal-data.ts: pure
data functions returning JSON-ready DTOs, with access rules expressed as
typed error variants the route layer maps to HTTP statuses.

Access model (entrant-only, both read and post — simpler than the league
table's "public when settled" rule because chat is just for the people who
played):
  - Pool not found              → POOL_NOT_FOUND   (404)
  - Viewer not authenticated    → NOT_AUTHENTICATED (401)
  - Viewer not an entrant       → NOT_ENTRANT      (403)

Posting adds three guards on top:
  - Active self-exclusion       → SELF_EXCLUDED    (403)
  - >5 messages in last 10s     → RATE_LIMITED     (429)
  - Empty / >500 chars (trimmed)→ EMPTY / TOO_LONG (400)

This whole file is deleted at teardown — no sentinel fences inside it.
*/

import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { pools, poolEntries } from "../db/schema/pools";
import { users } from "../db/schema/users";
import { selfExclusions } from "../db/schema/compliance";
import { poolMessages } from "../db/schema/messages";

const MAX_BODY = 500;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 5;

// ─── Shared helpers ───────────────────────────────────────────────────────

async function poolExists(poolId: string): Promise<boolean> {
  const [row] = await db.select({ id: pools.id }).from(pools).where(eq(pools.id, poolId));
  return !!row;
}

async function isEntrant(poolId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: poolEntries.id })
    .from(poolEntries)
    .where(and(eq(poolEntries.poolId, poolId), eq(poolEntries.userId, userId)));
  return !!row;
}

async function hasActiveSelfExclusion(userId: string): Promise<boolean> {
  const now = new Date();
  const [row] = await db
    .select({ id: selfExclusions.id })
    .from(selfExclusions)
    .where(
      and(
        eq(selfExclusions.userId, userId),
        isNull(selfExclusions.liftedAt),
        gt(selfExclusions.endsAt, now),
      ),
    );
  return !!row;
}

// ─── Read ─────────────────────────────────────────────────────────────────

export type ChatMessageDto = {
  id: string;
  body: string;
  authorDisplayName: string;
  isMine: boolean;
  createdAt: string;
};

export type ChatPayload = {
  viewer: { isEntrant: boolean };
  messages: ChatMessageDto[];
};

export type GetPoolMessagesError = "POOL_NOT_FOUND" | "NOT_AUTHENTICATED" | "NOT_ENTRANT";

export type GetPoolMessagesOutcome =
  | { ok: true; data: ChatPayload }
  | { ok: false; error: GetPoolMessagesError };

/**
 * Messages for a pool, oldest→newest, hidden rows excluded. Author is shown
 * as users.displayName to match the league table exactly. Entrant-gated.
 */
export async function getPoolMessages(
  poolId: string,
  viewerUserId: string | null,
): Promise<GetPoolMessagesOutcome> {
  if (!(await poolExists(poolId))) return { ok: false, error: "POOL_NOT_FOUND" };
  if (!viewerUserId) return { ok: false, error: "NOT_AUTHENTICATED" };
  if (!(await isEntrant(poolId, viewerUserId))) return { ok: false, error: "NOT_ENTRANT" };

  const rows = await db
    .select({
      id: poolMessages.id,
      body: poolMessages.body,
      userId: poolMessages.userId,
      authorDisplayName: users.displayName,
      createdAt: poolMessages.createdAt,
    })
    .from(poolMessages)
    .innerJoin(users, eq(users.id, poolMessages.userId))
    .where(and(eq(poolMessages.poolId, poolId), isNull(poolMessages.hiddenAt)))
    .orderBy(asc(poolMessages.createdAt));

  return {
    ok: true,
    data: {
      viewer: { isEntrant: true },
      messages: rows.map((r) => ({
        id: r.id,
        body: r.body,
        authorDisplayName: r.authorDisplayName,
        isMine: r.userId === viewerUserId,
        createdAt: r.createdAt.toISOString(),
      })),
    },
  };
}

// ─── Post ─────────────────────────────────────────────────────────────────

export type PostMessageError =
  | "POOL_NOT_FOUND"
  | "NOT_AUTHENTICATED"
  | "NOT_ENTRANT"
  | "SELF_EXCLUDED"
  | "RATE_LIMITED"
  | "EMPTY"
  | "TOO_LONG";

export type PostMessageOutcome =
  | { ok: true; message: ChatMessageDto }
  | { ok: false; error: PostMessageError };

export async function postMessage(opts: {
  poolId: string;
  userId: string | null;
  body: string;
}): Promise<PostMessageOutcome> {
  const { poolId } = opts;
  if (!opts.userId) return { ok: false, error: "NOT_AUTHENTICATED" };
  const userId = opts.userId;

  if (!(await poolExists(poolId))) return { ok: false, error: "POOL_NOT_FOUND" };
  if (!(await isEntrant(poolId, userId))) return { ok: false, error: "NOT_ENTRANT" };

  const body = (opts.body ?? "").trim();
  if (body.length === 0) return { ok: false, error: "EMPTY" };
  if (body.length > MAX_BODY) return { ok: false, error: "TOO_LONG" };

  // Block posting for self-excluded users (dormant table; correct default for
  // a gambling product). Reading is still allowed — only posting is gated.
  if (await hasActiveSelfExclusion(userId)) return { ok: false, error: "SELF_EXCLUDED" };

  // Rate limit: no more than RATE_MAX messages from this user in RATE_WINDOW_MS.
  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(poolMessages)
    .where(and(eq(poolMessages.userId, userId), gt(poolMessages.createdAt, since)));
  if (count >= RATE_MAX) return { ok: false, error: "RATE_LIMITED" };

  const [inserted] = await db
    .insert(poolMessages)
    .values({ poolId, userId, body })
    .returning({ id: poolMessages.id, createdAt: poolMessages.createdAt });

  const [author] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId));

  return {
    ok: true,
    message: {
      id: inserted.id,
      body,
      authorDisplayName: author?.displayName ?? "Player",
      isMine: true,
      createdAt: inserted.createdAt.toISOString(),
    },
  };
}

// ─── Moderate (admin hide) ─────────────────────────────────────────────────

export type HideMessageError = "MESSAGE_NOT_FOUND";

export type HideMessageOutcome =
  | { ok: true; messageId: string; poolId: string; previousBody: string }
  | { ok: false; error: HideMessageError };

/**
 * Soft-delete a message. Admin enforcement happens at the route layer
 * (requireAdmin). Returns the prior body + poolId so the route can write a
 * meaningful audit row.
 */
export async function hideMessage(opts: {
  messageId: string;
  adminUserId: string;
  reason?: string | null;
}): Promise<HideMessageOutcome> {
  const [existing] = await db
    .select({ id: poolMessages.id, poolId: poolMessages.poolId, body: poolMessages.body })
    .from(poolMessages)
    .where(eq(poolMessages.id, opts.messageId));
  if (!existing) return { ok: false, error: "MESSAGE_NOT_FOUND" };

  await db
    .update(poolMessages)
    .set({ hiddenAt: new Date(), hiddenBy: opts.adminUserId, hiddenReason: opts.reason ?? null })
    .where(eq(poolMessages.id, opts.messageId));

  return { ok: true, messageId: existing.id, poolId: existing.poolId, previousBody: existing.body };
}
