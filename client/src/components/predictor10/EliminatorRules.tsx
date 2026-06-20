/*
EliminatorRules — the player-facing rules sheet for Eliminator10 (step e5).

Opened from the "Rules" button on the Home card and the pick screen. Plain
overlay (no external dialog dependency): backdrop + centered scrollable card +
close button. Mobile-first, safe-area aware. Copy is the free-WC version; the
paid PL version swaps rule 11 for the entry fee + 75/25 pot when that ships.
*/

import { X } from "lucide-react";

const RULES: { n: number; title: string; body: React.ReactNode }[] = [
  { n: 1, title: "Last player standing wins", body: "Outlast everyone else and the competition is yours." },
  { n: 2, title: "Each round, pick one team to win", body: "Choose a single team from that round's fixtures." },
  { n: 3, title: "Picks lock at the first kick-off", body: "Get your pick in before the round's earliest game starts — after that it's locked, and you can't change it." },
  { n: 4, title: "Win and you go through", body: "Your team has to win in normal time (90 minutes — extra time and penalties don't count)." },
  { n: 5, title: "You're out if…", body: "your team loses, your team draws, or you don't get a pick in before the deadline." },
  { n: 6, title: "One team, once", body: "Once you've picked a team, you can't pick them again for the rest of the competition — so think ahead before you spend a strong side." },
  { n: 7, title: "A new round every day", body: "The World Cup runs as one competition across the whole tournament, with a round on each day of fixtures, all the way to the Final." },
  { n: 8, title: "Postponed or abandoned match?", body: "Your pick rolls forward to the rescheduled game — you're not knocked out for something that didn't get played." },
  { n: 9, title: "No second chances", body: "Once you're out, you're out — unless re-entry was announced before the competition started." },
  { n: 10, title: "If more than one of you is left", body: "after the last scheduled round, we'll either run extra rounds or share the win between the survivors." },
  { n: 11, title: "Free for the World Cup", body: "No entry fee, no money — just bragging rights and the title." },
  { n: 12, title: "Our decision is final", body: "on results, settlement and who's eligible." },
];

export function EliminatorRulesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Eliminator10 rules"
    >
      <button
        type="button"
        aria-label="Close rules"
        onClick={onClose}
        className="absolute inset-0 bg-black/70"
      />
      <div
        className="relative z-10 flex max-h-[88vh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#0b140f] sm:rounded-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <h2 className="m-0 font-['Barlow_Condensed'] text-[1.375rem] font-extrabold uppercase tracking-[0.02em] text-white">
            Eliminator10 — how it works
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/10 text-white/70 transition hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-4">
          <ol className="m-0 list-none space-y-3 p-0">
            {RULES.map((r) => (
              <li key={r.n} className="flex gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-400/15 font-['Manrope'] text-[0.72rem] font-bold text-emerald-200">
                  {r.n}
                </span>
                <p className="m-0 font-['Manrope'] text-[0.85rem] leading-[1.5] text-white/75">
                  <span className="font-semibold text-white">{r.title}</span>{" "}
                  {r.body}
                </p>
              </li>
            ))}
          </ol>

          <div className="mt-5 rounded-[10px] border border-amber-300/25 bg-amber-400/[0.06] px-4 py-3">
            <p className="m-0 font-['Manrope'] text-[0.7rem] font-bold uppercase tracking-[0.16em] text-amber-200/80">
              Play it tactically
            </p>
            <p className="m-0 mt-1 font-['Manrope'] text-[0.82rem] leading-[1.5] text-white/75">
              You can't reuse a team, and the deeper knockout rounds may only have
              one or two games. Spend all your strong sides early and you could
              reach a round with no team left to pick — which puts you out. Keep
              some firepower in reserve.
            </p>
          </div>

          <p className="mt-5 border-t border-white/10 pt-4 text-center font-['Barlow_Condensed'] text-[1.05rem] font-bold uppercase tracking-[0.04em] text-emerald-200">
            Pick a winner. Survive the round. Be the last player standing.
          </p>
        </div>
      </div>
    </div>
  );
}
