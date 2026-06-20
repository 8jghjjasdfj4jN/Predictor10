/*
Home (arch §8.1) — entry-discovery surface, redesigned in step 3a.6 and
extended in step 3a.11.

Cards stay visible after entry (3a.11 change from 3a.6's hide-on-entry
behaviour). Each card branches on the user's state in that competition:

  League-style (PL / Champ):
    not entered       → "Choose your tier →" single CTA, routes to /tables
    partially entered → "You're in: Fiver, Tenner · 2 tiers left" inline +
                        two stacked CTAs: "Open predictions" (smart route)
                        and "Pick another tier" (→ /tables)
    fully entered     → "You're in all N tiers" inline + single
                        "Open predictions" CTA

  Tournament-style (WC):
    not entered → "Enter World Cup →" routes to /enter/<slug>
    entered     → "You're in" inline + "Open World Cup →" routes to
                  /predict/<entryId>

Smart route for "Open predictions": one entry → straight to that entry's
predict screen (skips the Predict tab list); two or more entries → /predict
where the user picks which tier to open.

Entered cards get a brighter emerald border + slightly stronger background
tint so the card's state reads at a glance.

Card hiding rule: a competition is hidden only when the user has zero
entries in it AND zero enterable pools (e.g. between seasons). Otherwise
always shown.

Card behaviour branches on `competition.postponedPolicy` — `'forfeit'` =
tournament-style (WC), `'wait'` = league-style (PL/Champ).
*/

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, BookOpen, Check, Clock, Loader2, Trophy, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchCompetitions,
  fetchEliminatorOverviews,
  fetchMyEntries,
  type Competition,
  type EliminatorOverview,
  type Pool,
  type UserEntry,
} from "@/lib/portal-api";
import { EliminatorRulesSheet } from "@/components/predictor10/EliminatorRules";


const LOCK_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatLock(iso: string): string {
  return LOCK_FMT.format(new Date(iso));
}

function lockCountdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "locked";
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

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

/** "The Fiver" → "Fiver" for compact inline lists. */
function shortTierName(name: string): string {
  return name.replace(/^The\s+/i, "");
}

/** "Fiver", "Fiver and Tenner", "Fiver, Tenner and Pony". */
function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// ─── Card-data helpers ───────────────────────────────────────────────────

type CompState = {
  competition: Competition;
  /** UserEntries the viewer holds in this competition. */
  userEntries: UserEntry[];
  /** Pools still enterable: not entered AND late-entry window still open. */
  enterablePools: Pool[];
  /** Lowest enterable fee + nearest enterable close, for unentered/partial header. */
  nearestCloseAt: string | null;
  lowestFee: string | null;
};

function deriveCompState(competition: Competition, entries: UserEntry[]): CompState {
  const userEntries = entries.filter((e) => e.competitionId === competition.id);
  const enteredPoolIds = new Set(userEntries.map((e) => e.poolId));
  const now = Date.now();
  const enterablePools = competition.pools.filter(
    (p) => !enteredPoolIds.has(p.id) && new Date(p.closesAt).getTime() > now,
  );
  let nearestCloseAt: string | null = null;
  let lowestFee: string | null = null;
  for (const p of enterablePools) {
    if (nearestCloseAt === null || new Date(p.closesAt).getTime() < new Date(nearestCloseAt).getTime()) {
      nearestCloseAt = p.closesAt;
    }
    if (lowestFee === null || parseFloat(p.tier.entryFee) < parseFloat(lowestFee)) {
      lowestFee = p.tier.entryFee;
    }
  }
  return { competition, userEntries, enterablePools, nearestCloseAt, lowestFee };
}

/** Smart-route for "Open predictions". One entry → that entry; otherwise → list. */
function predictionsHref(userEntries: UserEntry[]): string {
  return userEntries.length === 1 ? `/predict/${userEntries[0].id}` : "/predict";
}

// ─── Visual building blocks ──────────────────────────────────────────────

function CornerGlow({ strong }: { strong: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -right-10 -top-10 h-[120px] w-[120px]"
      style={{
        background: strong
          ? "radial-gradient(circle at center, rgba(52, 211, 153, 0.18), transparent 70%)"
          : "radial-gradient(circle at center, rgba(52, 211, 153, 0.10), transparent 70%)",
      }}
    />
  );
}

/** Shared card outer container. `entered` toggles the brighter look. */
function CardShell({
  entered,
  children,
}: {
  entered: boolean;
  children: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border px-[18px] pb-4 pt-[18px]",
        entered
          ? "border-emerald-400/55 bg-emerald-400/[0.10] ring-1 ring-inset ring-emerald-400/15"
          : "border-emerald-400/30 bg-emerald-400/[0.06]",
      )}
    >
      <CornerGlow strong={entered} />
      {children}
    </article>
  );
}

