/*
Predict (arch §8.2, redesigned in step 3a.8) — every open entry the user
holds, grouped by status. Cards deep-link to the canonical predict screen
at `/predict/:entryId` (step 2m IA restructure — keeps the Predict
bottom-nav tab highlighted while picking).

Three sections, rendered only when non-empty:

  CLOSING SOON — late-entry window closes within 48h. Amber-urgent treatment
                 with a live countdown ("Late entry closes 2h 14m"). 30s
                 tick — fine enough for "Xh Ym" displays.
  THIS ROUND   — league-style entries (PL / Champ) outside the closing
                 window. Card shows Round end date.
  TOURNAMENT   — tournament-style entries (WC and any future Euros-style
                 comps; discriminated by `postponedPolicy === 'forfeit'`).
                 Card surfaces date range + match count instead of a Round
                 number.

Empty state: "No live entries — head to Home to pick a competition."

Mockup: docs/mockup-predict.html (locked May 2026).
*/

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AlarmClock, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchEliminatorOverviews,
  fetchMyEntries,
  type EliminatorOverview,
  type UserEntry,
} from "@/lib/portal-api";

// ─── Formatters ──────────────────────────────────────────────────────────

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const DATE_FMT_SHORT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return DATE_FMT.format(new Date(iso));
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "";
  return DATE_FMT_SHORT.format(new Date(iso));
}

