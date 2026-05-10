import { GlassPanel, SectionHeader } from "@/components/predictor10/Primitives";
import { leaderboardEntries } from "@/lib/mockData";

export function LeaderboardPreview() {
  const topFive = leaderboardEntries.slice(0, 5);

  return (
    <GlassPanel>
      <SectionHeader
        eyebrow="Live leaderboard"
        title="Premier ten · gameweek 35"
        description="Real-time table from the public premier league pool. After you sign up you'll see your own row."
      />

      <div className="mt-6 overflow-hidden rounded-[1.4rem] border border-white/10 bg-black/30">
        <div className="grid grid-cols-[60px_1fr_100px_80px] border-b border-white/8 bg-white/3 px-5 py-3 text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-white/40">
          <span>#</span>
          <span>Player</span>
          <span className="text-right">Exact</span>
          <span className="text-right">Pts</span>
        </div>

        {topFive.map((row) => (
          <div
            key={row.position}
            className="grid grid-cols-[60px_1fr_100px_80px] items-center border-b border-white/5 px-5 py-3 last:border-b-0"
          >
            <span
              className={`font-['Barlow_Condensed'] text-2xl font-bold ${
                row.position <= 3 ? "text-emerald-300" : "text-white/85"
              }`}
            >
              {row.position}
            </span>
            <span className="text-sm font-semibold text-white">{row.name}</span>
            <span className="text-right text-sm text-white/55">
              {row.correctScores} exact
            </span>
            <span className="text-right font-['Barlow_Condensed'] text-2xl font-bold text-white">
              {row.totalPoints}
            </span>
          </div>
        ))}

        <div className="px-5 py-2 text-center text-[0.6rem] font-semibold uppercase tracking-[0.32em] text-white/30">
          · · ·
        </div>

        <div className="grid grid-cols-[60px_1fr_100px_80px] items-center border-y border-emerald-300/25 bg-emerald-400/8 px-5 py-3">
          <span className="font-['Barlow_Condensed'] text-2xl font-bold text-emerald-300">51</span>
          <span className="text-sm font-semibold text-emerald-200">You — sign up to play</span>
          <span className="text-right text-sm text-emerald-200/55">—</span>
          <span className="text-right font-['Barlow_Condensed'] text-2xl font-bold text-emerald-300">—</span>
        </div>
      </div>
    </GlassPanel>
  );
}
