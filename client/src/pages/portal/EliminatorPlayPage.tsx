/*
EliminatorPlayPage (step e5) — the Eliminator10 play screen at /eliminator/:slug.

State-aware, mirroring the rest of the portal's look (dark, emerald, Barlow
Condensed / Manrope). Branches:

  not entered  → intro + "starts" note + Join (when entries open) / closed notice
  alive, open  → current round, lock countdown, one-team-per-match pick grid
                 (used teams greyed, your pick highlighted), picks-hidden note
  alive, locked→ your locked pick + "awaiting results"
  eliminated   → "you're out" (which round + why)
  won / settled→ result

The pick is one tap on a team. Submit is optimistic; a server rejection (team
already used / round locked) reverts the tap and toasts the reason, and a lock
rejection refetches so the row flips to its locked view. Everyone's picks stay
hidden until the round locks — enforced server-side, surfaced here as a note.
*/

import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, BookOpen, Check, Loader2, Lock, Trophy, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  fetchEliminatorOverview,
  fetchEliminatorPickScreen,
  joinEliminator,
  submitEliminatorPick,
  SubmitEliminatorPickError,
  type EliminatorFixture,
  type EliminatorOverview,
  type EliminatorPickScreen,
  type EliminatorPickSide,
} from "@/lib/portal-api";
import { EliminatorRulesSheet } from "@/components/predictor10/EliminatorRules";

// ─── Formatters ──────────────────────────────────────────────────────────

const LOCK_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatLock(iso: string): string {
  return LOCK_FMT.format(new Date(iso));
}

function lockCountdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "locked";
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function displayTeamName(name: string | null): string {
  if (!name) return "TBD";
  return name.replace(/\s+FC$/, "").replace(/\s+AFC$/, "");
}

const ELIM_REASON: Record<string, string> = {
  lost: "your team lost",
  draw: "your team drew",
  no_pick: "no pick in by the deadline",
};

// ─── Page ──────────────────────────────────────────────────────────────

