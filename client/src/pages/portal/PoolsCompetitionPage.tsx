/*
Pools by competition (arch §8.4).

Reached from /pools or directly via URL. Shows one competition's current
Round and its 5 tier pools as a flat list. Each row links to the canonical
Pool detail / Predict screen at /pools/:slug/:poolId. Entered rows are
visually distinct so the user can see at a glance which tiers they're in
already.

Reuses /api/competitions (filtered client-side by slug) and /api/entries/me
(filtered by competitionId) — no new server endpoints.

The wireframe's "Live now" strip and "Round N+1 · opens Mon" preview both
depend on infra not built yet; they land in later steps.

404 cases (slug doesn't match any competition with an open Round):
  - "Between seasons" copy with a link back to /pools.
*/

import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import {
  AlarmClock,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchCompetitions,
  fetchMyEntries,
  type Competition,
  type Pool,
  type UserEntry,
} from "@/lib/portal-api";

// ─── Formatters ──────────────────────────────────────────────────────────

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return DATE_FMT.format(new Date(iso));
}

function formatFee(decimal: string): string {
  const num = parseFloat(decimal);
  return `£${num % 1 === 0 ? num.toFixed(0) : num.toFixed(2)}`;
}

function formatMatchdayRange(matchdays: number[], label: "GW" | "MD"): string {
  if (matchdays.length === 0) return "";
  const first = matchdays[0];
  const last = matchdays[matchdays.length - 1];
  return matchdays.length === 1 ? `${label} ${first}` : `${label}s ${first}-${last}`;
}

function formatEntryCount(n: number): string {
  if (n === 0) return "No entries yet";
  if (n === 1) return "1 entry";
  return `${n.toLocaleString("en-GB")} entries`;
}

// ─── Components ──────────────────────────────────────────────────────────

function BackLink() {
  return (
    <Link
      href="/pools"
      className={cn(
        "inline-flex items-center gap-1.5 font-['Manrope'] text-[0.78rem] font-semibold",
        "text-emerald-300 transition hover:text-emerald-200",
        "outline-none focus-visible:underline",
      )}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Pools
    </Link>
  );
}

function RoundHeader({ competition }: { competition: Competition }) {
  const round = competition.currentRound;
  const lateEntryCloseAt = competition.pools[0]?.closesAt;
  const now = Date.now();
  const lateEntryOpen = !!lateEntryCloseAt && new Date(lateEntryCloseAt).getTime() > now;

  return (
    <header className="space-y-2">
      <p className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.32em] text-emerald-300/70">
        {competition.name}
      </p>
      <h1 className="font-['Barlow_Condensed'] text-[2rem] font-extrabold uppercase leading-[0.95] tracking-[0.02em] text-white sm:text-[2.4rem]">
        {round.name}
      </h1>
      <p className="font-['Manrope'] text-[0.82rem] text-white/55">
        {formatMatchdayRange(round.matchdays, round.matchdayLabel)}
        {round.endDate && (
          <>
            <span className="mx-1.5 text-white/30">·</span>
            Round ends {formatDate(round.endDate)}
          </>
        )}
      </p>

      {lateEntryCloseAt && (
        <div
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
            "font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.18em]",
            lateEntryOpen
              ? "border border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
              : "border border-amber-300/30 bg-amber-400/10 text-amber-200",
          )}
        >
          {lateEntryOpen ? (
            <>
              <AlarmClock className="h-3 w-3" aria-hidden />
              <span>Late entry closes {formatDate(lateEntryCloseAt)}</span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-3 w-3" aria-hidden />
              <span>Late entry closed {formatDate(lateEntryCloseAt)}</span>
            </>
          )}
        </div>
      )}
    </header>
  );
}

function TierRow({
  pool,
  competitionSlug,
  myEntry,
}: {
  pool: Pool;
  competitionSlug: string;
  myEntry: UserEntry | undefined;
}) {
  const entered = myEntry !== undefined;
  return (
    <Link
      href={`/pools/${competitionSlug}/${pool.id}`}
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5 transition",
        "border outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
        entered
          ? "border-emerald-400/30 bg-emerald-400/[0.06] hover:border-emerald-300/50 hover:bg-emerald-400/[0.09]"
          : "border-white/10 bg-white/[0.03] hover:border-emerald-300/25 hover:bg-emerald-400/[0.04]",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {entered && (
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-300" aria-hidden />
        )}
        <div className="min-w-0 space-y-0.5">
          <p className="truncate font-['Barlow_Condensed'] text-[1.05rem] font-bold uppercase tracking-[0.06em] text-white">
            {pool.tier.name}
          </p>
          <p className="font-['Manrope'] text-[0.74rem] text-white/55">
            {entered ? (
              myEntry!.predictionsTotal > 0
                ? `You're in · ${myEntry!.predictionsMade}/${myEntry!.predictionsTotal} saved`
                : "You're in"
            ) : (
              formatEntryCount(pool.entryCount)
            )}
          </p>
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2.5">
        {!entered && (
          <span className="font-['Barlow_Condensed'] text-[1.2rem] font-extrabold text-emerald-300">
            {formatFee(pool.tier.entryFee)}
          </span>
        )}
        <ArrowRight
          className={cn("h-4 w-4", entered ? "text-emerald-300" : "text-white/40")}
          aria-hidden
        />
      </div>
    </Link>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────

type Data = {
  competitions: Competition[];
  entries: UserEntry[];
};

export default function PoolsCompetitionPage() {
  const [, params] = useRoute<{ competitionSlug: string }>("/pools/:competitionSlug");
  const slug = params?.competitionSlug ?? "";

  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCompetitions(), fetchMyEntries()])
      .then(([competitions, entries]) => {
        if (cancelled) return;
        setData({ competitions, entries });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't load pools.");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Resolve the competition by slug + index user entries by poolId for O(1) lookup.
  const competition = useMemo(
    () => data?.competitions.find((c) => c.slug === slug) ?? null,
    [data, slug],
  );
  const entryByPoolId = useMemo(() => {
    const map = new Map<string, UserEntry>();
    if (data) for (const e of data.entries) map.set(e.poolId, e);
    return map;
  }, [data]);

  if (error) {
    return (
      <div className="space-y-5 px-4 py-7">
        <BackLink />
        <p className="font-['Manrope'] text-sm text-rose-200">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-white/50">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <p className="font-['Manrope'] text-xs">Loading…</p>
      </div>
    );
  }

  // 404: slug doesn't match any competition with an open Round.
  if (!competition) {
    return (
      <div className="space-y-5 px-4 py-7">
        <BackLink />
        <header className="space-y-1.5">
          <p className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.32em] text-emerald-300/70">
            Pools
          </p>
          <h1 className="font-['Barlow_Condensed'] text-[1.85rem] font-bold uppercase leading-[1.05] tracking-[0.04em] text-white">
            Between seasons
          </h1>
        </header>
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center">
          <Lock className="mx-auto mb-3 h-5 w-5 text-white/30" aria-hidden />
          <p className="font-['Manrope'] text-[0.82rem] leading-relaxed text-white/55">
            No open Round for this competition right now. New pools appear when fixtures are
            published.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-7 pb-10">
      <BackLink />
      <RoundHeader competition={competition} />

      <section className="space-y-2.5">
        <h2 className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.28em] text-white/45">
          Tiers
        </h2>
        <div className="space-y-2">
          {competition.pools.map((pool) => (
            <TierRow
              key={pool.id}
              pool={pool}
              competitionSlug={competition.slug}
              myEntry={entryByPoolId.get(pool.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
