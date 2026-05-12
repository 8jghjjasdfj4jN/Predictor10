/*
Account history archive (arch §8.8).

Per-user list of every settled pool the user entered, newest first. Header
stat strip shows rounds played, cashes, best rank (Decided Rule #11 — once
a Round settles its pools disappear from active surfaces and land here).

Cards link out via [Results →] to the read-only Pool detail at
`/pools/:slug/:poolId`. The [Table →] CTA in the wireframe goes to a League
Table page that doesn't exist yet (step 2k); placeholder kept for parity but
disabled.

Grouping: cards are grouped by Round under a "ROUND N · MMM YYYY" header,
newest Round first. Cashed cards get an amber accent + trophy.
*/

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, Loader2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchAccountHistory, type AccountHistory, type SettledEntry } from "@/lib/portal-api";

// ─── Formatters ──────────────────────────────────────────────────────────

const MONTH_FMT = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });

function formatMonthYear(iso: string): string {
  return MONTH_FMT.format(new Date(iso));
}

function formatPayout(amount: string | null): string {
  if (amount === null) return "No prize";
  const num = parseFloat(amount);
  if (Number.isNaN(num)) return "No prize";
  return `£${num.toFixed(2)}`;
}

function formatRankSuffix(rank: number): string {
  const lastTwo = rank % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${rank}th`;
  switch (rank % 10) {
    case 1: return `${rank}st`;
    case 2: return `${rank}nd`;
    case 3: return `${rank}rd`;
    default: return `${rank}th`;
  }
}

// Standardise on the same "Round N" label whether the round name already
// includes the word or not.
function shortRoundLabel(roundOrdinal: number, _roundName: string): string {
  return `Round ${roundOrdinal}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────

function BackLink() {
  return (
    <Link
      href="/account"
      className={cn(
        "inline-flex items-center gap-1.5 font-['Manrope'] text-[0.78rem] font-semibold",
        "text-emerald-300 transition hover:text-emerald-200",
        "outline-none focus-visible:underline",
      )}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Account
    </Link>
  );
}

function StatStrip({ stats }: { stats: AccountHistory["stats"] }) {
  const cells = [
    { label: "Rounds", value: stats.rounds.toString() },
    { label: "Cashes", value: stats.cashes.toString() },
    {
      label: "Best rank",
      value: stats.bestRank === null ? "—" : formatRankSuffix(stats.bestRank),
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {cells.map((c) => (
        <div
          key={c.label}
          className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-center"
        >
          <p className="font-['Barlow_Condensed'] text-[1.6rem] font-extrabold leading-none text-white">
            {c.value}
          </p>
          <p className="mt-1 font-['Manrope'] text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-white/45">
            {c.label}
          </p>
        </div>
      ))}
    </div>
  );
}

function EntryCard({ entry }: { entry: SettledEntry }) {
  const rankLabel = `${formatRankSuffix(entry.finalRank)} of ${entry.entryCount}`;

  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3.5",
        entry.cashed
          ? "border-amber-300/30 bg-amber-400/[0.04]"
          : "border-white/10 bg-white/[0.03]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="truncate font-['Barlow_Condensed'] text-[1.05rem] font-bold uppercase tracking-[0.05em] text-white">
              {entry.competitionShortName} · {entry.tierName}
            </p>
            {entry.cashed && (
              <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-amber-300/40 bg-amber-400/[0.1] px-2 py-0.5 font-['Manrope'] text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-amber-200">
                <Trophy className="h-2.5 w-2.5" aria-hidden />
                {formatRankSuffix(entry.finalRank)}
              </span>
            )}
          </div>
          <p className="font-['Manrope'] text-[0.74rem] text-white/55">
            {entry.finalPoints} pts
            <span className="mx-1.5 text-white/30">·</span>
            {rankLabel}
            <span className="mx-1.5 text-white/30">·</span>
            <span className={entry.cashed ? "text-amber-200" : "text-white/55"}>
              {formatPayout(entry.payoutAmount)}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Link
          href={`/pools/${entry.competitionSlug}/${entry.poolId}`}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2",
            "border border-white/10 bg-white/[0.03]",
            "font-['Manrope'] text-[0.74rem] font-semibold text-white/75",
            "transition hover:border-emerald-300/30 hover:bg-emerald-400/[0.06] hover:text-emerald-200",
            "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
            "min-h-[40px]",
          )}
        >
          <span>Results</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
        <Link
          href={`/pools/${entry.competitionSlug}/${entry.poolId}/table`}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2",
            "border border-white/10 bg-white/[0.03]",
            "font-['Manrope'] text-[0.74rem] font-semibold text-white/75",
            "transition hover:border-emerald-300/30 hover:bg-emerald-400/[0.06] hover:text-emerald-200",
            "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
            "min-h-[40px]",
          )}
        >
          <span>Table</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────

type RoundGroup = {
  key: string; // competitionSlug + roundOrdinal
  competitionName: string;
  competitionSlug: string;
  roundOrdinal: number;
  roundName: string;
  monthLabel: string; // derived from the first entry's settledAt
  entries: SettledEntry[];
};

function groupByRound(entries: SettledEntry[]): RoundGroup[] {
  const groups: RoundGroup[] = [];
  for (const e of entries) {
    const key = `${e.competitionSlug}:${e.roundOrdinal}`;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = {
        key,
        competitionName: e.competitionName,
        competitionSlug: e.competitionSlug,
        roundOrdinal: e.roundOrdinal,
        roundName: e.roundName,
        monthLabel: formatMonthYear(e.settledAt),
        entries: [],
      };
      groups.push(group);
    }
    group.entries.push(e);
  }
  // Within a group, keep ordering by tier ordinal asc (Pound → Big One) for
  // readability. (Server returns by settledAt desc; tiers can be co-settled
  // so the secondary sort matters.)
  for (const g of groups) {
    g.entries.sort((a, b) => a.tierOrdinal - b.tierOrdinal);
  }
  return groups;
}

export default function AccountHistoryPage() {
  const [history, setHistory] = useState<AccountHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAccountHistory()
      .then((h) => {
        if (cancelled) return;
        setHistory(h);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't load history.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="space-y-5 px-4 py-7">
        <BackLink />
        <p className="font-['Manrope'] text-sm text-rose-200">{error}</p>
      </div>
    );
  }

  if (!history) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-white/50">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <p className="font-['Manrope'] text-xs">Loading history…</p>
      </div>
    );
  }

  const empty = history.entries.length === 0;
  const groups = groupByRound(history.entries);

  return (
    <div className="space-y-6 px-4 py-7 pb-10">
      <BackLink />

      <header className="space-y-1.5">
        <p className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.32em] text-emerald-300/70">
          Account
        </p>
        <h1 className="font-['Barlow_Condensed'] text-[1.85rem] font-bold uppercase leading-[1.05] tracking-[0.04em] text-white">
          History
        </h1>
        <p className="font-['Manrope'] text-[0.78rem] text-white/55">
          All settled rounds
        </p>
      </header>

      <StatStrip stats={history.stats} />

      {empty ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
          <Trophy className="mx-auto mb-3 h-6 w-6 text-white/30" aria-hidden />
          <p className="font-['Manrope'] text-[0.82rem] leading-relaxed text-white/55">
            No settled rounds yet. Your first results will appear here when Round 1 settles.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} className="space-y-2.5">
              <h2 className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.28em] text-white/45">
                {shortRoundLabel(g.roundOrdinal, g.roundName)} · {g.monthLabel}
              </h2>
              <div className="space-y-2">
                {g.entries.map((e) => (
                  <EntryCard key={e.id} entry={e} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
