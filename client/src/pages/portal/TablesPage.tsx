/*
TablesPage — arch §8.6, redesigned for step 2m.

The third bottom-nav slot. Surfaces the current Round's league tables across
all active competitions / tiers, with an inline entry flow for tiers the
viewer hasn't joined yet.

Layout (mobile-first, 480px column):
  1. Competition pills — one per comp that has an open Round (selected = solid
     emerald). PL only right now; PL + Championship once 2026/27 fixtures land.
  2. Tier sub-tabs — one per active tier (Fiver, Tenner, Pony, Big One). A
     small emerald dot prefixes the label when the viewer is entered in that
     tier for the selected comp's current Round.
  3. Header card — Round name + tier name + meta line (£NN · N players · £NN
     pot). Right-side widget switches on entry status:
       - Entered: "You — Nth · X pts" (small two-line block, emerald).
       - Not entered: solid "Enter · £NN →" button.
  4. Standings table — `PoolStandingsTable` with maxRows={10}. "Your position"
     row pinned below the visible window when the viewer's rank is outside the
     top 10. Tie-break footer underneath.

Entry flow from the Enter button: fetch /api/pools/:id full detail, check
entryWindow. If "open", POST /enter directly and navigate to /predict/:entryId.
If "late", show LateEntryWarningModal first and proceed on confirm. If
"closed", surface a toast — shouldn't normally happen because the button is
hidden when the pool isn't enterable.

Default landing — locked with Wez at the planning stage:
  - Default comp: leftmost comp with an open Round.
  - Default tier: leftmost tier the viewer is entered in for that comp.
    Falls back to The Fiver if entered in none.

Caching — `fetchPoolEntries` is hit once per (comp, tier) per page session;
results live in a Map keyed by poolId. Re-fetched on window focus while the
pool is unsettled, matching the standalone PoolTablePage's behaviour.
*/

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  fetchCompetitions,
  fetchMyEntries,
  fetchPoolDetail,
  fetchPoolEntries,
  enterPool,
  FetchPoolEntriesError,
  type Competition,
  type Pool,
  type PoolDetail,
  type PoolEntriesPayload,
  type PrizeBreakdownEntry,
  type UserEntry,
} from "@/lib/portal-api";
import {
  PoolStandingsTable,
  TieBreakFooter,
  EmptyStandings,
} from "@/components/predictor10/PoolStandingsTable";
import { LateEntryWarningModal } from "@/components/predictor10/LateEntryWarningModal";

const STANDINGS_MAX_ROWS = 10;

// ─── Formatters ──────────────────────────────────────────────────────────

function formatFee(fee: string): string {
  const n = Number(fee);
  if (!Number.isFinite(n)) return `£${fee}`;
  return Number.isInteger(n) ? `£${n}` : `£${n.toFixed(2)}`;
}

function formatPlayerCount(n: number): string {
  if (n === 0) return "No players yet";
  if (n === 1) return "1 player";
  return `${n.toLocaleString("en-GB")} players`;
}

/**
 * Render the per-place prize breakdown as a single line:
 *   "1st £22.49 · 2nd £9.38 · 3rd £5.63"
 *
 * Returns "" when the breakdown is empty (zero-entry pool) so the calling
 * component can hide the line entirely rather than show £0s. Ordinal labels
 * are hard-coded to the first 5 — splits don't go deeper than that today.
 */
const ORDINAL_LABELS = ["1st", "2nd", "3rd", "4th", "5th"];

function formatPrizeBreakdown(breakdown: PrizeBreakdownEntry[]): string {
  if (breakdown.length === 0) return "";
  return breakdown
    .map((b) => {
      const label = ORDINAL_LABELS[b.rank - 1] ?? `${b.rank}th`;
      return `${label} £${b.amount}`;
    })
    .join(" · ");
}

function ordinalSuffix(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  const last = n % 10;
  if (last === 1) return `${n}st`;
  if (last === 2) return `${n}nd`;
  if (last === 3) return `${n}rd`;
  return `${n}th`;
}

