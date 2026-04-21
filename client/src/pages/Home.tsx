/*
Brand reminder — Broadcast Noir Athletics:
This page should feel like a premium football broadcast control surface:
editorial hero, disciplined spacing, refined green highlights, and crisp score-entry cards.
*/

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, CalendarRange, CheckCheck, Clock4, Layers3, Wallet } from "lucide-react";
import { BrandLogo } from "@/components/predictor10/BrandLogo";
import { ActionChip, GlassPanel, ScreenFrame, SectionHeader, SmallMeta, StatusPill, TeamBadge } from "@/components/predictor10/Primitives";
import { appMeta, currentFixtures, currentLeague, leagueTiers, recentResults, upcomingFixtures } from "@/lib/mockData";

export default function Home() {
  const [selectedLeagueId, setSelectedLeagueId] = useState(currentLeague.id);
  const [predictions, setPredictions] = useState(() =>
    currentFixtures.map((fixture) => ({
      id: fixture.id,
      home: fixture.homePredicted,
      away: fixture.awayPredicted,
    })),
  );

  const selectedLeague = useMemo(
    () => leagueTiers.find((league) => league.id === selectedLeagueId) ?? currentLeague,
    [selectedLeagueId],
  );

  return (
    <ScreenFrame className="space-y-6">
      <GlassPanel className="overflow-hidden p-0">
        <div
          className="relative overflow-hidden rounded-[1.55rem] border border-white/8 bg-cover bg-center"
          style={{
            backgroundImage:
              "linear-gradient(135deg, rgba(4,10,8,0.92), rgba(4,10,8,0.62)), url(https://d2xsxph8kpxj0f.cloudfront.net/310519663048135071/Hs9KYYBFCMZwearV4cmxdF/predictor10-hero-broadcast-nHcHns5qFHwELpPspEiwwz.webp)",
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(29,185,84,0.22),transparent_38%)]" />
          <div className="relative space-y-7 px-4 py-6 sm:px-6 sm:py-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-emerald-200">
                Live round window
              </span>
              <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-white/70">
                {appMeta.syncedAt}
              </span>
            </div>

            <BrandLogo />

            <div className="grid gap-5 lg:grid-cols-[1.25fr_0.9fr] lg:items-end">
              <div className="space-y-4">
                <div className="space-y-3">
                  <p className="max-w-xl text-base leading-7 text-white/72">
                    A mobile-first football prediction app that feels closer to premium match coverage than a prototype — weekly rounds, polished score entry, and league competition built to plug into live data later.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <ActionChip label="Save predictions" />
                    <ActionChip label="Submit round" />
                    <ActionChip label="Continue to payment" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <SmallMeta label="Season" value={appMeta.season} />
                  <SmallMeta label="Current round" value={`Round ${appMeta.currentRound}`} />
                  <SmallMeta label="Gameweeks" value={appMeta.currentGameweekBand} />
                  <SmallMeta label="Deadline" value={appMeta.nextDeadline} />
                </div>
              </div>

              <div className="rounded-[1.45rem] border border-white/10 bg-black/30 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.72rem] uppercase tracking-[0.24em] text-white/45">Selected tier</p>
                    <h3 className="font-['Barlow_Condensed'] text-3xl font-bold uppercase tracking-[0.03em] text-white">
                      {selectedLeague.name}
                    </h3>
                  </div>
                  <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-right">
                    <p className="text-[0.68rem] uppercase tracking-[0.22em] text-emerald-100/70">Round entry</p>
                    <p className="font-['Barlow_Condensed'] text-3xl font-bold text-white">£{selectedLeague.entry}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-white/65">{selectedLeague.description}</p>
                <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <SmallMeta label="Players" value={String(selectedLeague.players)} />
                  <SmallMeta label="Pool" value={selectedLeague.prizePool} />
                  <SmallMeta label="Status" value={selectedLeague.status} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel>
        <SectionHeader
          eyebrow="Competition tier"
          title="Switch your league before you lock"
          description="The MVP keeps league switching simple now, but the layout is structured for round entry logic, payment linking, and future account eligibility checks."
        />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {leagueTiers.map((league) => {
            const active = league.id === selectedLeagueId;
            return (
              <button
                key={league.id}
                type="button"
                onClick={() => setSelectedLeagueId(league.id)}
                className={`relative overflow-hidden rounded-[1.4rem] border px-4 py-4 text-left transition ${
                  active
                    ? "border-emerald-300/30 bg-emerald-400/10 shadow-[0_18px_45px_rgba(19,71,44,0.35)]"
                    : "border-white/10 bg-black/20 hover:border-white/16 hover:bg-white/6"
                }`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${league.accent} opacity-90`} />
                <div className="relative space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-['Barlow_Condensed'] text-2xl font-bold uppercase text-white">
                        {league.name}
                      </p>
                      <p className="text-sm text-white/60">{league.tagline}</p>
                    </div>
                    <StatusPill state={league.status === "Limited" || league.status === "Closing" ? "Locked" : "Open"} />
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[0.68rem] uppercase tracking-[0.22em] text-white/45">Entry</p>
                      <p className="font-['Barlow_Condensed'] text-4xl font-bold text-white">£{league.entry}</p>
                    </div>
                    <p className="text-right text-sm text-white/65">{league.prizePool}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </GlassPanel>

      <GlassPanel>
        <SectionHeader
          eyebrow="Round 3 fixtures"
          title="Set your scorelines"
          description={appMeta.lockNotice}
          action={
            <Link
              href="/cart"
              className="hidden items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/12 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400/18 sm:inline-flex"
            >
              Continue to payment
              <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />

        <div className="mt-5 space-y-4">
          {currentFixtures.map((fixture, index) => {
            const prediction = predictions[index];
            return (
              <article
                key={fixture.id}
                className="rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(0,0,0,0.18),rgba(255,255,255,0.03))] p-4 shadow-[0_14px_40px_rgba(0,0,0,0.22)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">
                      Gameweek {fixture.gameweek} · {fixture.venue}
                    </p>
                    <p className="mt-1 text-sm font-medium text-white/70">{fixture.kickoffLabel}</p>
                  </div>
                  <StatusPill state={fixture.state} />
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
                  <div className="flex items-center gap-3">
                    <TeamBadge abbr={fixture.homeAbbr} gradient={fixture.homeColor} />
                    <div>
                      <p className="font-['Barlow_Condensed'] text-2xl font-semibold uppercase tracking-[0.02em] text-white">
                        {fixture.homeTeam}
                      </p>
                      <p className="text-sm text-white/45">Home</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-3 rounded-[1.4rem] border border-white/8 bg-black/20 px-4 py-4">
                    <label className="space-y-1 text-center">
                      <span className="block text-[0.68rem] uppercase tracking-[0.22em] text-white/45">Home</span>
                      <input
                        type="number"
                        min={0}
                        max={9}
                        disabled={fixture.state === "Locked" || fixture.state === "Void" || fixture.state === "Completed"}
                        value={prediction.home ?? ""}
                        onChange={(event) => {
                          const next = [...predictions];
                          next[index] = {
                            ...next[index],
                            home: event.target.value === "" ? null : Number(event.target.value),
                          };
                          setPredictions(next);
                        }}
                        className="h-14 w-14 rounded-2xl border border-white/10 bg-white/6 text-center text-2xl font-bold text-white outline-none transition focus:border-emerald-300/35 focus:bg-black/25 disabled:opacity-45"
                      />
                    </label>
                    <span className="font-['Barlow_Condensed'] text-4xl text-white/35">:</span>
                    <label className="space-y-1 text-center">
                      <span className="block text-[0.68rem] uppercase tracking-[0.22em] text-white/45">Away</span>
                      <input
                        type="number"
                        min={0}
                        max={9}
                        disabled={fixture.state === "Locked" || fixture.state === "Void" || fixture.state === "Completed"}
                        value={prediction.away ?? ""}
                        onChange={(event) => {
                          const next = [...predictions];
                          next[index] = {
                            ...next[index],
                            away: event.target.value === "" ? null : Number(event.target.value),
                          };
                          setPredictions(next);
                        }}
                        className="h-14 w-14 rounded-2xl border border-white/10 bg-white/6 text-center text-2xl font-bold text-white outline-none transition focus:border-emerald-300/35 focus:bg-black/25 disabled:opacity-45"
                      />
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-3 lg:justify-self-end">
                    <div className="text-right">
                      <p className="font-['Barlow_Condensed'] text-xl font-semibold uppercase text-white">{fixture.awayTeam}</p>
                      <p className="text-sm text-white/45">Away</p>
                    </div>
                    <TeamBadge abbr={fixture.awayAbbr} gradient={fixture.awayColor} />
                  </div>
                </div>

                {fixture.note ? (
                  <div className="mt-4 rounded-2xl border border-white/8 bg-black/18 px-4 py-3 text-sm text-white/58">
                    {fixture.note}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: CheckCheck, label: "Save predictions" },
            { icon: Clock4, label: "Edit predictions" },
            { icon: Layers3, label: "Submit round" },
            { icon: Wallet, label: "Continue to payment" },
          ].map(({ icon: Icon, label }) => (
            <button
              key={label}
              type="button"
              className="flex items-center justify-between rounded-[1.35rem] border border-white/10 bg-white/6 px-4 py-4 text-left transition hover:border-emerald-300/30 hover:bg-white/9"
            >
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.22em] text-white/45">Action</p>
                <p className="mt-1 font-semibold text-white">{label}</p>
              </div>
              <Icon className="h-5 w-5 text-emerald-300" />
            </button>
          ))}
        </div>
      </GlassPanel>

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassPanel>
          <SectionHeader
            eyebrow="Completed results"
            title="Recent scoring context"
            description="Historical results and outcome states are already represented so the future scoring engine has obvious UI targets."
          />
          <div className="mt-5 space-y-3">
            {recentResults.map((fixture) => (
              <div key={fixture.id} className="rounded-[1.35rem] border border-white/8 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{fixture.homeTeam} vs {fixture.awayTeam}</p>
                    <p className="text-sm text-white/45">{fixture.kickoffLabel}</p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/8 px-3 py-1 font-['Barlow_Condensed'] text-2xl text-white">
                    {fixture.actualHome}–{fixture.actualAway}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel>
          <SectionHeader
            eyebrow="Next on the calendar"
            title="Upcoming fixtures"
            description="The app already communicates syncing, scheduling awareness, and round-by-round fixture planning."
            action={<Link href="/fixtures" className="text-sm font-semibold text-emerald-300">Open fixtures</Link>}
          />
          <div className="mt-5 space-y-3">
            {upcomingFixtures.map((fixture) => (
              <div key={fixture.id} className="rounded-[1.35rem] border border-white/8 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{fixture.homeTeam} vs {fixture.awayTeam}</p>
                    <p className="mt-1 flex items-center gap-2 text-sm text-white/45">
                      <CalendarRange className="h-4 w-4" />
                      {fixture.kickoffLabel}
                    </p>
                  </div>
                  <StatusPill state={fixture.state} />
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>
    </ScreenFrame>
  );
}
