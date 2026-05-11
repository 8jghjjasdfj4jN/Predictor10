/*
PredictGameweekTabs — arch §8.5 top tab strip.

One pill per GW in the Round. Active tab is highlighted emerald; future tabs
neutral; fully-locked tabs muted with a lock icon. Each tab carries its own
"N/M" progress so the user can glance at where they're behind.

Horizontally scrollable on narrow viewports — taps don't trigger scroll, so
the bottom-nav tap target stays unambiguous.
*/

import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EntryGameweek } from "@/lib/portal-api";

type Props = {
  gameweeks: EntryGameweek[];
  activeMatchday: number;
  onSelect: (matchday: number) => void;
};

export function PredictGameweekTabs({ gameweeks, activeMatchday, onSelect }: Props) {
  return (
    <div
      className={cn(
        "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1",
        // Hide horizontal scrollbar but keep it scrollable (iOS Safari + Firefox)
        "scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none]",
        "[&::-webkit-scrollbar]:hidden",
      )}
      role="tablist"
      aria-label="Round gameweeks"
    >
      {gameweeks.map((gw) => {
        const isActive = gw.matchday === activeMatchday;
        const fullyLocked = gw.lockedCount === gw.matchCount && gw.matchCount > 0;
        const progress = `${gw.predictionCount}/${gw.matchCount}`;
        return (
          <button
            key={gw.matchday}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(gw.matchday)}
            className={cn(
              "flex flex-shrink-0 flex-col items-start gap-0.5 rounded-xl px-3 py-2.5",
              "border transition outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
              // Touch target — 44px+ minimum, comfortable
              "min-h-[56px] min-w-[80px]",
              isActive
                ? "border-emerald-400/60 bg-emerald-400/[0.12]"
                : fullyLocked
                  ? "border-white/8 bg-white/[0.02] opacity-70"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
            )}
          >
            <span
              className={cn(
                "flex items-center gap-1 font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.18em]",
                isActive ? "text-emerald-200" : "text-white/50",
              )}
            >
              {fullyLocked && <Lock className="h-2.5 w-2.5" aria-hidden />}
              <span>{gw.label}</span>
            </span>
            <span
              className={cn(
                "font-['Barlow_Condensed'] text-[1rem] font-bold leading-none",
                isActive
                  ? "text-white"
                  : gw.predictionCount === gw.matchCount
                    ? "text-emerald-300/80"
                    : "text-white/70",
              )}
            >
              {progress}
            </span>
          </button>
        );
      })}
    </div>
  );
}
