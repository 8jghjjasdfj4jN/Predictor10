/*
Brand reminder — Broadcast Noir Athletics:
Use plaque-like composition, premium contrast, dark emerald atmosphere,
competitive typography, and elegant football substitutions for the brandmark.
*/

import { cn } from "@/lib/utils";

type BrandLogoProps = {
  compact?: boolean;
  className?: string;
};

function FootballGlyph({ className = "" }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.98),rgba(240,245,244,0.95)_48%,rgba(178,189,186,0.92)_100%)] shadow-[0_6px_18px_rgba(0,0,0,0.35)]",
        className,
      )}
      aria-hidden="true"
    >
      <span className="absolute h-2.5 w-2.5 rounded-full bg-zinc-900" />
      <span className="absolute left-[18%] top-[20%] h-2.5 w-2.5 rounded-[35%] bg-zinc-900" />
      <span className="absolute right-[18%] top-[20%] h-2.5 w-2.5 rounded-[35%] bg-zinc-900" />
      <span className="absolute bottom-[15%] left-[22%] h-2.5 w-2.5 rounded-[35%] bg-zinc-900" />
      <span className="absolute bottom-[15%] right-[22%] h-2.5 w-2.5 rounded-[35%] bg-zinc-900" />
      <span className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/20" />
    </span>
  );
}

export function BrandLogo({ compact = false, className }: BrandLogoProps) {
  if (compact) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3 py-2 shadow-[0_16px_48px_rgba(0,0,0,0.35)] backdrop-blur-xl",
          className,
        )}
      >
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200/20 bg-[radial-gradient(circle_at_30%_30%,rgba(30,56,45,0.95),rgba(10,23,17,0.98))] shadow-[0_0_30px_rgba(29,185,84,0.18)]">
          <span className="font-['Barlow_Condensed'] text-2xl font-bold tracking-tight text-white">
            P1
          </span>
          <FootballGlyph className="-ml-1 h-3.5 w-3.5 border-white/30" />
        </div>
        <div className="leading-none">
          <span className="block font-['Barlow_Condensed'] text-xl font-semibold uppercase tracking-[0.18em] text-white/96">
            Predictor10
          </span>
          <span className="mt-1 block font-['Manrope'] text-[0.58rem] uppercase tracking-[0.26em] text-white/42">
            Weekly football predictions
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("inline-flex flex-col gap-2", className)}>
      <span className="pl-1 font-['Manrope'] text-[0.62rem] font-semibold uppercase tracking-[0.34em] text-emerald-300/72">
        Predictor10 brand lockup
      </span>
      <div className="inline-flex items-center overflow-hidden rounded-full border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.03))] p-1 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-xl">
        <div className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-[radial-gradient(circle_at_25%_15%,rgba(35,73,57,0.96),rgba(8,19,14,0.98)_65%)] px-4 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <span className="font-['Barlow_Condensed'] text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Predict
          </span>
          <FootballGlyph className="mx-0.5 h-8 w-8 sm:h-10 sm:w-10" />
          <span className="font-['Barlow_Condensed'] text-4xl font-bold tracking-tight text-white sm:text-5xl">
            r1
          </span>
          <FootballGlyph className="ml-1 h-9 w-9 sm:h-11 sm:w-11" />
        </div>
      </div>
      <div className="pl-1 leading-none">
        <span className="block font-['Barlow_Condensed'] text-lg font-semibold uppercase tracking-[0.18em] text-white/90">
          Predictor10
        </span>
        <span className="mt-1 block font-['Manrope'] text-[0.68rem] uppercase tracking-[0.42em] text-white/55">
          Premium football prediction app
        </span>
      </div>
    </div>
  );
}