function CardHeader({
  title,
  badge,
}: {
  title: string;
  badge?: string | null;
}) {
  return (
    <header className="mb-1 flex items-start justify-between gap-3">
      <h2 className="m-0 font-['Barlow_Condensed'] text-[1.375rem] font-extrabold uppercase leading-[1.05] tracking-[0.02em] text-white">
        {title}
      </h2>
      {badge && (
        <span
          className={cn(
            "whitespace-nowrap rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1",
            "font-['Manrope'] text-[0.625rem] font-bold uppercase tracking-[0.14em] text-emerald-200",
          )}
        >
          {badge}
        </span>
      )}
    </header>
  );
}

function YoureInLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 mt-1.5 flex items-center gap-1.5 font-['Manrope'] text-[0.78rem] font-semibold leading-[1.4] text-emerald-200">
      <Check className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

const CTA_BASE =
  "flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-3.5 " +
  "font-['Manrope'] text-sm font-bold transition " +
  "outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60";

function PrimaryButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        CTA_BASE,
        "bg-emerald-500 text-[#0b1f14] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]",
        "hover:bg-emerald-400 active:bg-emerald-600",
      )}
    >
      {children}
    </Link>
  );
}

function GhostButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        CTA_BASE,
        "border border-emerald-400/40 bg-emerald-400/[0.06] text-emerald-200",
        "hover:bg-emerald-400/[0.12] active:bg-emerald-400/[0.18]",
      )}
    >
      {children}
    </Link>
  );
}

// ─── League-style card (PL / Champ) ──────────────────────────────────────

function LeagueCard({ state }: { state: CompState }) {
  const { competition, userEntries, enterablePools, nearestCloseAt, lowestFee } = state;
  const { currentRound: round } = competition;
  const rangeLabel = formatMatchdayRange(round.matchdays, round.matchdayLabel);
  const closeLabel = nearestCloseAt ? `Closes ${formatDate(nearestCloseAt)}` : "";
  const tierCount = enterablePools.length;
  const feeLabel = lowestFee ? formatFee(lowestFee) : "";
  const tierWord = tierCount === 1 ? "tier" : "tiers";

  // "Visible" tiers = comp.pools (the four active tiers; retired tiers like
  // Pound aren't returned by /api/competitions). User can still hold an
  // entry in a retired tier whose pool is still open — that's a "ghost"
  // entry, shown in Predict but not counted toward the visible-tier total.
  const visiblePoolIds = new Set(competition.pools.map((p) => p.id));
  const visibleEnteredCount = userEntries.filter((e) => visiblePoolIds.has(e.poolId)).length;
  const totalVisiblePools = competition.pools.length;
  const entered = userEntries.length > 0;
  const allVisibleEntered = entered && visibleEnteredCount === totalVisiblePools;

  // Tier names for the "You're in …" line — all entries the user holds in
  // this comp, including any ghost (retired-tier) entries so the user can
  // see them surfaced here too.
  const enteredNames = userEntries.map((e) => shortTierName(e.tierName));

  return (
    <CardShell entered={entered}>
      <CardHeader title={competition.name} badge={round.name} />

      {/* Meta line: show the open-tier summary only if any tiers are still
          enterable. Once nothing is left to pick, the line below tells the
          story. */}
      {(rangeLabel || closeLabel) && (
        <p className="m-0 font-['Manrope'] text-[0.8125rem] text-white/55">
          {rangeLabel && (
            <>
              {rangeLabel}
              {closeLabel && tierCount > 0 && (
                <span aria-hidden className="mx-1.5 text-white/30">·</span>
              )}
            </>
          )}
          {tierCount > 0 && closeLabel}
        </p>
      )}

      {/* "You're in …" line — only when at least one tier is entered. */}
      {entered && (
        <YoureInLine>
          {allVisibleEntered
            ? `You're in all ${totalVisiblePools} tiers`
            : tierCount > 0
              ? `You're in ${joinNames(enteredNames)} · ${tierCount} ${tierWord} left`
              : `You're in ${joinNames(enteredNames)}`}
        </YoureInLine>
      )}

      {/* Explainer block — only show when there are still tiers to pick. */}
      {tierCount > 0 && (
        <div
          className={cn(
            "my-3 rounded-[10px] border border-white/[0.04] bg-black/25 px-3.5 py-3",
            "font-['Manrope'] text-[0.78rem] leading-[1.55] text-white/55",
          )}
        >
          <span className="font-semibold text-white">
            {tierCount} {tierWord} from {feeLabel}.
          </span>{" "}
          Pick your stake. Same matches across the Round — one entry, all picks.
        </div>
      )}

      {/* CTAs */}
      <div className={cn(tierCount === 0 ? "mt-4" : "", "flex flex-col gap-2")}>
        {!entered && (
          <PrimaryButton href="/tables">
            <span>Choose your tier</span>
            <ArrowRight className="h-4 w-4" aria-hidden />
          </PrimaryButton>
        )}
        {entered && (
          <>
            <PrimaryButton href={predictionsHref(userEntries)}>
              <span>Open predictions</span>
              <ArrowRight className="h-4 w-4" aria-hidden />
            </PrimaryButton>
            {/* Always offer access to the tier list once entered — even if
                no tiers are currently enterable (late-entry window closed),
                the user can still see standings and review their own
                position across tiers. Label adapts to the state. */}
            <GhostButton href="/tables">
              <span>{tierCount > 0 ? "Pick another tier" : "View all tiers"}</span>
            </GhostButton>
          </>
        )}
      </div>
    </CardShell>
  );
}

