/*
EliminatorLobbyPage (step 3b.7) — the Eliminator10 game-mode hub at
`/eliminator`.

Home shows a single "Eliminator10" mode tile that routes here. The lobby is
three self-contained tabs — no floating banner — so the screen always matches
the tab you're on:

  Your games   — games you hold an entry in that are still live (alive or
                 eliminated-but-running). A game that needs a pick shows a
                 "Make pick" button on its own row. Settled ones move to
                 Finished.
  Open to join — games you're not in that are still joinable. Each shows when it
                 STARTS (for an Eliminator the game starts and entries close at
                 the same moment — the first kick-off) and a Join button.
  Finished     — settled games (your result shown if you played).

The call-to-action lives on the card it belongs to (Make pick / Join), not in a
banner above the tabs. Tab counts always match the rows shown.

A running game you're NOT in (entry closed, can't join) isn't shown — no action
to take — until it settles into Finished.

Game naming (step 3b.7): staggered weekly games are named "{Competition} · Game
N" so players can always tell which game they're in across Open to join, Your
games and Finished. Names come straight from the game record; this page just
renders game.name.

Data: GET /api/eliminator (fetchEliminatorOverviews) — viewer-aware. No backend;
buckets client-side. Rows deep-link to the play screen (/eliminator/:slug) and
survivors board (/eliminator/:slug/survivors).
*/

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, Clock, Lock, Trophy, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchEliminatorOverviews,
  type EliminatorOverview,
} from "@/lib/portal-api";

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

// ─── Bucketing ───────────────────────────────────────────────────────────

type Tab = "your" | "open" | "done";

const TAB_ORDER: Tab[] = ["your", "open", "done"];
const TAB_LABEL: Record<Tab, string> = {
  your: "Your games",
  open: "Open to join",
  done: "Finished",
};

/** Mutually-exclusive bucket. null = running, not in it, can't join (hidden). */
function bucketOf(ov: EliminatorOverview): Tab | null {
  if (ov.status === "settled") return "done";
  if (ov.entry.state !== "none") return "your";
  if (ov.canJoin) return "open";
  return null;
}

function sortYour(a: EliminatorOverview, b: EliminatorOverview): number {
  const aAlive = a.entry.state === "alive" ? 0 : 1;
  const bAlive = b.entry.state === "alive" ? 0 : 1;
  if (aAlive !== bAlive) return aAlive - bAlive;
  const ad = a.currentRound ? new Date(a.currentRound.deadlineAt).getTime() : Infinity;
  const bd = b.currentRound ? new Date(b.currentRound.deadlineAt).getTime() : Infinity;
  return ad - bd;
}

function sortByClose(a: EliminatorOverview, b: EliminatorOverview): number {
  return new Date(a.entryClosesAt).getTime() - new Date(b.entryClosesAt).getTime();
}

// ─── Game row ────────────────────────────────────────────────────────────

function GameRow({ ov, tab }: { ov: EliminatorOverview; tab: Tab }) {
  const watch = tab === "done";
  const href = watch ? `/eliminator/${ov.slug}/survivors` : `/eliminator/${ov.slug}`;
  const won = ov.entry.state === "won";
  const pickDue =
    tab === "your" &&
    ov.entry.state === "alive" &&
    !!ov.currentRound &&
    !ov.currentRound.isLocked &&
    ov.currentRound.needsPick;

  let sub: React.ReactNode;
  if (tab === "your") {
    if (ov.entry.state === "alive") {
      sub = (
        <>
          <span className="inline-flex items-center gap-1.5 text-emerald-200">
            <Users className="h-3.5 w-3.5" aria-hidden />
            Still in · {ov.aliveCount} of {ov.entrantCount} left
          </span>
          {ov.currentRound && !ov.currentRound.isLocked && (
            <>
              <span aria-hidden className="mx-1.5 text-white/25">·</span>
              <span className={cn(ov.currentRound.needsPick ? "font-semibold text-emerald-300" : "text-white/55")}>
                {ov.currentRound.needsPick ? "Pick due" : "Picked"} · locks in {lockCountdown(ov.currentRound.deadlineAt)}
              </span>
            </>
          )}
          {ov.currentRound && ov.currentRound.isLocked && (
            <>
              <span aria-hidden className="mx-1.5 text-white/25">·</span>
              <span className="inline-flex items-center gap-1 text-white/55">
                <Lock className="h-3 w-3" aria-hidden /> awaiting result
              </span>
            </>
          )}
        </>
      );
    } else {
      sub = <span className="text-white/55">You're out</span>;
    }
  } else if (tab === "open") {
    sub = (
      <span className="text-white/55">
        {ov.isFree ? "Free" : "Paid"}
        <span aria-hidden className="mx-1.5 text-white/25">·</span>
        Starts {formatLock(ov.entryClosesAt)}
      </span>
    );
  } else {
    sub = won ? (
      <span className="inline-flex items-center gap-1.5 font-semibold text-amber-200">
        <Trophy className="h-3.5 w-3.5" aria-hidden />
        You outlasted the field
      </span>
    ) : (
      <span className="text-white/55">
        Finished
        <span aria-hidden className="mx-1.5 text-white/25">·</span>
        {ov.entrantCount} played
      </span>
    );
  }

  const entered = ov.entry.state === "alive" || won;

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-3 overflow-hidden rounded-xl border px-4 py-3.5 transition",
        entered
          ? "border-emerald-400/40 bg-emerald-400/[0.08] hover:bg-emerald-400/[0.12]"
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
        "outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate font-['Barlow_Condensed'] text-[1.1rem] font-bold uppercase leading-tight tracking-[0.01em] text-white">
          {ov.name}
        </p>
        <p className="m-0 mt-1 font-['Manrope'] text-[0.76rem] leading-[1.3] text-white/55">{sub}</p>
      </div>
      {tab === "open" ? (
        <span className="flex-shrink-0 rounded-lg bg-emerald-500 px-3 py-2 font-['Manrope'] text-[0.76rem] font-bold text-[#0b1f14]">
          {ov.isFree ? "Join" : "View"}
        </span>
      ) : pickDue ? (
        <span className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 font-['Manrope'] text-[0.76rem] font-bold text-[#0b1f14]">
          Make pick
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      ) : watch ? (
        <span className="flex-shrink-0 rounded-md border border-white/15 px-2.5 py-1.5 font-['Manrope'] text-[0.66rem] font-bold uppercase tracking-[0.1em] text-white/60">
          Result
        </span>
      ) : (
        <ArrowRight
          className="h-4 w-4 flex-shrink-0 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-white/70"
          aria-hidden
        />
      )}
    </Link>
  );
}