export default function EliminatorPlayPage() {
  const [match, params] = useRoute<{ slug: string }>("/eliminator/:slug");
  const slug = match ? params.slug : "";

  const [overview, setOverview] = useState<EliminatorOverview | null>(null);
  const [pickScreen, setPickScreen] = useState<EliminatorPickScreen | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [localPick, setLocalPick] = useState<{ eventId: string; side: EliminatorPickSide } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchEliminatorOverview(slug)
      .then(async (ov) => {
        if (cancelled) return;
        setOverview(ov);
        if (ov.entry.state !== "none") {
          const ps = await fetchEliminatorPickScreen(slug);
          if (cancelled) return;
          setPickScreen(ps);
          setLocalPick(ps.yourPick ? { eventId: ps.yourPick.eventId, side: ps.yourPick.side } : null);
        } else {
          setPickScreen(null);
          setLocalPick(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Couldn't load this game.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, reloadKey]);

  useEffect(() => {
    const onFocus = () => setReloadKey((k) => k + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  async function handleJoin() {
    if (joining) return;
    setJoining(true);
    try {
      await joinEliminator(slug);
      toast.success("You're in");
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't join.");
    } finally {
      setJoining(false);
    }
  }

  async function handlePick(roundId: string, fixture: EliminatorFixture, side: EliminatorPickSide) {
    if (submitting) return;
    const prev = localPick;
    setLocalPick({ eventId: fixture.eventId, side });
    setSubmitting(true);
    try {
      await submitEliminatorPick(slug, { roundId, eventId: fixture.eventId, side });
      const team = side === "home" ? fixture.homeTeam : fixture.awayTeam;
      toast.success(`${displayTeamName(team)} to win`);
    } catch (err) {
      setLocalPick(prev);
      toast.error(err instanceof Error ? err.message : "Couldn't save your pick.");
      if (err instanceof SubmitEliminatorPickError && err.status === 403) {
        setReloadKey((k) => k + 1);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-white/50">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <p className="font-['Manrope'] text-xs">Loading…</p>
      </div>
    );
  }

  if (loadError || !overview) {
    return (
      <div className="px-5 py-10">
        <BackLink />
        <p className="mt-6 font-['Manrope'] text-sm text-rose-200">
          {loadError ?? "We couldn't find that game."}
        </p>
      </div>
    );
  }

  const ov = overview;
  const entered = ov.entry.state !== "none";
  const settled = ov.status === "settled";

  return (
    <div className="pb-10">
      <div className="flex items-center justify-between px-5 pt-5">
        <BackLink />
        <button
          type="button"
          onClick={() => setRulesOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 font-['Manrope'] text-[0.72rem] font-semibold text-white/70 transition hover:bg-white/[0.06] hover:text-white"
        >
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          Rules
        </button>
      </div>

      <div className="px-5 pt-4">
        <p className="m-0 mb-1.5 font-['Manrope'] text-[0.6875rem] font-bold uppercase tracking-[0.32em] text-emerald-300/70">
          {ov.isFree ? "Free · last player standing" : "Last player standing"}
        </p>
        <h1 className="m-0 font-['Barlow_Condensed'] text-[2rem] font-extrabold uppercase leading-[0.95] tracking-[0.01em] text-white">
          {ov.name}
        </h1>
        <p className="mt-2 inline-flex items-center gap-1.5 font-['Manrope'] text-[0.8rem] text-white/55">
          <Users className="h-3.5 w-3.5" aria-hidden />
          <span className="font-semibold text-emerald-200">{ov.aliveCount}</span> still in
          <span aria-hidden className="text-white/25">·</span>
          {ov.entrantCount} joined
        </p>
      </div>

      <div className="px-5">
        {settled ? (
          <SettledView overview={ov} />
        ) : !entered ? (
          <JoinView overview={ov} joining={joining} onJoin={handleJoin} />
        ) : ov.entry.state === "eliminated" ? (
          <EliminatedView overview={ov} />
        ) : (
          <AliveView
            pickScreen={pickScreen}
            localPick={localPick}
            submitting={submitting}
            onPick={handlePick}
          />
        )}
      </div>

      <EliminatorRulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────

function BackLink() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-1.5 font-['Manrope'] text-[0.78rem] font-semibold text-white/55 transition hover:text-white"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      <span>Home</span>
    </Link>
  );
}

/** The "when it starts" banner — Round N + lock day/time + countdown. */
function StartsNote({
  round,
  leadLabel,
}: {
  round: { ordinal: number; name: string; deadlineAt: string; isLocked: boolean };
  leadLabel?: string;
}) {
  const cd = lockCountdown(round.deadlineAt);
  return (
    <div className="mt-5 rounded-[12px] border border-emerald-400/20 bg-emerald-400/[0.05] px-4 py-3">
      <p className="m-0 font-['Manrope'] text-[0.7rem] font-bold uppercase tracking-[0.2em] text-emerald-300/70">
        {leadLabel ?? `Round ${round.ordinal} starts`}
      </p>
      <p className="m-0 mt-1 font-['Manrope'] text-[0.9rem] text-white">
        Picks lock <span className="font-semibold">{formatLock(round.deadlineAt)}</span>
        {!round.isLocked && (
          <span className="text-white/55"> · in {cd}</span>
        )}
      </p>
    </div>
  );
}

function JoinView({
  overview,
  joining,
  onJoin,
}: {
  overview: EliminatorOverview;
  joining: boolean;
  onJoin: () => void;
}) {
  const { currentRound, canJoin } = overview;
  return (
    <>
      <p className="mt-5 font-['Manrope'] text-[0.95rem] leading-[1.55] text-white">
        Pick one team to win each round. Win and you go through; lose, draw or miss the
        deadline and you're out.{" "}
        <span className="font-semibold text-emerald-200">
          {overview.isFree ? "Free to play" : `£${parseFloat(overview.entryFee).toFixed(2)} to enter`}
        </span>{" "}
        — last one standing wins.
      </p>

      {currentRound && <StartsNote round={currentRound} leadLabel="First round starts" />}

      {canJoin ? (
        <button
          type="button"
          onClick={onJoin}
          disabled={joining}
          className={cn(
            "mt-6 flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-3.5",
            "bg-emerald-500 font-['Manrope'] text-sm font-bold text-[#0b1f14]",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] transition",
            "hover:bg-emerald-400 active:bg-emerald-600 disabled:cursor-wait disabled:opacity-70",
          )}
        >
          {joining ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              <span>Joining…</span>
            </>
          ) : (
            <span>{overview.isFree ? "Join — free" : `Join — £${parseFloat(overview.entryFee).toFixed(2)}`}</span>
          )}
        </button>
      ) : (
        <div className="mt-6 rounded-[10px] border border-white/10 bg-white/[0.03] px-4 py-3.5 text-center font-['Manrope'] text-[0.85rem] text-white/60">
          Entries have closed for this game.
        </div>
      )}
    </>
  );
}

function EliminatedView({ overview }: { overview: EliminatorOverview }) {
  const { eliminatedRoundOrdinal, eliminatedReason } = overview.entry;
  const reason = eliminatedReason ? ELIM_REASON[eliminatedReason] ?? eliminatedReason : null;
  return (
    <div className="mt-6 rounded-[14px] border border-rose-400/25 bg-rose-500/[0.06] px-5 py-6 text-center">
      <p className="m-0 font-['Barlow_Condensed'] text-[1.5rem] font-extrabold uppercase tracking-[0.02em] text-rose-200">
        You're out
      </p>
      <p className="m-0 mt-1.5 font-['Manrope'] text-[0.85rem] text-white/65">
        Knocked out{eliminatedRoundOrdinal ? ` in Round ${eliminatedRoundOrdinal}` : ""}
        {reason ? ` — ${reason}.` : "."}
      </p>
      <p className="m-0 mt-3 font-['Manrope'] text-[0.8rem] text-white/45">
        <span className="font-semibold text-emerald-200">{overview.aliveCount}</span> still standing.
      </p>
    </div>
  );
}

function SettledView({ overview }: { overview: EliminatorOverview }) {
  const won = overview.entry.state === "won";
  return (
    <div
      className={cn(
        "mt-6 rounded-[14px] border px-5 py-6 text-center",
        won ? "border-amber-300/40 bg-amber-400/[0.08]" : "border-white/10 bg-white/[0.03]",
      )}
    >
      {won ? (
        <>
          <Trophy className="mx-auto mb-2 h-7 w-7 text-amber-300" aria-hidden />
          <p className="m-0 font-['Barlow_Condensed'] text-[1.6rem] font-extrabold uppercase tracking-[0.02em] text-amber-200">
            You won
          </p>
          <p className="m-0 mt-1.5 font-['Manrope'] text-[0.85rem] text-white/65">
            Last one standing. Nice.
          </p>
        </>
      ) : (
        <>
          <p className="m-0 font-['Barlow_Condensed'] text-[1.4rem] font-extrabold uppercase tracking-[0.02em] text-white">
            Game over
          </p>
          <p className="m-0 mt-1.5 font-['Manrope'] text-[0.85rem] text-white/60">
            {overview.entry.state === "eliminated"
              ? `You were knocked out${overview.entry.eliminatedRoundOrdinal ? ` in Round ${overview.entry.eliminatedRoundOrdinal}` : ""}.`
              : "This game has finished."}
          </p>
        </>
      )}
    </div>
  );
}

function AliveView({
  pickScreen,
  localPick,
  submitting,
  onPick,
}: {
  pickScreen: EliminatorPickScreen | null;
  localPick: { eventId: string; side: EliminatorPickSide } | null;
  submitting: boolean;
  onPick: (roundId: string, fixture: EliminatorFixture, side: EliminatorPickSide) => void;
}) {
  if (!pickScreen || !pickScreen.round) {
    return (
      <div className="mt-6 rounded-[10px] border border-white/10 bg-white/[0.03] px-4 py-4 text-center font-['Manrope'] text-[0.85rem] text-white/60">
        You're still in. The next round opens when the current one settles.
      </div>
    );
  }

  const { round, fixtures } = pickScreen;
  const locked = round.isLocked;

  if (locked) {
    const yp = pickScreen.yourPick;
    return (
      <div className="mt-5">
        <RoundHeader round={round} locked />
        <div className="mt-4 rounded-[12px] border border-white/10 bg-white/[0.03] px-4 py-4">
          {yp ? (
            <p className="m-0 font-['Manrope'] text-[0.9rem] text-white">
              Your pick: <span className="font-bold text-emerald-200">{displayTeamName(yp.team)}</span> to win.
            </p>
          ) : (
            <p className="m-0 font-['Manrope'] text-[0.9rem] text-rose-200">
              No pick in — you'll be knocked out when this round settles.
            </p>
          )}
          <p className="m-0 mt-2 inline-flex items-center gap-1.5 font-['Manrope'] text-[0.78rem] text-white/45">
            <Lock className="h-3 w-3" aria-hidden />
            Locked — awaiting results.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <RoundHeader round={round} />
      <p className="mt-3 font-['Manrope'] text-[0.85rem] text-white/65">
        Pick one team to win. You can change it until the round locks.
      </p>

      <div className="mt-3 flex flex-col gap-2.5">
        {fixtures.map((f) => (
          <FixtureRow
            key={f.eventId}
            fixture={f}
            localPick={localPick}
            disabled={submitting}
            onPick={(side) => onPick(round.id, f, side)}
          />
        ))}
      </div>

      <p className="mt-4 inline-flex items-center gap-1.5 font-['Manrope'] text-[0.72rem] text-white/40">
        <Lock className="h-3 w-3" aria-hidden />
        Everyone's picks stay hidden until the round locks.
      </p>
    </div>
  );
}

function RoundHeader({
  round,
  locked,
}: {
  round: { ordinal: number; name: string; deadlineAt: string; isLocked: boolean };
  locked?: boolean;
}) {
  const cd = lockCountdown(round.deadlineAt);
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="m-0 font-['Barlow_Condensed'] text-[1.375rem] font-extrabold uppercase tracking-[0.02em] text-white">
        Round {round.ordinal}
      </h2>
      <span
        className={cn(
          "rounded-md border px-2 py-1 font-['Manrope'] text-[0.625rem] font-bold uppercase tracking-[0.12em]",
          locked
            ? "border-white/10 bg-white/[0.04] text-white/45"
            : "border-amber-300/30 bg-amber-400/10 text-amber-200",
        )}
      >
        {locked ? "Locked" : `Locks in ${cd}`}
      </span>
    </div>
  );
}

function FixtureRow({
  fixture,
  localPick,
  disabled,
  onPick,
}: {
  fixture: EliminatorFixture;
  localPick: { eventId: string; side: EliminatorPickSide } | null;
  disabled: boolean;
  onPick: (side: EliminatorPickSide) => void;
}) {
  const homeSelected = localPick?.eventId === fixture.eventId && localPick.side === "home";
  const awaySelected = localPick?.eventId === fixture.eventId && localPick.side === "away";

  return (
    <div className="rounded-[12px] border border-white/8 bg-white/[0.02] px-3 py-3">
      <p className="m-0 mb-2 font-['Manrope'] text-[0.68rem] text-white/40">
        {formatLock(fixture.kickoffAt)}
      </p>
      <div className="flex items-stretch gap-2">
        <TeamButton
          name={fixture.homeTeam}
          selected={homeSelected}
          used={fixture.homeUsed}
          awaiting={fixture.awaitingTeams}
          disabled={disabled}
          onClick={() => onPick("home")}
        />
        <span className="flex items-center font-['Manrope'] text-[0.7rem] text-white/30">v</span>
        <TeamButton
          name={fixture.awayTeam}
          selected={awaySelected}
          used={fixture.awayUsed}
          awaiting={fixture.awaitingTeams}
          disabled={disabled}
          onClick={() => onPick("away")}
        />
      </div>
    </div>
  );
}

function TeamButton({
  name,
  selected,
  used,
  awaiting,
  disabled,
  onClick,
}: {
  name: string | null;
  selected: boolean;
  used: boolean;
  awaiting: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const blocked = used || awaiting;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || blocked}
      className={cn(
        "flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[10px] border px-2 py-2 text-center transition",
        "font-['Barlow_Condensed'] text-[0.85rem] font-bold uppercase leading-[1.1] tracking-[0.02em]",
        selected
          ? "border-emerald-400/60 bg-emerald-400/[0.14] text-white"
          : blocked
            ? "cursor-not-allowed border-white/8 bg-white/[0.015] text-white/35"
            : "border-white/12 bg-white/[0.03] text-white hover:border-emerald-400/40 hover:bg-emerald-400/[0.06]",
      )}
    >
      <span className="line-clamp-2 break-words">{displayTeamName(name)}</span>
      {selected ? (
        <span className="inline-flex items-center gap-1 font-['Manrope'] text-[0.6rem] font-semibold normal-case tracking-normal text-emerald-200">
          <Check className="h-2.5 w-2.5" aria-hidden /> Your pick
        </span>
      ) : used ? (
        <span className="font-['Manrope'] text-[0.6rem] font-semibold normal-case tracking-normal text-white/35">
          Used
        </span>
      ) : null}
    </button>
  );
}
