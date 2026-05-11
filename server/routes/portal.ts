/*
Predictor10 — portal API routes.

Endpoints serving the post-login portal screens. Thin handlers — the queries
live in server/lib/portal-data.ts.

Surface (this step):
  GET  /api/competitions   — competitions with open Round + 5 tier pools (public)
  GET  /api/entries/me     — current user's open pool entries (requireAuth)

Surface (later steps):
  GET  /api/pools/competition/:slug  — Pools landing per competition
  GET  /api/pools/:id                — Pool detail (Predict screen)
  POST /api/pools/:id/enter          — mock payment + create entry
  PUT  /api/predictions/:id          — auto-save prediction
*/

import { Router, type Request, type Response } from "express";
import { requireAuth } from "../lib/auth-middleware";
import { getCompetitionsWithOpenPools, getUserOpenEntries } from "../lib/portal-data";

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

export default router;
