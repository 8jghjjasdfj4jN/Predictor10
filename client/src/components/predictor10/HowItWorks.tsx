import { GlassPanel, SectionHeader } from "@/components/predictor10/Primitives";

const steps = [
  {
    number: 1,
    title: "Sign up",
    body: "Thirty seconds, email and date of birth. Age verified at sign-up. While we're in test mode there's no payment to set up.",
  },
  {
    number: 2,
    title: "Pick a pool",
    body: "World cup bracket, match-by-match, or both. Enter with the virtual credits we grant you weekly. Edit your picks until kickoff.",
  },
  {
    number: 3,
    title: "Climb the table",
    body: "Five points for an exact score, two for the right result. Live leaderboards, weekly winners, end-of-tournament prizes.",
  },
];

export function HowItWorks() {
  return (
    <GlassPanel>
      <SectionHeader
        eyebrow="How it works"
        title="Three steps. No card needed."
      />

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {steps.map((step) => (
          <div
            key={step.number}
            className="rounded-[1.4rem] border border-white/10 bg-black/20 p-5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-400/10 font-['Barlow_Condensed'] text-xl font-bold text-emerald-300">
              {step.number}
            </div>
            <h3 className="mt-4 font-['Barlow_Condensed'] text-2xl font-semibold uppercase tracking-[0.02em] text-white">
              {step.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-white/65">{step.body}</p>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}
