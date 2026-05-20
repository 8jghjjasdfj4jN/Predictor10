/*
Home (arch §8.1) — entry discovery surface. Step 3a.6 redesign.

One card per competition currently open for entry. No live entries
section — those moved entirely to the Predict tab (arch §8.2) per
Rule #18.

Card behaviour branches on `competition.postponedPolicy`:
  - `'wait'`  (league-style: PL / Champ) → "Choose your tier →" → /tables
  - `'forfeit'` (tournament-style: WC)   → "Enter [Name] →"     → /enter/:slug

Hiding rules (arch §8.1):
  - A competition's card hides once every enterable pool is either
    already entered by the user OR past its late-entry close (closesAt).
  - Inactive competitions / pools are filtered by the server.

Empty states:
  - No competitions open at all          → "Nothing open right now."
  - Open competitions all entered/closed → "All current competitions
    entered. Make your picks in Predict →"

NOTE: the WC card currently links to /enter/world-cup-2026 which will
404 until step 3a.7 ships the confirm screen. Order is deliberate per
the handoff (3a.9 predict gating must land before 3a.7).
*/

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchCompetitions,
  fetchMyEntries,
  type Competition,
  type Pool,
  type UserEntry,
} from "@/lib/portal-api";

// ─── Formatters ──────────────────────────────────────────────────────────

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function formatDate(iso: string | null | undefined): string {
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

// ─── Card-data helpers ───────────────────────────────────────────────────

type EnterableState = {
  /** Pools the user can still enter (not entered + late-entry not closed). */
  enterablePools: Pool[];
  /** Earliest closesAt across enterable pools (for the "Closes …" meta line). */
  nearestCloseAt: string | null;
  /** Lowest entry fee across enterable pools (for "from £5" copy). */
  lowestFee: string | null;
};

function deriveEnterable(competition: Competition, enteredPoolIds: Set<string>): EnterableState {
  const now = Date.now();
  const enterable = competition.pools.filter(
    (p) => !enteredPoolIds.has(p.id) && new Date(p.closesAt).getTime() > now,
  );
  if (enterable.length === 0) {
    return { enterablePools: [], nearestCloseAt: null, lowestFee: null };
  }
  let nearest = enterable[0].closesAt;
  let lowest = enterable[0].tier.entryFee;
  for (const p of enterable) {
    if (new Date(p.closesAt).getTime() < new Date(nearest).getTime()) nearest = p.closesAt;
    if (parseFloat(p.tier.entryFee) < parseFloat(lowest)) lowest = p.tier.entryFee;
  }
  return { enterablePools: enterable, nearestCloseAt: nearest, lowestFee: lowest };
}

// ─── League-style card (PL / Champ) ──────────────────────────────────────

function LeagueCard({
  competition,
  enterable,
}: {
  competition: Competition;
  enterable: EnterableState;
}) {
  const { currentRound: round } = competition;
  const rangeLabel = formatMatchdayRange(round.matchdays, round.matchdayLabel);
  const closeLabel = enterable.nearestCloseAt ? `Closes ${formatDate(enterable.nearestCloseAt)}` : "";
  const tierCount = enterable.enterablePools.length;
  const feeLabel = enterable.lowestFee ? formatFee(enterable.lowestFee) : "";
  const tierWord = tierCount === 1 ? "tier" : "tiers";

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06]",
        "px-[18px] pb-4 pt-[18px]",
      )}
    >
      <CornerGlow />
      <header className="mb-1 flex items-start justify-between gap-3">
        <h2 className="m-0 font-['Barlow_Condensed'] text-[1.375rem] font-extrabold uppercase leading-[1.05] tracking-[0.02em] text-white">
          {competition.name}
        </h2>
        {round.name && (
          <span
            className={cn(
              "whitespace-nowrap rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1",
              "font-['Manrope'] text-[0.625rem] font-bold uppercase tracking-[0.14em] text-emerald-200",
            )}
          >
            {round.name}
          </span>
        )}
      </header>
      <p className="m-0 font-['Manrope'] text-[0.8125rem] text-white/55">
        {rangeLabel && (
          <>
            {rangeLabel}
            {closeLabel && <span className="mx-1.5 text-white/30">·</span>}
          </>
        )}
        {closeLabel}
      </p>
      <div
        className={cn(
          "my-3 rounded-[10px] border border-white/[0.04] bg-black/25 px-3.5 py-3",
          "font-['Manrope'] text-[0.78rem] leading-[1.55] text-white/55",
        )}
      >
        <span className="font-semibold text-white">
          {tierCount} {tierWord} from {feeLabel}.
        </span>{" "}
        Pick your stake. Same matches across the Round — one entry, all picks.
      </div>
      <Link
        href="/tables"
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-3.5",
          "bg-emerald-500 font-['Manrope'] text-sm font-bold text-[#0b1f14]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]",
          "transition hover:bg-emerald-400 active:bg-emerald-600",
          "outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60",
        )}
      >
        <span>Choose your tier</span>
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </article>
  );
}

// ─── Tournament-style card (WC) ──────────────────────────────────────────

