/*
Pools landing (arch §8.3).

Two parts:
  - Competition picker chips at the top — taps navigate to /pools/:slug.
  - "Open now" section listing each competition that currently has an
    open Round, with a "See pools →" CTA going to the per-competition page.

Reuses /api/competitions (no new server endpoint). That endpoint already
returns only competitions whose current Round has open pools, so when one
competition is between seasons (Championship in May 2026) it simply doesn't
appear — no "coming soon" copy until we know expected start dates from the
sync layer.

The wireframe's "Live now" strip and "Round N+1 · opens Mon" preview both
require live-sync + multi-round seeding; those land later steps.
*/

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Loader2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchCompetitions, type Competition } from "@/lib/portal-api";

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return DATE_FMT.format(new Date(iso));
}

function formatMatchdayRange(matchdays: number[], label: "GW" | "MD"): string {
  if (matchdays.length === 0) return "";
  const first = matchdays[0];
  const last = matchdays[matchdays.length - 1];
  return matchdays.length === 1 ? `${label} ${first}` : `${label}s ${first}-${last}`;
}

// ─── Components ──────────────────────────────────────────────────────────

function CompetitionChip({ competition }: { competition: Competition }) {
  return (
    <Link
      href={`/pools/${competition.slug}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2",
        "border border-emerald-400/25 bg-emerald-400/[0.05]",
        "font-['Manrope'] text-[0.78rem] font-semibold text-emerald-100",
        "transition hover:border-emerald-300/45 hover:bg-emerald-400/[0.1]",
        "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
        "min-h-[40px]",
      )}
    >
      <span>{competition.shortName}</span>
    </Link>
  );
}

function OpenRoundCard({ competition }: { competition: Competition }) {
  const round = competition.currentRound;
  return (
    <Link
      href={`/pools/${competition.slug}`}
      className={cn(
        "block rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 transition",
        "hover:border-emerald-300/30 hover:bg-emerald-400/[0.04]",
        "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="truncate font-['Barlow_Condensed'] text-[1.1rem] font-bold uppercase tracking-[0.06em] text-white">
            {competition.name}
          </p>
          <p className="font-['Manrope'] text-[0.78rem] text-white/65">
            {round.name}
            <span className="mx-1.5 text-white/30">·</span>
            {formatMatchdayRange(round.matchdays, round.matchdayLabel)}
          </p>
          {round.endDate && (
            <p className="font-['Manrope'] text-[0.72rem] text-white/45">
              Round ends {formatDate(round.endDate)}
              <span className="mx-1.5 text-white/30">·</span>
              {competition.pools.length} tiers
            </p>
          )}
        </div>
        <ArrowRight className="mt-1 h-4 w-4 flex-shrink-0 text-emerald-300" aria-hidden />
      </div>
    </Link>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function PoolsPage() {
  const [competitions, setCompetitions] = useState<Competition[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCompetitions()
      .then((list) => {
        if (cancelled) return;
        setCompetitions(list);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't load pools.");
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

  if (!competitions) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-white/50">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <p className="font-['Manrope'] text-xs">Loading…</p>
      </div>
    );
  }

  if (competitions.length === 0) {
    return (
      <div className="space-y-5 px-4 py-7">
        <header className="space-y-1.5">
          <p className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.32em] text-emerald-300/70">
            Pools
          </p>
          <h1 className="font-['Barlow_Condensed'] text-[1.85rem] font-bold uppercase leading-[1.05] tracking-[0.04em] text-white">
            Between seasons
          </h1>
        </header>
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center">
          <Trophy className="mx-auto mb-3 h-6 w-6 text-white/30" aria-hidden />
          <p className="font-['Manrope'] text-[0.82rem] leading-relaxed text-white/55">
            No open Rounds right now. New pools appear here when the next Round opens.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7 px-4 py-7 pb-10">
      <header className="space-y-1.5">
        <p className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.32em] text-emerald-300/70">
          Pools
        </p>
        <h1 className="font-['Barlow_Condensed'] text-[1.85rem] font-bold uppercase leading-[1.05] tracking-[0.04em] text-white">
          Open Rounds
        </h1>
      </header>

      <div className="-mx-4 flex flex-wrap gap-2 px-4">
        {competitions.map((c) => (
          <CompetitionChip key={c.id} competition={c} />
        ))}
      </div>

      <section className="space-y-2.5">
        <h2 className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.28em] text-white/45">
          Open now
        </h2>
        <div className="space-y-2">
          {competitions.map((c) => (
            <OpenRoundCard key={c.id} competition={c} />
          ))}
        </div>
      </section>
    </div>
  );
}