function daysSince(isoOrNull: string | null): number {
  if (!isoOrNull) return 0;
  const t = new Date(isoOrNull).getTime();
  if (!Number.isFinite(t)) return 0;
  const diff = Date.now() - t;
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

// ─── Sub-components ──────────────────────────────────────────────────────

function CompetitionPills({
  competitions,
  selectedId,
  onSelect,
}: {
  competitions: Competition[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (competitions.length === 0) return null;
  // Single comp → no pills needed, just a label.
  if (competitions.length === 1) {
    return (
      <p className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.32em] text-emerald-300/70">
        {competitions[0].name}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Competition">
      {competitions.map((c) => {
        const active = c.id === selectedId;
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(c.id)}
            className={cn(
              "rounded-full px-4 py-2 font-['Manrope'] text-[0.78rem] font-semibold transition",
              "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
              "min-h-[44px]",
              active
                ? "bg-emerald-400 text-emerald-950 shadow-[0_8px_24px_-12px_rgba(52,211,153,0.6)]"
                : "border border-white/10 bg-white/[0.03] text-white/65 hover:border-white/20 hover:bg-white/[0.06]",
            )}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

function TierSubTabs({
  pools,
  selectedPoolId,
  enteredPoolIds,
  onSelect,
}: {
  pools: Pool[];
  selectedPoolId: string;
  enteredPoolIds: Set<string>;
  onSelect: (poolId: string) => void;
}) {
  if (pools.length === 0) return null;
  return (
    <div
      className="flex gap-1 overflow-x-auto border-b border-white/10 -mx-4 px-4"
      role="tablist"
      aria-label="Tier"
    >
      {pools.map((p) => {
        const active = p.id === selectedPoolId;
        const entered = enteredPoolIds.has(p.id);
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(p.id)}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 transition",
              "font-['Manrope'] text-[0.78rem] font-semibold",
              "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
              "min-h-[44px] border-b-2",
              active
                ? "border-emerald-400 text-white"
                : "border-transparent text-white/55 hover:text-white/80",
            )}
          >
            {entered && (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"
                aria-label="entered"
              />
            )}
            <span>{p.tier.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function TierHeader({
  pool,
  roundName,
  myEntry,
  submitting,
  onEnterClick,
}: {
  pool: Pool;
  roundName: string;
  myEntry: { rank: number; points: number } | null;
  submitting: boolean;
  onEnterClick: () => void;
}) {
  const feeLabel = formatFee(pool.tier.entryFee);
  const playerCount = pool.entryCount;
  // Gross pot = entryFee × entryCount. Matches what settlement reads off
  // tier.entryFee, so the displayed pot and the actual paid-out pot agree.
  // The 75/25 split disclosure on Home explains how this is allocated.
  const potLabel = (() => {
    const fee = Number(pool.tier.entryFee);
    if (!Number.isFinite(fee) || playerCount <= 0) return "";
    const pot = fee * playerCount;
    return Number.isInteger(pot) ? `Pot £${pot}` : `Pot £${pot.toFixed(2)}`;
  })();

  // Build the "1st £X · 2nd £Y · 3rd £Z" string. Server sends pence-rounded
  // amounts that match what settlement will actually pay (step 2n). When
  // entryCount=0 the server returns [] — show a placeholder rather than
  // "1st £0.00 · 2nd £0.00 · 3rd £0.00".
  const breakdownLabel = formatPrizeBreakdown(pool.prizeBreakdown);

  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-['Manrope'] text-[0.6rem] font-semibold uppercase tracking-[0.26em] text-white/45">
          {roundName}
        </p>
        <h2 className="font-['Barlow_Condensed'] text-[1.5rem] font-bold uppercase tracking-[0.02em] text-white">
          {pool.tier.name}
        </h2>
        <p className="font-['Manrope'] text-[0.75rem] text-white/55">
          {feeLabel} · {formatPlayerCount(playerCount)}
          {potLabel && (
            <>
              <span aria-hidden className="mx-1 text-white/30">·</span>
              <span className="tabular-nums">{potLabel}</span>
            </>
          )}
        </p>
        {breakdownLabel && (
          <p className="font-['Manrope'] text-[0.72rem] tabular-nums text-emerald-200/80">
            {breakdownLabel}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center">
        {myEntry ? (
          <div
            className={cn(
              "flex flex-col items-end gap-0.5 rounded-xl border border-emerald-300/30 bg-emerald-400/[0.08] px-3 py-2",
              "min-w-[88px]",
            )}
          >
            <span className="font-['Manrope'] text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
              You
            </span>
            <span className="font-['Barlow_Condensed'] text-[1.1rem] font-bold leading-none text-emerald-100">
              {ordinalSuffix(myEntry.rank)}
            </span>
            <span className="font-['Manrope'] text-[0.7rem] tabular-nums text-emerald-200/80">
              {myEntry.points} pts
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onEnterClick}
            disabled={submitting}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-2.5",
              "bg-emerald-400 font-['Manrope'] text-[0.82rem] font-semibold text-emerald-950",
              "shadow-[0_10px_28px_-14px_rgba(52,211,153,0.7)] transition",
              "hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60",
              "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070f09]",
              "min-h-[44px]",
            )}
          >
            <span>Enter · {feeLabel}</span>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ArrowRight className="h-4 w-4" aria-hidden />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function PageSplash() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-white/50">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <p className="font-['Manrope'] text-xs">Loading tables…</p>
    </div>
  );
}

function NoActiveRounds() {
  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
      <h2 className="font-['Barlow_Condensed'] text-[1.2rem] font-bold uppercase tracking-[0.02em] text-white">
        No active Rounds right now
      </h2>
      <p className="font-['Manrope'] text-[0.82rem] leading-relaxed text-white/55">
        Tables open up when the next Round goes live. Check the Home tab for what's coming.
      </p>
    </div>
  );
}

function PreEntryStandingsTeaser() {
  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
        <p className="font-['Manrope'] text-[0.82rem] leading-relaxed text-white/55">
          Enter this tier to see live standings and start scoring.
        </p>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────

type StandingsCacheEntry =
  | { state: "loading" }
  | { state: "ready"; payload: PoolEntriesPayload }
  | { state: "error"; status: number; message: string };

export default function TablesPage() {
  const [, setLocation] = useLocation();

  // Top-level data: comps with open pools + the user's open entries.
  const [competitions, setCompetitions] = useState<Competition[] | null>(null);
  const [myEntries, setMyEntries] = useState<UserEntry[] | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  // Selection state.
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string | null>(null);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);

  // Standings cache keyed by poolId.
  const [standingsCache, setStandingsCache] = useState<Map<string, StandingsCacheEntry>>(
    () => new Map(),
  );

  // Entry-flow state (per tier — only one entry call in flight at a time).
  const [submitting, setSubmitting] = useState(false);
  const [lateModalDetail, setLateModalDetail] = useState<PoolDetail | null>(null);

  // ─── Boot — load comps + entries in parallel ─────────────────────────

  const reloadBootstrap = useCallback(async () => {
    setBootError(null);
    try {
      const [comps, entries] = await Promise.all([fetchCompetitions(), fetchMyEntries()]);
      setCompetitions(comps);
      setMyEntries(entries);
    } catch (err) {
      setBootError(err instanceof Error ? err.message : "Couldn't load tables.");
    }
  }, []);

  useEffect(() => {
    reloadBootstrap();
  }, [reloadBootstrap]);

  // ─── Derived: which pools the viewer is entered in ───────────────────

  const enteredPoolIds = useMemo(
    () => new Set((myEntries ?? []).map((e) => e.poolId)),
    [myEntries],
  );

  // ─── Default selection — pick comp + tier on first load ──────────────

  useEffect(() => {
    if (!competitions || !myEntries) return;
    if (competitions.length === 0) return;
    if (selectedCompetitionId !== null && selectedPoolId !== null) return;

    // Default comp: leftmost (server orders by competition.name asc).
    const comp = competitions[0];
    if (!comp || comp.pools.length === 0) {
      setSelectedCompetitionId(comp?.id ?? null);
      setSelectedPoolId(null);
      return;
    }

    // Default tier: leftmost where viewer is entered; fall back to leftmost.
    const enteredSet = new Set(myEntries.map((e) => e.poolId));
    const orderedPools = [...comp.pools].sort((a, b) => a.tier.ordinal - b.tier.ordinal);
    const enteredFirst = orderedPools.find((p) => enteredSet.has(p.id));
    const fallback = orderedPools[0];
    const picked = enteredFirst ?? fallback;

    setSelectedCompetitionId(comp.id);
    setSelectedPoolId(picked?.id ?? null);
  }, [competitions, myEntries, selectedCompetitionId, selectedPoolId]);

  // ─── Resolve current comp + pool from selection ──────────────────────

  const selectedCompetition = useMemo(
    () => competitions?.find((c) => c.id === selectedCompetitionId) ?? null,
    [competitions, selectedCompetitionId],
  );

  const selectedPool = useMemo(() => {
    if (!selectedCompetition || !selectedPoolId) return null;
    return selectedCompetition.pools.find((p) => p.id === selectedPoolId) ?? null;
  }, [selectedCompetition, selectedPoolId]);

  const orderedPools = useMemo(() => {
    if (!selectedCompetition) return [];
    return [...selectedCompetition.pools].sort((a, b) => a.tier.ordinal - b.tier.ordinal);
  }, [selectedCompetition]);

  // ─── Fetch standings when selected pool changes ──────────────────────

  const loadStandings = useCallback(
    async (poolId: string) => {
      setStandingsCache((prev) => {
        const next = new Map(prev);
        next.set(poolId, { state: "loading" });
        return next;
      });
      try {
        const payload = await fetchPoolEntries(poolId);
        setStandingsCache((prev) => {
          const next = new Map(prev);
          next.set(poolId, { state: "ready", payload });
          return next;
        });
      } catch (err) {
        const status = err instanceof FetchPoolEntriesError ? err.status : 0;
        const message =
          err instanceof Error ? err.message : "Couldn't load standings.";
        setStandingsCache((prev) => {
          const next = new Map(prev);
          next.set(poolId, { state: "error", status, message });
          return next;
        });
      }
    },
    [],
  );

  useEffect(() => {
    if (!selectedPoolId) return;
    if (standingsCache.has(selectedPoolId)) return;
    loadStandings(selectedPoolId);
  }, [selectedPoolId, standingsCache, loadStandings]);

  // Window focus → refetch the currently-viewed standings while pool is unsettled.
  useEffect(() => {
    function onFocus() {
      if (!selectedPoolId) return;
      const cached = standingsCache.get(selectedPoolId);
      if (cached?.state === "ready" && cached.payload.pool.status === "settled") return;
      loadStandings(selectedPoolId);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [selectedPoolId, standingsCache, loadStandings]);

  // ─── Entry flow ──────────────────────────────────────────────────────

  async function submitEntry(poolId: string, tierName: string, feeLabel: string) {
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await enterPool(poolId);
      if (!result.alreadyEntered) {
        toast.success(`Entered ${tierName} · ${feeLabel}`);
      }
      setLateModalDetail(null);
      // Land the user on the prediction screen for their new entry.
      setLocation(`/predict/${result.entryId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't enter pool.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEnterClick() {
    if (!selectedPool || submitting) return;
    const poolId = selectedPool.id;
    setSubmitting(true);
    try {
      const detail = await fetchPoolDetail(poolId);
      if (detail.entryWindow === "closed") {
        toast.error("This pool is closed to new entries.");
        setSubmitting(false);
        return;
      }
      if (detail.entryWindow === "late") {
        // Modal handles confirm; release the spinner so the modal renders.
        setLateModalDetail(detail);
        setSubmitting(false);
        return;
      }
      // entryWindow === "open"
      await submitEntry(detail.id, detail.tier.name, formatFee(detail.tier.entryFee));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open entry.");
      setSubmitting(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────

  if (bootError) {
    return (
      <div className="space-y-4 px-4 py-7">
        <h1 className="font-['Barlow_Condensed'] text-[1.85rem] font-bold uppercase leading-[1.05] tracking-[0.04em] text-white">
          Tables
        </h1>
        <p className="font-['Manrope'] text-sm text-rose-200">{bootError}</p>
        <button
          type="button"
          onClick={reloadBootstrap}
          className={cn(
            "rounded-full border border-emerald-400/40 bg-emerald-400/5 px-4 py-2",
            "font-['Manrope'] text-[0.78rem] font-semibold text-emerald-200",
            "transition hover:border-emerald-300/60 hover:bg-emerald-400/10",
            "min-h-[44px]",
          )}
        >
          Try again
        </button>
      </div>
    );
  }

  if (competitions === null || myEntries === null) {
    return <PageSplash />;
  }

  if (competitions.length === 0) {
    return (
      <div className="space-y-4 px-4 py-7">
        <h1 className="font-['Barlow_Condensed'] text-[1.85rem] font-bold uppercase leading-[1.05] tracking-[0.04em] text-white">
          Tables
        </h1>
        <NoActiveRounds />
      </div>
    );
  }

  const standingsState = selectedPoolId ? standingsCache.get(selectedPoolId) : undefined;

  // Resolve "You" rank/points for the header widget — only when the viewer is
  // entered in the selected pool AND standings are loaded.
  let myRowForHeader: { rank: number; points: number } | null = null;
  if (
    selectedPool &&
    enteredPoolIds.has(selectedPool.id) &&
    standingsState?.state === "ready"
  ) {
    const mine = standingsState.payload.entries.find((e) => e.isYou);
    if (mine) myRowForHeader = { rank: mine.rank, points: mine.points };
  }

  const viewerIsEntered = !!(selectedPool && enteredPoolIds.has(selectedPool.id));

  return (
    <div className="space-y-5 px-4 py-7 pb-10">
      <h1 className="font-['Barlow_Condensed'] text-[1.85rem] font-bold uppercase leading-[1.05] tracking-[0.04em] text-white">
        Tables
      </h1>

      <CompetitionPills
        competitions={competitions}
        selectedId={selectedCompetitionId ?? ""}
        onSelect={(id) => {
          const comp = competitions.find((c) => c.id === id);
          if (!comp) return;
          setSelectedCompetitionId(id);
          // Pick a sensible default tier for the new comp — re-run the same
          // "leftmost-entered, else leftmost" rule using the latest entries.
          const enteredSet = new Set(myEntries.map((e) => e.poolId));
          const ordered = [...comp.pools].sort((a, b) => a.tier.ordinal - b.tier.ordinal);
          const enteredFirst = ordered.find((p) => enteredSet.has(p.id));
          setSelectedPoolId(enteredFirst?.id ?? ordered[0]?.id ?? null);
        }}
      />

      {selectedCompetition && (
        <TierSubTabs
          pools={orderedPools}
          selectedPoolId={selectedPoolId ?? ""}
          enteredPoolIds={enteredPoolIds}
          onSelect={setSelectedPoolId}
        />
      )}

      {selectedPool && selectedCompetition && (
        <>
          <TierHeader
            pool={selectedPool}
            roundName={selectedCompetition.currentRound.name}
            myEntry={myRowForHeader}
            submitting={submitting}
            onEnterClick={handleEnterClick}
          />

          {!viewerIsEntered ? (
            <PreEntryStandingsTeaser />
          ) : standingsState === undefined || standingsState.state === "loading" ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-white/50">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              <p className="font-['Manrope'] text-xs">Loading standings…</p>
            </div>
          ) : standingsState.state === "error" ? (
            <p className="rounded-2xl border border-rose-400/30 bg-rose-500/[0.06] px-4 py-3 font-['Manrope'] text-[0.82rem] text-rose-200">
              {standingsState.message}
            </p>
          ) : standingsState.payload.entries.length === 0 ? (
            <EmptyStandings settled={standingsState.payload.pool.status === "settled"} />
          ) : (
            <>
              <PoolStandingsTable
                entries={standingsState.payload.entries}
                maxRows={STANDINGS_MAX_ROWS}
                linkTo={(e) =>
                  `/pools/${standingsState.payload.pool.competitionSlug}/${standingsState.payload.pool.id}/table/${e.entryId}`
                }
              />
              <TieBreakFooter />
            </>
          )}
        </>
      )}

      {lateModalDetail !== null && (
        <LateEntryWarningModal
          open={true}
          onOpenChange={(open) => {
            if (!submitting && !open) setLateModalDetail(null);
          }}
          onConfirm={() => {
            void submitEntry(
              lateModalDetail.id,
              lateModalDetail.tier.name,
              formatFee(lateModalDetail.tier.entryFee),
            );
          }}
          roundName={lateModalDetail.currentRound.name}
          daysLive={daysSince(lateModalDetail.firstKickoffAt)}
          matchesLocked={lateModalDetail.matchesLocked}
          matchesTotal={lateModalDetail.matchesTotal}
          feeLabel={formatFee(lateModalDetail.tier.entryFee)}
          bypassActive={lateModalDetail.bypassActive}
          submitting={submitting}
        />
      )}
    </div>
  );
}