function TournamentCard({
  competition,
  enterable,
}: {
  competition: Competition;
  enterable: EnterableState;
}) {
  // Tournament comps always have exactly one pool (single dedicated tier).
  const pool = enterable.enterablePools[0];
  const { currentRound: round } = competition;
  const matchCount = round.matchdays.length === 0 ? "104 matches" : `${round.matchdays.length} matches`;
  const dateRange = round.startDate && round.endDate
    ? `${formatDate(round.startDate)} → ${formatDate(round.endDate)}`
    : null;
  const closeLabel = pool ? `Late entry closes ${formatDate(pool.closesAt)}` : "";
  const fee = pool ? formatFee(pool.tier.entryFee) : "";

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06]",
        "px-[18px] pb-4 pt-[18px]",
      )}
    >
      <CornerGlow />
      <header className="mb-1 flex items-start justify-between gap-3">
        <h2 className="m-0 font-['Barlow_Condensed'] text-[1.375rem] font-extrabold uppercase leading-[1.05] tracking-[0.02em] text-white">
          {competition.name}
        </h2>
        {dateRange && (
          <span
            className={cn(
              "whitespace-nowrap rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1",
              "font-['Manrope'] text-[0.625rem] font-bold uppercase tracking-[0.14em] text-emerald-200",
            )}
          >
            {dateRange}
          </span>
        )}
      </header>
      <p className="m-0 font-['Manrope'] text-[0.8125rem] text-white/55">
        <span className="font-semibold text-white">{matchCount}</span>
        {closeLabel && (
          <>
            <span className="mx-1.5 text-white/30">·</span>
            {closeLabel}
          </>
        )}
      </p>
      <div
        className={cn(
          "my-3 rounded-[10px] border border-white/[0.04] bg-black/25 px-3.5 py-3",
          "font-['Manrope'] text-[0.78rem] leading-[1.55] text-white/55",
        )}
      >
        <span className="font-semibold text-white">One bracket. One {fee} entry.</span>{" "}
        Full-time scores only — no extra time, no penalties. Predict each round as the bracket fills in.
      </div>
      <Link
        href={`/enter/${competition.slug}`}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-3.5",
          "bg-emerald-500 font-['Manrope'] text-sm font-bold text-[#0b1f14]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]",
          "transition hover:bg-emerald-400 active:bg-emerald-600",
          "outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60",
        )}
      >
        <span>Enter {competition.shortName ?? competition.name}</span>
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </article>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────

function CornerGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -right-10 -top-10 h-[120px] w-[120px]"
      style={{
        background:
          "radial-gradient(circle at center, rgba(52, 211, 153, 0.10), transparent 70%)",
      }}
    />
  );
}

function EmptyAllEntered() {
  return (
    <div
      className={cn(
        "mx-4 my-2 rounded-2xl border border-dashed border-white/10 px-5 py-7 text-center",
      )}
    >
      <p className="mb-1.5 font-['Manrope'] text-sm font-semibold text-white">
        All current competitions entered.
      </p>
      <p className="m-0 font-['Manrope'] text-[0.8125rem] text-white/55">
        You're in everything that's open right now. Make your picks in{" "}
        <Link
          href="/predict"
          className="font-semibold text-emerald-200 underline decoration-emerald-200/40 underline-offset-[3px]"
        >
          Predict →
        </Link>
      </p>
    </div>
  );
}

function EmptyNothingOpen() {
  return (
    <div
      className={cn(
        "mx-4 my-2 rounded-2xl border border-dashed border-white/10 px-5 py-7 text-center",
      )}
    >
      <p className="mb-1.5 font-['Manrope'] text-sm font-semibold text-white">
        Nothing open right now.
      </p>
      <p className="m-0 font-['Manrope'] text-[0.8125rem] text-white/55">
        Check back when the next Round opens.
      </p>
    </div>
  );
}

// ─── Page header ─────────────────────────────────────────────────────────

function PageHeading() {
  return (
    <div className="px-5 pb-2.5 pt-5">
      <p className="m-0 mb-1.5 font-['Manrope'] text-[0.6875rem] font-bold uppercase tracking-[0.32em] text-emerald-300/70">
        Open now
      </p>
      <h1 className="m-0 font-['Barlow_Condensed'] text-[2rem] font-extrabold uppercase leading-[0.95] tracking-[0.01em] text-white">
        Competitions
      </h1>
    </div>
  );
}

// ─── Top-level page ──────────────────────────────────────────────────────

type HomeData = {
  competitions: Competition[];
  entries: UserEntry[];
};

export default function HomePage() {
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

  // Build entered-pool set once, then derive each competition's enterable
  // state. Card hides when no pools remain (entered or past close).
  const enteredPoolIds = new Set(data.entries.map((e) => e.poolId));
  const cards = data.competitions
    .map((comp) => ({ comp, enterable: deriveEnterable(comp, enteredPoolIds) }))
    .filter(({ enterable }) => enterable.enterablePools.length > 0);

  // Empty state branches per arch §8.1:
  //   - No comps from server (between-seasons) → "Nothing open right now"
  //   - Comps exist but all entered/closed     → "All current competitions
  //     entered" with link to Predict
  const showAllEnteredEmpty = cards.length === 0 && data.competitions.length > 0;
  const showNothingOpenEmpty = cards.length === 0 && data.competitions.length === 0;

  return (
    <div className="pb-6">
      <PageHeading />
      {cards.length > 0 && (
        <div className="flex flex-col gap-3 px-4 pb-6 pt-2">
          {cards.map(({ comp, enterable }) =>
            comp.postponedPolicy === "forfeit" ? (
              <TournamentCard key={comp.id} competition={comp} enterable={enterable} />
            ) : (
              <LeagueCard key={comp.id} competition={comp} enterable={enterable} />
            ),
          )}
        </div>
      )}
      {showAllEnteredEmpty && <EmptyAllEntered />}
      {showNothingOpenEmpty && <EmptyNothingOpen />}
    </div>
  );
}
