/*
Predictor10 — admin/maintenance routes.

These are machine-to-machine endpoints — not gated by user sessions; instead
each request must carry `X-Admin-Token: <ADMIN_SECRET>` (env var). When
ADMIN_SECRET isn't set, every request returns 401 — closed by default.

Use these for an external scheduler (cron-job.org, EasyCron, a Render Cron
Job calling curl, …) without setting up a separate Render service.

Surface:
  POST /api/admin/sync-outcomes  — runs the outcome sync once. Returns the
                                    sync stats (200) or an error (4xx/5xx).
  POST /api/admin/settle-pools   — settles every pool whose Round has passed
                                    the gate clause (Decided Rule #13).
                                    Returns settlement stats. Idempotent.
*/

import { Router, type Request, type Response } from "express";
import { syncOutcomes } from "../lib/outcome-sync";
import { settleAllReadyPools } from "../lib/pool-settle";

const router = Router();

function checkAdminToken(req: Request, res: Response): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) {
    res.status(401).json({ error: "Admin endpoints disabled — ADMIN_SECRET not set." });
    return false;
  }
  const got = req.headers["x-admin-token"];
  if (typeof got !== "string" || got !== expected) {
    res.status(401).json({ error: "Invalid admin token." });
    return false;
  }
  return true;
}

router.post("/sync-outcomes", async (req: Request, res: Response): Promise<void> => {
  if (!checkAdminToken(req, res)) return;

  const startedAt = Date.now();
  try {
    const result = await syncOutcomes();
    const durationMs = Date.now() - startedAt;
    console.log(
      `[admin] sync-outcomes ok in ${durationMs}ms — outcomes:${result.outcomesWritten} ` +
      `scored:${result.predictionsScored} errors:${result.errors.length}`,
    );
    // 207 Multi-Status when partially failing is overkill; just include
    // errors in the body and let the caller decide.
    res.json({ durationMs, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[admin] sync-outcomes failed:", err);
    res.status(500).json({ error: message });
  }
});

router.post("/settle-pools", async (req: Request, res: Response): Promise<void> => {
  if (!checkAdminToken(req, res)) return;

  const startedAt = Date.now();
  try {
    const result = await settleAllReadyPools();
    const durationMs = Date.now() - startedAt;
    console.log(
      `[admin] settle-pools ok in ${durationMs}ms — ` +
      `checked:${result.poolsChecked} ready:${result.poolsReady} ` +
      `settled:${result.poolsSettled} payouts:${result.payoutsWritten} ` +
      `errors:${result.errors.length}`,
    );
    res.json({ durationMs, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[admin] settle-pools failed:", err);
    res.status(500).json({ error: message });
  }
});

export default router;
