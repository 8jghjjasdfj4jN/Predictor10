/*
Brand reminder — Broadcast Noir Athletics:
Fixtures and results should feel like an internal football data hub:
clean, confident, mobile-first, and ready for live data syncing later.
*/

import { CalendarClock, History, Rows3 } from "lucide-react";
import { GlassPanel, ScreenFrame, SectionHeader, StatusPill } from "@/components/predictor10/Primitives";
import { currentFixtures, recentResults, upcomingFixtures } from "@/lib/mockData";

export default function FixturesPage() {
  return (
    <ScreenFrame>
      <GlassPanel>
        <SectionHeader
          eyebrow="Fixtures & results"
          title="A premium football data view inside the product"
          description="Upcoming fixtures, completed scores, and round-level visibility are already modeled so the later football-data connector can map directly into these states."
        />

        <div className="mt-5 flex flex-wrap gap-3">
          {[
            { label: "Upcoming Fixtures", icon: CalendarClock, active: true },
            { label: "Results", icon: History, active: false },
            { label: "Round View", icon: Rows3, active: false },
          ].map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              type="button"
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "border border-emerald-300/20 bg-emerald-400/12 text-white"
                  : "border border-white/10 bg-white/6 text-white/65 hover:bg-white/10"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </GlassPanel>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <GlassPanel>
          <SectionHeader
            eyebrow="Upcoming"
            title="Next fixtures"
            description="Filtered by round and gameweek in the final connected version."
          />
          <div className="mt-5 space-y-3">
            {upcomingFixtures.map((fixture) => (
              <div key={fixture.id} className="rounded-[1.35rem] border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{fixture.homeTeam} vs {fixture.awayTeam}</p>
                    <p className="mt-1 text-sm text-white/50">{fixture.kickoffLabel} · Gameweek {fixture.gameweek}</p>
                  </div>
                  <StatusPill state={fixture.state} />
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel>
          <SectionHeader
            eyebrow="Completed"
            title="Recent results"
            description="Results are shown in a simple structure ready for automatic points comparison."
          />
          <div className="mt-5 space-y-3">
            {recentResults.map((fixture) => (
              <div key={fixture.id} className="rounded-[1.35rem] border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{fixture.homeTeam} vs {fixture.awayTeam}</p>
                    <p className="mt-1 text-sm text-white/50">{fixture.kickoffLabel}</p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/8 px-4 py-1 font-['Barlow_Condensed'] text-2xl text-white">
                    {fixture.actualHome}–{fixture.actualAway}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>

      <GlassPanel>
        <SectionHeader
          eyebrow="Round view"
          title="Current round status map"
          description="Open, locked, syncing, void, and submitted states are surfaced together so the eventual backend logic has visible anchors throughout the interface."
        />

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {currentFixtures.map((fixture) => (
            <div key={fixture.id} className="rounded-[1.3rem] border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{fixture.homeAbbr} vs {fixture.awayAbbr}</p>
                  <p className="mt-1 text-sm text-white/48">{fixture.kickoffLabel}</p>
                </div>
                <StatusPill state={fixture.state} />
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>
    </ScreenFrame>
  );
}
