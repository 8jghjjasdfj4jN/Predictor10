/*
Predictor10 — portal API routes.

Endpoints serving the post-login portal screens. Thin handlers — the queries
live in server/lib/portal-data.ts.

Surface (current):
  GET  /api/competitions       — competitions with open Round + 5 tier pools (public)
  GET  /api/entries/me         — current user's open pool entries (requireAuth)
  GET  /api/pools/:id          — full pool detail (public; myEntry only when auth'd)
  POST /api/pools/:id/enter    — mock-money entry flow (requireAuth)

Surface (later steps):
  GET  /api/pools/competition/:slug  — Pools landing per competition
  PUT  /api/predictions/:id          — auto-save prediction
*/

import { Router, type Request, type Response } from "express";
import { requireAuth } from "../lib/auth-middleware";
import { writeAudit } from "../lib/audit";
import {
  enterPool,
  getCompetitionsWithOpenPools,
  getPoolDetail,
  getUserOpenEntries,
  type EnterPoolError,
} from "../lib/portal-data";

const router = Router();

router.get("/competitions", async (_req: Request, res: Response): Promise<void> => {
  try {
    const competitions = await getCompetitionsWithOpenPools();
    res.json(competitions);
  } catch (err) {
    console.error("[portal] /competitions failed:", err);
    res.status(500).json({ error: "Failed to load competitions." });
  }
});

router.get("/entries/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const entries = await getUserOpenEntries(req.user!.id);
    res.json(entries);
  } catch (err) {
    console.error("[portal] /entries/me failed:", err);
    res.status(500).json({ error: "Failed to load entries." });
  }
});

router.get("/pools/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id ?? null;
    const detail = await getPoolDetail(req.params.id, userId);
    if (!detail) {
      res.status(404).json({ error: "Pool not found." });
      return;
    }
    res.json(detail);
  } catch (err) {
    console.error("[portal] /pools/:id failed:", err);
    res.status(500).json({ error: "Failed to load pool." });
  }
});

// Maps `EnterPoolError` codes to HTTP status + user-facing copy.
const ENTER_ERROR_MAP: Record<EnterPoolError, { status: number; message: string }> = {
  POOL_NOT_FOUND: { status: 404, message: "Pool not found." },
  POOL_NOT_OPEN: { status: 400, message: "This pool isn't open for entries." },
  LATE_ENTRY_CLOSED: { status: 403, message: "Late-entry window has closed." },
};

router.post("/pools/:id/enter", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const poolId = req.params.id;
  try {
    const outcome = await enterPool({
      poolId,
      userId,
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    if (!outcome.ok) {
      const { status, message } = ENTER_ERROR_MAP[outcome.error];
      // Best-effort audit so failed entry attempts are traceable.
      await writeAudit({
        req,
        userId,
        action: "pool.entry_failed",
        entityType: "pool",
        entityId: poolId,
        metadata: { reason: outcome.error },
      });
      res.status(status).json({ error: message });
      return;
    }

    // Audit only on a fresh entry — idempotent re-hits don't get duplicate rows.
    if (!outcome.alreadyEntered) {
      await writeAudit({
        req,
        userId,
        action: "payment.succeeded",
        entityType: "payment",
        entityId: outcome.paymentId,
        metadata: {
          mode: "mock",
          referenceType: "pool_entry",
          referenceId: outcome.entryId,
        },
      });
      await writeAudit({
        req,
        userId,
        action: "pool.entry_created",
        entityType: "pool_entry",
        entityId: outcome.entryId,
        metadata: {
          poolId,
          paymentId: outcome.paymentId,
          bypassLateEntry: process.env.BYPASS_LATE_ENTRY === "true",
        },
      });
    }

    res
      .status(outcome.alreadyEntered ? 200 : 201)
      .json({ entryId: outcome.entryId, alreadyEntered: outcome.alreadyEntered });
  } catch (err) {
    console.error("[portal] /pools/:id/enter failed:", err);
    res.status(500).json({ error: "Failed to enter pool." });
  }
});

export default router;
