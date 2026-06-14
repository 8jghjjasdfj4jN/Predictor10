/*
Predict screen — arch §8.5, refactored for step 2m.

Now served at /predict/:entryId — a fresh URL so the Predict bottom-nav tab
stays highlighted while making picks (was /pools/:slug/:poolId, which
highlighted Pools).

Scope: this is the *entered* view only. Pre-entry flow lives on the Tables
tab now — it handles the open/late/closed window states, the late-entry
warning modal, and the POST /api/pools/:id/enter call. By the time a user
reaches /predict/:entryId, they're always entered.

Two top-level branches inside the entered view, both driven by EntryDetail:

  Active   — GW tabs, day-grouped match rows, 800ms debounced auto-save,
             footer "Auto-saving · saved 2s ago" indicator.
  Settled  — read-only. "Final · Settled DATE · X pts · Rank N of Y" meta
             line, "Round complete · View league table" banner, read-only
             footer pill. Decided Rule #11.
*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Loader2,
  Lock,
  CheckCircle2,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  fetchEntryDetail,
  fetchPoolDistribution,
  type EntryDetail,
  type EntryMatch,
  type EventDistribution,
  type SavePredictionResponse,
} from "@/lib/portal-api";
import { PredictGameweekTabs } from "@/components/predictor10/PredictGameweekTabs";
import { PredictMatchRow } from "@/components/predictor10/PredictMatchRow";
import { PickDistribution } from "@/components/predictor10/PickDistribution";

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

function formatMatchdayRange(matchdays: number[], label: "GW" | "MD"): string {
  if (matchdays.length === 0) return "";
  const first = matchdays[0];
  const last = matchdays[matchdays.length - 1];
  return matchdays.length === 1 ? `${label} ${first}` : `${label}s ${first}-${last}`;
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
/**
 * Predict-screen ordering tier. Lower = higher up the feed.
 *   0 = live: kicked off, not finished → TOP, with the pulsing LIVE badge
 *   1 = open: still predictable (teams known, not locked, not started)
 *   2 = locked, about to start (within the 1hr pre-kickoff window)
 *   3 = played: finished or terminal (postponed / cancelled / void) — history
 *   4 = awaiting teams (unresolved knockout slots) → BOTTOM
 * Once a live game finishes it moves from tier 0 to tier 3, dropping into the
 * historical block. Competition-agnostic — PL, cups and WC alike.
 */
function predictTier(m: EntryMatch): number {
  const finished = m.outcome !== null;
  const terminalUnplayed =
    m.status === "postponed" || m.status === "cancelled" || m.status === "void";
  if (finished || terminalUnplayed) return 3;
  const teamsKnown = m.homeTeam !== null && m.awayTeam !== null;
  if (!teamsKnown) return 4;
  const kicked = new Date(m.kickoffAt).getTime() <= Date.now();
  if (kicked) return 0; // live — kicked off, no result yet
  if (!m.isLocked) return 1; // open — needs predicting
  return 2; // locked, awaiting kick-off
}

/**
 * Live games on top (newest kick-off first — several at once cluster together),
 * then the games you can still predict (nearest deadline first), then those
 * about to start, then the played games (most recent first), then awaiting.
 */
function comparePredict(a: EntryMatch, b: EntryMatch): number {
  const ta = predictTier(a);
  const tb = predictTier(b);
  if (ta !== tb) return ta - tb;
  const ak = new Date(a.kickoffAt).getTime();
  const bk = new Date(b.kickoffAt).getTime();
  return ta === 0 || ta === 3 ? bk - ak : ak - bk; // live & played newest-first; else soonest-first
}

function formatSettledDate(iso: string): string {
  return DATE_FMT.format(new Date(iso));
}

// ─── Shared sub-components ───────────────────────────────────────────────

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

// ─── Active-state sub-components ─────────────────────────────────────────

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

// ─── Settled-state sub-components (Decided Rule #11) ─────────────────────

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

// ─── Entered (canonical Predict) view ────────────────────────────────────

