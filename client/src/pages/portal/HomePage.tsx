/*
Home (arch §8.1) — state-aware: current Round header, user's live entries,
available tiers.

Single-competition for now — only PL has an open Round through May 2026.
Championship returns from /api/competitions once 2026/27 fixtures are seeded.
Multi-competition Home layout is a deferred design (arch §14 #7).
*/

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, AlarmClock, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchCompetitions,
  fetchMyEntries,
  type Competition,
  type Pool,
  type PrizeBreakdownEntry,
  type UserEntry,
} from "@/lib/portal-api";

// ─── Formatters ──────────────────────────────────────────────────────────

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return DATE_FMT.format(new Date(iso));
}

function formatFee(decimal: string): string {
  const num = parseFloat(decimal);
  return `£${num % 1 === 0 ? num.toFixed(0) : num.toFixed(2)}`;
}

function formatMatchdayRange(matchdays: number[], label: "GW" | "MD"): string {
  if (matchdays.length === 0) return "";
  const first = matchdays[0];
  const last = matchdays[matchdays.length - 1];
  return matchdays.length === 1 ? `${label} ${first}` : `${label}s ${first}-${last}`;
}

function formatEntryCount(n: number): string {
  if (n === 0) return "No entries yet";
  if (n === 1) return "1 entry";
  return `${n.toLocaleString("en-GB")} entries`;
}

