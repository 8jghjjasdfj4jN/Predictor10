/*
League table (arch §8.6).

Per-pool leaderboard. Live ranks during the Round; final ranks once the pool
settles. The `/api/pools/:id/entries` endpoint gates access — public when the
pool is settled, auth + entrant required for live pools — and the page
surfaces 401 / 403 / 404 errors with helpful copy rather than crashing.

Top 3 get gold rank numbers; the current user's row is emerald-highlighted
wherever it sits. Tie-breaker footer mirrors Decided Rule #10 verbatim:
`pts → exact-score count → correct-result count → split`.

During-round refresh: page-load + window-focus only. No polling / SSE — cheap
to re-fetch when the tab comes back to the foreground.
*/

import { useCallback, useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, ArrowRight, Loader2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchPoolEntries,
  FetchPoolEntriesError,
  type PoolEntriesPayload,
  type PoolEntriesPool,
  type PoolEntry,
} from "@/lib/portal-api";

// ─── Formatters ──────────────────────────────────────────────────────────

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function formatSettledDate(iso: string): string {
  return DATE_FMT.format(new Date(iso));
}

function formatEntryCount(n: number): string {
  if (n === 0) return "No entries yet";
  if (n === 1) return "1 entry";
  return `${n.toLocaleString("en-GB")} entries`;
}

// ─── Sub-components ──────────────────────────────────────────────────────

function BackLink({ to }: { to: string }) {
  return (
    <Link
      href={to}
      className={cn(
        "inline-flex items-center gap-1.5 font-['Manrope'] text-[0.78rem] font-semibold",
        "text-emerald-300 transition hover:text-emerald-200",
        "outline-none focus-visible:underline",
      )}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Pool
    </Link>
  );
}

function StatusPill({ pool }: { pool: PoolEntriesPool }) {
  const isSettled = pool.status === "settled";
  const label = isSettled
    ? pool.settledAt
      ? `Final · Settled ${formatSettledDate(pool.settledAt)}`
      : "Final"
    : pool.currentMatchdayOrdinal !== null
      ? `Round in progress · ${pool.matchdayLabel}${pool.currentMatchdayOrdinal} of ${pool.totalMatchdays}`
      : "Round complete · awaiting settlement";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
        "font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.18em]",
        isSettled
          ? "border border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
          : "border border-white/15 bg-white/[0.04] text-white/65",
      )}
    >
      {isSettled && <Trophy className="h-3 w-3" aria-hidden />}
      <span>{label}</span>
    </div>
  );
}

function LeaderboardRow({ entry }: { entry: PoolEntry }) {
  const isPodium = entry.rank >= 1 && entry.rank <= 3;
  return (
    <div
      className={cn(
        "grid grid-cols-[28px_1fr_36px_36px_44px] items-center gap-2 px-3 py-3",
        entry.isYou && "bg-emerald-400/[0.08]",
      )}
    >
      <span
        className={cn(
          "text-center font-['Barlow_Condensed'] text-[1rem] font-extrabold tabular-nums",
          isPodium ? "text-amber-300" : "text-white/55",
        )}
      >
        {entry.rank}
      </span>
      <span
        className={cn(
          "min-w-0 truncate font-['Manrope'] text-[0.82rem]",
          entry.isYou ? "font-semibold text-emerald-100" : "text-white/85",
        )}
      >
        {entry.isYou ? "You" : entry.displayName}
      </span>
      <span className="text-right font-['Manrope'] text-[0.78rem] tabular-nums text-white/65">
        {entry.exacts}
      </span>
      <span className="text-right font-['Manrope'] text-[0.78rem] tabular-nums text-white/65">
        {entry.results}
      </span>
      <span
        className={cn(
          "text-right font-['Barlow_Condensed'] text-[1rem] font-bold tabular-nums",
          entry.isYou ? "text-emerald-200" : "text-white",
        )}
      >
        {entry.points}
      </span>
    </div>
  );
}

