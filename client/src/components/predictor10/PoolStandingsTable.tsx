/*
PoolStandingsTable — shared leaderboard component (step 2m).

Pulled out of PoolTablePage so the Tables tab can reuse the same visual
without duplicating the row / table / footer styling. Behaviour matches
arch §8.6:

  - Gold rank numbers (amber-300) for the top 3 podium positions.
  - Emerald-tinted row when entry.isYou.
  - Decided Rule #10 tie-break verbatim in the footer:
      pts → exact-score count → correct-result count → split.

New for the Tables tab use case: optional `maxRows` truncation. When set
and the leaderboard is longer than that, the table shows the top N rows
plus a "↓ M more ↓" expander. If the viewer's own row sits below the
visible window, it's pinned in a separate "Your position" section so they
can always see their rank without expanding.

Standalone callers (PoolTablePage) omit `maxRows` to get the full list.
*/

import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ChevronDown, ChevronRight, ChevronUp, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PoolEntry } from "@/lib/portal-api";

// ─── Sub-components ──────────────────────────────────────────────────────

/**
 * Rank cell. Top 3 get a gold / silver / bronze medal badge; everyone else a
 * plain number. Pure standing/skill recognition (arch §23 green list) — RG-safe.
 * Metallic gradients tuned for the dark Broadcast Noir theme; 1st carries a
 * soft gold glow.
 */
function RankBadge({ rank }: { rank: number }) {
  if (rank < 1 || rank > 3) {
    return (
      <span className="text-center font-['Barlow_Condensed'] text-[1rem] font-extrabold tabular-nums text-white/55">
        {rank}
      </span>
    );
  }

  const medal: Record<number, string> = {
    1: "bg-gradient-to-br from-amber-200 to-amber-500 text-amber-950 ring-amber-200/60 shadow-[0_0_10px_rgba(251,191,36,0.35)]",
    2: "bg-gradient-to-br from-slate-100 to-slate-400 text-slate-900 ring-slate-200/50",
    3: "bg-gradient-to-br from-orange-300 to-orange-700 text-orange-50 ring-orange-300/50",
  };

  return (
    <span className="flex justify-center" aria-label={`Rank ${rank}`}>
      <span
        className={cn(
          "flex h-[22px] w-[22px] items-center justify-center rounded-full ring-1",
          "font-['Barlow_Condensed'] text-[0.82rem] font-black leading-none tabular-nums",
          medal[rank],
        )}
      >
        {rank}
      </span>
    </span>
  );
}