/**
 * Render the per-place prize breakdown as a single line. Mirrors
 * TablesPage.formatPrizeBreakdown — kept duplicated rather than extracted
 * since both files only use it in one place and the helper is trivial.
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

// ─── Round header ────────────────────────────────────────────────────────

function RoundHeader({ competition }: { competition: Competition }) {
  const { currentRound: round, pools } = competition;
  // Late-entry close = the closesAt on any pool (they share the same window).
  const lateEntryCloseAt = pools[0]?.closesAt;
  const now = Date.now();
  const lateEntryOpen = !!lateEntryCloseAt && new Date(lateEntryCloseAt).getTime() > now;

  return (
    <header className="space-y-2.5">
      <p className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.32em] text-emerald-300/70">
        {competition.name}
      </p>
      <h1 className="font-['Barlow_Condensed'] text-[2rem] font-extrabold uppercase leading-[0.95] tracking-[0.02em] text-white sm:text-[2.4rem]">
        {round.name}
      </h1>
      <p className="font-['Manrope'] text-[0.82rem] text-white/55">
        {formatMatchdayRange(round.matchdays, round.matchdayLabel)}
        {round.endDate && (
          <>
            <span className="mx-1.5 text-white/30">·</span>
            Round ends {formatDate(round.endDate)}
          </>
        )}
      </p>

      {lateEntryCloseAt && (
        <div
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
            "font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.18em]",
            lateEntryOpen
              ? "border border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
              : "border border-amber-300/30 bg-amber-400/10 text-amber-200",
          )}
        >
          {lateEntryOpen ? (
            <>
              <AlarmClock className="h-3 w-3" aria-hidden />
              <span>Late entry closes {formatDate(lateEntryCloseAt)}</span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-3 w-3" aria-hidden />
              <span>Late entry closed {formatDate(lateEntryCloseAt)}</span>
            </>
          )}
        </div>
      )}
    </header>
  );
}

// ─── Live entries section ────────────────────────────────────────────────

function LiveEntryCard({ entry, competitionSlug }: { entry: UserEntry; competitionSlug: string }) {
  const progress = entry.predictionsTotal > 0
    ? `${entry.predictionsMade}/${entry.predictionsTotal} saved`
    : "No matches yet";
  const predictHref = `/predict/${entry.id}`;
  const tableHref = `/pools/${competitionSlug}/${entry.poolId}/table`;
  return (
    <div
      className={cn(
        "rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06]",
        "px-4 py-3.5",
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="truncate font-['Barlow_Condensed'] text-[1rem] font-bold uppercase tracking-[0.06em] text-white">
          {entry.competitionShortName} · {entry.tierName}
        </p>
        <p className="font-['Manrope'] text-[0.75rem] text-white/55">{progress}</p>
      </div>
      <div className="mt-3 flex gap-2">
        <Link
          href={predictHref}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2",
            "bg-emerald-500 font-['Manrope'] text-[0.78rem] font-semibold text-black",
            "transition hover:bg-emerald-400 active:bg-emerald-600",
            "outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60",
            "min-h-[44px]",
          )}
        >
          <span>Predictions</span>
        </Link>
        <Link
          href={tableHref}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2",
            "border border-emerald-400/30 bg-emerald-400/[0.04]",
            "font-['Manrope'] text-[0.78rem] font-semibold text-emerald-200",
            "transition hover:border-emerald-300/50 hover:bg-emerald-400/[0.08]",
            "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
            "min-h-[44px]",
          )}
        >
          <span>Table</span>
        </Link>
      </div>
    </div>
  );
}

function LiveEntriesSection({
  entries,
  hasAvailableTiers,
  competitionSlug,
}: {
  entries: UserEntry[];
  hasAvailableTiers: boolean;
  competitionSlug: string;
}) {
  return (
    <section className="space-y-2.5">
      <h2 className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.28em] text-white/45">
        Your live entries
      </h2>
      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center">
          <p className="font-['Manrope'] text-sm text-white/55">
            No entries yet.
          </p>
          {hasAvailableTiers && (
            <p className="mt-1 font-['Manrope'] text-[0.76rem] text-white/40">
              Pick a tier below to enter this Round.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <LiveEntryCard key={entry.id} entry={entry} competitionSlug={competitionSlug} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Available tiers section ─────────────────────────────────────────────

function AvailableTierRow({ pool, competitionSlug }: { pool: Pool; competitionSlug: string }) {
  const breakdownLabel = formatPrizeBreakdown(pool.prizeBreakdown);
  return (
    <Link
      href="/tables"
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02]",
        "px-4 py-3.5 transition hover:border-emerald-300/30 hover:bg-emerald-400/[0.04]",
        "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
      )}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate font-['Barlow_Condensed'] text-[1.05rem] font-bold uppercase tracking-[0.06em] text-white">
          {pool.tier.name}
        </p>
        <p className="font-['Manrope'] text-[0.75rem] text-white/45">
          {formatEntryCount(pool.entryCount)}
        </p>
        {breakdownLabel && (
          <p className="font-['Manrope'] text-[0.7rem] tabular-nums text-emerald-200/70">
            {breakdownLabel}
          </p>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2.5">
        <span className="font-['Barlow_Condensed'] text-[1.2rem] font-extrabold text-emerald-300">
          {formatFee(pool.tier.entryFee)}
        </span>
        <ArrowRight className="h-4 w-4 text-white/40" aria-hidden />
      </div>
    </Link>
  );
}

function AvailableTiersSection({ pools, competitionSlug }: { pools: Pool[]; competitionSlug: string }) {
  if (pools.length === 0) return null;
  return (
    <section className="space-y-2.5">
      <h2 className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.28em] text-white/45">
        Available tiers
      </h2>
      <div className="space-y-2">
        {pools.map((pool) => (
          <AvailableTierRow key={pool.id} pool={pool} competitionSlug={competitionSlug} />
        ))}
      </div>
    </section>
  );
}

// ─── Top-level page ──────────────────────────────────────────────────────

type HomeData = {
  competitions: Competition[];
  entries: UserEntry[];
};

export default function HomePage() {
  const { user } = useAuth();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCompetitions(), fetchMyEntries()])
      .then(([competitions, entries]) => {
        if (cancelled) return;
        setData({ competitions, entries });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't load home.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="px-4 py-8">
        <p className="font-['Manrope'] text-sm text-rose-200">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-white/50">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <p className="font-['Manrope'] text-xs">Loading…</p>
      </div>
    );
  }

  const firstName = user?.name?.split(" ")[0] ?? "there";

  // Between-seasons empty state — no competition has an open Round.
  if (data.competitions.length === 0) {
    return (
      <div className="space-y-5 px-4 py-7">
        <header className="space-y-2">
          <h1 className="font-['Barlow_Condensed'] text-[1.85rem] font-bold uppercase leading-[1.05] tracking-[0.04em] text-white">
            Welcome, {firstName}.
          </h1>
          <p className="font-['Manrope'] text-sm text-white/55">
            No open Rounds right now — we're between seasons.
          </p>
        </header>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-6 text-center">
          <p className="font-['Barlow_Condensed'] text-[0.86rem] font-bold uppercase tracking-[0.18em] text-white/55">
            Pools open when fixtures are ready
          </p>
          <p className="mt-2 font-['Manrope'] text-xs text-white/40">
            Check back when the next Round opens.
          </p>
        </div>
      </div>
    );
  }

  // Single-competition Home — arch §14 #7 multi-competition layout deferred.
  // Pick the first competition (alphabetical → "Premier League" before
  // "EFL Championship"; once Champ pools exist we'll add a switcher).
  const competition = data.competitions[0];
  const myEntries = data.entries.filter((e) => e.competitionId === competition.id);
  const enteredPoolIds = new Set(myEntries.map((e) => e.poolId));
  const availableTiers = competition.pools.filter((p) => !enteredPoolIds.has(p.id));

  return (
    <div className="space-y-7 px-4 py-7">
      <RoundHeader competition={competition} />

      <LiveEntriesSection
        entries={myEntries}
        hasAvailableTiers={availableTiers.length > 0}
        competitionSlug={competition.slug}
      />

      <AvailableTiersSection pools={availableTiers} competitionSlug={competition.slug} />
    </div>
  );
}
