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

const KNOCKOUT_STAGE_ORDER: Record<string, number> = {
  LAST_32: 1,
  LAST_16: 2,
  QUARTER_FINALS: 3,
  SEMI_FINALS: 4,
  THIRD_PLACE_PLAYOFF: 5,
  FINAL: 6,
};
const KNOCKOUT_STAGE_DISPLAY: Record<string, string> = {
  LAST_32: "Round of 32",
  LAST_16: "Round of 16",
  QUARTER_FINALS: "Quarter-finals",
  SEMI_FINALS: "Semi-finals",
  THIRD_PLACE_PLAYOFF: "Third-place playoff",
  FINAL: "Final",
};

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

/**
 * Single read-only match row. Renders one of five states, depending on the
 * lock-gated payload from the server:
 *   - awaiting teams (null team) → "Awaiting teams"
 *   - finished → FT score + their pick + points pill
 *   - locked, predicted → their pick + lock chip
 *   - locked, no pick → "No pick"
 *   - not yet locked → "Hidden until kick-off" + predicted / not-yet tag
 */
function OpponentRow({ match }: { match: OpponentMatch }) {
  const awaitingTeams = match.homeTeam === null || match.awayTeam === null;
  const finished = match.outcome !== null;

  let right: React.ReactNode;
  if (awaitingTeams) {
    right = <span className="font-['Manrope'] text-[0.72rem] text-white/40">Awaiting teams</span>;
  } else if (finished && match.outcome) {
    const pick = match.prediction;
    right = (
      <div className="flex flex-col items-end gap-1">
        <span className="font-['Manrope'] text-[0.7rem] uppercase tracking-[0.14em] text-white/45">
          FT {match.outcome.homeScore}-{match.outcome.awayScore}
        </span>
        <div className="flex items-center gap-2">
          {pick ? (
            <>
              <span className="font-['Manrope'] text-[0.74rem] text-white/70">
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
  } else if (match.predictionVisible) {
    // Locked but not yet finished — reveal the pick (or "no pick").
    right = match.prediction ? (
      <div className="flex items-center gap-1.5">
        <Lock className="h-3 w-3 text-white/35" aria-hidden />
        <ScoreBox tone="solid">{match.prediction.homeScore}</ScoreBox>
        <span className="text-white/40">-</span>
        <ScoreBox tone="solid">{match.prediction.awayScore}</ScoreBox>
      </div>
    ) : (
      <span className="font-['Manrope'] text-[0.74rem] text-white/45">No pick</span>
    );
  } else {
    // Not yet locked — scores withheld by the server. Show only whether a pick
    // exists, never the values.
    right = (
      <div className="flex flex-col items-end gap-1">
        <span className="font-['Manrope'] text-[0.72rem] text-white/45">Hidden until kick-off</span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 font-['Manrope'] text-[0.64rem] font-semibold",
            match.hasPrediction
              ? "border-emerald-300/25 bg-emerald-400/[0.07] text-emerald-200/80"
              : "border-white/12 bg-white/[0.03] text-white/45",
          )}
        >
          {match.hasPrediction ? "Predicted" : "Not yet predicted"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate font-['Manrope'] text-[0.84rem] text-white/90">
          {displayTeamName(match.homeTeam)} <span className="text-white/40">v</span>{" "}
          {displayTeamName(match.awayTeam)}
        </div>
        <div className="mt-0.5 truncate font-['Manrope'] text-[0.68rem] text-white/40">
          {match.groupLabel ? `Group ${match.groupLabel} · ` : ""}
          {formatKickoff(match.kickoffAt)}
        </div>
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}

type Group = { label: string; matches: OpponentMatch[] };

function buildGroups(payload: EntryPredictionsPayload): Group[] {
  const { matches, pool } = payload;
  const numbered = new Map<number, OpponentMatch[]>();
  const nullBucket: OpponentMatch[] = [];

  for (const m of matches) {
    if (m.matchday == null) nullBucket.push(m);
    else {
      const list = numbered.get(m.matchday) ?? [];
      list.push(m);
      numbered.set(m.matchday, list);
    }
  }

  const groups: Group[] = Array.from(numbered.entries())
    .sort(([a], [b]) => a - b)
    .map(([md, ms]) => ({ label: `${pool.matchdayLabel} ${md}`, matches: ms }));

  if (nullBucket.length > 0) {
    if (pool.isTournamentStyle) {
      // Sub-group the knockout bucket by football-data stage so the rows sit
      // under "Round of 32" / "Round of 16" / … like the prediction screen.
      const byStage = new Map<string, OpponentMatch[]>();
      for (const m of nullBucket) {
        const key = m.fdStage ?? "OTHER";
        if (!byStage.has(key)) byStage.set(key, []);
        byStage.get(key)!.push(m);
      }
      const stageGroups = Array.from(byStage.entries())
        .sort((a, b) => (KNOCKOUT_STAGE_ORDER[a[0]] ?? 99) - (KNOCKOUT_STAGE_ORDER[b[0]] ?? 99))
        .map(([key, ms]) => ({ label: KNOCKOUT_STAGE_DISPLAY[key] ?? "Other", matches: ms }));
      groups.push(...stageGroups);
    } else {
      groups.push({ label: pool.nullBucketLabel, matches: nullBucket });
    }
  }

  return groups;
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
  const groups = buildGroups(payload);

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

      <p className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 font-['Manrope'] text-[0.72rem] leading-5 text-white/50">
        Each match's picks become visible to everyone once it locks, 1 hour before kick-off. Until then, scores stay hidden.
      </p>

      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.label} className="space-y-2">
            <h2 className="px-1 font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-white/45">
              {group.label}
            </h2>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
              {group.matches.map((m) => (
                <OpponentRow key={m.eventId} match={m} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
