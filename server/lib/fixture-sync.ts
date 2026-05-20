/*
Shared fixture-sync helpers — used by both `seed.ts` (first deploy / manual
catch-up) and `outcome-sync.ts` (scheduled cron). One implementation for the
football-data.org → `events` table upsert so the two callers can't drift.

What lives here:
  - `FDStatus`, `FDMatch` — typed subset of the football-data.org response
  - `mapFootballDataStatus()` — FD status → internal `event_status` enum
  - `LOCK_LEAD_MS` — single source of truth for the prediction-lock lead
  - `fetchAllMatchesForSeason()` — one HTTP call, returns all matches for a
    competition+season (no status filter — caller branches on status)
  - `upsertEventFromFootballData()` — per-event upsert with safety rails:
      • inserts new matches
      • refreshes kickoff / lock / matchday / status on non-finished events
      • NEVER overwrites a `finished` event's status or kickoff — those rows
        are immutable from this path; outcome corrections go through the
        outcome-write code path in `outcome-sync.ts`
      • returns a discriminated action so callers can tally stats

Why the safety rail matters: football-data can occasionally re-emit a
finished match with a transiently-different status (cache propagation, late
edit). Without the guard a fixture-refresh pass could revert a `finished`
event back to `scheduled`, which would unlock predictions on a played match
and corrupt the scoring pipeline. The rule is one-way: finished is terminal
from the fixture path. Outcome corrections are the outcome path's job.
*/

import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { events } from "../db/schema/sports";

// ─── football-data.org types (subset we use) ─────────────────────────────

export type FDStatus =
  | "SCHEDULED" | "TIMED" | "IN_PLAY" | "PAUSED"
  | "FINISHED" | "SUSPENDED" | "POSTPONED" | "CANCELLED" | "AWARDED";

export type FDMatch = {
  id: number;
  utcDate: string;
  lastUpdated?: string;
  status: FDStatus;
  matchday: number | null;
  // Tournament-only fields. football-data sends `stage` on every match and
  // `group` only on group-stage matches.
  //   stage: "GROUP_STAGE" | "LAST_32" | "LAST_16" | "QUARTER_FINALS" |
  //          "SEMI_FINALS" | "THIRD_PLACE_PLAYOFF" | "FINAL" | ...
  //   group: "GROUP_A" | "GROUP_B" | ... | null  (null for knockouts)
  // For PL / Champ (regular season), `stage` is "REGULAR_SEASON" and
  // `group` is null. We persist a normalised group label ("A", "B"…) on
  // events.group_label so the predict UI can show "Group A" per row.
  stage?: string | null;
  group?: string | null;
  // Tournament knockout fixtures may have null homeTeam/awayTeam until the
  // prior round resolves — football-data sends `null` for the slot, not a
  // placeholder object. Step 3a.4 made the schema columns nullable to match.
  homeTeam: { id: number; name: string; shortName?: string | null; tla?: string | null } | null;
  awayTeam: { id: number; name: string; shortName?: string | null; tla?: string | null } | null;
  venue?: string | null;
  score?: {
    // Step 3a — `duration` distinguishes 90-min finishes from extra-time /
    // shootout finishes. When duration is anything other than REGULAR, the
    // `fullTime` field contains the post-ET (or post-shootout) result, so we
    // must read `regularTime` instead to honour the "FT (90 min) only"
    // scoring rule for the World Cup knockouts.
    duration?: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT";
    fullTime?: { home: number | null; away: number | null };
    regularTime?: { home: number | null; away: number | null };
    extraTime?: { home: number | null; away: number | null };
    penalties?: { home: number | null; away: number | null };
  };
};

/**
 * Normalise football-data's group string to a short label.
 *   "GROUP_A" → "A"
 *   "GROUP_F" → "F"
 *   null / undefined / unknown → null
 *
 * Used to populate `events.group_label`. Tournament group-stage matches
 * carry a value; everything else (knockouts, league matches) stays null.
 */
export function normaliseGroupLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^GROUP_(.+)$/.exec(value);
  return match ? match[1] : null;
}

