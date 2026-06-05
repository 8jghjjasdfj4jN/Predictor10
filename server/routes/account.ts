/*
Account routes — user-editable profile fields.

PATCH /api/account/nickname
  - Validates new nickname (same rules as signup: 3–15 chars,
    letters/digits/underscore, not in the reserved list).
  - Case-insensitive uniqueness check across all users (excluding self).
  - Updates users.nickname + avatarInitials.
  - Writes an audit_log entry (action: user.profile_update,
    before/after = {nickname}) so the change is fully traceable
    against the LCCP 3-year retention requirement.
  - Returns the updated public user (same shape as /api/auth/me).

First/last name + email + DOB are NOT editable in V1 — those are
KYC-bearing fields that need a re-verification flow when real money
is on. The Settings sub-page will host those edits later.
*/

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { sql, eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema/users";
import { requireAuth } from "../lib/auth-middleware";
import { writeAudit } from "../lib/audit";

const router = Router();

// Kept in sync with signup's reserved list in routes/auth.ts. Small enough
// to inline; factor into a shared module if it grows much further.
const RESERVED_NICKNAMES = new Set([
  "admin",
  "administrator",
  "moderator",
  "mod",
  "predictor10",
  "predictor",
  "support",
  "system",
  "staff",
  "official",
  "help",
  "you",
]);

const NICKNAME_PATTERN = /^[A-Za-z0-9_]{3,15}$/;

const updateNicknameSchema = z.object({
  nickname: z
    .string()
    .trim()
    .regex(
      NICKNAME_PATTERN,
      "Nickname must be 3–15 characters, letters/digits/underscore only.",
    )
    .refine(
      (v) => !RESERVED_NICKNAMES.has(v.toLowerCase()),
      "That nickname is reserved. Please choose another.",
    ),
});

type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  nickname: string | null;
  avatarInitials: string | null;
  emailVerified: boolean;
  countryCode: string;
  marketingConsent: boolean;
};

function publicUser(u: typeof users.$inferSelect): PublicUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    firstName: u.firstName,
    lastName: u.lastName,
    nickname: u.nickname,
    avatarInitials: u.avatarInitials,
    emailVerified: u.emailVerifiedAt != null,
    countryCode: u.countryCode,
    marketingConsent: u.marketingConsent,
  };
}

router.patch("/nickname", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = updateNicknameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid nickname." });
    return;
  }
  const { nickname } = parsed.data;
  const me = req.user!;

  // No-op when the value is identical (incl. case) to what the user
  // already has — return success without writing or auditing.
  if (me.nickname === nickname) {
    res.json({ user: publicUser(me) });
    return;
  }

  // Case-insensitive uniqueness check excluding self. The partial unique
  // index on lower(nickname) would also catch this server-side, but the
  // explicit pre-check gives a clean error message.
  const [clash] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      sql`lower(${users.nickname}) = ${nickname.toLowerCase()} AND ${users.id} <> ${me.id}`,
    );
  if (clash) {
    res.status(409).json({ error: "That nickname is already taken. Please choose another." });
    return;
  }

  const before = { nickname: me.nickname };
  const [updated] = await db
    .update(users)
    .set({
      nickname,
      avatarInitials: nickname.slice(0, 2).toUpperCase(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, me.id))
    .returning();

  await writeAudit({
    req,
    userId: me.id,
    action: "user.profile_update",
    entityType: "user",
    entityId: me.id,
    before,
    after: { nickname: updated.nickname },
    metadata: { field: "nickname" },
  });

  res.json({ user: publicUser(updated) });
});

export default router;
