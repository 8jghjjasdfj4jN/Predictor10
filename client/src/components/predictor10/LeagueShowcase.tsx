import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { GlassPanel, SectionHeader } from "@/components/predictor10/Primitives";
import { leagueTiers } from "@/lib/mockData";

export function LeagueShowcase() {
  return (
    <GlassPanel>
      <SectionHeader
        eyebrow="Competition tiers"
        title="Pick your level. Same rules, different stakes."
        description="Five tiers from casual entry to the elite leaderboard. While we're in test mode all tiers are free to play with virtual credits. Real-money entry switches on at licence grant."
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {leagueTiers.map((league) => (
          <div
            key={league.id}
            className="relative overflow-hidden rounded-[1.4rem] border border-white/10 bg-black/20 px-4 py-5 transition hover:border-white/16 hover:bg-white/5"
          >
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${league.accent} opacity-90`} />
            <div className="relative space-y-3">
              <div>
                <p className="font-['Barlow_Condensed'] text-2xl font-bold uppercase tracking-[0.02em] text-white">
                  {league.name}
                </p>
                <p className="text-[0.78rem] text-white/55">{league.tagline}</p>
              </div>

              <div>
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-white/40">
                  Round entry
                </p>
                <p className="font-['Barlow_Condensed'] text-4xl font-bold text-white">£{league.entry}</p>
              </div>

              <div className="flex items-center justify-between border-t border-white/8 pt-3 text-[0.78rem] text-white/55">
                <span>{league.players} players</span>
                <span>
                  <span className="font-semibold text-white/85">£{league.entry * league.players}</span> pool
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300"
        >
          Sign up to enter
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </GlassPanel>
  );
}