/**
 * Compact countdown:
 *   < 60s → "Closing now"
 *   < 1h  → "23m"
 *   < 24h → "5h 12m"
 *   ≥ 24h → "2d 4h"
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

// ─── Card pieces ─────────────────────────────────────────────────────────

function ProgressBar({
  made,
  total,
}: {
  made: number;
  total: number;
}) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (made / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1 flex-1 overflow-hidden rounded bg-white/[0.06]">
        <div
          className="h-full rounded bg-emerald-400 transition-[width] duration-300"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>
      <span className="whitespace-nowrap font-['Manrope'] text-[0.72rem] font-semibold tabular-nums text-white/55">
        {made} / {total} saved
      </span>
    </div>
  );
}

function CornerGlow({ tone }: { tone: "emerald" | "amber" }) {
  const gradient =
    tone === "amber"
      ? "radial-gradient(circle at center, rgba(251, 191, 36, 0.10), transparent 70%)"
      : "radial-gradient(circle at center, rgba(52, 211, 153, 0.10), transparent 70%)";
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -right-10 -top-10 h-[120px] w-[120px]"
      style={{ background: gradient }}
    />
  );
}

function OpenCta({ entryId, tone }: { entryId: string; tone: "emerald" | "amber" }) {
  return (
    <Link
      href={`/predict/${entryId}`}
      className={cn(
        "mt-3.5 flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-3",
        "font-['Manrope'] text-[0.84rem] font-bold text-[#0b1f14]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]",
        "transition outline-none focus-visible:ring-2",
        tone === "amber"
          ? "bg-amber-300 hover:bg-amber-200 active:bg-amber-400 focus-visible:ring-amber-200/60"
          : "bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 focus-visible:ring-emerald-300/60",
      )}
    >
      <span>Open</span>
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

// ─── League-style card (PL / Champ) ──────────────────────────────────────

function LeagueCard({
  entry,
  urgent,
  nowMs,
}: {
  entry: UserEntry;
  urgent: boolean;
  nowMs: number;
}) {
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border px-4 pb-3.5 pt-3.5",
        urgent
          ? "border-amber-300/40 bg-amber-400/[0.06]"
          : "border-emerald-400/30 bg-emerald-400/[0.06]",
      )}
    >
      <CornerGlow tone={urgent ? "amber" : "emerald"} />
      <h2 className="m-0 mb-1 font-['Barlow_Condensed'] text-[1.25rem] font-bold uppercase leading-[1.05] tracking-[0.02em] text-white">
        {entry.competitionShortName} · {entry.tierName}
      </h2>
      <p className="m-0 font-['Manrope'] text-[0.78rem] text-white/55">
        {entry.roundName}
        {entry.predictionsTotal > 0 && (
          <>
            <span aria-hidden className="mx-1.5 text-white/30">·</span>
            {entry.predictionsTotal} matches
          </>
        )}
        {!urgent && entry.roundEndDate && (
          <>
            <span aria-hidden className="mx-1.5 text-white/30">·</span>
            Closes {formatDate(entry.roundEndDate)}
          </>
        )}
      </p>
      {urgent && (
        <p className="mt-1 flex items-center gap-1.5 font-['Manrope'] text-[0.78rem] font-semibold text-amber-300">
          <AlarmClock className="h-3.5 w-3.5" aria-hidden />
          <span>Late entry closes {formatCountdown(entry.closesAt, nowMs)}</span>
        </p>
      )}
      <div className="mt-3">
        <ProgressBar made={entry.predictionsMade} total={entry.predictionsTotal} />
      </div>
      <OpenCta entryId={entry.id} tone={urgent ? "amber" : "emerald"} />
    </article>
  );
}

// ─── Tournament card (WC) ────────────────────────────────────────────────

function TournamentCard({ entry }: { entry: UserEntry }) {
  // Round end date is also the tournament end for WC. The roundEndDate is
  // a YYYY-MM-DD string from the seed; enteredAt + closesAt are ISO. We
  // derive a date range from the entry's metadata where possible.
  const endLabel = entry.roundEndDate ? formatDateShort(entry.roundEndDate) : null;

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border px-4 pb-3.5 pt-3.5",
        "border-emerald-400/30 bg-emerald-400/[0.06]",
      )}
    >
      <CornerGlow tone="emerald" />
      <h2 className="m-0 mb-1 font-['Barlow_Condensed'] text-[1.25rem] font-bold uppercase leading-[1.05] tracking-[0.02em] text-white">
        {entry.competitionShortName}
      </h2>
      <p className="m-0 font-['Manrope'] text-[0.78rem] text-white/55">
        {endLabel ? (
          <>
            Ends {endLabel}
            <span aria-hidden className="mx-1.5 text-white/30">·</span>
          </>
        ) : null}
        {entry.predictionsTotal} matches
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-1",
            "border border-emerald-400/30 bg-emerald-400/[0.08]",
            "font-['Manrope'] text-[0.62rem] font-bold uppercase tracking-[0.12em] text-emerald-200",
          )}
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-emerald-400"
            style={{ boxShadow: "0 0 8px rgba(52, 211, 153, 0.6)" }}
          />
          Tournament in play
        </span>
      </div>
      <div className="mt-3">
        <ProgressBar made={entry.predictionsMade} total={entry.predictionsTotal} />
      </div>
      <OpenCta entryId={entry.id} tone="emerald" />
    </article>
  );
}

// ─── Eliminator strip (a pick that's due) ─────────────────────────
//
// The act-now home for the Eliminator mode. Surfaces only games the user is
// in where the current round is open and no pick is in yet — so a due pick
// floats to the top of Predict instead of being buried behind Home → lobby.
// Each row deep-links to the play screen.

// Sort key for the Eliminator section: pick-due first, then picked, then
// locked/awaiting, then between-rounds.
function elimRank(ov: EliminatorOverview): number {
  const r = ov.currentRound;
  if (r && !r.isLocked && r.needsPick) return 0;
  if (r && !r.isLocked) return 1;
  if (r && r.isLocked) return 2;
  return 3;
}

function ElimRow({ ov, nowMs }: { ov: EliminatorOverview; nowMs: number }) {
  const round = ov.currentRound;
  const cd = round ? formatCountdown(round.deadlineAt, nowMs) : "";
  const lockLabel = cd === "Closing now" ? "locking now" : `locks in ${cd}`;
  const pickDue = !!round && !round.isLocked && round.needsPick;

  let sub: React.ReactNode;
  let cta: string;
  if (round && !round.isLocked && round.needsPick) {
    sub = (
      <>
        {round.name}
        <span aria-hidden className="mx-1.5 text-white/30">·</span>
        <span className="font-semibold text-emerald-300">Pick due · {lockLabel}</span>
      </>
    );
    cta = "Make your pick";
  } else if (round && !round.isLocked) {
    sub = (
      <>
        {round.name}
        <span aria-hidden className="mx-1.5 text-white/30">·</span>
        Pick in · {lockLabel}
      </>
    );
    cta = "Change pick";
  } else if (round && round.isLocked) {
    sub = (
      <>
        {round.name}
        <span aria-hidden className="mx-1.5 text-white/30">·</span>
        Pick locked · awaiting results
      </>
    );
    cta = "View game";
  } else {
    sub = (
      <>
        Still in · {ov.aliveCount} of {ov.entrantCount} left
      </>
    );
    cta = "View game";
  }

  return (
    <article className="relative overflow-hidden rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] px-4 pb-3.5 pt-3.5">
      <CornerGlow tone="emerald" />
      <h2 className="m-0 mb-1 font-['Barlow_Condensed'] text-[1.25rem] font-bold uppercase leading-[1.05] tracking-[0.02em] text-white">
        {ov.name}
      </h2>
      <p className="m-0 font-['Manrope'] text-[0.78rem] text-white/55">{sub}</p>
      <Link
        href={`/eliminator/${ov.slug}`}
        className={cn(
          "mt-3.5 flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-3",
          "font-['Manrope'] text-[0.84rem] font-bold transition",
          "outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60",
          pickDue
            ? "bg-emerald-500 text-[#0b1f14] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-emerald-400 active:bg-emerald-600"
            : "border border-emerald-400/40 bg-emerald-400/[0.06] text-emerald-200 hover:bg-emerald-400/[0.12] active:bg-emerald-400/[0.18]",
        )}
      >
        <span>{cta}</span>
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </article>
  );
}

// ─── Section group ───────────────────────────────────────────────────────

function SectionGroup({
  title,
  urgent,
  children,
}: {
  title: string;
  urgent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="pt-5">
      <div className="mb-2 flex items-center gap-2.5 px-1">
        <span
          className={cn(
            "font-['Manrope'] text-[0.68rem] font-extrabold uppercase tracking-[0.22em]",
            urgent ? "text-amber-300" : "text-white/55",
          )}
        >
          {title}
        </span>
        <span aria-hidden className="h-px flex-1 bg-white/10" />
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────

const CLOSING_SOON_WINDOW_MS = 48 * 60 * 60 * 1000;

export default function PredictPage() {
  const [entries, setEntries] = useState<UserEntry[] | null>(null);
  const [eliminators, setEliminators] = useState<EliminatorOverview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchMyEntries(),
      // Tolerate absence — a missing Eliminator feed must not break Predict.
      fetchEliminatorOverviews().catch(() => [] as EliminatorOverview[]),
    ])
      .then(([list, elims]) => {
        if (cancelled) return;
        setEntries(list);
        setEliminators(elims);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't load entries.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 30s tick for the countdown labels.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (error) {
    return (
      <div className="px-5 py-8">
        <PageHeading />
        <p className="mt-4 font-['Manrope'] text-sm text-rose-200">{error}</p>
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

  // Every Eliminator game the player is still alive in shows here — whether or
  // not a pick is due — so an entered game never disappears from Predict.
  // Pick-due games sort to the top of the section.
  const elimLive = eliminators
    .filter((e) => e.entry.state === "alive")
    .sort((a, b) => elimRank(a) - elimRank(b));

  if (entries.length === 0 && elimLive.length === 0) {
    return (
      <div className="px-4 pb-8">
        <PageHeading />
        <div className="mx-1 mt-6 rounded-2xl border border-dashed border-white/10 px-6 py-9 text-center">
          <p className="m-0 mb-2 font-['Manrope'] text-[0.95rem] font-semibold text-white">
            No live entries.
          </p>
          <p className="m-0 mb-4 font-['Manrope'] text-[0.82rem] text-white/55">
            Head to Home to pick a competition.
          </p>
          <Link
            href="/"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg",
              "bg-emerald-500 px-4 py-2.5",
              "font-['Manrope'] text-[0.82rem] font-bold text-[#0b1f14]",
              "transition hover:bg-emerald-400",
              "outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60",
            )}
          >
            Browse competitions
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    );
  }

  // Bucket entries into three groups. Tournament entries skip the closing
  // logic — they live in their own section regardless of when their late
  // window expires.
  const closingSoon: UserEntry[] = [];
  const thisRound: UserEntry[] = [];
  const tournament: UserEntry[] = [];
  for (const entry of entries) {
    if (entry.postponedPolicy === "forfeit") {
      tournament.push(entry);
      continue;
    }
    const ms = new Date(entry.closesAt).getTime() - nowMs;
    if (ms > 0 && ms <= CLOSING_SOON_WINDOW_MS) {
      closingSoon.push(entry);
    } else {
      thisRound.push(entry);
    }
  }

  return (
    <div className="px-4 pb-8">
      <PageHeading />

      {elimLive.length > 0 && (
        <SectionGroup title={elimLive.length > 1 ? "Elimination games" : "Elimination game"}>
          {elimLive.map((ov) => (
            <ElimRow key={ov.slug} ov={ov} nowMs={nowMs} />
          ))}
        </SectionGroup>
      )}

      {closingSoon.length > 0 && (
        <SectionGroup title="Closing soon" urgent>
          {closingSoon.map((entry) => (
            <LeagueCard key={entry.id} entry={entry} urgent nowMs={nowMs} />
          ))}
        </SectionGroup>
      )}

      {thisRound.length > 0 && (
        <SectionGroup title="This round">
          {thisRound.map((entry) => (
            <LeagueCard key={entry.id} entry={entry} urgent={false} nowMs={nowMs} />
          ))}
        </SectionGroup>
      )}

      {tournament.length > 0 && (
        <SectionGroup title="Tournament">
          {tournament.map((entry) => (
            <TournamentCard key={entry.id} entry={entry} />
          ))}
        </SectionGroup>
      )}
    </div>
  );
}

function PageHeading() {
  return (
    <div className="px-1 pt-5">
      <p className="m-0 mb-1.5 font-['Manrope'] text-[0.6875rem] font-bold uppercase tracking-[0.32em] text-emerald-300/70">
        Active play
      </p>
      <h1 className="m-0 font-['Barlow_Condensed'] text-[2rem] font-extrabold uppercase leading-[0.95] tracking-[0.01em] text-white">
        Your live entries
      </h1>
    </div>
  );
}
