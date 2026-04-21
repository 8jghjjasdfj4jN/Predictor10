/*
Brand reminder — Broadcast Noir Athletics:
Rules content should feel like premium product guidance, not a legal wall of text:
structured, calm, high-clarity, and subtly competitive.
*/

import { CircleHelp, LockKeyhole, Radar, Target } from "lucide-react";
import { GlassPanel, ScreenFrame, SectionHeader } from "@/components/predictor10/Primitives";
import { rules, syncStatuses } from "@/lib/mockData";

export default function RulesPage() {
  return (
    <ScreenFrame>
      <GlassPanel>
        <SectionHeader
          eyebrow="How it works"
          title="Simple rules. Serious weekly tension."
          description="The MVP explains the game clearly now while leaving room for real scoring, fixture syncing, and payment enforcement once a backend layer is added."
        />

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            {rules.map((rule, index) => (
              <div key={rule} className="flex gap-3 rounded-[1.35rem] border border-white/10 bg-black/20 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-400/10 font-['Barlow_Condensed'] text-xl font-bold text-white">
                  {index + 1}
                </div>
                <p className="pt-1 text-sm leading-7 text-white/72">{rule}</p>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  icon: Target,
                  title: "Scoring logic",
                  detail: "Exact score = 5 points. Correct result = 2 points. Void fixtures return no scoring value.",
                },
                {
                  icon: LockKeyhole,
                  title: "Prediction lock",
                  detail: "Users can edit until the day before kickoff. Locked cards become read-only instantly.",
                },
                {
                  icon: Radar,
                  title: "Season structure",
                  detail: "Rounds bundle multiple gameweeks so users can think in cycles, not single matches only.",
                },
                {
                  icon: CircleHelp,
                  title: "Entry logic",
                  detail: "Payment is required for each round, but late entry still respects the same round price.",
                },
              ].map(({ icon: Icon, title, detail }) => (
                <div key={title} className="rounded-[1.35rem] border border-white/10 bg-white/5 p-4">
                  <Icon className="h-5 w-5 text-emerald-300" />
                  <h3 className="mt-3 font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/60">{detail}</p>
                </div>
              ))}
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.24em] text-emerald-300/70">Future integration notes</p>
              <h3 className="mt-3 font-['Barlow_Condensed'] text-3xl font-bold uppercase text-white">Backend connector assumptions are already surfaced</h3>
              <div className="mt-4 space-y-3">
                {syncStatuses.map((status) => (
                  <div key={status} className="rounded-[1.15rem] border border-white/8 bg-black/20 px-4 py-3 text-sm text-white/65">
                    {status}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </GlassPanel>
    </ScreenFrame>
  );
}
