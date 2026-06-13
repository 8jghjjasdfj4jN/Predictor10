/*
Opponent predictions (lock-gated) — /pools/:competitionSlug/:poolId/table/:entryId

Tap a player on the league table → a read-only view of their picks for that
pool. The anti-cheat rule (arch §13 Rule #7 reused as a visibility rule):

  - A pick's scores are only shown once that match has locked (1 hour before
    kick-off). The server omits unlocked scores from the payload entirely —
    they are never sent, so they can't be read off the wire.
  - By the time a match has locked, the viewer's own pick for the same match is
    locked too, so seeing it carries no advantage. The lock does all the work.
  - Before lock we still show whether the player has predicted (Wez's call:
    "hide the score only") — knowing a pick exists carries no copying edge.

Access mirrors the table: entrants only while the pool is live, public once
settled. 401 / 403 / 404 surface with helpful copy.

Read-only throughout — no inputs, no auto-save. Matches are grouped by matchday
(GW / MD / Group MD), with the knockout bucket sub-grouped by stage to match the
prediction screen.
*/

import { useCallback, useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchEntryPredictions,
  FetchEntryPredictionsError,
  type EntryPredictionsPayload,
  type OpponentMatch,
} from "@/lib/portal-api";

// ─── Formatters ──────────────────────────────────────────────────────────

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatKickoff(iso: string): string {
  return TIME_FMT.format(new Date(iso));
}

function displayTeamName(name: string | null): string {
  if (!name) return "TBD";
  return name.replace(/\s+FC$/, "").replace(/\s+AFC$/, "");
}

const KNOCKOUT_STAGE_DISPLAY: Record<string, string> = {
  LAST_32: "Round of 32",
  LAST_16: "Round of 16",
  QUARTER_FINALS: "Quarter-finals",
  SEMI_FINALS: "Semi-finals",
  THIRD_PLACE_PLAYOFF: "Third-place playoff",
  FINAL: "Final",
};

function stageLabelFor(match: OpponentMatch): string | null {
  if (!match.fdStage) return null;
  if (match.fdStage === "GROUP_STAGE" || match.fdStage === "REGULAR_SEASON") return null;
  return KNOCKOUT_STAGE_DISPLAY[match.fdStage] ?? null;
}

/**
 * Ordering tier for a shown match. 0 = live, 1 = locked-but-not-kicked-off,
 * 2 = finished / terminal. Drives the live → about-to-start → played layout.
 */
function matchTier(m: OpponentMatch): number {
  const finished = m.outcome !== null;
  const kicked = new Date(m.kickoffAt).getTime() <= Date.now();
  const terminalUnplayed =
    m.status === "postponed" || m.status === "cancelled" || m.status === "void";
  if (!finished && !terminalUnplayed && kicked) return 0; // live / in play
  if (!finished && !terminalUnplayed && !kicked) return 1; // locked, awaiting kick-off
  return 2; // finished or terminal-unplayed
}

/**
 * Live matches first (newest kick-off on top), then the locked matches about
 * to start (soonest first), then the played matches (most recent first). Reads
 * top-to-bottom as now → soon → history. Several simultaneous live matches sit
 * together at the top.
 */
function sortByState(a: OpponentMatch, b: OpponentMatch): number {
  const ta = matchTier(a);
  const tb = matchTier(b);
  if (ta !== tb) return ta - tb;
  const ak = new Date(a.kickoffAt).getTime();
  const bk = new Date(b.kickoffAt).getTime();
  return ta === 1 ? ak - bk : bk - ak; // awaiting: soonest first; else newest first
}

// ─── Sub-components ──────────────────────────────────────────────────────

function PointsPill({ points }: { points: number }) {
  const tone =
    points >= 5
      ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
      : points >= 2
        ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
        : "border-rose-300/25 bg-rose-500/10 text-rose-200";
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 font-['Manrope'] text-[0.66rem] font-semibold tabular-nums",
        tone,
      )}
    >
      {points > 0 ? `+${points}` : "0"} pts
    </span>
  );
}

function ScoreBox({ children, tone }: { children: React.ReactNode; tone: "solid" | "muted" }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-[26px] items-center justify-center rounded-md px-1.5",
        "font-['Barlow_Condensed'] text-[1rem] font-bold tabular-nums",
        tone === "solid"
          ? "bg-white/10 text-white"
          : "border border-dashed border-white/15 text-white/40",
      )}
    >
      {children}
    </span>
  );
}