// ─── Tournament-style card (WC) ──────────────────────────────────────────

function TournamentCard({ state }: { state: CompState }) {
  const { competition, userEntries, enterablePools } = state;
  const { currentRound: round } = competition;
  // Tournament comps have a single pool — userEntries.length is 0 or 1.
  const entered = userEntries.length > 0;
  const myEntry = userEntries[0] ?? null;
  // Use the one available pool (entered or enterable) for fee display.
  const referencePool =
    enterablePools[0] ?? competition.pools[0] ?? null;
  const fee = referencePool ? formatFee(referencePool.tier.entryFee) : "";

  const dateRange =
    round.startDate && round.endDate
      ? `${formatDate(round.startDate)} → ${formatDate(round.endDate)}`
      : null;
  const matchCount = `${round.matchdays.length || 104} matches`;
  const closeLabel = enterablePools[0]
    ? `Late entry closes ${formatDate(enterablePools[0].closesAt)}`
    : null;

  return (
    <CardShell entered={entered}>
      <CardHeader title={competition.name} badge={dateRange} />

      <p className="m-0 font-['Manrope'] text-[0.8125rem] text-white/55">
        <span className="font-semibold text-white">{matchCount}</span>
        {closeLabel && (
          <>
            <span aria-hidden className="mx-1.5 text-white/30">·</span>
            {closeLabel}
          </>
        )}
      </p>

      {entered && <YoureInLine>You're in</YoureInLine>}

      <div
        className={cn(
          "my-3 rounded-[10px] border border-white/[0.04] bg-black/25 px-3.5 py-3",
          "font-['Manrope'] text-[0.78rem] leading-[1.55] text-white/55",
        )}
      >
        <span className="font-semibold text-white">One bracket. One {fee} entry.</span>{" "}
        Full-time scores only — no extra time, no penalties. Predict each round as the
        bracket fills in.
      </div>

      {entered && myEntry ? (
        <PrimaryButton href={`/predict/${myEntry.id}`}>
          <span>Open {competition.shortName ?? competition.name}</span>
          <ArrowRight className="h-4 w-4" aria-hidden />
        </PrimaryButton>
      ) : (
        <PrimaryButton href={`/enter/${competition.slug}`}>
          <span>Enter {competition.shortName ?? competition.name}</span>
          <ArrowRight className="h-4 w-4" aria-hidden />
        </PrimaryButton>
      )}
    </CardShell>
  );
}

// ─── Eliminator10 mode tile (More ways to play) ─────────────────
//
// Home shows ONE tile for the whole Eliminator mode (not a card per game).
// It summarises across every active game and routes to the lobby
// (/eliminator), where games are bucketed into tabs. This keeps Home tidy
// once weekly PL eliminators run in parallel, and gives future game modes a
// natural home below the competitions.

function startingNextNote(games: EliminatorOverview[]): {
  eyebrow: string;
  iso: string;
  label: string;
} | null {
  const pickDue = games
    .filter(
      (g) =>
        g.entry.state === "alive" &&
        g.currentRound &&
        !g.currentRound.isLocked &&
        g.currentRound.needsPick,
    )
    .sort(
      (a, b) =>
        new Date(a.currentRound!.deadlineAt).getTime() -
        new Date(b.currentRound!.deadlineAt).getTime(),
    );
  if (pickDue[0] && pickDue[0].currentRound) {
    const r = pickDue[0].currentRound;
    return {
      eyebrow: r.ordinal === 1 ? "Starting soon" : "Pick due",
      iso: r.deadlineAt,
      label: "Picks lock",
    };
  }
  const joinable = games
    .filter((g) => g.canJoin && g.entry.state === "none")
    .sort((a, b) => new Date(a.entryClosesAt).getTime() - new Date(b.entryClosesAt).getTime());
  if (joinable[0]) {
    return { eyebrow: "Open to join", iso: joinable[0].entryClosesAt, label: "Entries close" };
  }
  return null;
}

function EliminatorModeTile({ overviews }: { overviews: EliminatorOverview[] }) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const games = overviews;
  const aliveCount = games.filter((g) => g.entry.state === "alive").length;
  const wonCount = games.filter((g) => g.entry.state === "won").length;
  const joinCount = games.filter((g) => g.canJoin && g.entry.state === "none").length;
  const allFree = games.length > 0 && games.every((g) => g.isFree);
  const entered = aliveCount > 0 || wonCount > 0;
  const note = startingNextNote(games);

  return (
    <CardShell entered={entered}>
      <CardHeader title="Eliminator10" badge={allFree ? "Free" : null} />

      <p className="m-0 font-['Manrope'] text-[0.8125rem] text-white/55">
        <span className="font-semibold text-white">Elimination game</span>
        <span aria-hidden className="mx-1.5 text-white/30">·</span>
        outlast the field
      </p>

      {aliveCount > 0 ? (
        <YoureInLine>
          You're still in {aliveCount} {aliveCount === 1 ? "game" : "games"}
        </YoureInLine>
      ) : wonCount > 0 ? (
        <p className="m-0 mt-1.5 inline-flex items-center gap-1.5 font-['Manrope'] text-[0.78rem] font-semibold text-amber-200">
          <Trophy className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          You outlasted the field
        </p>
      ) : joinCount > 0 ? (
        <p className="m-0 mt-1.5 inline-flex items-center gap-1.5 font-['Manrope'] text-[0.78rem] text-white/55">
          <Users className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          <span className="font-semibold text-emerald-200">{joinCount}</span>
          {joinCount === 1 ? " game" : " games"} open to join
        </p>
      ) : null}

      {note && (
        <div className="my-3 rounded-[10px] border border-white/[0.04] bg-black/25 px-3.5 py-3 font-['Manrope'] text-[0.78rem] leading-[1.5] text-white/55">
          <span className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-emerald-300/70">
            {note.eyebrow}
          </span>
          <br />
          <span className="text-white">
            {note.label} {formatLock(note.iso)}
          </span>
          <span> · in {lockCountdown(note.iso)}</span>
        </div>
      )}

      <div className={cn(note ? "mt-1" : "mt-4", "flex flex-col gap-2")}>
        <PrimaryButton href="/eliminator">
          <span>View games</span>
          <ArrowRight className="h-4 w-4" aria-hidden />
        </PrimaryButton>
        <button
          type="button"
          onClick={() => setRulesOpen(true)}
          className={cn(
            CTA_BASE,
            "border border-white/10 bg-transparent text-white/60",
            "hover:bg-white/[0.05] hover:text-white",
          )}
        >
          <BookOpen className="h-4 w-4" aria-hidden />
          <span>How it works</span>
        </button>
      </div>

      <EliminatorRulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </CardShell>
  );
}

