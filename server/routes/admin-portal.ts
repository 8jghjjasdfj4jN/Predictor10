/*
Admin portal — user-session-gated administrative routes for the small set
of platform admins (Wez, James, Jason at the time of writing — see seed
for the canonical allowlist).

Distinct from server/routes/admin.ts, which is the machine-to-machine
maintenance surface gated by X-Admin-Token. This file is the human
admin UI's API: list users, reset passwords, toggle the off-platform
"paid" flag during the WC informal run.

Every request requires:
  1. A valid session cookie (requireAuth)
  2. The authenticated user has users.is_admin = true (requireAdmin)

Surface:
  GET    /api/admin-portal/users
         List every user with id, email, names, nickname, signup date,
         country, status flags. Excludes password hashes.

  POST   /api/admin-portal/users/:id/password
         Body: { newPassword: string (8-128 chars) }
         Argon2-hashes and writes the new password. Audit-logged with
         action=user.password_change, before/after redacted.

  PATCH  /api/admin-portal/users/:id/paid
         Body: { isPaid: boolean }
         Flips the WC off-platform paid flag. Audit-logged.

Every admin action writes an audit_log row so the licence application
can demonstrate a full record of admin interventions per LCCP's 3-year
retention requirement.
*/

import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema/users";
import { requireAuth } from "../lib/auth-middleware";
import { writeAudit } from "../lib/audit";

const router = Router();

// Same Argon2 params as signup — kept inline so any future tuning happens
// in lockstep.
const ARGON2_OPTS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  if (!req.user.isAdmin) {
    // Don't reveal that an admin surface exists — return 404, not 403.
    res.status(404).json({ error: "Not found." });
    return;
  }
  next();
}

// ─── GET /users ─────────────────────────────────────────────────────────

router.get(
  "/users",
  requireAuth,
  requireAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        nickname: users.nickname,
        displayName: users.displayName,
        countryCode: users.countryCode,
        dateOfBirth: users.dateOfBirth,
        emailVerifiedAt: users.emailVerifiedAt,
        accountStatus: users.accountStatus,
        isAdmin: users.isAdmin,
        isPaid: users.isPaid,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .orderBy(users.createdAt);

    res.json({
      users: rows.map((u) => ({
        ...u,
        emailVerified: u.emailVerifiedAt != null,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        emailVerifiedAt: undefined,
      })),
    });
  },
);

// ─── POST /users/:id/password ───────────────────────────────────────────

const passwordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters.").max(128),
});

router.post(
  "/users/:id/password",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload." });
      return;
    }
    const targetId = req.params.id;

    const [target] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, targetId));
    if (!target) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    const passwordHash = await hash(parsed.data.newPassword, ARGON2_OPTS);
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, targetId));

    // Audit — never log the new password itself, only the fact of the change
    // and who performed it.
    await writeAudit({
      req,
      userId: target.id,
      action: "user.password_change",
      entityType: "user",
      entityId: target.id,
      metadata: {
        performedBy: req.user!.id,
        performedByEmail: req.user!.email,
        adminInitiated: true,
      },
    });

    res.json({ ok: true });
  },
);

// ─── PATCH /users/:id/paid ──────────────────────────────────────────────

const paidSchema = z.object({
  isPaid: z.boolean(),
});

router.patch(
  "/users/:id/paid",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = paidSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload." });
      return;
    }
    const targetId = req.params.id;
    const { isPaid } = parsed.data;

    const [target] = await db.select().from(users).where(eq(users.id, targetId));
    if (!target) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    if (target.isPaid === isPaid) {
      // No-op: state already matches. Return success without auditing to
      // keep the audit log signal-rich (only real toggles get logged).
      res.json({ ok: true, isPaid });
      return;
    }

    await db
      .update(users)
      .set({ isPaid, updatedAt: new Date() })
      .where(eq(users.id, targetId));

    await writeAudit({
      req,
      userId: target.id,
      action: "admin.action",
      entityType: "user",
      entityId: target.id,
      before: { isPaid: target.isPaid },
      after: { isPaid },
      metadata: {
        field: "isPaid",
        performedBy: req.user!.id,
        performedByEmail: req.user!.email,
      },
    });

    res.json({ ok: true, isPaid });
  },
);

export default router;
