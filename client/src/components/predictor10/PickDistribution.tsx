/*
PickDistribution — "how the table called it" for a locked match.

Collapsed to a single tappable strip; expands to show the home/draw/away
split as a bar plus the most-predicted scorelines. The viewer's own pick is
highlighted when it appears among the top scorelines.

Only rendered for locked matches (the parent gates on `match.isLocked` and the
presence of a distribution slice — the server never sends unlocked events).
Pure display; no network of its own — the parent fetches the pool's
distribution once and passes the per-event slice down.
*/

import { useState } from "react";
import { ChevronDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventDistribution } from "@/lib/portal-api";

function pct(n: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((n / total) * 100);
}

export function PickDistribution({
  data,
  yourHome,
  yourAway,
  homeShort,
  awayShort,
}: {
  data: EventDistribution;
  yourHome: number | null;
  yourAway: number | null;
  homeShort: string | null;
  awayShort: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (data.total === 0) return null;

  const homePct = pct(data.homeWin, data.total);
  const drawPct = pct(data.draw, data.total);
  const awayPct = Math.max(0, 100 - homePct - drawPct);

  const homeLabel = homeShort ?? "Home";
  const awayLabel = awayShort ?? "Away";

  const playersLabel = data.total === 1 ? "1 pick" : `${data.total} picks`;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-2 px-3.5 py-2.5",
          "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:rounded-xl",
          "min-h-[44px]",
        )}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-['Manrope'] text-[0.72rem] font-semibold text-white/60">
          <Users className="h-3.5 w-3.5 text-white/40" aria-hidden />
          How the table called it
        </span>
        <span className="flex items-center gap-2">
          <span className="font-['Manrope'] text-[0.66rem] tabular-nums text-white/35">
            {playersLabel}
          </span>
          <ChevronDown
            className={cn("h-4 w-4 text-white/40 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </span>
      </button>

      {open && (
        <div className="space-y-3 px-3.5 pb-3.5">
          {/* Outcome split bar */}
          <div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
              {homePct > 0 && <div className="bg-emerald-400/80" style={{ width: `${homePct}%` }} />}
              {drawPct > 0 && <div className="bg-white/30" style={{ width: `${drawPct}%` }} />}
              {awayPct > 0 && <div className="bg-sky-400/70" style={{ width: `${awayPct}%` }} />}
            </div>
            <div className="mt-1.5 flex justify-between font-['Manrope'] text-[0.66rem] tabular-nums text-white/55">
              <span>
                {homeLabel} {homePct}%
              </span>
              <span>Draw {drawPct}%</span>
              <span>
                {awayLabel} {awayPct}%
              </span>
            </div>
          </div>

          {/* Top scorelines */}
          {data.topScorelines.length > 0 && (
            <div className="space-y-1">
              {data.topScorelines.map((s) => {
                const isYours = yourHome === s.home && yourAway === s.away;
                return (
                  <div
                    key={`${s.home}-${s.away}`}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-2.5 py-1.5",
                      isYours ? "bg-emerald-400/[0.1] ring-1 ring-emerald-300/25" : "bg-white/[0.03]",
                    )}
                  >
                    <span className="flex items-center gap-2 font-['Manrope'] text-[0.78rem] tabular-nums text-white/80">
                      <span className="font-semibold">
                        {s.home}–{s.away}
                      </span>
                      {isYours && (
                        <span className="font-['Manrope'] text-[0.58rem] font-bold uppercase tracking-[0.1em] text-emerald-300/90">
                          You
                        </span>
                      )}
                    </span>
                    <span className="font-['Manrope'] text-[0.7rem] tabular-nums text-white/45">
                      {s.count === 1 ? "1 pick" : `${s.count} picks`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
