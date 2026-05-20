/*
Predictor10 — Round structure (arch §3).

Maps Round number → which gameweek/matchday numbers belong to it, for each
MVP competition. Used by the seed/sync to group football-data.org matches
into stages, and by the runtime to look up which Round a match is in.

Two competition shapes are supported:

- **League-style** (PL, Championship): each Round covers a numeric range of
  matchdays. `matchdays` is the explicit list. A match with a matchday
  outside any Round (or with `matchday=null`) gets dropped.

- **Tournament-style** (World Cup, future Euros, etc.): all matches belong
  to a single Round regardless of football-data's `matchday` value, since
  tournament matches use `stage` strings instead of numeric matchdays (e.g.
  "GROUP_STAGE", "LAST_16") and the matchday field may be null or carry
  semantics that don't map onto our weekly Rounds model. Mark the Round
  with `matchdays: "all"` — every fetched match goes into that Round.
  Introduced in step 3a.3 for WC 2026.
*/

export type RoundSpec = {
  round: number;
  matchdays: number[] | "all";
};

// Premier League: 38 GWs → 9 Rounds (4-4-4-4-4-4-4-5-5)
export const PL_ROUNDS: RoundSpec[] = [
  { round: 1, matchdays: [1, 2, 3, 4] },
  { round: 2, matchdays: [5, 6, 7, 8] },
  { round: 3, matchdays: [9, 10, 11, 12] },
  { round: 4, matchdays: [13, 14, 15, 16] },
  { round: 5, matchdays: [17, 18, 19, 20] },
  { round: 6, matchdays: [21, 22, 23, 24] },
  { round: 7, matchdays: [25, 26, 27, 28] },
  { round: 8, matchdays: [29, 30, 31, 32, 33] },
  { round: 9, matchdays: [34, 35, 36, 37, 38] },
];

// EFL Championship: 46 MDs → 9 Rounds (5-5-5-5-5-5-5-5-6)
export const ELC_ROUNDS: RoundSpec[] = [
  { round: 1, matchdays: [1, 2, 3, 4, 5] },
  { round: 2, matchdays: [6, 7, 8, 9, 10] },
  { round: 3, matchdays: [11, 12, 13, 14, 15] },
  { round: 4, matchdays: [16, 17, 18, 19, 20] },
  { round: 5, matchdays: [21, 22, 23, 24, 25] },
  { round: 6, matchdays: [26, 27, 28, 29, 30] },
  { round: 7, matchdays: [31, 32, 33, 34, 35] },
  { round: 8, matchdays: [36, 37, 38, 39, 40] },
  { round: 9, matchdays: [41, 42, 43, 44, 45, 46] },
];

// World Cup 2026: 104 matches → 1 Round covering the whole tournament
// (group stage + knockouts). football-data may return null matchdays for
// knockout matches, so we accept all matches into Round 1 regardless.
export const WC_ROUNDS: RoundSpec[] = [
  { round: 1, matchdays: "all" },
];

export const ROUNDS_BY_CODE: Record<string, RoundSpec[]> = {
  PL: PL_ROUNDS,
  ELC: ELC_ROUNDS,
  WC: WC_ROUNDS,
};

/**
 * Returns the Round number that contains a given matchday in a competition.
 * `null` for unknown competition codes or matchdays outside the schedule.
 *
 * For tournament-style competitions (any Round with `matchdays: "all"`),
 * returns the Round number for every input — including `matchday=null`.
 */
export function roundForMatchday(
  competitionCode: string,
  matchday: number | null,
): number | null {
  const rounds = ROUNDS_BY_CODE[competitionCode];
  if (!rounds) return null;
  for (const r of rounds) {
    if (r.matchdays === "all") return r.round;
    if (matchday != null && r.matchdays.includes(matchday)) return r.round;
  }
  return null;
}
