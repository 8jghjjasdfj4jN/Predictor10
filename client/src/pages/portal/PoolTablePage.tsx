/*
League table (arch §8.6) — standalone full-list view.

Per-pool leaderboard at /pools/:competitionSlug/:poolId/table. Live ranks
during the Round; final ranks once the pool settles. Endpoint
/api/pools/:id/entries gates access — public when settled, auth + entrant
required for live pools — and the page surfaces 401 / 403 / 404 errors with
helpful copy rather than crashing.

Step 2m: the row/table/footer/empty-state styling lives in the shared
`PoolStandingsTable` component now so the Tables tab can reuse it. This page
calls it without `maxRows` to get the full unbounded list. Account History's
[Table] button still links here, so the URL stays the same.

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
} from "@/lib/portal-api";
import {
  PoolStandingsTable,
  TieBreakFooter,
  EmptyStandings,
} from "@/components/predictor10/PoolStandingsTable";

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
  // Tournament-style comps supply a server-computed liveStatusLabel that
  // handles knockouts correctly (the matchday-based fallback breaks down
  // there because knockouts have no matchday). League comps stay on the
  // matchday-driven path.
  const liveLabel = pool.liveStatusLabel
    ? pool.liveStatusLabel === "Awaiting settlement"
      ? "Round complete · awaiting settlement"
      : `Round in progress · ${pool.liveStatusLabel}`
    : pool.currentMatchdayOrdinal !== null
      ? `Round in progress · ${pool.matchdayLabel}${pool.currentMatchdayOrdinal} of ${pool.totalMatchdays}`
      : "Round complete · awaiting settlement";
  const label = isSettled
    ? pool.settledAt
      ? `Final · Settled ${formatSettledDate(pool.settledAt)}`
      : "Final"
    : liveLabel;

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

// ─── Page ────────────────────────────────────────────────────────────────

export default function PoolTablePage() {
  const [, params] = useRoute<{ competitionSlug: string; poolId: string }>(
    "/pools/:competitionSlug/:poolId/table",
  );
  const poolId = params?.poolId ?? "";
  // Back-arrow target: legacy URL falls through LegacyPoolRedirect (step 2m)
  // which resolves to /predict/:entryId if the viewer's entered, or /tables
  // if not. Keeps a consistent back action whether the viewer's an entrant
  // or just landed here from a deep link.
  const backHref = `/pools/${params?.competitionSlug ?? ""}/${poolId}`;

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
        <EmptyStandings settled={isSettled} />
      ) : (
        <>
          <PoolStandingsTable entries={entries} />
          <TieBreakFooter />
        </>
      )}

      {isSettled && entries.length > 0 && <SettledViewResultsLink to={backHref} />}
    </div>
  );
}
