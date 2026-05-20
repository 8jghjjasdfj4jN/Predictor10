/*
EnterPage (arch §8.6.1, step 3a.7) — single-screen tournament entry confirm
mounted at `/enter/:competitionSlug`. Used for tournament-style competitions
(currently World Cup 2026; future single-tier tournaments reuse the route).

Flow:
  1. Load /api/competitions + /api/entries/me in parallel.
  2. If the competition exists and is league-style (multiple pools / not
     `postponedPolicy='forfeit'`) → 302 to /tables. The arch reserves this
     route for tournament-style competitions.
  3. If the user already has an entry in the single pool → 302 to
     /predict/:entryId (per arch §8.6.1).
  4. Otherwise, hydrate the pool detail (entry window, prize breakdown) and
     render the explainer + dynamic prize breakdown + Enter CTA.
  5. Tap Enter → late-entry window check → modal (if late) → POST
     /api/pools/:id/enter → navigate to /predict/:entryId.
  6. Window closed → CTA disabled, copy switches to "Late entry closed",
     link out to Tables.

Reuses LateEntryWarningModal for the late-entry confirm. The actual entry
POST is the same `/api/pools/:id/enter` endpoint used by TablesPage.
*/

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  enterPool,
  fetchCompetitions,
  fetchMyEntries,
  fetchPoolDetail,
  type Competition,
  type PoolDetail,
  type PrizeBreakdownEntry,
  type UserEntry,
} from "@/lib/portal-api";
import { LateEntryWarningModal } from "@/components/predictor10/LateEntryWarningModal";

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

function formatFee(decimal: string): string {
  const num = parseFloat(decimal);
  return `£${num % 1 === 0 ? num.toFixed(0) : num.toFixed(2)}`;
}

function formatPoundsPence(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return num.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th"];
function ordinal(rank: number): string {
  return ORDINALS[rank - 1] ?? `${rank}th`;
}

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

// ─── Hooks ───────────────────────────────────────────────────────────────

type BootState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "wrong_type" } // league-style — should use /tables instead
  | { kind: "ready"; competition: Competition; poolDetail: PoolDetail }
  | { kind: "error"; message: string };