function LeaderboardRow({ entry, href }: { entry: PoolEntry; href?: string }) {
  const gridCols = href
    ? "grid-cols-[28px_1fr_36px_36px_44px_16px]"
    : "grid-cols-[28px_1fr_36px_36px_44px]";
  const inner = (
    <>
      <RankBadge rank={entry.rank} />
      <span
        className={cn(
          "min-w-0 truncate font-['Manrope'] text-[0.82rem]",
          entry.isYou ? "font-semibold text-emerald-100" : "text-white/85",
        )}
      >
        {entry.isYou ? "You" : entry.displayName}
      </span>
      <span className="text-right font-['Manrope'] text-[0.78rem] tabular-nums text-white/65">
        {entry.exacts}
      </span>
      <span className="text-right font-['Manrope'] text-[0.78rem] tabular-nums text-white/65">
        {entry.results}
      </span>
      <span
        className={cn(
          "text-right font-['Barlow_Condensed'] text-[1rem] font-bold tabular-nums",
          entry.isYou ? "text-emerald-200" : "text-white",
        )}
      >
        {entry.points}
      </span>
      {href && (
        <ChevronRight className="h-3.5 w-3.5 justify-self-end text-white/30" aria-hidden />
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "grid items-center gap-2 px-3 py-3",
          gridCols,
          "min-h-[44px] transition hover:bg-white/[0.04]",
          "outline-none focus-visible:bg-white/[0.04]",
          entry.isYou && "bg-emerald-400/[0.08] hover:bg-emerald-400/[0.12]",
        )}
        aria-label={`See ${entry.isYou ? "your" : `${entry.displayName}'s`} predictions`}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className={cn("grid items-center gap-2 px-3 py-3", gridCols, entry.isYou && "bg-emerald-400/[0.08]")}>
      {inner}
    </div>
  );
}

function ColumnHeader({ hasLink }: { hasLink?: boolean }) {
  return (
    <div
      className={cn(
        "grid gap-2 px-3 py-2.5",
        hasLink ? "grid-cols-[28px_1fr_36px_36px_44px_16px]" : "grid-cols-[28px_1fr_36px_36px_44px]",
        "border-b border-white/10 bg-white/[0.02]",
        "font-['Manrope'] text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-white/45",
      )}
    >
      <span className="text-center">#</span>
      <span>Player</span>
      <span className="text-right">Exact</span>
      <span className="text-right">Res</span>
      <span className="text-right">Pts</span>
      {hasLink && <span aria-hidden />}
    </div>
  );
}

/**
 * Mirrors Decided Rule #10 verbatim — must include "split" as the final step.
 * The arch §8.6 wireframe truncates ("pts → exact → result") but the canonical
 * rule has four steps and the app should communicate the full tie-breaker so
 * users understand how prizes resolve in a true tie.
 */
export function TieBreakFooter() {
  return (
    <p className="px-1 font-['Manrope'] text-[0.7rem] leading-relaxed text-white/45">
      Tie-break: pts → exact-score count → correct-result count → split.
    </p>
  );
}

/**
 * Covers two zero-entry cases:
 *   - a brand-new pool no one's entered yet (status='open'), and
 *   - a settled zero-entry pool per Decided Rule #15 (rare but real).
 */
export function EmptyStandings({ settled }: { settled: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
      <Trophy className="mx-auto mb-3 h-6 w-6 text-white/30" aria-hidden />
      <p className="font-['Manrope'] text-[0.82rem] leading-relaxed text-white/55">
        {settled
          ? "No entries this Round — no standings to show."
          : "No entries yet. Be the first to join this pool."}
      </p>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────

type PoolStandingsTableProps = {
  entries: PoolEntry[];
  /**
   * When set and entries.length > maxRows, show only the top N rows plus a
   * "↓ M more ↓" expander. Omit for the full standalone table (PoolTablePage).
   */
  maxRows?: number;
  /**
   * When provided, each row becomes a tappable link to the given href —
   * used to open a player's lock-gated predictions. Omit to keep static rows.
   */
  linkTo?: (entry: PoolEntry) => string;
};

export function PoolStandingsTable({ entries, maxRows, linkTo }: PoolStandingsTableProps) {
  const [expanded, setExpanded] = useState(false);

  // ── Climb animation (arch §23) ──
  // When the standings re-order between renders (a settle pass, a refetch),
  // each row slides from its old position to its new one (FLIP). Pure visual,
  // celebrates movement up the table. Skipped under prefers-reduced-motion.
  const rowNodes = useRef<Map<string, HTMLElement>>(new Map());
  const prevTops = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const newTops = new Map<string, number>();
    rowNodes.current.forEach((node, id) => {
      newTops.set(id, node.getBoundingClientRect().top);
    });

    if (!reduce) {
      newTops.forEach((newTop, id) => {
        const oldTop = prevTops.current.get(id);
        const node = rowNodes.current.get(id);
        if (oldTop == null || !node) return;
        const delta = oldTop - newTop;
        if (delta === 0) return;
        node.style.transform = `translateY(${delta}px)`;
        node.style.transition = "transform 0s";
        void node.getBoundingClientRect(); // force reflow so the jump is applied
        requestAnimationFrame(() => {
          node.style.transition = "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)";
          node.style.transform = "";
        });
      });
    }

    prevTops.current = newTops;
  });

  const total = entries.length;
  const shouldTruncate =
    typeof maxRows === "number" && maxRows > 0 && total > maxRows && !expanded;
  const visible = shouldTruncate ? entries.slice(0, maxRows) : entries;
  const hiddenCount = total - visible.length;

  // When truncated, if the viewer's own row sits below the visible window,
  // surface it separately so they can always see their rank without
  // expanding the full table.
  const youEntry = entries.find((e) => e.isYou);
  const youInVisible = visible.some((e) => e.isYou);
  const showPinnedYou = shouldTruncate && youEntry !== undefined && !youInVisible;

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        <ColumnHeader hasLink={Boolean(linkTo)} />

        <div className="divide-y divide-white/5">
          {visible.map((e) => (
            <div
              key={e.entryId}
              ref={(el) => {
                if (el) rowNodes.current.set(e.entryId, el);
                else rowNodes.current.delete(e.entryId);
              }}
              className="will-change-transform"
            >
              <LeaderboardRow entry={e} href={linkTo?.(e)} />
            </div>
          ))}
        </div>

        {showPinnedYou && youEntry !== undefined && (
          <>
            <div
              className={cn(
                "px-3 py-1.5 text-center",
                "border-t border-white/10 bg-white/[0.015]",
                "font-['Manrope'] text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-white/35",
              )}
              aria-hidden
            >
              · · ·
            </div>
            <div className="border-t border-white/10">
              <LeaderboardRow entry={youEntry} href={linkTo?.(youEntry)} />
            </div>
          </>
        )}

        {shouldTruncate && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={cn(
              "flex w-full items-center justify-center gap-1.5 px-3 py-2.5",
              "border-t border-white/10 bg-white/[0.015]",
              "font-['Manrope'] text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-emerald-300/80",
              "transition hover:bg-white/[0.04] hover:text-emerald-200",
              "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
              "min-h-[44px]",
            )}
            aria-expanded={false}
            aria-label={`Show ${hiddenCount} more ${hiddenCount === 1 ? "entry" : "entries"}`}
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            <span>
              {hiddenCount} more {hiddenCount === 1 ? "entry" : "entries"}
            </span>
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}

        {/* Collapse affordance — visible only when the table was previously truncated and is now expanded. */}
        {typeof maxRows === "number" &&
          maxRows > 0 &&
          total > maxRows &&
          expanded && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className={cn(
                "flex w-full items-center justify-center gap-1.5 px-3 py-2.5",
                "border-t border-white/10 bg-white/[0.015]",
                "font-['Manrope'] text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-white/55",
                "transition hover:bg-white/[0.04] hover:text-white/70",
                "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
                "min-h-[44px]",
              )}
              aria-expanded={true}
              aria-label={`Collapse to top ${maxRows}`}
            >
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              <span>Show top {maxRows}</span>
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
      </div>
    </div>
  );
}
