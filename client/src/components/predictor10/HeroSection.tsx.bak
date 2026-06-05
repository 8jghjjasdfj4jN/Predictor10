import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { appMeta } from "@/lib/mockData";

export function HeroSection() {
  return (
    <div className="relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-4 py-10 text-center backdrop-blur-xl sm:px-8 sm:py-14">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(46,204,113,0.22),transparent_42%),radial-gradient(circle_at_85%_90%,rgba(46,204,113,0.08),transparent_32%)]" />

      <div className="relative space-y-7">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-white/65">
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 rounded-full bg-emerald-400/50 motion-safe:animate-ping" />
              <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Live round window · {appMeta.syncedAt}
          </span>
        </div>

        <img
          src="/predictor10-logo.svg"
          alt="Predictor10"
          className="mx-auto block h-auto w-full max-w-[640px]"
        />

        <h1 className="mx-auto max-w-3xl font-['Barlow_Condensed'] text-4xl font-bold uppercase tracking-[0.01em] text-white sm:text-5xl lg:text-6xl">
          Predict the matches. Climb the table.{" "}
          <span className="text-emerald-300">Settle who really knows football.</span>
        </h1>

        <p className="mx-auto max-w-xl text-base leading-7 text-white/70 sm:text-lg">
          Free-to-play prediction pools across the world cup and the premier league. Compete weekly, pick the entire bracket, or both — virtual credits, real bragging rights.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300"
          >
            Get started — free
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#leagues"
            className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-6 py-3 text-sm font-semibold text-white/85 transition hover:border-white/20 hover:bg-white/10"
          >
            See active pools
          </a>
        </div>
      </div>
    </div>
  );
}