function MoreWaysHeading() {
  return (
    <div className="px-5 pb-1 pt-7">
      <h2 className="m-0 font-['Barlow_Condensed'] text-[1.5rem] font-extrabold uppercase leading-[1] tracking-[0.01em] text-white">
        More ways to play
      </h2>
    </div>
  );
}

// ─── Upcoming competition card (display-only, step 3b.3) ────────────
//
// The new Premier League season fixtures are announced but entry isn't open
// yet. This is a teaser only — no CTA, not tappable — so players see it's
// coming. When PL is seeded active with open Round 1 pools it renders through
// the normal LeagueCard instead, and this card is suppressed (hasActivePL).
// Tiers locked at £10 / £25 / £50 per round (architecture §3).

function UpcomingPremierLeagueCard() {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] px-[18px] pb-4 pt-[18px]">
      <header className="mb-1 flex items-start justify-between gap-3">
        <h2 className="m-0 font-['Barlow_Condensed'] text-[1.375rem] font-extrabold uppercase leading-[1.05] tracking-[0.02em] text-white/85">
          Premier League
        </h2>
        <span className="whitespace-nowrap rounded-md border border-white/15 bg-white/[0.04] px-2 py-1 font-['Manrope'] text-[0.625rem] font-bold uppercase tracking-[0.14em] text-white/60">
          Upcoming
        </span>
      </header>

      <p className="m-0 font-['Manrope'] text-[0.8125rem] text-white/55">
        <span className="font-semibold text-white/80">New season</span>
        <span aria-hidden className="mx-1.5 text-white/25">·</span>
        fixtures announced
      </p>

      <div className="my-3 rounded-[10px] border border-white/[0.04] bg-black/25 px-3.5 py-3 font-['Manrope'] text-[0.78rem] leading-[1.55] text-white/55">
        <span className="font-semibold text-white/80">£10 · £25 · £50 per round.</span>{" "}
        Pick your stake when entry opens — one entry, all picks across the Round.
      </div>

      <p className="m-0 inline-flex items-center gap-1.5 font-['Manrope'] text-[0.78rem] font-semibold text-white/45">
        <Clock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
        Entry opens before Gameweek 1
      </p>
    </article>
  );
}

