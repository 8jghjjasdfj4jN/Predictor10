/*
Pools landing (arch §8.3). Competition picker (PL · Championship) + currently-
relevant pools across all competitions. Per-competition view at
/pools/:competitionSlug, pool detail at /pools/:competitionSlug/:poolId — both
land in step 3.
*/

export default function PoolsPage() {
  return (
    <div className="px-4 py-6">
      <div className="space-y-1">
        <p className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.32em] text-emerald-300/70">
          Pools
        </p>
        <h1 className="font-['Barlow_Condensed'] text-[1.85rem] font-bold uppercase leading-[1.05] tracking-[0.04em] text-white">
          Browse open pools
        </h1>
        <p className="text-sm text-white/55">
          Premier League · Championship. Five tiers per Round, one stake covers the lot.
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
        <p className="font-['Barlow_Condensed'] text-[0.78rem] font-bold uppercase tracking-[0.22em] text-white/40">
          Step 3 placeholder
        </p>
        <p className="mt-2 text-xs text-white/40">
          Competition picker · Pool list — arch §8.3 / §8.4
        </p>
      </div>
    </div>
  );
}
