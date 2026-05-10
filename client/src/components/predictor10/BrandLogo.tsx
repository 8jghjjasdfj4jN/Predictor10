/*
Brand reminder — Broadcast Noir Athletics:
Use the exact user-approved original Predictor10 logo artwork consistently.
The hero logo should dominate the mobile width and still sit cleanly in a centred desktop app shell.
*/

import { cn } from "@/lib/utils";

const APPROVED_LOGO_URL = "/predictor10-logo.svg";

type BrandLogoProps = {
  compact?: boolean;
  className?: string;
};

export function BrandLogo({ compact = false, className }: BrandLogoProps) {
  if (compact) {
    return (
      <div
        className={cn(
          "inline-flex items-center rounded-[1.1rem] border border-white/12 bg-white/6 p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.35)] backdrop-blur-xl",
          className,
        )}
      >
        <img
          src={APPROVED_LOGO_URL}
          alt="Predictor10"
          className="block h-10 w-auto rounded-[0.8rem] object-contain sm:h-11"
        />
      </div>
    );
  }

  return (
    <div className={cn("w-full space-y-3", className)}>
      <span className="block font-['Manrope'] text-[0.62rem] font-semibold uppercase tracking-[0.34em] text-emerald-300/72">
        Approved brand mark
      </span>
      <div className="w-full rounded-[1.6rem] border border-white/12 bg-white/6 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:p-3">
        <img
          src={APPROVED_LOGO_URL}
          alt="Predictor10 premium football prediction app logo"
          className="block h-auto w-full rounded-[1.15rem] object-contain"
        />
      </div>
      <div className="leading-none">
        <span className="block font-['Barlow_Condensed'] text-[1.4rem] font-semibold uppercase tracking-[0.16em] text-white/92 sm:text-[1.6rem]">
          Predictor10
        </span>
        <span className="mt-1.5 block font-['Manrope'] text-[0.68rem] uppercase tracking-[0.42em] text-white/55 sm:text-[0.72rem]">
          Premium football prediction app
        </span>
      </div>
    </div>
  );
}
