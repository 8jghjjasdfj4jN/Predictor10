/*
Eliminator10 — routes (step e3). Mounted at /api/eliminator.

  GET  /api/eliminator/:slug            — overview for the Home card (viewer optional)
  POST /api/eliminator/:slug/enter      — join the game (requireAuth)
  GET  /api/eliminator/:slug/pick       — current round + fixtures + your pick (requireAuth, entrant)
  POST /api/eliminator/:slug/pick       — submit a pick for the current round (requireAuth, alive entrant)
  GET  /api/eliminator/:slug/survivors  — still-in / out (settled = public; live = auth + entrant)

Error variants from the data layer are mapped to HTTP here, exactly like
portal.ts. Picks for a round are never disclosed until it locks (handled in
the data layer) — same anti-cheat as §18/§19.
*/

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../lib/auth-middleware";
import { writeAudit } from "../lib/audit";
import {
  getEliminatorOverview,
  joinEliminator,
  getEliminatorPickScreen,
  submitEliminatorPick,
  getEliminatorSurvivors,
  type JoinEliminatorError,
  type GetPickScreenError,
  type SubmitPickError,
  type GetSurvivorsError,
} from "../lib/eliminator-data";

const router = Router();

router.get("/:slug", async (req: Request, res: Response): Promise<void> => {
  try {
    const overview = await getEliminatorOverview(req.params.slug, req.user?.id ?? null);
    if (!overview) {
      res.status(404).json({ error: "Game not found." });
      return;
    }
    res.json(overview);
  } catch (err) {
    console.error("[eliminator] /:slug failed:", err);
    res.status(500).json({ error: "Failed to load game." });
  }
});

const JOIN_ERROR_MAP: Record<JoinEliminatorError, { status: number; message: string }> = {
  GAME_NOT_FOUND: { status: 404, message: "Game not found." },
  GAME_NOT_OPEN: { status: 400, message: "This game isn't open for entries." },
  ENTRIES_CLOSED: { status: 403, message: "Entries have closed for this game." },
};

router.post("/:slug/enter", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const slug = req.params.slug;
  try {
    const outcome = await joinEliminator({
      slug,
      userId,
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    if (!outcome.ok) {
      const { status, message } = JOIN_ERROR_MAP[outcome.error];
      res.status(status).json({ error: message });
      return;
    }

    if (!outcome.alreadyEntered) {
      await writeAudit({
        req,
        userId,
        action: "eliminator.entry_created",
        entityType: "eliminator_entry",
        entityId: outcome.entryId,
        metadata: { slug },
      });
    }

    res
      .status(outcome.alreadyEntered ? 200 : 201)
      .json({ entryId: outcome.entryId, alreadyEntered: outcome.alreadyEntered });
  } catch (err) {
    console.error("[eliminator] /:slug/enter failed:", err);
    res.status(500).json({ error: "Failed to join game." });
  }
});

const PICK_SCREEN_ERROR_MAP: Record<GetPickScreenError, { status: number; message: string }> = {
  GAME_NOT_FOUND: { status: 404, message: "Game not found." },
  NOT_AUTHENTICATED: { status: 401, message: "Sign in to play." },
  NOT_ENTRANT: { status: 403, message: "Join the game to make a pick." },
};

router.get("/:slug/pick", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const outcome = await getEliminatorPickScreen(req.params.slug, req.user!.id);
    if (!outcome.ok) {
      const { status, message } = PICK_SCREEN_ERROR_MAP[outcome.error];
      res.status(status).json({ error: message });
      return;
    }
    res.json(outcome.data);
  } catch (err) {
    console.error("[eliminator] GET /:slug/pick failed:", err);
    res.status(500).json({ error: "Failed to load pick screen." });
  }
});

const SUBMIT_PICK_ERROR_MAP: Record<SubmitPickError, { status: number; message: string }> = {
  GAME_NOT_FOUND: { status: 404, message: "Game not found." },
  NOT_ENTRANT: { status: 403, message: "Join the game to make a pick." },
  ENTRY_NOT_ALIVE: { status: 403, message: "You're out of this game — no more picks." },
  ROUND_NOT_FOUND: { status: 404, message: "Round not found." },
  ENTRIES_LOCKED: { status: 403, message: "This round is locked — the deadline has passed." },
  EVENT_NOT_IN_ROUND: { status: 400, message: "That match isn't in this round." },
  EVENT_AWAITING_TEAMS: { status: 409, message: "That team isn't confirmed yet." },
  TEAM_ALREADY_USED: { status: 409, message: "You've already used that team in this competition." },
};

const pickSchema = z.object({
  roundId: z.string().uuid(),
  eventId: z.string().uuid(),
  side: z.enum(["home", "away"]),
});

router.post("/:slug/pick", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const slug = req.params.slug;

  const parsed = pickSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Pick a team from the round's fixtures." });
    return;
  }

  try {
    const outcome = await submitEliminatorPick({
      slug,
      userId,
      roundId: parsed.data.roundId,
      eventId: parsed.data.eventId,
      side: parsed.data.side,
      ipAddress: req.ip ?? "unknown",
      userAgent: req.headers["user-agent"] ?? null,
    });

    if (!outcome.ok) {
      const { status, message } = SUBMIT_PICK_ERROR_MAP[outcome.error];
      res.status(status).json({ error: message });
      return;
    }

    await writeAudit({
      req,
      userId,
      action: "eliminator.pick_submitted",
      entityType: "eliminator_pick",
      entityId: outcome.eventId,
      metadata: { slug, roundId: parsed.data.roundId, side: outcome.side, team: outcome.team },
    });

    res.json({ eventId: outcome.eventId, side: outcome.side, team: outcome.team });
  } catch (err) {
    console.error("[eliminator] POST /:slug/pick failed:", err);
    res.status(500).json({ error: "Failed to save pick." });
  }
});

const SURVIVORS_ERROR_MAP: Record<GetSurvivorsError, { status: number; message: string }> = {
  GAME_NOT_FOUND: { status: 404, message: "Game not found." },
  NOT_AUTHENTICATED: { status: 401, message: "Sign in to view the survivors." },
  NOT_ENTRANT: { status: 403, message: "Only entrants can view the survivors while the game is live." },
};

router.get("/:slug/survivors", async (req: Request, res: Response): Promise<void> => {
  try {
    const outcome = await getEliminatorSurvivors(req.params.slug, req.user?.id ?? null);
    if (!outcome.ok) {
      const { status, message } = SURVIVORS_ERROR_MAP[outcome.error];
      res.status(status).json({ error: message });
      return;
    }
    res.json(outcome.data);
  } catch (err) {
    console.error("[eliminator] /:slug/survivors failed:", err);
    res.status(500).json({ error: "Failed to load survivors." });
  }
});

export default router;
