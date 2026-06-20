/*
EliminatorSurvivorsPage (step e5b) — the still-in / out board at
/eliminator/:slug/survivors.

Two lists: who's still in and who's out (newest knockouts first, with the
round they fell and the team that did it). Current-round picks stay hidden until
the round locks — the server only sends them once locked, and we show a note
while they're hidden. Same access gate as the league table: public once the game
is settled, entrant-only while it's live.
*/

import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Loader2, Lock, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchEliminatorSurvivors,
  type EliminatorOut,
  type EliminatorSurvivor,
  type EliminatorSurvivors,
} from "@/lib/portal-api";

function displayTeamName(name: string | null): string {
  if (!name) return "TBD";
  return name.replace(/\s+FC$/, "").replace(/\s+AFC$/, "");
}

const ELIM_REASON: Record<string, string> = {
  lost: "lost",
  draw: "drew",
  no_pick: "no pick",
};

export default function EliminatorSurvivorsPage() {
  const [match, params] = useRoute<{ slug: string }>("/eliminator/:slug/survivors");
  const slug = match ? params.slug : "";

  const [data, setData] = useState<EliminatorSurvivors | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetchEliminatorSurvivors(slug)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load survivors.");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) {
    return (
      <div className="px-5 py-10">
        <BackToGame slug={slug} />
        <p className="mt-6 font-['Manrope'] text-sm text-rose-200">{error}</p>
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

  const settled = data.game.status === "settled";

  return (
    <div className="pb-10">
      <div className="px-5 pt-5">
        <BackToGame slug={slug} />
      </div>

      <div className="px-5 pt-4">
        <p className="m-0 mb-1.5 font-['Manrope'] text-[0.6875rem] font-bold uppercase tracking-[0.32em] text-emerald-300/70">
          {data.game.name}
        </p>
        <h1 className="m-0 font-['Barlow_Condensed'] text-[2rem] font-extrabold uppercase leading-[0.95] tracking-[0.01em] text-white">
          Survivors
        </h1>
        <p className="mt-2 font-['Manrope'] text-[0.8rem] text-white/55">
          <span className="font-semibold text-emerald-200">{data.stillIn.length}</span> still in
          <span aria-hidden className="mx-1.5 text-white/25">·</span>
          {data.out.length} out
          <span aria-hidden className="mx-1.5 text-white/25">·</span>
          {data.game.entrantCount} entered
        </p>
      </div>

      <div className="px-5">
        {/* Still in */}
        <SectionLabel>{settled ? "Winners" : "Still in"}</SectionLabel>

        {data.picksHidden && !settled && (
          <p className="mb-2 inline-flex items-center gap-1.5 font-['Manrope'] text-[0.72rem] text-white/40">
            <Lock className="h-3 w-3" aria-hidden />
            Picks stay hidden until this round locks.
          </p>
        )}

        {data.stillIn.length === 0 ? (
          <EmptyRow>Nobody left in.</EmptyRow>
        ) : (
          <ul className="m-0 list-none space-y-1.5 p-0">
            {data.stillIn.map((s) => (
              <StillInRow key={s.entryId} survivor={s} settled={settled} />
            ))}
          </ul>
        )}

        {/* Out */}
        <SectionLabel className="mt-7">Out</SectionLabel>
        {data.out.length === 0 ? (
          <EmptyRow>Nobody's out yet.</EmptyRow>
        ) : (
          <ul className="m-0 list-none space-y-1.5 p-0">
            {data.out.map((o) => (
              <OutRow key={o.entryId} entry={o} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function BackToGame({ slug }: { slug: string }) {
  return (
    <Link
      href={`/eliminator/${slug}`}
      className="inline-flex items-center gap-1.5 font-['Manrope'] text-[0.78rem] font-semibold text-white/55 transition hover:text-white"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      <span>Back to game</span>
    </Link>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "mb-2.5 mt-6 font-['Manrope'] text-[0.7rem] font-bold uppercase tracking-[0.22em] text-emerald-300/70",
        className,
      )}
    >
      {children}
    </p>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-white/8 bg-white/[0.02] px-4 py-3.5 text-center font-['Manrope'] text-[0.82rem] text-white/45">
      {children}
    </div>
  );
}

function NameCell({ name, isYou }: { name: string; isYou: boolean }) {
  return (
    <span className="flex items-center gap-2 font-['Manrope'] text-[0.9rem] font-semibold text-white">
      {name}
      {isYou && (
        <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 font-['Manrope'] text-[0.6rem] font-bold uppercase tracking-[0.1em] text-emerald-200">
          You
        </span>
      )}
    </span>
  );
}

function StillInRow({ survivor, settled }: { survivor: EliminatorSurvivor; settled: boolean }) {
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 rounded-[10px] border px-4 py-3",
        survivor.isYou
          ? "border-emerald-400/40 bg-emerald-400/[0.07]"
          : "border-white/8 bg-white/[0.02]",
      )}
    >
      <span className="flex items-center gap-2">
        {settled && <Trophy className="h-4 w-4 flex-shrink-0 text-amber-300" aria-hidden />}
        <NameCell name={survivor.displayName} isYou={survivor.isYou} />
      </span>
      {survivor.currentPickTeam && (
        <span className="font-['Barlow_Condensed'] text-[0.85rem] font-bold uppercase tracking-[0.02em] text-emerald-200">
          {displayTeamName(survivor.currentPickTeam)}
        </span>
      )}
    </li>
  );
}

function OutRow({ entry }: { entry: EliminatorOut }) {
  const reason = entry.eliminatedReason ? ELIM_REASON[entry.eliminatedReason] ?? entry.eliminatedReason : null;
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 rounded-[10px] border px-4 py-3",
        entry.isYou ? "border-rose-400/30 bg-rose-500/[0.05]" : "border-white/8 bg-white/[0.015]",
      )}
    >
      <span className="flex flex-col gap-0.5">
        <NameCell name={entry.displayName} isYou={entry.isYou} />
        <span className="font-['Manrope'] text-[0.72rem] text-white/40">
          {entry.eliminatedRoundOrdinal ? `Round ${entry.eliminatedRoundOrdinal}` : "Out"}
          {entry.eliminatedPickTeam && ` · ${displayTeamName(entry.eliminatedPickTeam)}`}
          {reason && ` ${reason}`}
        </span>
      </span>
    </li>
  );
}