function useEnterBoot(competitionSlug: string): {
  state: BootState;
  reload: () => void;
  redirectEntryId: string | null;
} {
  const [state, setState] = useState<BootState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [redirectEntryId, setRedirectEntryId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    setRedirectEntryId(null);

    Promise.all([fetchCompetitions(), fetchMyEntries()])
      .then(async ([competitions, entries]) => {
        if (cancelled) return;
        const competition = competitions.find((c) => c.slug === competitionSlug);
        if (!competition) {
          setState({ kind: "not_found" });
          return;
        }
        // Reserve /enter for tournament-style comps; redirect league-style
        // ones to the tier picker.
        if (competition.postponedPolicy !== "forfeit" || competition.pools.length !== 1) {
          setState({ kind: "wrong_type" });
          return;
        }
        const pool = competition.pools[0];
        // Already entered → bounce straight to the predict screen.
        const existing = entries.find((e: UserEntry) => e.poolId === pool.id);
        if (existing) {
          setRedirectEntryId(existing.id);
          return;
        }
        const poolDetail = await fetchPoolDetail(pool.id);
        if (cancelled) return;
        // Defensive: if myEntry came back populated by the pool fetch
        // (race: user opened a second tab and entered), bounce too.
        if (poolDetail.myEntry) {
          setRedirectEntryId(poolDetail.myEntry.id);
          return;
        }
        setState({ kind: "ready", competition, poolDetail });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Couldn't load this competition.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [competitionSlug, reloadKey]);

  return {
    state,
    reload: () => setReloadKey((k) => k + 1),
    redirectEntryId,
  };
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function EnterPage() {
  const [match, params] = useRoute<{ competitionSlug: string }>("/enter/:competitionSlug");
  const [, setLocation] = useLocation();
  const slug = match ? params.competitionSlug : "";
  const { state, reload, redirectEntryId } = useEnterBoot(slug);

  const [submitting, setSubmitting] = useState(false);
  const [showLateModal, setShowLateModal] = useState(false);

  // Redirect side-effect: already-entered users go straight to predict.
  useEffect(() => {
    if (redirectEntryId) {
      setLocation(`/predict/${redirectEntryId}`, { replace: true });
    }
  }, [redirectEntryId, setLocation]);

  // /tables redirect for league-style comps.
  useEffect(() => {
    if (state.kind === "wrong_type") {
      setLocation("/tables", { replace: true });
    }
  }, [state.kind, setLocation]);

  async function handleEnter() {
    if (state.kind !== "ready" || submitting) return;
    const { poolDetail } = state;
    if (poolDetail.entryWindow === "closed") {
      toast.error("Late entry has closed.");
      return;
    }
    if (poolDetail.entryWindow === "late") {
      setShowLateModal(true);
      return;
    }
    await submitEntry();
  }

  async function submitEntry() {
    if (state.kind !== "ready") return;
    setSubmitting(true);
    try {
      const result = await enterPool(state.poolDetail.id);
      if (!result.alreadyEntered) {
        toast.success(`Entered ${state.competition.shortName ?? state.competition.name}`);
      }
      setShowLateModal(false);
      setLocation(`/predict/${result.entryId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't enter pool.");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Render branches ─────────────────────────────────────────────────

  if (state.kind === "loading" || redirectEntryId) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-white/50">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <p className="font-['Manrope'] text-xs">Loading…</p>
      </div>
    );
  }

  if (state.kind === "not_found") {
    return (
      <div className="px-5 py-10">
        <BackToHome />
        <p className="mt-6 font-['Manrope'] text-sm text-rose-200">
          We couldn't find that competition.
        </p>
      </div>
    );
  }

  if (state.kind === "wrong_type") {
    // Will redirect via the effect above; render nothing meanwhile.
    return null;
  }

  if (state.kind === "error") {
    return (
      <div className="px-5 py-10">
        <BackToHome />
        <p className="mt-6 font-['Manrope'] text-sm text-rose-200">{state.message}</p>
        <button
          type="button"
          onClick={reload}
          className={cn(
            "mt-4 rounded-full border border-emerald-400/40 bg-emerald-400/5 px-4 py-2",
            "font-['Manrope'] text-[0.78rem] font-semibold text-emerald-200",
          )}
        >
          Try again
        </button>
      </div>
    );
  }

  const { competition, poolDetail } = state;
  const closed = poolDetail.entryWindow === "closed";
  const feeLabel = formatFee(poolDetail.tier.entryFee);

  return (
    <div className="pb-8">
      <BackToHome />
      <ConfirmContent
        competition={competition}
        poolDetail={poolDetail}
        feeLabel={feeLabel}
        closed={closed}
        submitting={submitting}
        onEnter={handleEnter}
      />

      {showLateModal && (
        <LateEntryWarningModal
          open
          onOpenChange={(open) => {
            if (!submitting && !open) setShowLateModal(false);
          }}
          onConfirm={() => void submitEntry()}
          roundName={poolDetail.currentRound.name}
          daysLive={daysSince(poolDetail.firstKickoffAt)}
          matchesLocked={poolDetail.matchesLocked}
          matchesTotal={poolDetail.matchesTotal}
          feeLabel={feeLabel}
          bypassActive={poolDetail.bypassActive}
          submitting={submitting}
        />
      )}
    </div>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────

function BackToHome() {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-1.5 px-5 pt-5",
        "font-['Manrope'] text-[0.78rem] font-semibold text-white/55 hover:text-white",
        "transition",
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      <span>Home</span>
    </Link>
  );
}

function ConfirmContent({
  competition,
  poolDetail,
  feeLabel,
  closed,
  submitting,
  onEnter,
}: {
  competition: Competition;
  poolDetail: PoolDetail;
  feeLabel: string;
  closed: boolean;
  submitting: boolean;
  onEnter: () => void;
}) {
  const round = competition.currentRound;
  const matchCount = poolDetail.matchesTotal;
  const dateRange = useMemo(() => {
    if (!round.startDate || !round.endDate) return null;
    return `${formatDateShort(round.startDate)} → ${formatDateShort(round.endDate)}`;
  }, [round.startDate, round.endDate]);
  const closeLabel = poolDetail.closesAt ? formatDate(poolDetail.closesAt) : null;

  return (
    <div className="px-5 pt-4">
      <h1 className="m-0 font-['Barlow_Condensed'] text-[2rem] font-extrabold uppercase leading-[0.95] tracking-[0.01em] text-white">
        {competition.name}
      </h1>
      {dateRange && (
        <p className="mt-1.5 font-['Manrope'] text-[0.85rem] text-white/55">
          {dateRange}
          <span aria-hidden className="mx-1.5 text-white/30">·</span>
          {matchCount} matches
        </p>
      )}

      <p className="mt-5 font-['Manrope'] text-[0.95rem] leading-[1.55] text-white">
        One entry. <span className="font-bold text-emerald-200">{feeLabel}</span>. Whole
        tournament across group stage and knockouts. Top 3 win money from the pot.
      </p>

      <Section title="How it works">
        <ul className="space-y-2 font-['Manrope'] text-[0.85rem] leading-[1.55] text-white/70">
          <Bullet>
            Predict every match's full-time score — 90 minutes only, no extra time, no
            penalties.
          </Bullet>
          <Bullet>
            <span className="text-white">5 pts</span> for an exact score,{" "}
            <span className="text-white">2 pts</span> for a correct result.
          </Bullet>
          <Bullet>
            Knockout fixtures fill in as the tournament progresses — you'll predict each
            round as the teams resolve.
          </Bullet>
          <Bullet>Predictions lock 1 hour before each kickoff.</Bullet>
          <Bullet>
            Postponed matches score 0 unless rescheduled — then they reopen for prediction.
          </Bullet>
          {closeLabel && !closed && (
            <Bullet>Late entry closes {closeLabel}.</Bullet>
          )}
        </ul>
      </Section>

      <Section title="Prize breakdown">
        <PrizeBreakdownBlock poolDetail={poolDetail} feeLabel={feeLabel} />
      </Section>

      {closed ? (
        <div className="mt-6 space-y-3">
          <button
            type="button"
            disabled
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-3.5",
              "bg-white/[0.04] font-['Manrope'] text-sm font-bold text-white/40",
              "cursor-not-allowed",
            )}
          >
            Late entry closed
          </button>
          <p className="text-center font-['Manrope'] text-[0.8rem] text-white/55">
            You can still follow the live table.{" "}
            <Link
              href="/tables"
              className="font-semibold text-emerald-200 underline decoration-emerald-200/40 underline-offset-[3px]"
            >
              See standings →
            </Link>
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={onEnter}
          disabled={submitting}
          className={cn(
            "mt-6 flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-3.5",
            "bg-emerald-500 font-['Manrope'] text-sm font-bold text-[#0b1f14]",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]",
            "transition hover:bg-emerald-400 active:bg-emerald-600",
            "outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60",
            "disabled:cursor-wait disabled:opacity-70",
          )}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              <span>Entering…</span>
            </>
          ) : (
            <>
              <span>Enter — {feeLabel}</span>
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <p className="mb-2 font-['Manrope'] text-[0.7rem] font-bold uppercase tracking-[0.22em] text-emerald-300/70">
        {title}
      </p>
      {children}
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span aria-hidden className="mt-[0.55rem] h-1 w-1 flex-shrink-0 rounded-full bg-emerald-400/70" />
      <span>{children}</span>
    </li>
  );
}

function PrizeBreakdownBlock({
  poolDetail,
  feeLabel,
}: {
  poolDetail: PoolDetail;
  feeLabel: string;
}) {
  const playerCount = poolDetail.entryCount;
  const fee = parseFloat(poolDetail.tier.entryFee);
  const grossPot = playerCount * fee;
  const playerWord = playerCount === 1 ? "player" : "players";

  return (
    <div
      className={cn(
        "rounded-[12px] border border-emerald-400/20 bg-emerald-400/[0.04] px-4 py-3.5",
      )}
    >
      <p className="m-0 font-['Manrope'] text-[0.8rem] text-white/65">
        {feeLabel} entry
        <span aria-hidden className="mx-1.5 text-white/25">·</span>
        {playerCount} {playerWord} so far
      </p>
      {playerCount === 0 ? (
        <p className="mt-2 font-['Manrope'] text-[0.8rem] text-white/45">
          Prize amounts appear once the first players enter.
        </p>
      ) : (
        <>
          <p className="m-0 mt-1 font-['Manrope'] text-[0.8rem] text-white/45 tabular-nums">
            Gross pot {formatPoundsPence(grossPot)}
          </p>
          <ul className="mt-2.5 space-y-1.5 font-['Manrope'] text-[0.85rem] tabular-nums">
            {poolDetail.prizeBreakdown.map((entry: PrizeBreakdownEntry) => (
              <li
                key={entry.rank}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="text-white/70">{ordinal(entry.rank)} place</span>
                <span className="font-bold text-emerald-200">£{entry.amount}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