// ─── Empty states ────────────────────────────────────────────────────────

function PrizeFundNote() {
  return (
    <div className="mx-4 mt-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <p className="m-0 font-['Manrope'] text-[0.72rem] leading-[1.55] text-white/55">
        75% of all entry fees are allocated to the prize fund. The remaining
        25% is retained by Predictor10 to cover operating, administration and
        platform costs.
      </p>
    </div>
  );
}

function EmptyNothingOpen() {
  return (
    <div className="mx-4 my-2 rounded-2xl border border-dashed border-white/10 px-5 py-7 text-center">
      <p className="mb-1.5 font-['Manrope'] text-sm font-semibold text-white">
        Nothing open right now.
      </p>
      <p className="m-0 font-['Manrope'] text-[0.8125rem] text-white/55">
        Check back when the next Round opens.
      </p>
    </div>
  );
}

// ─── Page heading ────────────────────────────────────────────────────────

function PageHeading() {
  return (
    <div className="px-5 pb-2.5 pt-5">
      <p className="m-0 mb-1.5 font-['Manrope'] text-[0.6875rem] font-bold uppercase tracking-[0.32em] text-emerald-300/70">
        Open now
      </p>
      <h1 className="m-0 font-['Barlow_Condensed'] text-[2rem] font-extrabold uppercase leading-[0.95] tracking-[0.01em] text-white">
        Competitions
      </h1>
    </div>
  );
}

// ─── Top-level page ──────────────────────────────────────────────────────

type HomeData = {
  competitions: Competition[];
  entries: UserEntry[];
  eliminators: EliminatorOverview[];
};

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchCompetitions(),
      fetchMyEntries(),
      // Tolerate absence — if no Eliminator games are seeded yet, just omit
      // the cards rather than failing the whole Home screen.
      fetchEliminatorOverviews().catch(() => [] as EliminatorOverview[]),
    ])
      .then(([competitions, entries, eliminators]) => {
        if (cancelled) return;
        setData({ competitions, entries, eliminators });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't load home.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="px-4 py-8">
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

  // Build CompState per competition. Card is shown when the user has at
  // least one entry in it OR at least one pool is still enterable. Drop
  // only the truly-nothing-to-do case (between seasons, no entries).
  const cards = data.competitions
    .map((comp) => deriveCompState(comp, data.entries))
    .filter(
      (state) => state.userEntries.length > 0 || state.enterablePools.length > 0,
    );

  // One card per Eliminator game (draft/void already filtered server-side;
  // belt-and-braces filter here too). Multiple games can run in parallel.
  const elims = data.eliminators.filter(
    (e) => e.status !== "draft" && e.status !== "void",
  );
  const showElim = elims.length > 0;
  const showNothingOpen = cards.length === 0 && !showElim;

  // Suppress the static Upcoming PL teaser if a real, active PL competition is
  // already in the data (then it renders through LeagueCard instead).
  const hasActivePL = cards.some(
    (s) =>
      s.competition.slug.toLowerCase().includes("premier") ||
      /premier league/i.test(s.competition.name),
  );

  return (
    <div className="pb-6">
      <PageHeading />
      <div className="flex flex-col gap-3 px-4 pt-2">
        {cards.map((state) =>
          state.competition.postponedPolicy === "forfeit" ? (
            <TournamentCard key={state.competition.id} state={state} />
          ) : (
            <LeagueCard key={state.competition.id} state={state} />
          ),
        )}
        {!hasActivePL && <UpcomingPremierLeagueCard />}
      </div>
      {showElim && (
        <>
          <MoreWaysHeading />
          <div className="flex flex-col gap-3 px-4 pt-2">
            <EliminatorModeTile overviews={elims} />
          </div>
        </>
      )}
      {showNothingOpen && <EmptyNothingOpen />}
      <PrizeFundNote />
    </div>
  );
}
