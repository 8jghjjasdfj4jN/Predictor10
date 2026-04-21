/*
Brand reminder — Broadcast Noir Athletics:
History should feel like a clean post-match stat breakdown:
read-only, analytical, premium, and tightly structured.
*/

import { CheckCircle2, CircleDot, Filter, XCircle } from "lucide-react";
import { GlassPanel, ScreenFrame, SectionHeader } from "@/components/predictor10/Primitives";
import { featuredHistory, roundOptions } from "@/lib/mockData";

export default function HistoryPage() {
  return (
    <ScreenFrame>
      <GlassPanel>
        <SectionHeader
          eyebrow="Player prediction history"
          title={featuredHistory.playerName}
          description="This view is intentionally read-only. It is already structured for round-based auditability, historical scoring, and later player drill-downs from the leaderboard."
        />

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "League", value: featuredHistory.league },
            { label: "Round", value: featuredHistory.round },
            { label: "Season", value: featuredHistory.season },
            { label: "Rank", value: featuredHistory.summary.rank },
          ].map((item) => (
            <div key={item.label} className="rounded-[1.35rem] border border-white/10 bg-black/20 px-4 py-4">
              <p className="text-[0.68rem] uppercase tracking-[0.22em] text-white/40">{item.label}</p>
              <p className="mt-2 text-base font-semibold text-white">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            { label: "Total points", value: featuredHistory.summary.points },
            { label: "Correct results", value: featuredHistory.summary.correctResults },
            { label: "Exact scores", value: featuredHistory.summary.correctScores },
          ].map((item) => (
            <div key={item.label} className="rounded-[1.45rem] border border-white/10 bg-white/5 p-4">
              <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">{item.label}</p>
              <p className="mt-2 font-['Barlow_Condensed'] text-4xl font-bold text-white">{item.value}</p>
            </div>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader
            eyebrow="Read-only breakdown"
            title="Every fixture, every point"
            description="Filters are presented as frontend controls now and can later drive player, season, and round parameters."
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-semibold text-white/82">
              <Filter className="h-4 w-4" />
              {roundOptions[1]}
            </button>
            <button type="button" className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-semibold text-white/82">
              {featuredHistory.season}
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {featuredHistory.rows.map((row) => (
            <article key={row.fixture} className="rounded-[1.45rem] border border-white/8 bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-white">{row.fixture}</h3>
                  <p className="mt-1 text-sm text-white/50">Prediction: {row.prediction}</p>
                </div>
                <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-sm font-semibold text-white/82">
                  Actual: {row.result}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_110px]">
                <div className="rounded-[1.2rem] border border-white/8 bg-white/5 p-4">
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-white/40">Correct result</p>
                  <div className="mt-3 flex items-center gap-2">
                    {row.gotResult ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                    ) : (
                      <XCircle className="h-5 w-5 text-rose-300" />
                    )}
                    <p className="font-semibold text-white">{row.gotResult ? "Achieved" : "No points"}</p>
                  </div>
                </div>
                <div className="rounded-[1.2rem] border border-white/8 bg-white/5 p-4">
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-white/40">Exact score</p>
                  <div className="mt-3 flex items-center gap-2">
                    {row.gotScore ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                    ) : (
                      <CircleDot className="h-5 w-5 text-white/35" />
                    )}
                    <p className="font-semibold text-white">{row.gotScore ? "5-point hit" : "Not exact"}</p>
                  </div>
                </div>
                <div className="rounded-[1.2rem] border border-white/8 bg-white/5 p-4 text-center">
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-white/40">Points</p>
                  <p className="mt-2 font-['Barlow_Condensed'] text-4xl font-bold text-white">{row.points}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </GlassPanel>
    </ScreenFrame>
  );
}
