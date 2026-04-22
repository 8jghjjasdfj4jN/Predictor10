/*
Brand reminder — Broadcast Noir Athletics:
These primitives should feel like broadcast overlays translated into mobile UI:
sharp hierarchy, dark translucent surfaces, refined emerald energy, elegant restraint.
*/

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ArrowUpRight, Clock3 } from "lucide-react";
import type { FixtureState } from "@/lib/mockData";

export function ScreenFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("container mx-auto max-w-[1240px] space-y-5 overflow-x-hidden px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8", className)}>{children}</section>
  );
}

export function GlassPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.04))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="space-y-2">
        <p className="font-['Manrope'] text-[0.68rem] font-semibold uppercase tracking-[0.34em] text-emerald-300/75">
          {eyebrow}
        </p>
        <div className="space-y-1">
          <h2 className="font-['Barlow_Condensed'] text-3xl font-bold uppercase tracking-[0.02em] text-white sm:text-4xl">
            {title}
          </h2>
          {description ? (
            <p className="max-w-2xl text-sm leading-6 text-white/60">{description}</p>
          ) : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export function TeamBadge({
  abbr,
  gradient,
  className = "",
}: {
  abbr: string;
  gradient: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br text-sm font-bold uppercase tracking-[0.14em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",
        gradient,
        className,
      )}
    >
      {abbr}
    </span>
  );
}

const stateStyles: Record<FixtureState, string> = {
  Open: "bg-emerald-400/12 text-emerald-200 ring-1 ring-emerald-300/20",
  Locked: "bg-amber-400/12 text-amber-100 ring-1 ring-amber-300/20",
  Submitted: "bg-sky-400/12 text-sky-100 ring-1 ring-sky-300/20",
  Void: "bg-zinc-400/12 text-zinc-200 ring-1 ring-zinc-300/10",
  Completed: "bg-white/10 text-white ring-1 ring-white/10",
  Syncing: "bg-fuchsia-400/12 text-fuchsia-100 ring-1 ring-fuchsia-300/20",
};

export function StatusPill({ state }: { state: FixtureState }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em]",
        stateStyles[state],
      )}
    >
      {state === "Syncing" ? <Clock3 className="h-3.5 w-3.5" /> : null}
      {state}
    </span>
  );
}

export function ScoreBox({ value }: { value: number | null }) {
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-black/25 text-2xl font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      {value ?? "-"}
    </div>
  );
}

export function SmallMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
      <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">{label}</p>
      <p className="text-sm font-semibold text-white/88">{value}</p>
    </div>
  );
}

export function ActionChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-white/70">
      {label}
      <ArrowUpRight className="h-3.5 w-3.5" />
    </span>
  );
}