// ─── Tab strip ───────────────────────────────────────────────────────────

function TabStrip({
  active,
  counts,
  onSelect,
}: {
  active: Tab;
  counts: Record<Tab, number>;
  onSelect: (t: Tab) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {TAB_ORDER.map((t) => {
        const isActive = t === active;
        const count = counts[t];
        return (
          <button
            key={t}
            type="button"
            onClick={() => onSelect(t)}
            className={cn(
              "flex min-h-[44px] flex-wrap items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center",
              "font-['Manrope'] text-[0.8rem] font-bold leading-[1.15] transition",
              "outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50",
              isActive
                ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-100"
                : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06]",
            )}
          >
            <span>{TAB_LABEL[t]}</span>
            {count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[0.62rem] leading-[1.4] tabular-nums",
                  isActive ? "bg-emerald-400/25 text-emerald-100" : "bg-white/10 text-white/50",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function EmptyTab({ tab }: { tab: Tab }) {
  const copy: Record<Tab, { title: string; body: string }> = {
    your: { title: "You haven't joined a game yet.", body: "Check the Open to join tab to get started." },
    open: { title: "Nothing open to join right now.", body: "New games appear here as they open." },
    done: { title: "No finished games yet.", body: "Completed games and results land here." },
  };
  const c = copy[tab];
  return (
    <div className="rounded-2xl border border-dashed border-white/10 px-5 py-9 text-center">
      <p className="m-0 mb-1.5 font-['Manrope'] text-sm font-semibold text-white">{c.title}</p>
      <p className="m-0 font-['Manrope'] text-[0.8125rem] text-white/55">{c.body}</p>
    </div>
  );
}

// ─── Heading ─────────────────────────────────────────────────────────────

function LobbyHeading() {
  return (
    <div className="px-1 pt-5">
      <Link
        href="/"
        className="mb-3 inline-flex items-center gap-1.5 font-['Manrope'] text-[0.78rem] font-semibold text-white/55 transition hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Home
      </Link>
      <p className="m-0 mb-1.5 font-['Manrope'] text-[0.6875rem] font-bold uppercase tracking-[0.32em] text-emerald-300/70">
        Outlast the field
      </p>
      <h1 className="m-0 font-['Barlow_Condensed'] text-[2rem] font-extrabold uppercase leading-[0.95] tracking-[0.01em] text-white">
        Eliminator10
      </h1>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function EliminatorLobbyPage() {
  const [games, setGames] = useState<EliminatorOverview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Tab | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEliminatorOverviews()
      .then((list) => {
        if (cancelled) return;
        setGames(list.filter((g) => g.status !== "draft" && g.status !== "void"));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't load games.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const buckets = useMemo(() => {
    const out: Record<Tab, EliminatorOverview[]> = { your: [], open: [], done: [] };
    for (const g of games ?? []) {
      const b = bucketOf(g);
      if (b) out[b].push(g);
    }
    out.your.sort(sortYour);
    out.open.sort(sortByClose);
    out.done.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [games]);

  const counts: Record<Tab, number> = {
    your: buckets.your.length,
    open: buckets.open.length,
    done: buckets.done.length,
  };

  // Land on Your games if you're in any (TAB_ORDER puts it first); otherwise the
  // first non-empty tab.
  const resolvedActive: Tab = active ?? TAB_ORDER.find((t) => counts[t] > 0) ?? "your";

  if (error) {
    return (
      <div className="px-4 py-8">
        <LobbyHeading />
        <p className="mt-4 font-['Manrope'] text-sm text-rose-200">{error}</p>
      </div>
    );
  }

  if (!games) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-white/50">
        <Clock className="h-5 w-5 animate-pulse" aria-hidden />
        <p className="font-['Manrope'] text-xs">Loading…</p>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="px-4 pb-8">
        <LobbyHeading />
        <div className="mx-1 mt-6 rounded-2xl border border-dashed border-white/10 px-6 py-9 text-center">
          <p className="m-0 mb-2 font-['Manrope'] text-[0.95rem] font-semibold text-white">
            No elimination games right now.
          </p>
          <p className="m-0 font-['Manrope'] text-[0.82rem] text-white/55">
            Check back when the next game opens.
          </p>
        </div>
      </div>
    );
  }

  const rows = buckets[resolvedActive];

  return (
    <div className="px-4 pb-8">
      <LobbyHeading />

      <div className="mt-4 flex flex-col gap-4">
        <TabStrip active={resolvedActive} counts={counts} onSelect={setActive} />

        <div className="flex flex-col gap-2.5">
          {rows.length > 0 ? (
            rows.map((ov) => <GameRow key={ov.slug} ov={ov} tab={resolvedActive} />)
          ) : (
            <EmptyTab tab={resolvedActive} />
          )}
        </div>
      </div>
    </div>
  );
}
