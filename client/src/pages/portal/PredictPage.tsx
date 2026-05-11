/*
Predict (arch §8.2). Lists every open entry the user holds, grouped by close
time. Each card deep-links to /pools/:competitionSlug/:poolId. Filled in a
later step.
*/

export default function PredictPage() {
  return (
    <div className="px-4 py-6">
      <div className="space-y-1">
        <p className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.32em] text-emerald-300/70">
          Predict
        </p>
        <h1 className="font-['Barlow_Condensed'] text-[1.85rem] font-bold uppercase leading-[1.05] tracking-[0.04em] text-white">
          Your open entries
        </h1>
        <p className="text-sm text-white/55">
          Open Rounds you've entered, ordered by deadline. Tap a card to predict.
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
        <p className="font-['Barlow_Condensed'] text-[0.78rem] font-bold uppercase tracking-[0.22em] text-white/40">
          Step placeholder
        </p>
        <p className="mt-2 text-xs text-white/40">
          Closing soon · This Round — arch §8.2
        </p>
      </div>
    </div>
  );
}