/** Pulsing red "LIVE" badge — the radar-ping dot gives an in-play match juice. */
function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/15 px-2 py-0.5">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
      </span>
      <span className="font-['Manrope'] text-[0.64rem] font-bold uppercase tracking-[0.18em] text-rose-200">
        Live
      </span>
    </span>
  );
}

/** Calm amber status for a locked match that hasn't kicked off yet. */
function AwaitingKickoffBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5">
      <Lock className="h-2.5 w-2.5 text-amber-200/80" aria-hidden />
      <span className="font-['Manrope'] text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-amber-200/90">
        Locked · awaiting kick-off
      </span>
    </span>
  );
}

/**
 * Single read-only match row. Only locked-or-later matches reach here (the
 * page filters out anything still open). Three live states:
 *   - awaiting kick-off → locked, not started yet ("Locked · awaiting kick-off")
 *   - live → kicked off, not finished ("LIVE", pulsing)
 *   - finished → FT score + their pick + points pill
 */
function OpponentRow({ match }: { match: OpponentMatch }) {
  const awaitingTeams = match.homeTeam === null || match.awayTeam === null;
  const finished = match.outcome !== null;
  const kicked = new Date(match.kickoffAt).getTime() <= Date.now();
  const terminalUnplayed =
    match.status === "postponed" || match.status === "cancelled" || match.status === "void";
  const isLive = !finished && !awaitingTeams && !terminalUnplayed && kicked;
  const isAwaitingKickoff = !finished && !awaitingTeams && !terminalUnplayed && !kicked;

  const meta = [
    stageLabelFor(match),
    match.groupLabel ? `Group ${match.groupLabel}` : null,
    formatKickoff(match.kickoffAt),
  ]
    .filter(Boolean)
    .join(" · ");

  // Their pick, rendered read-only and clearly labelled "Pick" so it can't be
  // mistaken for the actual score. Shared by the live + awaiting states.
  const pickBlock = match.prediction ? (
    <div className="flex items-center gap-1.5">
      <span className="font-['Manrope'] text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-white/45">
        Pick
      </span>
      <ScoreBox tone="solid">{match.prediction.homeScore}</ScoreBox>
      <span className="text-white/40">-</span>
      <ScoreBox tone="solid">{match.prediction.awayScore}</ScoreBox>
    </div>
  ) : (
    <span className="font-['Manrope'] text-[0.74rem] text-white/45">No pick</span>
  );

  let right: React.ReactNode;
  if (awaitingTeams) {
    right = <span className="font-['Manrope'] text-[0.72rem] text-white/40">Awaiting teams</span>;
  } else if (finished && match.outcome) {
    const pick = match.prediction;
    right = (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          <span className="font-['Manrope'] text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-emerald-300/70">
            FT
          </span>
          <span className="font-['Barlow_Condensed'] text-[1.05rem] font-bold tabular-nums text-white">
            {match.outcome.homeScore}-{match.outcome.awayScore}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {pick ? (
            <>
              <span className="font-['Manrope'] text-[0.74rem] text-white/65">
                Pick {pick.homeScore}-{pick.awayScore}
              </span>
              {pick.points != null && <PointsPill points={pick.points} />}
            </>
          ) : (
            <span className="font-['Manrope'] text-[0.74rem] text-white/45">No pick · 0 pts</span>
          )}
        </div>
      </div>
    );
  } else if (isLive) {
    right = (
      <div className="flex flex-col items-end gap-1.5">
        <LiveBadge />
        {pickBlock}
      </div>
    );
  } else if (isAwaitingKickoff) {
    right = (
      <div className="flex flex-col items-end gap-1.5">
        <AwaitingKickoffBadge />
        {pickBlock}
      </div>
    );
  } else {
    // Terminal-but-unplayed (postponed / cancelled / void) — show their pick
    // with a muted note. Rare; forfeit-policy matches score 0.
    right = (
      <div className="flex flex-col items-end gap-1">
        <span className="font-['Manrope'] text-[0.7rem] uppercase tracking-[0.14em] text-white/45">
          {match.status === "postponed" ? "Postponed" : match.status === "cancelled" ? "Cancelled" : "Void"}
        </span>
        {pickBlock}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-3",
        isLive && "bg-rose-500/[0.06]",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-['Manrope'] text-[0.84rem] text-white/90">
          {displayTeamName(match.homeTeam)} <span className="text-white/40">v</span>{" "}
          {displayTeamName(match.awayTeam)}
        </div>
        <div className="mt-0.5 truncate font-['Manrope'] text-[0.68rem] text-white/40">
          {meta}
        </div>
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function OpponentPredictionsPage() {
  const [, params] = useRoute<{ competitionSlug: string; poolId: string; entryId: string }>(
    "/pools/:competitionSlug/:poolId/table/:entryId",
  );
  const poolId = params?.poolId ?? "";
  const entryId = params?.entryId ?? "";
  const tableHref = `/pools/${params?.competitionSlug ?? ""}/${poolId}/table`;

  const [payload, setPayload] = useState<EntryPredictionsPayload | null>(null);
  const [error, setError] = useState<{ message: string; status: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await fetchEntryPredictions(poolId, entryId);
      setPayload(p);
      setError(null);
    } catch (err) {
      if (err instanceof FetchEntryPredictionsError) {
        setError({ message: err.message, status: err.status });
      } else {
        setError({
          message: err instanceof Error ? err.message : "Couldn't load predictions.",
          status: 0,
        });
      }
    }
  }, [poolId, entryId]);

  useEffect(() => {
    if (!poolId || !entryId) return;
    setPayload(null);
    setError(null);
    load();
  }, [poolId, entryId, load]);

  // Re-fetch on window focus while the pool is live — a match may have locked
  // since the page opened, revealing more picks.
  useEffect(() => {
    function onFocus() {
      if (payload?.pool.status !== "settled") load();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load, payload?.pool.status]);

  if (error) {
    return (
      <div className="space-y-5 px-4 py-7">
        <Link
          href={tableHref}
          className="inline-flex items-center gap-1.5 font-['Manrope'] text-[0.78rem] font-semibold text-emerald-300 transition hover:text-emerald-200"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Table
        </Link>
        <p className="font-['Manrope'] text-sm text-rose-200">{error.message}</p>
        {error.status === 401 && (
          <p className="font-['Manrope'] text-xs text-white/45">
            Players' predictions are visible to entrants while the pool is live, and to everyone once it settles.
          </p>
        )}
        {error.status === 403 && (
          <p className="font-['Manrope'] text-xs text-white/45">
            You need to be entered in this pool to see other players' predictions.
          </p>
        )}
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-white/50">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <p className="font-['Manrope'] text-xs">Loading predictions…</p>
      </div>
    );
  }

  const { pool, player } = payload;
  // Show matches that have locked (1hr before kick-off) onwards — locked,
  // live, and finished. Anything still open is omitted (its picks are hidden
  // by the server anyway). Order: live → about to start → played.
  const shown = payload.matches.filter((m) => m.isLocked).sort(sortByState);

  return (
    <div className="space-y-5 px-4 py-7 pb-10">
      <Link
        href={tableHref}
        className="inline-flex items-center gap-1.5 font-['Manrope'] text-[0.78rem] font-semibold text-emerald-300 transition hover:text-emerald-200"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Table
      </Link>

      <header className="space-y-1.5">
        <p className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.32em] text-emerald-300/70">
          {pool.competitionShortName} · {pool.roundName} · {pool.tierName}
        </p>
        <h1 className="font-['Barlow_Condensed'] text-[1.85rem] font-bold uppercase leading-[1.05] tracking-[0.04em] text-white">
          {player.isYou ? "Your picks" : `${player.displayName}'s picks`}
        </h1>
        <p className="font-['Manrope'] text-[0.78rem] text-white/55">
          {payload.pointsVisibleTotal} pts so far
        </p>
      </header>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
          <p className="font-['Manrope'] text-[0.82rem] leading-relaxed text-white/55">
            No matches have locked yet. Picks appear here once a match locks, 1 hour before kick-off.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
          {shown.map((m) => (
            <OpponentRow key={m.eventId} match={m} />
          ))}
        </div>
      )}
    </div>
  );
}
