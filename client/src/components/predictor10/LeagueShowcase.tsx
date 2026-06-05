import { Link } from "wouter";
import { ArrowRight, CalendarDays, Coins, Trophy } from "lucide-react";
import { GlassPanel, SectionHeader } from "@/components/predictor10/Primitives";

/*
Single-competition showcase for the World Cup informal run. The original
4-tier picker ("Fiver / Tenner / Pony / Big One") was the main source of
the "pick a pool" confusion noted by early real players — replaced with
one focused card. Restore the multi-tier picker from
LeagueShowcase.tsx.bak when PL/Champ pools come back online for the new
domestic season (Aug 2026, after WC retirement per arch §15).
*/

export function LeagueShowcase() {
  return (
    <GlassPanel>
      <SectionHeader
        eyebrow="The competition"
        title="One bracket. One £10 entry. Top three share the pot."
        description="World Cup 2026 runs from 11 June through 19 July — 104 matches across group stage and knockouts. Predict every score. The pot grows with every entry."
      />

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {/* Headline card — entry + dates */}
        <div className="relative overflow-hidden rounded-[1.4rem] border border-emerald-300/25 bg-gradient-to-br from-emerald-500/15 via-emerald-400/5 to-transparent px-5 py-6">
          <div className="space-y-4">
            <p className="font-['Barlow_Condensed'] text-3xl font-bold uppercase tracking-[0.02em] text-white">
              World Cup 2026
            </p>

            <div className="grid grid-cols-2 gap-4 border-t border-white/8 pt-4 text-[0.78rem] text-white/65">
              <div>
                <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-white/40">
                  Entry
                </p>
                <p className="mt-1 font-['Barlow_Condensed'] text-3xl font-bold text-white">£10</p>
              </div>
              <div>
                <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-white/40">
                  Format
                </p>
                <p className="mt-1 text-sm leading-snug text-white/85">
                  104 matches<br />Full-time scores only
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-white/8 pt-4 text-[0.78rem] text-white/65">
              <CalendarDays className="h-4 w-4 text-emerald-300" aria-hidden />
              Thu 11 Jun → Sun 19 Jul 2026
            </div>
          </div>
        </div>

        {/* Prize fund mechanics */}
        <div className="rounded-[1.4rem] border border-white/10 bg-black/20 px-5 py-6">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-emerald-300" aria-hidden />
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-white/55">
              How the prize fund works
            </p>
          </div>

          <ul className="mt-4 space-y-3 text-sm leading-6 text-white/75">
            <li className="flex gap-3">
              <Coins className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" aria-hidden />
              <span>
                <span className="font-semibold text-white">75% of entries</span> go to
                the prize fund. The remaining 25% covers operating,
                administration and platform costs.
              </span>
            </li>
            <li className="flex gap-3">
              <Trophy className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" aria-hidden />
              <span>
                Prize fund split{" "}
                <span className="font-semibold text-white">60 / 25 / 15</span>{" "}
                across 1st, 2nd and 3rd. Tied points settle by exact-score count,
                then correct-result count, then even split.
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-6 flex justify-center">
        <Link
          href="/register"
          className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300"
        >
          Sign up — £10 to enter
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </GlassPanel>
  );
}
