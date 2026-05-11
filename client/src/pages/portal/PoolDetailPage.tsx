/*
Pool detail / Predict (arch §8.5) — step 2e minimal entry-flow page.

This page is the only place a user enters a pool. Three states:

  Pre-entry, window 'open'    — header + tier card + big "Enter — £X" CTA;
                                tap fires POST /api/pools/:id/enter directly.
  Pre-entry, window 'late'    — same plus amber late-entry banner; tapping
                                the CTA opens LateEntryWarningModal first
                                (arch §4). Confirm fires the POST.
  Pre-entry, window 'closed'  — muted "Round closed" state, no CTA.
  Entered (myEntry exists)    — emerald "You're in" confirmation + step-2f
                                placeholder (canonical predict screen pending).

On a successful entry the page re-fetches its own data and flips into the
entered state. When the user navigates back to Home, Wouter remounts
HomePage which re-runs its data fetch — so "Available tiers" and "Your live
entries" both update without explicit wiring.

The canonical full Predict screen (GW tabs, match rows, auto-save) is step 2f+.
*/

import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import {
  ArrowLeft,
  AlarmClock,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  enterPool,
  fetchPoolDetail,
  type PoolDetail,
} from "@/lib/portal-api";
import { LateEntryWarningModal } from "@/components/predictor10/LateEntryWarningModal";

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

// ─── Sub-components ──────────────────────────────────────────────────────

function BackLink() {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-1.5 font-['Manrope'] text-[0.78rem] font-semibold",
        "text-emerald-300 transition hover:text-emerald-200",
        "outline-none focus-visible:underline",
      )}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Home
    </Link>
  );
}

function PoolHeader({ detail }: { detail: PoolDetail }) {
  return (
    <header className="space-y-2">
      <p className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.32em] text-emerald-300/70">
        {detail.competition.name}
      </p>
      <h1 className="font-['Barlow_Condensed'] text-[2rem] font-extrabold uppercase leading-[0.95] tracking-[0.02em] text-white sm:text-[2.4rem]">
        {detail.currentRound.name}
      </h1>
      <p className="font-['Manrope'] text-[0.82rem] text-white/55">
        {formatMatchdayRange(detail.currentRound.matchdays, detail.currentRound.matchdayLabel)}
        {detail.currentRound.endDate && (
          <>
            <span className="mx-1.5 text-white/30">·</span>
            Round ends {formatDate(detail.currentRound.endDate)}
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
        // Touch target — 44px+ per project guidance
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

function EnteredState({ detail }: { detail: PoolDetail }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] px-5 py-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-400/10">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="font-['Barlow_Condensed'] text-[1.15rem] font-bold uppercase tracking-[0.04em] text-white">
              You're in
            </p>
            <p className="font-['Manrope'] text-[0.82rem] leading-relaxed text-white/65">
              {detail.competition.shortName} · {detail.tier.name} · {detail.currentRound.name}.
              Entered {formatDate(detail.myEntry?.enteredAt ?? null)}.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center">
        <p className="font-['Barlow_Condensed'] text-[0.82rem] font-bold uppercase tracking-[0.18em] text-white/55">
          Predict screen coming soon
        </p>
        <p className="mt-2 font-['Manrope'] text-[0.74rem] leading-relaxed text-white/40">
          Gameweek tabs, match rows and auto-save land in the next step (arch §8.5).
        </p>
      </div>

      <Link
        href="/"
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-2xl",
          "border border-white/15 bg-white/[0.04] px-5 py-3.5",
          "font-['Manrope'] text-[0.85rem] font-semibold text-white/80",
          "transition hover:bg-white/[0.08] hover:text-white",
          "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
          "min-h-[48px]",
        )}
      >
        Back to Home
      </Link>
    </div>
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

function LateEntryBanner({ daysLive, matchesLocked, matchesTotal }: { daysLive: number; matchesLocked: number; matchesTotal: number }) {
  const liveCopy =
    daysLive <= 0 ? "is already in progress" :
    daysLive === 1 ? "has been live for 1 day" :
    `has been live for ${daysLive} days`;
  return (
    <div className="rounded-2xl border border-amber-300/30 bg-amber-400/[0.06] px-4 py-3.5">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="font-['Manrope'] text-[0.78rem] font-semibold text-amber-100">
            Late entry
          </p>
          <p className="font-['Manrope'] text-[0.74rem] leading-relaxed text-amber-100/75">
            This Round {liveCopy}. {matchesLocked} of {matchesTotal} matches have already kicked off
            — you'll score 0 on those.
          </p>
        </div>
      </div>
    </div>
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
  const [submitting, setSubmitting] = useState(false);
  const [showLateModal, setShowLateModal] = useState(false);

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

  async function submitEntry(): Promise<void> {
    if (!detail || submitting) return;
    setSubmitting(true);
    try {
      const result = await enterPool(poolId);
      if (!result.alreadyEntered) {
        toast.success(`Entered ${detail.tier.name} · ${formatFee(detail.tier.entryFee)}`);
      }
      // Re-fetch so the page flips into the entered state.
      await loadDetail();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't enter pool.");
    } finally {
      setSubmitting(false);
      setShowLateModal(false);
    }
  }

  function onCTAClick(): void {
    if (!detail) return;
    if (detail.entryWindow === "late") {
      setShowLateModal(true);
    } else {
      submitEntry();
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="space-y-5 px-4 py-7">
        <BackLink />
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

  const feeLabel = formatFee(detail.tier.entryFee);
  const isEntered = detail.myEntry !== null;
  const canEnter = !isEntered && (detail.entryWindow === "open" || detail.entryWindow === "late");
  const showLateBanner = !isEntered && detail.entryWindow === "late";

  return (
    <div className="space-y-6 px-4 py-7">
      <BackLink />
      <PoolHeader detail={detail} />

      <div className="space-y-3">
        <TierCard detail={detail} />
        {!isEntered && (
          <div>
            <WindowBadge detail={detail} />
          </div>
        )}
      </div>

      {showLateBanner && (
        <LateEntryBanner
          daysLive={daysSince(detail.firstKickoffAt)}
          matchesLocked={detail.matchesLocked}
          matchesTotal={detail.matchesTotal}
        />
      )}

      {isEntered && <EnteredState detail={detail} />}

      {!isEntered && detail.entryWindow === "closed" && <ClosedState />}

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
    </div>
  );
}