/**
 * Sort order for knockout-stage display, lowest = earliest in tournament.
 * Used by the Predict screen to render Round of 32 above Round of 16,
 * Quarter-finals above Semi-finals, etc.
 *
 * Group-stage matches return 0 — they're handled via matchday and don't
 * mix with knockouts in the Knockout Stages tab.
 */
export function knockoutStageOrder(fdStage: string | null | undefined): number {
  switch (fdStage) {
    case "LAST_32":              return 1;
    case "LAST_16":              return 2;
    case "QUARTER_FINALS":       return 3;
    case "SEMI_FINALS":          return 4;
    case "THIRD_PLACE_PLAYOFF":  return 5;
    case "FINAL":                return 6;
    default:                     return 0;
  }
}

/**
 * Human display label for a tournament stage. Null for unknown / non-
 * tournament stages — client uses this to render Knockout Stages
 * sub-headings.
 */
export function knockoutStageDisplay(fdStage: string | null | undefined): string | null {
  switch (fdStage) {
    case "LAST_32":              return "Round of 32";
    case "LAST_16":              return "Round of 16";
    case "QUARTER_FINALS":       return "Quarter-finals";
    case "SEMI_FINALS":          return "Semi-finals";
    case "THIRD_PLACE_PLAYOFF":  return "Third-place playoff";
    case "FINAL":                return "Final";
    default:                     return null;
  }
}

/**
 * Returns the 90-minute (regulation-time only) score for a finished match,
 * or `null` if no usable score is present.
 *
 * Predictor10 scores predictions on the 90-minute result only — extra-time
 * and penalty-shootout goals are explicitly ignored (Decided Rule: "FT only
 * for WC"). For Premier League / Championship matches there is no extra
 * time, so `fullTime` already equals the 90-min score. For World Cup
 * knockouts that went to extra time or penalties, football-data sets
 * `score.duration` to `EXTRA_TIME` or `PENALTY_SHOOTOUT`, in which case
 * `score.fullTime` contains the *final* result (i.e. includes ET goals).
 * The 90-min score lives in `score.regularTime`.
 *
 * Rule:
 *   - duration absent OR "REGULAR" → use fullTime.
 *   - duration "EXTRA_TIME" / "PENALTY_SHOOTOUT" → use regularTime; if
 *     regularTime is missing, return null (refuse to guess — better to skip
 *     this run and write nothing than to write a wrong score that locks in
 *     under first-write-wins).
 */
export function extractRegulationScore(
  match: FDMatch,
): { home: number; away: number } | null {
  const duration = match.score?.duration;
  if (duration && duration !== "REGULAR") {
    const rt = match.score?.regularTime;
    if (rt && rt.home != null && rt.away != null) {
      return { home: rt.home, away: rt.away };
    }
    return null;
  }
  const ft = match.score?.fullTime;
  if (ft && ft.home != null && ft.away != null) {
    return { home: ft.home, away: ft.away };
  }
  return null;
}

// Mirrors `event_status` enum in server/db/schema/sports.ts.
export type InternalEventStatus =
  | "scheduled" | "live" | "finished" | "postponed" | "cancelled" | "void";

export function mapFootballDataStatus(fd: FDStatus): InternalEventStatus {
  switch (fd) {
    case "SCHEDULED":
    case "TIMED":      return "scheduled";
    case "IN_PLAY":
    case "PAUSED":     return "live";
    case "FINISHED":
    case "AWARDED":    return "finished";
    case "POSTPONED":  return "postponed";
    case "CANCELLED":  return "cancelled";
    case "SUSPENDED":  return "void";
  }
}

// ─── Constants ───────────────────────────────────────────────────────────

// Predictions lock 1 hour before kickoff. Single source of truth — seed,
// sync, and any future scheduler all derive `predictionLockAt` from kickoff
// using this value.
export const LOCK_LEAD_MS = 60 * 60 * 1000;

const FOOTBALL_API_BASE = "https://api.football-data.org/v4";

// ─── HTTP fetch ──────────────────────────────────────────────────────────

