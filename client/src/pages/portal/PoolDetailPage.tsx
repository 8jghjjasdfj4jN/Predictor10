/*
Pool detail / Predict (arch §8.5).

Two top-level branches:

  Pre-entry  — PoolDetail drives header + tier card + window-state CTA.
               (Three sub-states: window 'open', 'late', 'closed'.)
  Entered    — EntryDetail drives the canonical Predict screen: GW tabs,
               day-grouped match rows, debounced auto-save, footer indicator.

Pre-entry is exactly what shipped in step 2e — untouched. The "You're in"
placeholder has been replaced with the real canonical layout (step 2f).

Settled state, FT scores, points pills and live in-play indicators arrive
behind the settlement / live-sync work (step 2g+).
*/

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  AlarmClock,
  AlertTriangle,
  Loader2,
  Lock,
  CheckCircle2,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  enterPool,
  fetchEntryDetail,
  fetchPoolDetail,
  type EntryDetail,
  type EntryMatch,
  type PoolDetail,
  type SavePredictionResponse,
} from "@/lib/portal-api";
import { LateEntryWarningModal } from "@/components/predictor10/LateEntryWarningModal";
import { PredictGameweekTabs } from "@/components/predictor10/PredictGameweekTabs";
import { PredictMatchRow } from "@/components/predictor10/PredictMatchRow";

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

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

function formatSavedAgo(savedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - savedAt) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatDate(new Date(savedAt).toISOString());
}

// Used by the day-grouper headers within the active GW.
function formatDayHeader(iso: string): string {
  return formatDate(iso); // e.g. "Sat 22 Aug"
}

// ─── Pre-entry sub-components (unchanged from step 2e) ───────────────────

function BackLink({ to, label }: { to: string; label: string }) {
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
      {label}
    </Link>
  );
}

function RoundHeader({
  competitionName,
  roundName,
  matchdays,
  matchdayLabel,
  endDate,
}: {
  competitionName: string;
  roundName: string;
  matchdays: number[];
  matchdayLabel: "GW" | "MD";
  endDate: string | null;
}) {
  return (
    <header className="space-y-2">
      <p className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.32em] text-emerald-300/70">
        {competitionName}
      </p>
      <h1 className="font-['Barlow_Condensed'] text-[2rem] font-extrabold uppercase leading-[0.95] tracking-[0.02em] text-white sm:text-[2.4rem]">
        {roundName}
      </h1>
      <p className="font-['Manrope'] text-[0.82rem] text-white/55">
        {formatMatchdayRange(matchdays, matchdayLabel)}
        {endDate && (
          <>
            <span className="mx-1.5 text-white/30">·</span>
            Round ends {formatDate(endDate)}
          </>
        )}
      </p>
    </header>
  );
}

function TierCard({ detail }: { detail: PoolDetail }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="truncate font-['Barlow_Condensed'] text-[1.25rem] font-bold uppercase tracking-[0.06em] text-white">
            {detail.tier.name}
          </p>
          <p className="font-['Manrope'] text-[0.75rem] text-white/45">
            {formatEntryCount(detail.entryCount)}
          </p>
        </div>
        <span className="flex-shrink-0 font-['Barlow_Condensed'] text-[1.6rem] font-extrabold leading-none text-emerald-300">
          {formatFee(detail.tier.entryFee)}
        </span>
      </div>
    </div>
  );
}

function WindowBadge({ detail }: { detail: PoolDetail }) {
  if (detail.entryWindow === "open") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
          "border border-emerald-300/30 bg-emerald-400/10",
          "font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-emerald-200",
        )}
      >
        <AlarmClock className="h-3 w-3" aria-hidden />
        <span>Late entry closes {formatDate(detail.closesAt)}</span>
      </div>
    );
  }
  if (detail.entryWindow === "late") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
          "border border-amber-300/30 bg-amber-400/10",
          "font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-amber-200",
        )}
      >
        <AlertTriangle className="h-3 w-3" aria-hidden />
        <span>Late entry — warning required</span>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
        "border border-white/15 bg-white/[0.04]",
        "font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-white/55",
      )}
    >
      <Lock className="h-3 w-3" aria-hidden />
      <span>Round closed</span>
    </div>
  );
}

