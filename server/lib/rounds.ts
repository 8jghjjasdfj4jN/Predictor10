/*
Predictor10 — Round structure (arch §3).

Maps Round number → which gameweek/matchday numbers belong to it, for each
MVP competition. Used by the seed/sync to group football-data.org matches
into stages, and by the runtime to look up which Round a match is in.
*/

export type RoundSpec = {
  round: number;
  matchdays: number[];
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

export const ROUNDS_BY_CODE: Record<string, RoundSpec[]> = {
  PL: PL_ROUNDS,
  ELC: ELC_ROUNDS,
};

/**
 * Returns the Round number that contains a given matchday in a competition.
 * `null` for unknown competition codes or matchdays outside the schedule.
 */
export function roundForMatchday(competitionCode: string, matchday: number): number | null {
  const rounds = ROUNDS_BY_CODE[competitionCode];
  if (!rounds) return null;
  for (const r of rounds) {
    if (r.matchdays.includes(matchday)) return r.round;
  }
  return null;
}
