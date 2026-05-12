/*
Predictor10 — portal API routes.

Endpoints serving the post-login portal screens. Thin handlers — the queries
live in server/lib/portal-data.ts.

Surface (current):
  GET  /api/competitions                         — competitions with open Round + 5 tier pools (public)
  GET  /api/entries/me                           — current user's open pool entries (requireAuth)
  GET  /api/pools/:id                            — full pool detail (public; myEntry only when auth'd)
  POST /api/pools/:id/enter                      — mock-money entry flow (requireAuth)
  GET  /api/entries/:id                          — entry detail with matches + predictions (requireAuth)
  PUT  /api/entries/:id/predictions/:eventId     — upsert one prediction (requireAuth)
  GET  /api/account/history                      — settled-pools archive (requireAuth)
*/

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../lib/auth-middleware";
import { writeAudit } from "../lib/audit";
import {
  enterPool,
  getAccountHistory,
  getCompetitionsWithOpenPools,
  getEntryDetail,
  getPoolDetail,
  getUserOpenEntries,
  upsertPrediction,
  type EnterPoolError,
  type UpsertPredictionError,
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

// ─── Entry detail + predictions (step 2f) ────────────────────────────────

router.get("/entries/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const detail = await getEntryDetail(req.params.id, req.user!.id);
    if (!detail) {
      // 404 covers both "doesn't exist" and "belongs to another user" — we
      // intentionally don't distinguish (no info leak about other users' entries).
      res.status(404).json({ error: "Entry not found." });
      return;
    }
    res.json(detail);
  } catch (err) {
    console.error("[portal] /entries/:id failed:", err);
    res.status(500).json({ error: "Failed to load entry." });
  }
});

const PREDICTION_ERROR_MAP: Record<UpsertPredictionError, { status: number; message: string }> = {
  ENTRY_NOT_FOUND: { status: 404, message: "Entry not found." },
  ENTRY_NOT_OWNED: { status: 404, message: "Entry not found." }, // 404 not 403 — don't leak existence
  EVENT_NOT_IN_POOL: { status: 400, message: "That match isn't in this Round." },
  EVENT_LOCKED: { status: 403, message: "This match's predictions are locked." },
  INVALID_SCORE: { status: 400, message: "Scores must be whole numbers from 0 to 99." },
};

const predictionBodySchema = z.object({
  homeScore: z.number().int().min(0).max(99),
  awayScore: z.number().int().min(0).max(99),
});

router.put(
  "/entries/:entryId/predictions/:eventId",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const { entryId, eventId } = req.params;

    const parsed = predictionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Scores must be whole numbers from 0 to 99." });
      return;
    }

    try {
      const outcome = await upsertPrediction({
        entryId,
        eventId,
        userId,
        homeScore: parsed.data.homeScore,
        awayScore: parsed.data.awayScore,
        // LCCP 13.1.2: equipment identification. IP is captured per-prediction.
        ipAddress: req.ip ?? "unknown",
        userAgent: req.headers["user-agent"] ?? null,
      });

      if (!outcome.ok) {
        const { status, message } = PREDICTION_ERROR_MAP[outcome.error];
        res.status(status).json({ error: message });
        return;
      }

      // Audit on every successful upsert. Predict screens auto-save on every
      // keystroke (debounced), so this fires often — kept lightweight by
      // writeAudit being best-effort + a single insert.
      await writeAudit({
        req,
        userId,
        action: "prediction.updated",
        entityType: "prediction",
        entityId: outcome.eventId,
        metadata: {
          entryId,
          eventId,
          homeScore: parsed.data.homeScore,
          awayScore: parsed.data.awayScore,
        },
      });

      res.json({ eventId: outcome.eventId, prediction: outcome.prediction });
    } catch (err) {
      console.error("[portal] PUT /entries/:id/predictions/:eventId failed:", err);
      res.status(500).json({ error: "Failed to save prediction." });
    }
  },
);

// ─── Account history (step 2j) ───────────────────────────────────────────

router.get("/account/history", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const history = await getAccountHistory(req.user!.id);
    res.json(history);
  } catch (err) {
    console.error("[portal] /account/history failed:", err);
    res.status(500).json({ error: "Failed to load history." });
  }
});

export default router;