function EnterCTA({
  feeLabel,
  submitting,
  onClick,
}: {
  feeLabel: string;
  submitting: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={submitting}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-2xl",
        "bg-emerald-500 px-5 py-4 font-['Manrope'] text-[0.95rem] font-semibold tracking-wide text-black",
        "transition hover:bg-emerald-400 active:bg-emerald-600",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60",
        "min-h-[52px]",
      )}
    >
      {submitting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span>Entering…</span>
        </>
      ) : (
        <span>Enter — {feeLabel}</span>
      )}
    </button>
  );
}

function ClosedState() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-6 text-center">
      <p className="font-['Barlow_Condensed'] text-[0.86rem] font-bold uppercase tracking-[0.22em] text-white/55">
        Entries closed
      </p>
      <p className="mt-2 font-['Manrope'] text-[0.78rem] leading-relaxed text-white/45">
        This Round's late-entry window has passed. The next Round's pools will appear on Home when
        they open.
      </p>
    </div>
  );
}

function LateEntryBanner({
  daysLive,
  matchesLocked,
  matchesTotal,
}: {
  daysLive: number;
  matchesLocked: number;
  matchesTotal: number;
}) {
  const liveCopy =
    daysLive <= 0
      ? "is already in progress"
      : daysLive === 1
        ? "has been live for 1 day"
        : `has been live for ${daysLive} days`;
  return (
    <div className="rounded-2xl border border-amber-300/30 bg-amber-400/[0.06] px-4 py-3.5">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="font-['Manrope'] text-[0.78rem] font-semibold text-amber-100">Late entry</p>
          <p className="font-['Manrope'] text-[0.74rem] leading-relaxed text-amber-100/75">
            This Round {liveCopy}. {matchesLocked} of {matchesTotal} matches have already kicked off
            — you'll score 0 on those.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Pre-entry view ──────────────────────────────────────────────────────

function PreEntryView({
  detail,
  onEntered,
}: {
  detail: PoolDetail;
  onEntered: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [showLateModal, setShowLateModal] = useState(false);

  const feeLabel = formatFee(detail.tier.entryFee);
  const canEnter = detail.entryWindow === "open" || detail.entryWindow === "late";
  const showLateBanner = detail.entryWindow === "late";

  async function submitEntry(): Promise<void> {
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await enterPool(detail.id);
      if (!result.alreadyEntered) {
        toast.success(`Entered ${detail.tier.name} · ${feeLabel}`);
      }
      await onEntered();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't enter pool.");
    } finally {
      setSubmitting(false);
      setShowLateModal(false);
    }
  }

  function onCTAClick(): void {
    if (detail.entryWindow === "late") {
      setShowLateModal(true);
    } else {
      submitEntry();
    }
  }

  return (
    <>
      <RoundHeader
        competitionName={detail.competition.name}
        roundName={detail.currentRound.name}
        matchdays={detail.currentRound.matchdays}
        matchdayLabel={detail.currentRound.matchdayLabel}
        endDate={detail.currentRound.endDate}
      />

      <div className="space-y-3">
        <TierCard detail={detail} />
        <div>
          <WindowBadge detail={detail} />
        </div>
      </div>

      {showLateBanner && (
        <LateEntryBanner
          daysLive={daysSince(detail.firstKickoffAt)}
          matchesLocked={detail.matchesLocked}
          matchesTotal={detail.matchesTotal}
        />
      )}

      {detail.entryWindow === "closed" && <ClosedState />}

      {canEnter && (
        <EnterCTA feeLabel={feeLabel} submitting={submitting} onClick={onCTAClick} />
      )}

      <LateEntryWarningModal
        open={showLateModal}
        onOpenChange={(open) => {
          if (!submitting) setShowLateModal(open);
        }}
        onConfirm={submitEntry}
        roundName={detail.currentRound.name}
        daysLive={daysSince(detail.firstKickoffAt)}
        matchesLocked={detail.matchesLocked}
        matchesTotal={detail.matchesTotal}
        feeLabel={feeLabel}
        bypassActive={detail.bypassActive}
        submitting={submitting}
      />
    </>
  );
}

// ─── Entered (canonical Predict) view ────────────────────────────────────

/**
 * Picks the default GW tab on first load:
 *   - Settled (Decided Rule #11): GW1 (chronological start) per arch §8.5
 *     settled mockup. Deferred Decision §14.2 may revisit this.
 *   - Active: the first GW that still has at least one unlocked (predictable)
 *     match. Falls back to the last GW when everything is locked but the
 *     pool hasn't yet settled. Arch §8.5: "default = the current GW (first
 *     that hasn't fully completed)".
 */
function pickDefaultMatchday(entry: EntryDetail): number {
  if (entry.settledAt !== null) {
    return entry.gameweeks[0]?.matchday ?? -1;
  }
  const fresh = entry.gameweeks.find((gw) => gw.lockedCount < gw.matchCount);
  if (fresh) return fresh.matchday;
  return entry.gameweeks[entry.gameweeks.length - 1]?.matchday ?? -1;
}

type FooterState =
  | { kind: "idle" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

function PredictFooter({ state }: { state: FooterState }) {
  // Tick to refresh "Saved Xs ago" copy without re-rendering rows.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state.kind !== "saved") return;
    const id = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, [state.kind]);

  if (state.kind === "idle") {
    return (
      <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-2.5 text-center font-['Manrope'] text-[0.72rem] text-white/40">
        Auto-saves as you type
      </div>
    );
  }
  if (state.kind === "saved") {
    return (
      <div className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] px-4 py-2.5 font-['Manrope'] text-[0.72rem] text-emerald-200/85">
        <CheckCircle2 className="h-3 w-3" aria-hidden />
        <span>Auto-saving · saved {formatSavedAgo(state.at, now)}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-400/30 bg-rose-400/[0.06] px-4 py-2.5 font-['Manrope'] text-[0.72rem] text-rose-200">
      <AlertTriangle className="h-3 w-3" aria-hidden />
      <span>{state.message}</span>
    </div>
  );
}

// ─── Settled-state subcomponents (Decided Rule #11) ──────────────────────

function formatSettledDate(iso: string): string {
  return DATE_FMT.format(new Date(iso));
}

/**
 * Header meta row shown in place of "X/Y saved" when the entry is settled.
 *   "Final · Settled Sat 20 Sep · 87 pts · Rank 4 of 18"
 * Tier name kept on the left so the header reads consistently with the
 * active-state layout.
 */
function SettledMeta({ entry }: { entry: EntryDetail }) {
  const settledLabel = entry.settledAt ? `Settled ${formatSettledDate(entry.settledAt)}` : "Settled";
  const rankLabel =
    entry.finalRank !== null
      ? `Rank ${entry.finalRank}`
      : "Rank —";
  const ptsLabel = entry.finalPoints !== null ? `${entry.finalPoints} pts` : `${entry.pointsTotal} pts`;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-['Manrope'] text-[0.78rem] font-semibold text-white/65">
          {entry.tier.name}
        </p>
        <p className="font-['Manrope'] text-[0.72rem] uppercase tracking-[0.16em] text-emerald-300/85">
          Final
        </p>
      </div>
      <p className="font-['Manrope'] text-[0.72rem] text-white/55">
        {settledLabel}
        <span className="mx-1.5 text-white/30">·</span>
        {ptsLabel}
        <span className="mx-1.5 text-white/30">·</span>
        {rankLabel}
      </p>
    </div>
  );
}

/**
 * Read-only banner shown above the GW tabs when settled. Links to the
 * League Table page (step 2k); the "view results" deep-link back to the
 * pool detail lives at the bottom of the table page.
 */
function SettledBanner({ tableHref }: { tableHref: string }) {
  return (
    <Link
      href={tableHref}
      className={cn(
        "flex items-center gap-2 rounded-2xl border px-3.5 py-3",
        "border-emerald-400/25 bg-emerald-400/[0.04]",
        "transition hover:border-emerald-300/40 hover:bg-emerald-400/[0.07]",
        "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
      )}
    >
      <Trophy className="h-4 w-4 flex-shrink-0 text-emerald-300" aria-hidden />
      <p className="flex-1 font-['Manrope'] text-[0.78rem] text-emerald-100/90">
        Round complete
        <span className="mx-1.5 text-white/30">·</span>
        <span className="text-emerald-200">View league table</span>
      </p>
      <ArrowRight className="h-4 w-4 flex-shrink-0 text-emerald-300" aria-hidden />
    </Link>
  );
}

/**
 * Subtle right-aligned affordance shown during an active entered pool. Lets
 * the user peek at live standings without leaving the predict screen as the
 * primary surface. Home page's [Table] CTA on the live-entry card remains
 * the main discovery path; this is the in-context shortcut.
 */
function LiveTableLink({ tableHref }: { tableHref: string }) {
  return (
    <div className="flex justify-end">
      <Link
        href={tableHref}
        className={cn(
          "inline-flex items-center gap-1 font-['Manrope'] text-[0.72rem] font-semibold",
          "text-emerald-300 transition hover:text-emerald-200",
          "outline-none focus-visible:underline",
          "min-h-[28px]",
        )}
      >
        View league table
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}

/**
 * Replaces the PredictFooter when settled — no auto-save copy, no error
 * recovery, just a static read-only indicator. Per arch §8.5 settled mockup:
 * "Settled · Read-only".
 */
function SettledFooter() {
  return (
    <div className="flex items-center justify-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-2.5 font-['Manrope'] text-[0.72rem] text-white/45">
      <Lock className="h-3 w-3" aria-hidden />
      <span>Settled · Read-only</span>
    </div>
  );
}

function EnteredView({
  entryId,
  competitionName,
  onLockRejection,
}: {
  entryId: string;
  competitionName: string;
  onLockRejection: () => void;
}) {
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeMatchday, setActiveMatchday] = useState<number | null>(null);
  const [footer, setFooter] = useState<FooterState>({ kind: "idle" });
  const lockRejectionFiredRef = useRef(false);

  async function load(): Promise<void> {
    try {
      const e = await fetchEntryDetail(entryId);
      setEntry(e);
      setActiveMatchday((current) => current ?? pickDefaultMatchday(e));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load entry.");
    }
  }

  useEffect(() => {
    setEntry(null);
    setLoadError(null);
    setActiveMatchday(null);
    lockRejectionFiredRef.current = false;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  const onSaved = useCallback(
    (response: SavePredictionResponse) => {
      setEntry((prev) => {
        if (!prev) return prev;
        // Update prediction on the matching match + bump per-GW counts when
        // this was a brand new prediction (not an edit of an existing one).
        let wasNew = false;
        const matches = prev.matches.map((m) => {
          if (m.eventId !== response.eventId) return m;
          if (m.prediction === null) wasNew = true;
          return { ...m, prediction: response.prediction };
        });
        const target = prev.matches.find((m) => m.eventId === response.eventId);
        const md = target?.matchday ?? -1;
        const gameweeks = wasNew
          ? prev.gameweeks.map((gw) =>
              gw.matchday === md ? { ...gw, predictionCount: gw.predictionCount + 1 } : gw,
            )
          : prev.gameweeks;
        return {
          ...prev,
          matches,
          gameweeks,
          predictionsMade: wasNew ? prev.predictionsMade + 1 : prev.predictionsMade,
        };
      });
      setFooter({ kind: "saved", at: Date.now() });
    },
    [],
  );

  const onError = useCallback(
    (message: string, isLockRejection: boolean) => {
      if (isLockRejection && !lockRejectionFiredRef.current) {
        lockRejectionFiredRef.current = true;
        toast.error("That match just locked — refreshing.");
        setFooter({ kind: "error", message: "Match locked — refreshing" });
        onLockRejection();
        load();
        return;
      }
      toast.error(message);
      setFooter({ kind: "error", message: "Couldn't save — will retry on next change" });
    },
    // load is stable enough — defined per render but no real cost
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onLockRejection],
  );

  // Group the active GW's matches by day for the day-headers.
  const groupedActive = useMemo(() => {
    if (!entry || activeMatchday === null) return [];
    const active = entry.matches.filter((m) => (m.matchday ?? -1) === activeMatchday);
    const groups: { dayLabel: string; matches: EntryMatch[] }[] = [];
    for (const m of active) {
      const dayLabel = formatDayHeader(m.kickoffAt);
      const last = groups[groups.length - 1];
      if (last && last.dayLabel === dayLabel) {
        last.matches.push(m);
      } else {
        groups.push({ dayLabel, matches: [m] });
      }
    }
    return groups;
  }, [entry, activeMatchday]);

  if (loadError) {
    return (
      <>
        <BackLink to="/" label="Home" />
        <p className="font-['Manrope'] text-sm text-rose-200">{loadError}</p>
      </>
    );
  }

  if (!entry || activeMatchday === null) {
    return (
      <>
        <BackLink to="/" label="Home" />
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-white/50">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          <p className="font-['Manrope'] text-xs">Loading predictions…</p>
        </div>
      </>
    );
  }

  const isSettled = entry.settledAt !== null;

  return (
    <>
      <BackLink
        to={isSettled ? "/account/history" : "/"}
        label={isSettled ? "History" : "Home"}
      />

      <RoundHeader
        competitionName={competitionName}
        roundName={entry.currentRound.name}
        matchdays={entry.currentRound.matchdays}
        matchdayLabel={entry.currentRound.matchdayLabel}
        endDate={entry.currentRound.endDate}
      />

      {isSettled ? (
        <SettledMeta entry={entry} />
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-['Manrope'] text-[0.78rem] font-semibold text-white/65">
              {entry.tier.name}
            </p>
            <p className="font-['Manrope'] text-[0.72rem] text-white/45">
              {entry.predictionsMade}/{entry.matchesTotal} saved
            </p>
          </div>
          <LiveTableLink tableHref={`/pools/${entry.competition.slug}/${entry.poolId}/table`} />
        </div>
      )}

      {isSettled && (
        <SettledBanner tableHref={`/pools/${entry.competition.slug}/${entry.poolId}/table`} />
      )}

      <PredictGameweekTabs
        gameweeks={entry.gameweeks}
        activeMatchday={activeMatchday}
        onSelect={setActiveMatchday}
        poolSettled={isSettled}
      />

      <div className="space-y-4">
        {groupedActive.map((group) => (
          <Fragment key={group.dayLabel}>
            <p className="font-['Manrope'] text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-white/45">
              {group.dayLabel}
            </p>
            <div className="space-y-2">
              {group.matches.map((m) => (
                <PredictMatchRow
                  key={m.eventId}
                  match={m}
                  entryId={entry.id}
                  onSaved={onSaved}
                  onError={onError}
                />
              ))}
            </div>
          </Fragment>
        ))}
        {groupedActive.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center">
            <p className="font-['Manrope'] text-[0.78rem] text-white/45">
              No matches in this gameweek.
            </p>
          </div>
        )}
      </div>

      {isSettled ? <SettledFooter /> : <PredictFooter state={footer} />}
    </>
  );
}

// ─── Top-level page ──────────────────────────────────────────────────────

export default function PoolDetailPage() {
  const [, params] = useRoute<{ competitionSlug: string; poolId: string }>(
    "/pools/:competitionSlug/:poolId",
  );
  const poolId = params?.poolId ?? "";

  const [detail, setDetail] = useState<PoolDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadDetail(): Promise<void> {
    try {
      const d = await fetchPoolDetail(poolId);
      setDetail(d);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load pool.");
    }
  }

  useEffect(() => {
    if (!poolId) return;
    setDetail(null);
    setLoadError(null);
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId]);

  if (loadError) {
    return (
      <div className="space-y-5 px-4 py-7">
        <BackLink to="/" label="Home" />
        <p className="font-['Manrope'] text-sm text-rose-200">{loadError}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-white/50">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <p className="font-['Manrope'] text-xs">Loading pool…</p>
      </div>
    );
  }

  const isEntered = detail.myEntry !== null;

  return (
    <div className="space-y-6 px-4 py-7 pb-10">
      {isEntered ? (
        <EnteredView
          entryId={detail.myEntry!.id}
          competitionName={detail.competition.name}
          onLockRejection={loadDetail}
        />
      ) : (
        <>
          <BackLink to="/" label="Home" />
          <PreEntryView detail={detail} onEntered={loadDetail} />
        </>
      )}
    </div>
  );
}
