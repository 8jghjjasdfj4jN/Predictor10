/*
Predict (arch §8.2) — every open entry the user holds, grouped by close
time. Cards deep-link to the canonical Predict screen at
`/pools/:competitionSlug/:poolId`.

Two sections:
  CLOSING SOON — entries whose pool late-entry window closes within 48h.
                 Card shows "Late entry closes 2h 14m" countdown.
  THIS ROUND   — everything else still open. Card shows Round end date.

The "closing soon" threshold of 48h is chosen to keep the urgency bucket
useful without firing too eagerly. Entries already past their late-entry
window stay reachable via Home/Pools — they're not duplicated here.

Empty state: "No open entries — pick a tier on Home." When /pools ships
(arch §8.3), the link should swap to /pools.
*/

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AlarmClock, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchMyEntries, type UserEntry } from "@/lib/portal-api";

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

/**
 * Compact countdown formatter for the CLOSING SOON cards.
 *   < 60s  : "Closing now"
 *   < 1h   : "23m"
 *   < 24h  : "5h 12m"
 *   ≥ 24h  : "2d 4h"
 * Rounds down — so a value of "0m" means under a minute.
 */
function formatCountdown(targetIso: string, nowMs: number): string {
  const target = new Date(targetIso).getTime();
  const diff = target - nowMs;
  if (diff <= 0) return "Closing now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Closing now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const remMins = minutes - hours * 60;
    return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours - days * 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

// ─── Card ────────────────────────────────────────────────────────────────

function EntryCard({
  entry,
  urgent,
  nowMs,
}: {
  entry: UserEntry;
  urgent: boolean;
  nowMs: number;
}) {
  const progress = entry.predictionsTotal > 0
    ? `${entry.predictionsMade}/${entry.predictionsTotal} predictions saved`
    : "No matches yet";

  return (
    <Link
      href={`/pools/${entry.competitionSlug}/${entry.poolId}`}
      className={cn(
        "block rounded-2xl border px-4 py-4 transition",
        "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
        urgent
          ? "border-amber-300/30 bg-amber-400/[0.05] hover:border-amber-300/50 hover:bg-amber-400/[0.08]"
          : "border-emerald-400/25 bg-emerald-400/[0.04] hover:border-emerald-300/40 hover:bg-emerald-400/[0.07]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate font-['Barlow_Condensed'] text-[1.05rem] font-bold uppercase tracking-[0.06em] text-white">
            {entry.competitionShortName} · {entry.tierName}
          </p>
          <p className="font-['Manrope'] text-[0.75rem] text-white/55">
            {entry.roundName}
            {entry.predictionsTotal > 0 && (
              <>
                <span className="mx-1.5 text-white/30">·</span>
                {entry.predictionsTotal} matches
              </>
            )}
          </p>

          {urgent ? (
            <p
              className={cn(
                "inline-flex items-center gap-1 font-['Manrope'] text-[0.72rem] font-semibold text-amber-200",
              )}
            >
              <AlarmClock className="h-3 w-3" aria-hidden />
              <span>Late entry closes {formatCountdown(entry.closesAt, nowMs)}</span>
            </p>
          ) : (
            entry.roundEndDate && (
              <p className="font-['Manrope'] text-[0.72rem] text-white/45">
                Round ends {formatDate(entry.roundEndDate)}
              </p>
            )
          )}
        </div>
        <ArrowRight className="mt-1 h-4 w-4 flex-shrink-0 text-emerald-300" aria-hidden />
      </div>

      <div className="mt-2.5 font-['Manrope'] text-[0.74rem] text-white/65">
        {progress}
      </div>
    </Link>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────

function Section({
  title,
  entries,
  urgent,
  nowMs,
}: {
  title: string;
  entries: UserEntry[];
  urgent: boolean;
  nowMs: number;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="space-y-2.5">
      <h2
        className={cn(
          "font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.28em]",
          urgent ? "text-amber-200/75" : "text-white/45",
        )}
      >
        {title}
      </h2>
      <div className="space-y-2">
        {entries.map((entry) => (
          <EntryCard key={entry.id} entry={entry} urgent={urgent} nowMs={nowMs} />
        ))}
      </div>
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────

const CLOSING_SOON_WINDOW_MS = 48 * 60 * 60 * 1000;

export default function PredictPage() {
  const [entries, setEntries] = useState<UserEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tick for countdown copy. 30s cadence is plenty — "2h 14m" doesn't need
  // per-second refresh, and finer ticks would re-render every card needlessly.
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    fetchMyEntries()
      .then((list) => {
        if (cancelled) return;
        setEntries(list);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't load entries.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (error) {
    return (
      <div className="px-4 py-8">
        <p className="font-['Manrope'] text-sm text-rose-200">{error}</p>
      </div>
    );
  }

  if (!entries) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-white/50">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <p className="font-['Manrope'] text-xs">Loading…</p>
      </div>
    );
  }

  const closingSoon: UserEntry[] = [];
  const thisRound: UserEntry[] = [];
  for (const entry of entries) {
    const ms = new Date(entry.closesAt).getTime() - nowMs;
    if (ms > 0 && ms <= CLOSING_SOON_WINDOW_MS) {
      closingSoon.push(entry);
    } else {
      thisRound.push(entry);
    }
  }

  if (entries.length === 0) {
    return (
      <div className="space-y-5 px-4 py-7">
        <header className="space-y-1.5">
          <p className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.32em] text-emerald-300/70">
            Predict
          </p>
          <h1 className="font-['Barlow_Condensed'] text-[1.85rem] font-bold uppercase leading-[1.05] tracking-[0.04em] text-white">
            No open entries
          </h1>
        </header>
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center">
          <p className="font-['Manrope'] text-[0.82rem] leading-relaxed text-white/55">
            Browse open pools to enter the current Round — your entries land here once you're in.
          </p>
          <Link
            href="/pools"
            className={cn(
              "mt-4 inline-flex items-center gap-1.5 rounded-xl",
              "border border-emerald-400/30 bg-emerald-400/[0.08] px-4 py-2",
              "font-['Manrope'] text-[0.78rem] font-semibold text-emerald-200",
              "transition hover:bg-emerald-400/[0.14]",
              "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
            )}
          >
            Browse pools
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-7 pb-10">
      <header className="space-y-1.5">
        <p className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.32em] text-emerald-300/70">
          Predict
        </p>
        <h1 className="font-['Barlow_Condensed'] text-[1.85rem] font-bold uppercase leading-[1.05] tracking-[0.04em] text-white">
          Your open entries
        </h1>
      </header>

      <Section title="Closing soon" entries={closingSoon} urgent={true} nowMs={nowMs} />
      <Section title="This round" entries={thisRound} urgent={false} nowMs={nowMs} />
    </div>
  );
}