/**
 * One HTTP call to football-data.org returning every match in a competition+
 * season. No status filter — caller branches on `m.status` to decide what to
 * do with each row (write outcome, refresh fixture metadata, both, neither).
 *
 * Why no filter: we used to fetch FINISHED-only when the sync was outcome-
 * only. That meant scheduled-fixture changes (rescheduled, postponed,
 * newly-added matches) silently vanished from our DB until someone ran the
 * seed script by hand. Pulling the full set on every run is the same one
 * HTTP call with a larger payload (~50 KB per competition vs ~1 KB) and well
 * inside the free-tier budget (10 req/min, 14,400/day; at 5-min cron with 2
 * competitions that's 576 calls/day = 4% of the daily limit).
 */
export async function fetchAllMatchesForSeason(
  externalCode: string,
  season: number,
): Promise<FDMatch[]> {
  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) throw new Error("FOOTBALL_API_KEY env var not set");

  const url = `${FOOTBALL_API_BASE}/competitions/${externalCode}/matches?season=${season}`;
  const res = await fetch(url, { headers: { "X-Auth-Token": apiKey } });
  if (!res.ok) {
    throw new Error(`football-data ${res.status} ${res.statusText} for ${externalCode}`);
  }
  const data = (await res.json()) as { matches: FDMatch[] };
  return data.matches ?? [];
}

// ─── Per-event upsert ────────────────────────────────────────────────────

export type UpsertEventInput = {
  fdMatch: FDMatch;
  competitionId: string;
  /**
   * Stage to attach this event to, derived from `fdMatch.matchday` via the
   * caller's round structure. `null` means "this matchday has no stage in
   * our schema (out of any modelled Round)" — caller built the map; the
   * helper just respects it. Skipping is reported, not an error.
   */
  stageId: string | null;
  /**
   * Existing row from the `events` table for this external_id, or null on
   * first sight. Caller batches the lookup (single `inArray()` query per
   * competition per run) and passes per-row state to keep this helper
   * I/O-light: one INSERT or one UPDATE.
   */
  existing: {
    id: string;
    status: InternalEventStatus;
    kickoffAt: Date;
    matchday: number | null;
    // Optional — only the seed and outcome-sync that need bracket-fill
    // detection pass these. Older callers omit them and the update path
    // falls back to "always overwrite teams" (no harm since matching values
    // → no-op SQL UPDATE on those columns).
    homeTeam?: string | null;
    awayTeam?: string | null;
    // Optional — populated alongside teams so the update path knows whether
    // group_label needs writing. Callers that don't pass it get an
    // always-overwrite-on-other-changes behaviour (still safe).
    groupLabel?: string | null;
    // Optional — same idea for fd_stage; populated by the seed +
    // outcome-sync existing-row lookup.
    fdStage?: string | null;
  } | null;
};

export type UpsertEventResult =
  | { action: "inserted"; eventId: string }
  | { action: "updated"; eventId: string }
  | { action: "skipped_no_stage" }
  | { action: "skipped_finished"; eventId: string }
  | { action: "unchanged"; eventId: string };

/**
 * Upsert one `events` row from a football-data match payload.
 *
 * Decision table:
 *   existing  | fd.status | stageId | → action
 *   ----------|-----------|---------|-----------------
 *   null      | any       | null    | skipped_no_stage
 *   null      | any       | uuid    | inserted
 *   finished  | any       | any     | skipped_finished
 *   non-final | any       | any     | updated / unchanged (compares kickoff/matchday/status)
 *
 * The "unchanged" return is a small optimisation — we hit Postgres millions
 * of times less per year by skipping no-op UPDATEs when football-data
 * re-emits the same scheduled data.
 */
