/*
Pool detail / Predict (arch §8.5) — CANONICAL screen for the product.
Step placeholder. Real layout (GW tabs, match rows in 4 states, auto-save
footer, late-entry modal) lands in step 2e+.

Reached from Home's "Available tiers" rows and from Predict cards.
*/

import { Link, useRoute } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function PoolDetailPage() {
  const [, params] = useRoute<{ competitionSlug: string; poolId: string }>(
    "/pools/:competitionSlug/:poolId",
  );

  return (
    <div className="space-y-5 px-4 py-7">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 font-['Manrope'] text-[0.78rem] font-semibold text-emerald-300 transition hover:text-emerald-200"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to Home
      </Link>

      <header className="space-y-1.5">
        <p className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.32em] text-emerald-300/70">
          Pool detail
        </p>
        <h1 className="font-['Barlow_Condensed'] text-[1.85rem] font-bold uppercase leading-[1.05] tracking-[0.04em] text-white">
          {params?.competitionSlug?.replace(/-/g, " ") ?? "—"}
        </h1>
      </header>

      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-7 text-center">
        <p className="font-['Barlow_Condensed'] text-[0.86rem] font-bold uppercase tracking-[0.18em] text-white/55">
          Canonical predict screen — coming soon
        </p>
        <p className="mt-2 font-['Manrope'] text-xs text-white/40">
          Pool {params?.poolId?.slice(0, 8) ?? ""}… · arch §8.5
        </p>
        <p className="mt-3 font-['Manrope'] text-[0.7rem] text-white/30">
          Entry flow + GW tabs + match rows + auto-save land in step 2e+.
        </p>
      </div>
    </div>
  );
}
