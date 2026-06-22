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
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema/users";
import { poolEntries, pools } from "../db/schema/pools";
import { competitions, stages } from "../db/schema/sports";
import { leagues } from "../db/schema/leagues";
import { auditLog } from "../db/schema/compliance";
import { requireAuth } from "../lib/auth-middleware";
import { writeAudit } from "../lib/audit";
// ── WC CHAT (temporary) ── start — remove after WC (docs/wc-chat-teardown.md)
import { hideMessage } from "../lib/chat-data";
// ── WC CHAT (temporary) ── end

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

// ─── GET /score-alerts ──────────────────────────────────────────────────
//
// Surfaces "score divergence" alerts raised by the results-checker's detector
// (server/lib/outcome-sync.ts) — cases where football-data now reports a
// different result than the one already recorded. Read-only: the actual fix is
// applied deliberately via server/scripts/correct-outcome.ts. An alert is
// "resolved" once a later admin correction for the same event is recorded.
router.get(
  "/score-alerts",
  requireAuth,
  requireAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select({
        id: auditLog.id,
        entityId: auditLog.entityId,
        before: auditLog.before,
        after: auditLog.after,
        ipAddress: auditLog.ipAddress,
        metadata: auditLog.metadata,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(and(eq(auditLog.action, "admin.action"), eq(auditLog.entityType, "event_outcome")))
      .orderBy(desc(auditLog.createdAt))
      .limit(100);

    const corrections = rows.filter((r) => {
      const md = (r.metadata ?? {}) as { tool?: string };
      return (
        r.ipAddress === "admin-shell-outcome-correction" ||
        md.tool === "server/scripts/correct-outcome.ts"
      );
    });

    const alerts = rows.filter((r) => ((r.metadata ?? {}) as { kind?: string }).kind === "outcome_divergence");

    const payload = alerts.map((a) => {
      const md = (a.metadata ?? {}) as { match?: string };
      const before = (a.before ?? {}) as { homeScore?: number; awayScore?: number };
      const after = (a.after ?? {}) as { homeScore?: number; awayScore?: number };
      // Resolved if a correction for the same event was recorded after this alert.
      const resolved = corrections.some(
        (c) => c.entityId === a.entityId && c.createdAt > a.createdAt,
      );
      return {
        id: a.id,
        match: md.match ?? "Unknown match",
        recorded: `${before.homeScore ?? "?"}-${before.awayScore ?? "?"}`,
        footballData: `${after.homeScore ?? "?"}-${after.awayScore ?? "?"}`,
        detectedAt: a.createdAt.toISOString(),
        resolved,
      };
    });

    res.json({ alerts: payload });
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

// ─── GET /users/:id/entries ─────────────────────────────────────────────
//
// Lists a player's CURRENT entries — live (not settled) and not already
// voided — so an admin can remove one from the round it belongs to. Settled
// entries are excluded: their result and any payout are final and are read
// from /account/history, not from here.
router.get(
  "/users/:id/entries",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const targetId = req.params.id;
    const rows = await db
      .select({
        entryId: poolEntries.id,
        poolId: poolEntries.poolId,
        enteredAt: poolEntries.enteredAt,
        competitionName: competitions.name,
        tierName: leagues.name,
        roundName: stages.name,
      })
      .from(poolEntries)
      .innerJoin(pools, eq(poolEntries.poolId, pools.id))
      .innerJoin(competitions, eq(pools.competitionId, competitions.id))
      .innerJoin(leagues, eq(pools.leagueId, leagues.id))
      .innerJoin(stages, eq(pools.stageId, stages.id))
      .where(
        and(
          eq(poolEntries.userId, targetId),
          isNull(poolEntries.settledAt),
          isNull(poolEntries.voidedAt),
        ),
      )
      .orderBy(asc(pools.closesAt));

    res.json({
      entries: rows.map((r) => ({ ...r, enteredAt: r.enteredAt.toISOString() })),
    });
  },
);

// ─── POST /entries/:entryId/void ────────────────────────────────────────
//
// "Remove from pool" — the licensed-clean removal. It does NOT delete the
// entry: it marks it voided (with the acting admin + a required reason),
// which drops the player from the pot, the standings, their own live entries
// and from settlement scoring, while the entry, its payment row and the audit
// trail are retained. A settled entry can't be voided (its payout is final).
const voidEntrySchema = z.object({
  reason: z.string().trim().min(3, "A reason is required.").max(300),
});

router.post(
  "/entries/:entryId/void",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = voidEntrySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload." });
      return;
    }
    const entryId = req.params.entryId;

    const [entry] = await db
      .select({
        id: poolEntries.id,
        userId: poolEntries.userId,
        poolId: poolEntries.poolId,
        voidedAt: poolEntries.voidedAt,
        settledAt: poolEntries.settledAt,
      })
      .from(poolEntries)
      .where(eq(poolEntries.id, entryId));

    if (!entry) {
      res.status(404).json({ error: "Entry not found." });
      return;
    }
    if (entry.voidedAt) {
      // Idempotent — already removed. No second audit row.
      res.json({ ok: true, alreadyVoided: true });
      return;
    }
    if (entry.settledAt) {
      res.status(409).json({
        error: "Can't remove a settled entry — its result and any payout are final.",
      });
      return;
    }

    const now = new Date();
    await db
      .update(poolEntries)
      .set({ voidedAt: now, voidedBy: req.user!.id, voidReason: parsed.data.reason })
      .where(eq(poolEntries.id, entryId));

    await writeAudit({
      req,
      userId: entry.userId,
      action: "admin.action",
      entityType: "pool_entry",
      entityId: entry.id,
      before: { voidedAt: null },
      after: { voidedAt: now.toISOString() },
      metadata: {
        field: "voidedAt",
        poolId: entry.poolId,
        reason: parsed.data.reason,
        performedBy: req.user!.id,
        performedByEmail: req.user!.email,
      },
    });

    res.json({ ok: true });
  },
);

// ── WC CHAT (temporary) ── start — remove after WC (docs/wc-chat-teardown.md)

// POST /messages/:id/hide — soft-delete (moderate) a chat message. Admin-only.
// Audited as admin.action so the licence record shows every intervention.
const hideMessageSchema = z.object({
  reason: z.string().max(300).optional(),
});

router.post(
  "/messages/:id/hide",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = hideMessageSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload." });
      return;
    }

    const outcome = await hideMessage({
      messageId: req.params.id,
      adminUserId: req.user!.id,
      reason: parsed.data.reason ?? null,
    });

    if (!outcome.ok) {
      res.status(404).json({ error: "Message not found." });
      return;
    }

    await writeAudit({
      req,
      userId: req.user!.id,
      action: "admin.action",
      entityType: "pool_message",
      entityId: outcome.messageId,
      before: { body: outcome.previousBody, hidden: false },
      after: { hidden: true },
      metadata: {
        field: "hiddenAt",
        poolId: outcome.poolId,
        reason: parsed.data.reason ?? null,
        performedBy: req.user!.id,
        performedByEmail: req.user!.email,
      },
    });

    res.json({ ok: true });
  },
);

// ── WC CHAT (temporary) ── end

export default router;
