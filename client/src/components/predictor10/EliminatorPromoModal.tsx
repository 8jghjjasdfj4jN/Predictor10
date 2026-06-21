// ─── BEGIN TEMP: Eliminator10 launch promo (step 3b.6) ─────────────────────
//
// TEMPORARY one-time welcome modal announcing Eliminator10. Remove per
// docs/eliminator-promo-teardown.md (target ~Mon 29 Jun 2026).
//
// Safety nets so it's harmless if teardown slips:
//   • Auto-hides after PROMO_EXPIRES_AT.
//   • Only shows while a game is actually open to join — once entries close
//     everywhere it never appears, and it never pesters players already in.
//   • Shows once per device (localStorage), then never again.
//
// Deliberately gentle (no countdown pressure, easy dismiss). When Eliminator
// goes paid/licensed, any promo like this must be frequency-capped and hidden
// from anyone with deposit/activity limits or self-exclusion — see teardown doc.

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchEliminatorOverviews } from "@/lib/portal-api";

const PROMO_KEY = "p10_elim_promo_seen_v1";
// Auto-hide cutoff (aligns with the WC Knockout entries closing). One line to
// shorten if you want it gone sooner.
const PROMO_EXPIRES_AT = new Date("2026-06-28T19:00:00Z");

const CLOSE_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(PROMO_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(PROMO_KEY, "1");
  } catch {
    /* private mode / storage disabled — fine, it just shows once this session */
  }
}

export function EliminatorPromoModal() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [closesAt, setClosesAt] = useState<string | null>(null);

  useEffect(() => {
    if (Date.now() > PROMO_EXPIRES_AT.getTime()) return;
    if (alreadySeen()) return;
    let cancelled = false;
    fetchEliminatorOverviews()
      .then((list) => {
        if (cancelled) return;
        const joinable = list
          .filter((g) => g.entry.state === "none" && g.canJoin)
          .sort((a, b) => new Date(a.entryClosesAt).getTime() - new Date(b.entryClosesAt).getTime());
        if (joinable.length === 0) return; // nothing to enter → don't promote
        setClosesAt(joinable[0].entryClosesAt);
        setOpen(true);
      })
      .catch(() => {
        /* a promo must never break the app */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!open) return null;

  function dismiss() {
    markSeen();
    setOpen(false);
  }

  function view() {
    markSeen();
    setOpen(false);
    navigate("/eliminator");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Eliminator10"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 backdrop-blur-sm sm:items-center"
      onClick={dismiss}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-emerald-400/40 bg-[#0c1512] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1.5 text-white/40 transition hover:bg-white/5 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 font-['Manrope'] text-[0.62rem] font-bold uppercase tracking-[0.16em] text-emerald-300">
          <Zap className="h-3 w-3" aria-hidden />
          New game mode
        </div>

        <h2 className="m-0 font-['Barlow_Condensed'] text-[1.75rem] font-extrabold uppercase leading-[0.98] tracking-[0.01em] text-white">
          Eliminator10
        </h2>

        <p className="m-0 mt-2 font-['Manrope'] text-[0.85rem] leading-[1.5] text-white/65">
          Outlast the field. Pick one team to win each round — lose, draw or miss a pick and you're
          out. Last one standing wins.
        </p>

        {closesAt && (
          <p className="m-0 mt-3 rounded-lg border border-white/[0.06] bg-black/30 px-3.5 py-2.5 font-['Manrope'] text-[0.78rem] text-white/70">
            <span className="font-semibold text-emerald-300">Free to enter</span> · entries close{" "}
            {CLOSE_FMT.format(new Date(closesAt))}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={view}
            className={cn(
              "flex w-full items-center justify-center rounded-[10px] bg-emerald-500 px-4 py-3.5",
              "font-['Manrope'] text-sm font-bold text-[#0b1f14] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]",
              "transition hover:bg-emerald-400 active:bg-emerald-600",
            )}
          >
            View games
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="w-full rounded-[10px] px-4 py-2.5 font-['Manrope'] text-[0.82rem] font-semibold text-white/55 transition hover:text-white"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
// ─── END TEMP: Eliminator10 launch promo ───────────────────────────────────
