/*
Brand reminder — Broadcast Noir Athletics:
League tiers should feel aspirational, premium, and competition-led,
with dark glass surfaces, disciplined highlights, and clear value hierarchy.
*/

import { Crown, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Link } from "wouter";
import { GlassPanel, ScreenFrame, SectionHeader, SmallMeta } from "@/components/predictor10/Primitives";
import { leagueTiers } from "@/lib/mockData";

export default function LeaguesPage() {
  return (
    <ScreenFrame>
      <GlassPanel className="overflow-hidden p-0">
        <div
          className="relative px-4 py-6 sm:px-6 sm:py-8"
          style={{
            backgroundImage:
              "linear-gradient(145deg, rgba(4,10,8,0.92), rgba(4,10,8,0.66)), url(https://d2xsxph8kpxj0f.cloudfront.net/310519663048135071/Hs9KYYBFCMZwearV4cmxdF/predictor10-league-premium-Yy8YonxQa4uJ6aWBgxwEdn.webp)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <SectionHeader
            eyebrow="League tiers"
            title="Choose how premium the round feels"
            description="Each tier is presented as a clean frontend shell now, but already communicates entry cost, pool size, competition status, and where payment will connect later."
          />
        </div>
      </GlassPanel>

      <div className="grid gap-4 xl:grid-cols-2">
        {leagueTiers.map((league, index) => (
          <GlassPanel key={league.id} className="relative overflow-hidden">
            <div className={`absolute inset-0 bg-gradient-to-br ${league.accent} opacity-90`} />
            <div className="relative space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-[0.68rem] uppercase tracking-[0.26em] text-white/45">
                    Tier {index + 1}
                  </p>
                  <h2 className="font-['Barlow_Condensed'] text-4xl font-bold uppercase tracking-[0.02em] text-white">
                    {league.name}
                  </h2>
                  <p className="max-w-md text-sm leading-6 text-white/65">{league.description}</p>
                </div>
                <div className="rounded-[1.3rem] border border-white/10 bg-black/25 px-4 py-3 text-right shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-white/40">Entry</p>
                  <p className="font-['Barlow_Condensed'] text-4xl font-bold text-white">£{league.entry}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SmallMeta label="Players" value={String(league.players)} />
                <SmallMeta label="Pool" value={league.prizePool} />
                <SmallMeta label="Round" value={league.roundDuration} />
                <SmallMeta label="Status" value={league.status} />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4">
                  <Users className="h-5 w-5 text-emerald-300" />
                  <p className="mt-3 font-semibold text-white">{league.tagline}</p>
                  <p className="mt-1 text-sm text-white/55">Strong weekly participation and visible table movement.</p>
                </div>
                <div className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4">
                  <ShieldCheck className="h-5 w-5 text-emerald-300" />
                  <p className="mt-3 font-semibold text-white">Round-ready structure</p>
                  <p className="mt-1 text-sm text-white/55">Prepared for payment confirmation and locked entry states later.</p>
                </div>
                <div className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4">
                  <Sparkles className="h-5 w-5 text-emerald-300" />
                  <p className="mt-3 font-semibold text-white">Aspirational identity</p>
                  <p className="mt-1 text-sm text-white/55">Higher tiers lean more exclusive without turning flashy or noisy.</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href="/cart" className="inline-flex items-center rounded-full border border-emerald-300/20 bg-emerald-400/12 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400/18">
                  Join League
                </Link>
                <Link href="/leaderboard" className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-semibold text-white/82 transition hover:bg-white/10">
                  View Table
                </Link>
                <Link href="/" className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-semibold text-white/82 transition hover:bg-white/10">
                  Enter Round
                </Link>
              </div>
            </div>
          </GlassPanel>
        ))}
      </div>

      <GlassPanel>
        <div className="flex items-start gap-4">
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-100">
            <Crown className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h3 className="font-['Barlow_Condensed'] text-3xl font-bold uppercase text-white">Higher tiers feel more elite by design</h3>
            <p className="max-w-3xl text-sm leading-7 text-white/65">
              The visual treatment becomes more metallic and exclusive as entry rises, but the structure remains consistent so a backend can later attach eligibility logic, actual payment records, round entry windows, and dynamic player counts without redesigning the page.
            </p>
          </div>
        </div>
      </GlassPanel>
    </ScreenFrame>
  );
}
