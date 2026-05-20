/*
Predictor10 — admin/maintenance routes.

These are machine-to-machine endpoints — not gated by user sessions; instead
each request must carry `X-Admin-Token: <ADMIN_SECRET>` (env var). When
ADMIN_SECRET isn't set, every request returns 401 — closed by default.

For GET endpoints intended to be opened in a browser, the token can be
passed as `?token=<ADMIN_SECRET>` query string instead (step 3a.2 — keeps
state inspection accessible from an iPhone without an HTTP-client app).

Use these for an external scheduler (cron-job.org, EasyCron, a Render Cron
Job calling curl, …) without setting up a separate Render service.

Surface:
  POST /api/admin/sync-outcomes  — runs the outcome sync once. Returns the
                                    sync stats (200) or an error (4xx/5xx).
  POST /api/admin/settle-pools   — settles every pool whose Round has passed
                                    the gate clause (Decided Rule #13).
                                    Returns settlement stats. Idempotent.
  GET  /api/admin/state          — read-only DB inventory: competitions,
                                    tiers, pool counts. Used to verify what's
                                    been seeded / deployed without DB access.
                                    Token via header OR ?token= query param.
*/

import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { competitions, stages, events } from "../db/schema/sports";
import { leagues } from "../db/schema/leagues";
import { pools } from "../db/schema/pools";
import { syncOutcomes } from "../lib/outcome-sync";
import { settleAllReadyPools } from "../lib/pool-settle";

const router = Router();

function checkAdminToken(req: Request, res: Response): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) {
    res.status(401).json({ error: "Admin endpoints disabled — ADMIN_SECRET not set." });
    return false;
  }
  // Accept token via header (machine-to-machine) or ?token= query (browser).
  const headerToken = req.headers["x-admin-token"];
  const queryToken = typeof req.query.token === "string" ? req.query.token : undefined;
  const got = typeof headerToken === "string" ? headerToken : queryToken;
  if (got !== expected) {
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

/**
 * GET /api/admin/state — DB inventory.
 *
 * Returns competitions (with isActive + postponedPolicy + stage/event counts),
 * tiers (with isActive + entryFee), and pool counts per competition. Used to
 * verify a deploy actually applied schema changes and ran seed correctly,
 * without needing terminal or psql access.
 *
 * Step 3a.2 added this endpoint so iPhone-only operators can verify state.
 */
router.get("/state", async (req: Request, res: Response): Promise<void> => {
  if (!checkAdminToken(req, res)) return;

  try {
    // Competitions with counts.
    const comps = await db.select().from(competitions).orderBy(competitions.name);
    const compIds = comps.map((c) => c.id);

    type CountRow = { competitionId: string; n: number };

    const stageCounts: CountRow[] = compIds.length
      ? await db
          .select({
            competitionId: stages.competitionId,
            n: sql<number>`COUNT(*)::int`,
          })
          .from(stages)
          .groupBy(stages.competitionId)
      : [];

    const eventCounts: CountRow[] = compIds.length
      ? await db
          .select({
            competitionId: events.competitionId,
            n: sql<number>`COUNT(*)::int`,
          })
          .from(events)
          .groupBy(events.competitionId)
      : [];

    const poolCounts: CountRow[] = compIds.length
      ? await db
          .select({
            competitionId: pools.competitionId,
            n: sql<number>`COUNT(*)::int`,
          })
          .from(pools)
          .groupBy(pools.competitionId)
      : [];

    const stageMap = new Map(stageCounts.map((r) => [r.competitionId, r.n]));
    const eventMap = new Map(eventCounts.map((r) => [r.competitionId, r.n]));
    const poolMap = new Map(poolCounts.map((r) => [r.competitionId, r.n]));

    const competitionsOut = comps.map((c) => ({
      slug: c.slug,
      name: c.name,
      shortName: c.shortName,
      externalId: c.externalId,
      externalSeasonId: c.externalSeasonId,
      isActive: c.isActive,
      postponedPolicy: c.postponedPolicy,
      stageCount: stageMap.get(c.id) ?? 0,
      eventCount: eventMap.get(c.id) ?? 0,
      poolCount: poolMap.get(c.id) ?? 0,
    }));

    // Tiers — every league row, including retired ones (is_active=false).
    const tierRows = await db.select().from(leagues).orderBy(leagues.ordinal);
    const tiersOut = tierRows.map((t) => ({
      slug: t.slug,
      name: t.name,
      entryFee: t.entryFee,
      isActive: t.isActive,
      ordinal: t.ordinal,
    }));

    res.json({
      generatedAt: new Date().toISOString(),
      schemaHas: {
        postponedPolicyColumn: comps.length > 0
          ? Object.prototype.hasOwnProperty.call(comps[0], "postponedPolicy")
          : null,
      },
      competitions: competitionsOut,
      tiers: tiersOut,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[admin] state failed:", err);
    res.status(500).json({ error: message });
  }
});

export default router;