function LeaderboardTable({ entries }: { entries: PoolEntry[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <div
        className={cn(
          "grid grid-cols-[28px_1fr_36px_36px_44px] gap-2 px-3 py-2.5",
          "border-b border-white/10 bg-white/[0.02]",
          "font-['Manrope'] text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-white/45",
        )}
      >
        <span className="text-center">#</span>
        <span>Player</span>
        <span className="text-right">Exact</span>
        <span className="text-right">Res</span>
        <span className="text-right">Pts</span>
      </div>
      <div className="divide-y divide-white/5">
        {entries.map((e) => (
          <LeaderboardRow key={e.entryId} entry={e} />
        ))}
      </div>
    </div>
  );
}

/**
 * Mirrors Decided Rule #10 verbatim — must include "split" as the final step.
 * The arch §8.6 wireframe truncates ("pts → exact → result") but the canonical
 * rule has four steps and the app should communicate the full tie-breaker so
 * users understand how prizes resolve in a true tie.
 */
function TieBreakFooter() {
  return (
    <p className="px-1 font-['Manrope'] text-[0.7rem] leading-relaxed text-white/45">
      Tie-break: pts → exact-score count → correct-result count → split.
    </p>
  );
}

function SettledViewResultsLink({ to }: { to: string }) {
  return (
    <Link
      href={to}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-xl px-4 py-3",
        "border border-emerald-400/25 bg-emerald-400/[0.04]",
        "font-['Manrope'] text-[0.78rem] font-semibold text-emerald-200",
        "transition hover:border-emerald-300/40 hover:bg-emerald-400/[0.07]",
        "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
        "min-h-[44px]",
      )}
    >
      <span>View results</span>
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

/**
 * Covers two zero-entry cases not in arch §8.6:
 *   - a brand-new pool no one's entered yet (status='open'), and
 *   - a settled zero-entry pool per Decided Rule #15 (rare but real).
 */
function EmptyTable({ settled }: { settled: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
      <Trophy className="mx-auto mb-3 h-6 w-6 text-white/30" aria-hidden />
      <p className="font-['Manrope'] text-[0.82rem] leading-relaxed text-white/55">
        {settled
          ? "No entries this Round — no standings to show."
          : "No entries yet. Be the first to join this pool."}
      </p>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function PoolTablePage() {
  const [, params] = useRoute<{ competitionSlug: string; poolId: string }>(
    "/pools/:competitionSlug/:poolId/table",
  );
  const competitionSlug = params?.competitionSlug ?? "";
  const poolId = params?.poolId ?? "";
  const backHref = `/pools/${competitionSlug}/${poolId}`;

  const [payload, setPayload] = useState<PoolEntriesPayload | null>(null);
  const [error, setError] = useState<{ message: string; status: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await fetchPoolEntries(poolId);
      setPayload(p);
      setError(null);
    } catch (err) {
      if (err instanceof FetchPoolEntriesError) {
        setError({ message: err.message, status: err.status });
      } else {
        setError({
          message: err instanceof Error ? err.message : "Couldn't load standings.",
          status: 0,
        });
      }
    }
  }, [poolId]);

  useEffect(() => {
    if (!poolId) return;
    setPayload(null);
    setError(null);
    load();
  }, [poolId, load]);

  // Cheap re-fetch on window focus so users coming back to the tab see an
  // updated table while a Round is in progress. Skip when already settled —
  // the data won't change.
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
        <BackLink to={backHref} />
        <p className="font-['Manrope'] text-sm text-rose-200">{error.message}</p>
        {error.status === 401 && (
          <p className="font-['Manrope'] text-xs text-white/45">
            Live league tables are visible to entrants only. Final standings open up after the Round settles.
          </p>
        )}
        {error.status === 403 && (
          <p className="font-['Manrope'] text-xs text-white/45">
            You need to be entered in this pool to see live standings.
          </p>
        )}
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-white/50">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <p className="font-['Manrope'] text-xs">Loading league table…</p>
      </div>
    );
  }

  const { pool, entries } = payload;
  const isSettled = pool.status === "settled";

  return (
    <div className="space-y-5 px-4 py-7 pb-10">
      <BackLink to={backHref} />

      <header className="space-y-1.5">
        <p className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.32em] text-emerald-300/70">
          {pool.competitionShortName}
        </p>
        <h1 className="font-['Barlow_Condensed'] text-[1.85rem] font-bold uppercase leading-[1.05] tracking-[0.04em] text-white">
          {pool.roundName} · {pool.tierName}
        </h1>
        <p className="font-['Manrope'] text-[0.78rem] text-white/55">
          {formatEntryCount(entries.length)}
        </p>
      </header>

      <StatusPill pool={pool} />

      {entries.length === 0 ? (
        <EmptyTable settled={isSettled} />
      ) : (
        <>
          <LeaderboardTable entries={entries} />
          <TieBreakFooter />
        </>
      )}

      {isSettled && entries.length > 0 && <SettledViewResultsLink to={backHref} />}
    </div>
  );
}