function EnteredView({ entryId }: { entryId: string }) {
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeMatchday, setActiveMatchday] = useState<number | null>(null);
  const [footer, setFooter] = useState<FooterState>({ kind: "idle" });
  const [distribution, setDistribution] = useState<Record<string, EventDistribution>>({});
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

  // Pick distribution is an enhancement — load it best-effort by poolId and
  // never surface a failure (a missing/empty map just hides the panels).
  const loadDistribution = useCallback(async (poolId: string) => {
    try {
      const payload = await fetchPoolDistribution(poolId);
      setDistribution(payload.byEvent);
    } catch {
      /* non-fatal — leave whatever we have */
    }
  }, []);

  useEffect(() => {
    setEntry(null);
    setLoadError(null);
    setActiveMatchday(null);
    lockRejectionFiredRef.current = false;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  // Load the pool's pick distribution once the entry resolves a poolId, and
  // refresh it on window focus while the pool is unsettled (more matches lock
  // over time). Mirrors the standings focus-refetch behaviour.
  const poolId = entry?.poolId ?? null;
  const poolSettledForDist = entry?.settledAt != null;
  useEffect(() => {
    if (!poolId) return;
    void loadDistribution(poolId);
    function onFocus() {
      if (poolSettledForDist) return;
      void loadDistribution(poolId!);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [poolId, poolSettledForDist, loadDistribution]);

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
        load();
        return;
      }
      toast.error(message);
      setFooter({ kind: "error", message: "Couldn't save — will retry on next change" });
    },
    // load is stable enough — defined per render but no real cost
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Order the active GW's matches into a single feed (arch §13 Rule #12,
  // refined): the games you can still predict float to the top, soonest
  // kick-off first, so the nearest deadline is always at the top. Then the
  // games about to start, then live, then played (most recent first). Fully
  // competition-agnostic — PL, cups and WC all run through this one path.
  const orderedActive = useMemo(() => {
    if (!entry || activeMatchday === null) return [];
    return entry.matches
      .filter((m) => (m.matchday ?? -1) === activeMatchday)
      .slice()
      .sort(comparePredict);
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
  const tableHref = `/pools/${entry.competition.slug}/${entry.poolId}/table`;

  return (
    <>
      <BackLink
        to={isSettled ? "/account/history" : "/"}
        label={isSettled ? "History" : "Home"}
      />

      <RoundHeader
        competitionName={entry.competition.name}
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
          <LiveTableLink tableHref={tableHref} />
          <p className="font-['Manrope'] text-[0.72rem] leading-snug text-white/45">
            Each match locks 1 hour before kick-off. Edit your picks any time
            until then.
          </p>
        </div>
      )}

      {isSettled && <SettledBanner tableHref={tableHref} />}

      <PredictGameweekTabs
        gameweeks={entry.gameweeks}
        activeMatchday={activeMatchday}
        onSelect={setActiveMatchday}
        poolSettled={isSettled}
      />

      <div className="space-y-2">
        {orderedActive.map((m) => {
          const dist = m.isLocked ? distribution[m.eventId] : undefined;
          return (
            <div key={m.eventId} className="space-y-2">
              <PredictMatchRow
                match={m}
                entryId={entry.id}
                onSaved={onSaved}
                onError={onError}
              />
              {dist && (
                <PickDistribution
                  data={dist}
                  yourHome={m.prediction?.homeScore ?? null}
                  yourAway={m.prediction?.awayScore ?? null}
                  homeShort={m.homeTeamShort}
                  awayShort={m.awayTeamShort}
                />
              )}
            </div>
          );
        })}
        {orderedActive.length === 0 && (
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
  const [, params] = useRoute<{ entryId: string }>("/predict/:entryId");
  const entryId = params?.entryId ?? "";

  if (!entryId) {
    // Should never happen given the route definition; defensive empty state.
    return (
      <div className="space-y-5 px-4 py-7">
        <BackLink to="/" label="Home" />
        <p className="font-['Manrope'] text-sm text-rose-200">No entry specified.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-7 pb-10">
      <EnteredView entryId={entryId} />
    </div>
  );
}
