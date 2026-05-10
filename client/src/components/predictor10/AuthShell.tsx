import { ReactNode } from "react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070f0a] text-white">
      {/* Backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(46,204,113,0.20),transparent_45%),linear-gradient(180deg,#050a07,#070f0a_40%,#070f0a_60%,#050a07)]" />

      {/* Pitch-line decoration */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.05]"
        viewBox="0 0 800 600"
        preserveAspectRatio="xMidYMid slice"
      >
        <rect x="60" y="40" width="680" height="520" fill="none" stroke="#34d379" strokeWidth="2" />
        <rect x="160" y="40" width="480" height="520" fill="none" stroke="#34d379" strokeWidth="1" />
        <circle cx="400" cy="300" r="80" fill="none" stroke="#34d379" strokeWidth="1.5" />
        <circle cx="400" cy="300" r="4" fill="#34d379" />
        <line x1="400" y1="40" x2="400" y2="560" stroke="#34d379" strokeWidth="1" />
      </svg>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md space-y-5">
          <img
            src="/predictor10-logo.svg"
            alt="Predictor10"
            className="mx-auto block h-auto w-full max-w-[300px]"
          />

          <div className="rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:p-8">
            {children}
          </div>

          <div className="rounded-2xl border border-amber-300/22 bg-amber-300/6 px-4 py-3 text-center text-[0.78rem] leading-5 text-amber-100/80">
            <strong className="font-semibold text-amber-200">Test mode:</strong> Free-to-play with virtual credits only. No real money is accepted while we're in test mode.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

export function AuthField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-white/55">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-[0.72rem] text-white/40">{hint}</p>}
      {error && <p className="text-[0.72rem] text-red-300">{error}</p>}
    </div>
  );
}

export const inputClasses =
  "w-full rounded-2xl border border-white/12 bg-white/4 px-4 py-3 text-[0.95rem] text-white placeholder-white/30 outline-none transition focus:border-emerald-300/50 focus:bg-black/25 disabled:opacity-50";