export async function upsertEventFromFootballData(
  input: UpsertEventInput,
): Promise<UpsertEventResult> {
  const { fdMatch, competitionId, stageId, existing } = input;
  const kickoff = new Date(fdMatch.utcDate);
  const lockAt = new Date(kickoff.getTime() - LOCK_LEAD_MS);
  const status = mapFootballDataStatus(fdMatch.status);
  const now = new Date();

  // INSERT path — first sight of this externalId.
  if (!existing) {
    if (!stageId) return { action: "skipped_no_stage" };
    const [row] = await db
      .insert(events)
      .values({
        competitionId,
        stageId,
        externalId: String(fdMatch.id),
        homeTeam: fdMatch.homeTeam?.name ?? null,
        awayTeam: fdMatch.awayTeam?.name ?? null,
        homeTeamShort: fdMatch.homeTeam?.tla ?? null,
        awayTeamShort: fdMatch.awayTeam?.tla ?? null,
        kickoffAt: kickoff,
        venue: fdMatch.venue ?? null,
        matchday: fdMatch.matchday,
        groupLabel: normaliseGroupLabel(fdMatch.group),
        fdStage: fdMatch.stage ?? null,
        status,
        predictionLockAt: lockAt,
        lastSyncedAt: now,
      })
      .returning({ id: events.id });
    return { action: "inserted", eventId: row.id };
  }

  // Already-finished events are terminal from this code path — outcome
  // corrections (rare; tracked as a separate pre-launch follow-up) go
  // through the dedicated outcome-write path in `outcome-sync.ts`. We
  // never revert a finished status from a fixture refresh.
  if (existing.status === "finished") {
    return { action: "skipped_finished", eventId: existing.id };
  }

  // Compare against the existing row — short-circuit if nothing relevant
  // changed. Avoids billions of pointless UPDATEs over the season.
  const kickoffUnchanged = existing.kickoffAt.getTime() === kickoff.getTime();
  const matchdayUnchanged = existing.matchday === fdMatch.matchday;
  const statusUnchanged = existing.status === status;
  // Step 3a.4: bracket fill-in path. Tournament knockout slots start with
  // null teams; football-data resolves them in subsequent fetches. The
  // update path must overwrite stored null team names when FD provides
  // real ones. League-style comps don't hit this because their teams
  // never start null. We compare against `null`/`undefined`-tolerant
  // equality to avoid spurious updates on identical real names.
  const fdHomeName = fdMatch.homeTeam?.name ?? null;
  const fdAwayName = fdMatch.awayTeam?.name ?? null;
  const teamsUnchanged =
    fdHomeName === (existing.homeTeam ?? null) &&
    fdAwayName === (existing.awayTeam ?? null);
  // Group label: only compare when caller passed it through. Otherwise we
  // can't tell whether it changed and force the update branch on the next
  // change to anything else (which writes the current value either way).
  const fdGroupLabel = normaliseGroupLabel(fdMatch.group);
  const groupUnchanged =
    existing.groupLabel === undefined
      ? true
      : (existing.groupLabel ?? null) === fdGroupLabel;
  // Same idea for fd_stage — tracked only when caller passes it.
  const fdStageValue = fdMatch.stage ?? null;
  const stageUnchanged =
    existing.fdStage === undefined
      ? true
      : (existing.fdStage ?? null) === fdStageValue;
  if (kickoffUnchanged && matchdayUnchanged && statusUnchanged && teamsUnchanged && groupUnchanged && stageUnchanged) {
    return { action: "unchanged", eventId: existing.id };
  }

  // Something material changed — refresh kickoff, lock, matchday, status.
  // Team names + shorts also update for the bracket fill-in case (step 3a.4).
  // Group label + fd_stage update too — football-data sometimes assigns
  // groups / stage strings after initial fixture release.
  // Venue still left alone: it gets set on insert and rarely changes; if it
  // ever did, that smells like a different event entirely — investigate.
  await db
    .update(events)
    .set({
      homeTeam: fdHomeName,
      awayTeam: fdAwayName,
      homeTeamShort: fdMatch.homeTeam?.tla ?? null,
      awayTeamShort: fdMatch.awayTeam?.tla ?? null,
      kickoffAt: kickoff,
      predictionLockAt: lockAt,
      matchday: fdMatch.matchday,
      groupLabel: fdGroupLabel,
      fdStage: fdStageValue,
      status,
      lastSyncedAt: now,
    })
    .where(eq(events.id, existing.id));
  return { action: "updated", eventId: existing.id };
}
