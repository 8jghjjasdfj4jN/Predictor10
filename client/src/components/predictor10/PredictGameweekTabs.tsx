/*
PredictGameweekTabs — arch §8.5 top tab strip.

One pill per GW in the Round. Active tab is highlighted emerald; future tabs
neutral; fully-finished tabs (every match has an outcome) display the user's
points total with a checkmark. Each tab carries its own "N/M" progress for
the in-progress case so the user can glance at where they're behind.

Horizontally scrollable on narrow viewports.

Display rules:
  - finishedCount === matchCount && hasPredictions  → "N pts ✓"
  - else                                            → "P/M" (predictions/matches)
*/

import { Check, Lock } from "lucide-react";
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
        "scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none]",
        "[&::-webkit-scrollbar]:hidden",
      )}
      role="tablist"
      aria-label="Round gameweeks"
    >
      {gameweeks.map((gw) => {
        const isActive = gw.matchday === activeMatchday;
        const fullyFinished = gw.matchCount > 0 && gw.finishedCount === gw.matchCount;
        const fullyLocked = gw.matchCount > 0 && gw.lockedCount === gw.matchCount && !fullyFinished;
        // Finished tab body shows points total (when user has predictions);
        // otherwise the original P/M progress.
        const showPoints = fullyFinished && gw.predictionCount > 0;
        const bodyLabel = showPoints
          ? `${gw.pointsTotal} pts`
          : `${gw.predictionCount}/${gw.matchCount}`;

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
              "min-h-[56px] min-w-[80px]",
              isActive
                ? "border-emerald-400/60 bg-emerald-400/[0.12]"
                : fullyFinished
                  ? "border-emerald-400/25 bg-emerald-400/[0.04] hover:bg-emerald-400/[0.07]"
                  : fullyLocked
                    ? "border-white/8 bg-white/[0.02] opacity-70"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
            )}
          >
            <span
              className={cn(
                "flex items-center gap-1 font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.18em]",
                isActive
                  ? "text-emerald-200"
                  : fullyFinished
                    ? "text-emerald-300/70"
                    : "text-white/50",
              )}
            >
              {fullyFinished && <Check className="h-2.5 w-2.5" aria-hidden />}
              {!fullyFinished && fullyLocked && <Lock className="h-2.5 w-2.5" aria-hidden />}
              <span>{gw.label}</span>
            </span>
            <span
              className={cn(
                "font-['Barlow_Condensed'] text-[1rem] font-bold leading-none",
                isActive
                  ? "text-white"
                  : showPoints
                    ? "text-emerald-300/90"
                    : gw.predictionCount === gw.matchCount && gw.matchCount > 0
                      ? "text-emerald-300/80"
                      : "text-white/70",
              )}
            >
              {bodyLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}
