/*
Predictor10 — audit log helper.

Every state-changing endpoint should call `writeAudit()` to record what
happened and who did it. Writes go to the `audit_log` table (compliance.ts)
and are append-only: required by LCCP and useful for debugging.

Audit writes must never break business logic. Failures are logged and
swallowed — the user's action succeeds even if the audit insert blows up.
*/

import type { Request } from "express";
import { db } from "../db";
import { auditLog } from "../db/schema/compliance";

type AuditAction = typeof auditLog.$inferInsert["action"];

export async function writeAudit(opts: {
  req?: Request;
  userId?: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(auditLog).values({
      userId: opts.userId ?? opts.req?.user?.id ?? null,
      action: opts.action,
      entityType: opts.entityType ?? null,
      entityId: opts.entityId ?? null,
      before: opts.before ?? null,
      after: opts.after ?? null,
      metadata: opts.metadata ?? null,
      ipAddress: opts.req?.ip ?? null,
      userAgent: opts.req?.headers["user-agent"] ?? null,
    });
  } catch (err) {
    console.error("[audit] write failed:", err);
  }
}
