/*
Brand reminder — Broadcast Noir Athletics:
Leaderboard views should feel competitive and elevated, like a clean standings desk
inside a premium football broadcast package.
*/

import { ArrowDown, ArrowUp, Minus, Trophy } from "lucide-react";
import { Link } from "wouter";
import { GlassPanel, ScreenFrame, SectionHeader } from "@/components/predictor10/Primitives";
import { currentLeague, leaderboardEntries, roundOptions } from "@/lib/mockData";

export default function LeaderboardPage() {
  return (
    <ScreenFrame>
      <GlassPanel>
        <SectionHeader
          eyebrow="Leaderboard"
          title="Round tables built to feel competitive"
          description="Round, month, and season states are represented here so the scoring engine can later update totals automatically without changing the visual model."
        />

        <div className="mt-5 flex flex-wrap gap-3">
          {[
            "Round",
            "Month",
            "Season",
          ].map((tab, index) => (
            <button
              key={tab}
              type="button"
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                index === 0
                  ? "border border-emerald-300/20 bg-emerald-400/12 text-white"
                  : "border border-white/10 bg-white/6 text-white/65 hover:bg-white/10"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_260px]">
          <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-4">
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">League</p>
                <h3 className="font-['Barlow_Condensed'] text-3xl font-bold uppercase text-white">
                  {currentLeague.name}
                </h3>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">Round selector</p>
                <p className="text-sm font-semibold text-white/88">{roundOptions[2]}</p>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-[1.3rem] border border-white/8">
              <div className="grid grid-cols-[60px_1.4fr_80px_80px_80px] bg-white/8 px-4 py-3 text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-white/45">
                <span>Pos</span>
                <span>Player</span>
                <span>Results</span>
                <span>Scores</span>
                <span>Points</span>
              </div>
              <div className="divide-y divide-white/8">
                {leaderboardEntries.map((entry) => {
                  const isTopThree = entry.position <= 3;
                  return (
                    <Link
                      href="/history"
                      key={entry.name}
                      className={`grid grid-cols-[60px_1.4fr_80px_80px_80px] items-center px-4 py-4 transition ${
                        isTopThree ? "bg-white/[0.05] hover:bg-white/[0.08]" : "bg-black/10 hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`font-['Barlow_Condensed'] text-3xl font-bold ${isTopThree ? "text-white" : "text-white/78"}`}>
                          {entry.position}
                        </span>
                        {entry.position === 1 ? <Trophy className="h-4 w-4 text-amber-200" /> : null}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-white">{entry.name}</p>
                          <span className="rounded-full border border-white/10 bg-white/6 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.2em] text-white/55">
                            {entry.streak}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-sm text-white/45">
                          {entry.movement > 0 ? <ArrowUp className="h-3.5 w-3.5 text-emerald-300" /> : null}
                          {entry.movement < 0 ? <ArrowDown className="h-3.5 w-3.5 text-rose-300" /> : null}
                          {entry.movement === 0 ? <Minus className="h-3.5 w-3.5 text-white/35" /> : null}
                          {entry.movement === 0 ? "No movement" : `${Math.abs(entry.movement)} places`}
                        </div>
                      </div>

                      <span className="text-sm font-semibold text-white/86">{entry.correctResults}</span>
                      <span className="text-sm font-semibold text-white/86">{entry.correctScores}</span>
                      <span className="font-['Barlow_Condensed'] text-3xl font-bold text-white">{entry.totalPoints}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {leaderboardEntries.slice(0, 3).map((entry) => (
              <GlassPanel key={entry.position} className="bg-white/5">
                <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">Top {entry.position}</p>
                <h4 className="mt-2 font-['Barlow_Condensed'] text-3xl font-bold uppercase text-white">
                  {entry.name}
                </h4>
                <p className="mt-2 text-sm leading-6 text-white/62">{entry.streak}</p>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">Total points</p>
                    <p className="font-['Barlow_Condensed'] text-4xl font-bold text-white">{entry.totalPoints}</p>
                  </div>
                  <Link href="/history" className="rounded-full border border-emerald-300/20 bg-emerald-400/12 px-4 py-2 text-sm font-semibold text-white">
                    Open history
                  </Link>
                </div>
              </GlassPanel>
            ))}
          </div>
        </div>
      </GlassPanel>
    </ScreenFrame>
  );
}
