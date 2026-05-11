/*
Predictor10 — session token utilities.

Sessions are server-stored (row in `sessions`) so logout is instant and tokens
can be revoked. The cookie carries an opaque 32-byte token; only its SHA-256
hash sits in Postgres — DB read won't yield a usable cookie value.

Sliding-expiry: a 30-day TTL that resets when a session is used with <7 days
remaining. Caps churn on `expires_at` to once per week per user.
*/

import { randomBytes, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { sessions } from "../db/schema/users";

export const SESSION_COOKIE_NAME = "p10_session";
const SESSION_TTL_DAYS = 30;
const SESSION_SLIDE_AT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = SESSION_TTL_DAYS * DAY_MS;
const SLIDE_THRESHOLD_MS = SESSION_SLIDE_AT_DAYS * DAY_MS;

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(opts: {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ token: string; session: typeof sessions.$inferSelect }> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const [row] = await db
    .insert(sessions)
    .values({
      userId: opts.userId,
      tokenHash,
      expiresAt,
      ipAddress: opts.ipAddress ?? null,
      userAgent: opts.userAgent ?? null,
    })
    .returning();

  return { token, session: row };
}

/**
 * Returns the session row if the token is valid and unexpired.
 * As a side effect, bumps `last_used_at` and slides `expires_at` if within the
 * 7-day refresh window. Expired sessions are cleaned up asynchronously.
 */
export async function loadSession(token: string) {
  const tokenHash = hashSessionToken(token);
  const [row] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
  if (!row) return null;

  if (row.expiresAt.getTime() < Date.now()) {
    // Best-effort cleanup. Don't await — caller doesn't care.
    db.delete(sessions).where(eq(sessions.id, row.id)).catch(() => {});
    return null;
  }

  const remainingMs = row.expiresAt.getTime() - Date.now();
  if (remainingMs < SLIDE_THRESHOLD_MS) {
    const newExpiry = new Date(Date.now() + SESSION_TTL_MS);
    await db
      .update(sessions)
      .set({ expiresAt: newExpiry, lastUsedAt: new Date() })
      .where(eq(sessions.id, row.id));
    row.expiresAt = newExpiry;
  } else {
    // Lazy lastUsedAt update — fire and forget, don't block the request.
    db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, row.id)).catch(() => {});
  }

  return row;
}

export async function destroySession(token: string): Promise<void> {
  const tokenHash = hashSessionToken(token);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}
