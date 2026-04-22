// mockDataExtended.ts
// Full 2025/26 season fixture data across all 9 rounds

export type FixtureState = "Open" | "Locked" | "Submitted" | "Void" | "Completed" | "Syncing";

export type SeasonFixture = {
  id: string;
  round: number;
  gameweek: number;
  date: string;
  kickoffLabel: string;
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string;
  awayAbbr: string;
  homePredicted: number | null;
  awayPredicted: number | null;
  actualHome: number | null;
  actualAway: number | null;
  state: FixtureState;
  pointsEarned?: number; // 5 = exact, 2 = correct result, 0 = wrong
};

export type Round = {
  id: number;
  label: string;
  gameweeks: string;
  status: "Completed" | "Active" | "Upcoming";
  totalPoints?: number;
  rank?: number;
  players?: number;
};

// Teams for the 2025/26 season
const TEAMS = [
  { name: "Arsenal",          abbr: "ARS" },
  { name: "Aston Villa",      abbr: "AVL" },
  { name: "Bournemouth",      abbr: "BOU" },
  { name: "Brentford",        abbr: "BRE" },
  { name: "Brighton",         abbr: "BHA" },
  { name: "Chelsea",          abbr: "CHE" },
  { name: "Crystal Palace",   abbr: "CRY" },
  { name: "Everton",          abbr: "EVE" },
  { name: "Fulham",           abbr: "FUL" },
  { name: "Ipswich",          abbr: "IPS" },
  { name: "Leicester",        abbr: "LEI" },
  { name: "Liverpool",        abbr: "LIV" },
  { name: "Man City",         abbr: "MCI" },
  { name: "Man Utd",          abbr: "MNU" },
  { name: "Newcastle",        abbr: "NEW" },
  { name: "Nottm Forest",     abbr: "NFO" },
  { name: "Southampton",      abbr: "SOU" },
  { name: "Spurs",            abbr: "TOT" },
  { name: "West Ham",         abbr: "WHU" },
  { name: "Wolves",           abbr: "WOL" },
];

// Round definitions
export const ROUNDS: Round[] = [
  { id: 1, label: "Round 1", gameweeks: "GW 1–4",   status: "Completed", totalPoints: 34, rank: 41, players: 248 },
  { id: 2, label: "Round 2", gameweeks: "GW 5–8",   status: "Completed", totalPoints: 28, rank: 67, players: 248 },
  { id: 3, label: "Round 3", gameweeks: "GW 9–12",  status: "Active",    totalPoints: 12, rank: 51, players: 248 },
  { id: 4, label: "Round 4", gameweeks: "GW 13–16", status: "Upcoming" },
  { id: 5, label: "Round 5", gameweeks: "GW 17–20", status: "Upcoming" },
  { id: 6, label: "Round 6", gameweeks: "GW 21–24", status: "Upcoming" },
  { id: 7, label: "Round 7", gameweeks: "GW 25–28", status: "Upcoming" },
  { id: 8, label: "Round 8", gameweeks: "GW 29–33", status: "Upcoming" },
  { id: 9, label: "Round 9", gameweeks: "GW 34–38", status: "Upcoming" },
];

// Full season fixtures — 10 per gameweek, 38 gameweeks
// Rounds 1-2 = Completed (with actuals + predictions + points)
// Round 3 = Active (some submitted/open/locked)
// Rounds 4-9 = Upcoming (no predictions yet)

export const ALL_SEASON_FIXTURES: SeasonFixture[] = [

  // ─── ROUND 1 — GW 1-4 — COMPLETED ─────────────────────────────────────────

  // GW1
  { id:"r1-gw1-1",  round:1, gameweek:1, date:"2025-08-16", kickoffLabel:"Sat 16 Aug · 12:30", homeTeam:"Arsenal",        awayTeam:"Wolves",        homeAbbr:"ARS", awayAbbr:"WOL", homePredicted:2, awayPredicted:0, actualHome:2, actualAway:0, state:"Completed", pointsEarned:5 },
  { id:"r1-gw1-2",  round:1, gameweek:1, date:"2025-08-16", kickoffLabel:"Sat 16 Aug · 15:00", homeTeam:"Everton",        awayTeam:"Brighton",      homeAbbr:"EVE", awayAbbr:"BHA", homePredicted:1, awayPredicted:1, actualHome:0, actualAway:1, state:"Completed", pointsEarned:0 },
  { id:"r1-gw1-3",  round:1, gameweek:1, date:"2025-08-16", kickoffLabel:"Sat 16 Aug · 15:00", homeTeam:"Ipswich",        awayTeam:"Liverpool",     homeAbbr:"IPS", awayAbbr:"LIV", homePredicted:0, awayPredicted:2, actualHome:0, actualAway:2, state:"Completed", pointsEarned:5 },
  { id:"r1-gw1-4",  round:1, gameweek:1, date:"2025-08-16", kickoffLabel:"Sat 16 Aug · 15:00", homeTeam:"Leicester",      awayTeam:"Fulham",        homeAbbr:"LEI", awayAbbr:"FUL", homePredicted:1, awayPredicted:2, actualHome:1, actualAway:1, state:"Completed", pointsEarned:0 },
  { id:"r1-gw1-5",  round:1, gameweek:1, date:"2025-08-16", kickoffLabel:"Sat 16 Aug · 15:00", homeTeam:"Newcastle",      awayTeam:"Southampton",   homeAbbr:"NEW", awayAbbr:"SOU", homePredicted:3, awayPredicted:0, actualHome:2, actualAway:0, state:"Completed", pointsEarned:2 },
  { id:"r1-gw1-6",  round:1, gameweek:1, date:"2025-08-16", kickoffLabel:"Sat 16 Aug · 15:00", homeTeam:"Nottm Forest",   awayTeam:"Bournemouth",   homeAbbr:"NFO", awayAbbr:"BOU", homePredicted:1, awayPredicted:1, actualHome:1, actualAway:1, state:"Completed", pointsEarned:5 },
  { id:"r1-gw1-7",  round:1, gameweek:1, date:"2025-08-16", kickoffLabel:"Sat 16 Aug · 17:30", homeTeam:"West Ham",       awayTeam:"Aston Villa",   homeAbbr:"WHU", awayAbbr:"AVL", homePredicted:0, awayPredicted:2, actualHome:1, actualAway:2, state:"Completed", pointsEarned:2 },
  { id:"r1-gw1-8",  round:1, gameweek:1, date:"2025-08-17", kickoffLabel:"Sun 17 Aug · 14:00", homeTeam:"Brentford",      awayTeam:"Crystal Palace", homeAbbr:"BRE", awayAbbr:"CRY", homePredicted:2, awayPredicted:1, actualHome:2, actualAway:1, state:"Completed", pointsEarned:5 },
  { id:"r1-gw1-9",  round:1, gameweek:1, date:"2025-08-17", kickoffLabel:"Sun 17 Aug · 16:30", homeTeam:"Chelsea",        awayTeam:"Man City",      homeAbbr:"CHE", awayAbbr:"MCI", homePredicted:1, awayPredicted:2, actualHome:0, actualAway:2, state:"Completed", pointsEarned:2 },
  { id:"r1-gw1-10", round:1, gameweek:1, date:"2025-08-18", kickoffLabel:"Mon 18 Aug · 20:00", homeTeam:"Spurs",          awayTeam:"Man Utd",       homeAbbr:"TOT", awayAbbr:"MNU", homePredicted:2, awayPredicted:0, actualHome:3, actualAway:0, state:"Completed", pointsEarned:2 },

  // GW2
  { id:"r1-gw2-1",  round:1, gameweek:2, date:"2025-08-23", kickoffLabel:"Sat 23 Aug · 12:30", homeTeam:"Aston Villa",    awayTeam:"Arsenal",       homeAbbr:"AVL", awayAbbr:"ARS", homePredicted:1, awayPredicted:2, actualHome:1, actualAway:3, state:"Completed", pointsEarned:2 },
  { id:"r1-gw2-2",  round:1, gameweek:2, date:"2025-08-23", kickoffLabel:"Sat 23 Aug · 15:00", homeTeam:"Bournemouth",    awayTeam:"Newcastle",     homeAbbr:"BOU", awayAbbr:"NEW", homePredicted:1, awayPredicted:1, actualHome:2, actualAway:1, state:"Completed", pointsEarned:0 },
  { id:"r1-gw2-3",  round:1, gameweek:2, date:"2025-08-23", kickoffLabel:"Sat 23 Aug · 15:00", homeTeam:"Brighton",       awayTeam:"Ipswich",       homeAbbr:"BHA", awayAbbr:"IPS", homePredicted:3, awayPredicted:0, actualHome:3, actualAway:0, state:"Completed", pointsEarned:5 },
  { id:"r1-gw2-4",  round:1, gameweek:2, date:"2025-08-23", kickoffLabel:"Sat 23 Aug · 15:00", homeTeam:"Crystal Palace", awayTeam:"West Ham",      homeAbbr:"CRY", awayAbbr:"WHU", homePredicted:0, awayPredicted:1, actualHome:0, actualAway:0, state:"Completed", pointsEarned:0 },
  { id:"r1-gw2-5",  round:1, gameweek:2, date:"2025-08-23", kickoffLabel:"Sat 23 Aug · 15:00", homeTeam:"Fulham",         awayTeam:"Leicester",     homeAbbr:"FUL", awayAbbr:"LEI", homePredicted:2, awayPredicted:1, actualHome:2, actualAway:1, state:"Completed", pointsEarned:5 },
  { id:"r1-gw2-6",  round:1, gameweek:2, date:"2025-08-23", kickoffLabel:"Sat 23 Aug · 15:00", homeTeam:"Liverpool",      awayTeam:"Brentford",     homeAbbr:"LIV", awayAbbr:"BRE", homePredicted:3, awayPredicted:0, actualHome:2, actualAway:0, state:"Completed", pointsEarned:2 },
  { id:"r1-gw2-7",  round:1, gameweek:2, date:"2025-08-23", kickoffLabel:"Sat 23 Aug · 17:30", homeTeam:"Man City",       awayTeam:"Chelsea",       homeAbbr:"MCI", awayAbbr:"CHE", homePredicted:2, awayPredicted:1, actualHome:1, actualAway:1, state:"Completed", pointsEarned:0 },
  { id:"r1-gw2-8",  round:1, gameweek:2, date:"2025-08-24", kickoffLabel:"Sun 24 Aug · 14:00", homeTeam:"Man Utd",        awayTeam:"Nottm Forest",  homeAbbr:"MNU", awayAbbr:"NFO", homePredicted:2, awayPredicted:0, actualHome:2, actualAway:0, state:"Completed", pointsEarned:5 },
  { id:"r1-gw2-9",  round:1, gameweek:2, date:"2025-08-24", kickoffLabel:"Sun 24 Aug · 16:30", homeTeam:"Southampton",    awayTeam:"Everton",       homeAbbr:"SOU", awayAbbr:"EVE", homePredicted:0, awayPredicted:1, actualHome:0, actualAway:2, state:"Completed", pointsEarned:2 },
  { id:"r1-gw2-10", round:1, gameweek:2, date:"2025-08-25", kickoffLabel:"Mon 25 Aug · 20:00", homeTeam:"Wolves",         awayTeam:"Spurs",         homeAbbr:"WOL", awayAbbr:"TOT", homePredicted:1, awayPredicted:2, actualHome:0, actualAway:1, state:"Completed", pointsEarned:2 },

  // GW3
  { id:"r1-gw3-1",  round:1, gameweek:3, date:"2025-08-30", kickoffLabel:"Sat 30 Aug · 12:30", homeTeam:"Arsenal",        awayTeam:"Brighton",      homeAbbr:"ARS", awayAbbr:"BHA", homePredicted:2, awayPredicted:1, actualHome:2, actualAway:1, state:"Completed", pointsEarned:5 },
  { id:"r1-gw3-2",  round:1, gameweek:3, date:"2025-08-30", kickoffLabel:"Sat 30 Aug · 15:00", homeTeam:"Brentford",      awayTeam:"West Ham",      homeAbbr:"BRE", awayAbbr:"WHU", homePredicted:1, awayPredicted:0, actualHome:1, actualAway:0, state:"Completed", pointsEarned:5 },
  { id:"r1-gw3-3",  round:1, gameweek:3, date:"2025-08-30", kickoffLabel:"Sat 30 Aug · 15:00", homeTeam:"Chelsea",        awayTeam:"Crystal Palace", homeAbbr:"CHE", awayAbbr:"CRY", homePredicted:3, awayPredicted:0, actualHome:3, actualAway:1, state:"Completed", pointsEarned:2 },
  { id:"r1-gw3-4",  round:1, gameweek:3, date:"2025-08-30", kickoffLabel:"Sat 30 Aug · 15:00", homeTeam:"Everton",        awayTeam:"Bournemouth",   homeAbbr:"EVE", awayAbbr:"BOU", homePredicted:1, awayPredicted:1, actualHome:2, actualAway:2, state:"Completed", pointsEarned:2 },
  { id:"r1-gw3-5",  round:1, gameweek:3, date:"2025-08-30", kickoffLabel:"Sat 30 Aug · 15:00", homeTeam:"Fulham",         awayTeam:"Newcastle",     homeAbbr:"FUL", awayAbbr:"NEW", homePredicted:0, awayPredicted:2, actualHome:1, actualAway:2, state:"Completed", pointsEarned:2 },
  { id:"r1-gw3-6",  round:1, gameweek:3, date:"2025-08-30", kickoffLabel:"Sat 30 Aug · 15:00", homeTeam:"Ipswich",        awayTeam:"Man Utd",       homeAbbr:"IPS", awayAbbr:"MNU", homePredicted:0, awayPredicted:1, actualHome:0, actualAway:1, state:"Completed", pointsEarned:5 },
  { id:"r1-gw3-7",  round:1, gameweek:3, date:"2025-08-30", kickoffLabel:"Sat 30 Aug · 17:30", homeTeam:"Leicester",      awayTeam:"Aston Villa",   homeAbbr:"LEI", awayAbbr:"AVL", homePredicted:0, awayPredicted:2, actualHome:1, actualAway:2, state:"Completed", pointsEarned:2 },
  { id:"r1-gw3-8",  round:1, gameweek:3, date:"2025-08-31", kickoffLabel:"Sun 31 Aug · 14:00", homeTeam:"Nottm Forest",   awayTeam:"Liverpool",     homeAbbr:"NFO", awayAbbr:"LIV", homePredicted:0, awayPredicted:2, actualHome:0, actualAway:1, state:"Completed", pointsEarned:2 },
  { id:"r1-gw3-9",  round:1, gameweek:3, date:"2025-08-31", kickoffLabel:"Sun 31 Aug · 16:30", homeTeam:"Southampton",    awayTeam:"Man City",      homeAbbr:"SOU", awayAbbr:"MCI", homePredicted:0, awayPredicted:3, actualHome:0, actualAway:3, state:"Completed", pointsEarned:5 },
  { id:"r1-gw3-10", round:1, gameweek:3, date:"2025-09-01", kickoffLabel:"Mon 1 Sep · 20:00",  homeTeam:"Spurs",          awayTeam:"Wolves",        homeAbbr:"TOT", awayAbbr:"WOL", homePredicted:2, awayPredicted:0, actualHome:1, actualAway:0, state:"Completed", pointsEarned:2 },

  // GW4
  { id:"r1-gw4-1",  round:1, gameweek:4, date:"2025-09-13", kickoffLabel:"Sat 13 Sep · 12:30", homeTeam:"Aston Villa",    awayTeam:"Everton",       homeAbbr:"AVL", awayAbbr:"EVE", homePredicted:2, awayPredicted:0, actualHome:2, actualAway:0, state:"Completed", pointsEarned:5 },
  { id:"r1-gw4-2",  round:1, gameweek:4, date:"2025-09-13", kickoffLabel:"Sat 13 Sep · 15:00", homeTeam:"Bournemouth",    awayTeam:"Chelsea",       homeAbbr:"BOU", awayAbbr:"CHE", homePredicted:0, awayPredicted:2, actualHome:0, actualAway:2, state:"Completed", pointsEarned:5 },
  { id:"r1-gw4-3",  round:1, gameweek:4, date:"2025-09-13", kickoffLabel:"Sat 13 Sep · 15:00", homeTeam:"Brighton",       awayTeam:"Nottm Forest",  homeAbbr:"BHA", awayAbbr:"NFO", homePredicted:2, awayPredicted:1, actualHome:1, actualAway:1, state:"Completed", pointsEarned:0 },
  { id:"r1-gw4-4",  round:1, gameweek:4, date:"2025-09-13", kickoffLabel:"Sat 13 Sep · 15:00", homeTeam:"Crystal Palace", awayTeam:"Leicester",     homeAbbr:"CRY", awayAbbr:"LEI", homePredicted:2, awayPredicted:0, actualHome:2, actualAway:0, state:"Completed", pointsEarned:5 },
  { id:"r1-gw4-5",  round:1, gameweek:4, date:"2025-09-13", kickoffLabel:"Sat 13 Sep · 15:00", homeTeam:"Liverpool",      awayTeam:"Fulham",        homeAbbr:"LIV", awayAbbr:"FUL", homePredicted:3, awayPredicted:0, actualHome:3, actualAway:0, state:"Completed", pointsEarned:5 },
  { id:"r1-gw4-6",  round:1, gameweek:4, date:"2025-09-13", kickoffLabel:"Sat 13 Sep · 15:00", homeTeam:"Man City",       awayTeam:"Brentford",     homeAbbr:"MCI", awayAbbr:"BRE", homePredicted:3, awayPredicted:1, actualHome:2, actualAway:0, state:"Completed", pointsEarned:0 },
  { id:"r1-gw4-7",  round:1, gameweek:4, date:"2025-09-13", kickoffLabel:"Sat 13 Sep · 17:30", homeTeam:"Man Utd",        awayTeam:"Southampton",   homeAbbr:"MNU", awayAbbr:"SOU", homePredicted:2, awayPredicted:0, actualHome:3, actualAway:0, state:"Completed", pointsEarned:2 },
  { id:"r1-gw4-8",  round:1, gameweek:4, date:"2025-09-14", kickoffLabel:"Sun 14 Sep · 14:00", homeTeam:"Newcastle",      awayTeam:"Ipswich",       homeAbbr:"NEW", awayAbbr:"IPS", homePredicted:2, awayPredicted:0, actualHome:2, actualAway:0, state:"Completed", pointsEarned:5 },
  { id:"r1-gw4-9",  round:1, gameweek:4, date:"2025-09-14", kickoffLabel:"Sun 14 Sep · 16:30", homeTeam:"West Ham",       awayTeam:"Arsenal",       homeAbbr:"WHU", awayAbbr:"ARS", homePredicted:0, awayPredicted:2, actualHome:0, actualAway:2, state:"Completed", pointsEarned:5 },
  { id:"r1-gw4-10", round:1, gameweek:4, date:"2025-09-15", kickoffLabel:"Mon 15 Sep · 20:00", homeTeam:"Wolves",         awayTeam:"Spurs",         homeAbbr:"WOL", awayAbbr:"TOT", homePredicted:1, awayPredicted:1, actualHome:1, actualAway:1, state:"Completed", pointsEarned:5 },

  // ─── ROUND 2 — GW 5-8 — COMPLETED ─────────────────────────────────────────

  // GW5
  { id:"r2-gw5-1",  round:2, gameweek:5, date:"2025-09-20", kickoffLabel:"Sat 20 Sep · 12:30", homeTeam:"Arsenal",        awayTeam:"Southampton",   homeAbbr:"ARS", awayAbbr:"SOU", homePredicted:3, awayPredicted:0, actualHome:3, actualAway:0, state:"Completed", pointsEarned:5 },
  { id:"r2-gw5-2",  round:2, gameweek:5, date:"2025-09-20", kickoffLabel:"Sat 20 Sep · 15:00", homeTeam:"Brentford",      awayTeam:"Newcastle",     homeAbbr:"BRE", awayAbbr:"NEW", homePredicted:1, awayPredicted:2, actualHome:1, actualAway:1, state:"Completed", pointsEarned:0 },
  { id:"r2-gw5-3",  round:2, gameweek:5, date:"2025-09-20", kickoffLabel:"Sat 20 Sep · 15:00", homeTeam:"Brighton",       awayTeam:"Man City",      homeAbbr:"BHA", awayAbbr:"MCI", homePredicted:0, awayPredicted:2, actualHome:1, actualAway:2, state:"Completed", pointsEarned:2 },
  { id:"r2-gw5-4",  round:2, gameweek:5, date:"2025-09-20", kickoffLabel:"Sat 20 Sep · 15:00", homeTeam:"Chelsea",        awayTeam:"Wolves",        homeAbbr:"CHE", awayAbbr:"WOL", homePredicted:2, awayPredicted:0, actualHome:2, actualAway:0, state:"Completed", pointsEarned:5 },
  { id:"r2-gw5-5",  round:2, gameweek:5, date:"2025-09-20", kickoffLabel:"Sat 20 Sep · 15:00", homeTeam:"Everton",        awayTeam:"Ipswich",       homeAbbr:"EVE", awayAbbr:"IPS", homePredicted:1, awayPredicted:0, actualHome:1, actualAway:0, state:"Completed", pointsEarned:5 },
  { id:"r2-gw5-6",  round:2, gameweek:5, date:"2025-09-20", kickoffLabel:"Sat 20 Sep · 15:00", homeTeam:"Fulham",         awayTeam:"Spurs",         homeAbbr:"FUL", awayAbbr:"TOT", homePredicted:1, awayPredicted:2, actualHome:0, actualAway:1, state:"Completed", pointsEarned:2 },
  { id:"r2-gw5-7",  round:2, gameweek:5, date:"2025-09-20", kickoffLabel:"Sat 20 Sep · 17:30", homeTeam:"Leicester",      awayTeam:"Man Utd",       homeAbbr:"LEI", awayAbbr:"MNU", homePredicted:0, awayPredicted:1, actualHome:0, actualAway:1, state:"Completed", pointsEarned:5 },
  { id:"r2-gw5-8",  round:2, gameweek:5, date:"2025-09-21", kickoffLabel:"Sun 21 Sep · 14:00", homeTeam:"Nottm Forest",   awayTeam:"Crystal Palace", homeAbbr:"NFO", awayAbbr:"CRY", homePredicted:1, awayPredicted:0, actualHome:1, actualAway:0, state:"Completed", pointsEarned:5 },
  { id:"r2-gw5-9",  round:2, gameweek:5, date:"2025-09-21", kickoffLabel:"Sun 21 Sep · 16:30", homeTeam:"West Ham",       awayTeam:"Bournemouth",   homeAbbr:"WHU", awayAbbr:"BOU", homePredicted:2, awayPredicted:1, actualHome:2, actualAway:2, state:"Completed", pointsEarned:0 },
  { id:"r2-gw5-10", round:2, gameweek:5, date:"2025-09-22", kickoffLabel:"Mon 22 Sep · 20:00", homeTeam:"Aston Villa",    awayTeam:"Liverpool",     homeAbbr:"AVL", awayAbbr:"LIV", homePredicted:1, awayPredicted:2, actualHome:1, actualAway:3, state:"Completed", pointsEarned:2 },

  // GW6
  { id:"r2-gw6-1",  round:2, gameweek:6, date:"2025-09-27", kickoffLabel:"Sat 27 Sep · 12:30", homeTeam:"Bournemouth",    awayTeam:"Arsenal",       homeAbbr:"BOU", awayAbbr:"ARS", homePredicted:0, awayPredicted:2, actualHome:0, actualAway:2, state:"Completed", pointsEarned:5 },
  { id:"r2-gw6-2",  round:2, gameweek:6, date:"2025-09-27", kickoffLabel:"Sat 27 Sep · 15:00", homeTeam:"Crystal Palace", awayTeam:"Fulham",        homeAbbr:"CRY", awayAbbr:"FUL", homePredicted:1, awayPredicted:1, actualHome:1, actualAway:2, state:"Completed", pointsEarned:0 },
  { id:"r2-gw6-3",  round:2, gameweek:6, date:"2025-09-27", kickoffLabel:"Sat 27 Sep · 15:00", homeTeam:"Ipswich",        awayTeam:"Brentford",     homeAbbr:"IPS", awayAbbr:"BRE", homePredicted:0, awayPredicted:1, actualHome:0, actualAway:1, state:"Completed", pointsEarned:5 },
  { id:"r2-gw6-4",  round:2, gameweek:6, date:"2025-09-27", kickoffLabel:"Sat 27 Sep · 15:00", homeTeam:"Liverpool",      awayTeam:"Wolves",        homeAbbr:"LIV", awayAbbr:"WOL", homePredicted:3, awayPredicted:0, actualHome:3, actualAway:0, state:"Completed", pointsEarned:5 },
  { id:"r2-gw6-5",  round:2, gameweek:6, date:"2025-09-27", kickoffLabel:"Sat 27 Sep · 15:00", homeTeam:"Man City",       awayTeam:"Newcastle",     homeAbbr:"MCI", awayAbbr:"NEW", homePredicted:2, awayPredicted:1, actualHome:1, actualAway:1, state:"Completed", pointsEarned:0 },
  { id:"r2-gw6-6",  round:2, gameweek:6, date:"2025-09-27", kickoffLabel:"Sat 27 Sep · 15:00", homeTeam:"Man Utd",        awayTeam:"Everton",       homeAbbr:"MNU", awayAbbr:"EVE", homePredicted:2, awayPredicted:0, actualHome:2, actualAway:0, state:"Completed", pointsEarned:5 },
  { id:"r2-gw6-7",  round:2, gameweek:6, date:"2025-09-27", kickoffLabel:"Sat 27 Sep · 17:30", homeTeam:"Southampton",    awayTeam:"Brighton",      homeAbbr:"SOU", awayAbbr:"BHA", homePredicted:0, awayPredicted:2, actualHome:0, actualAway:1, state:"Completed", pointsEarned:2 },
  { id:"r2-gw6-8",  round:2, gameweek:6, date:"2025-09-28", kickoffLabel:"Sun 28 Sep · 14:00", homeTeam:"Spurs",          awayTeam:"West Ham",      homeAbbr:"TOT", awayAbbr:"WHU", homePredicted:2, awayPredicted:1, actualHome:2, actualAway:1, state:"Completed", pointsEarned:5 },
  { id:"r2-gw6-9",  round:2, gameweek:6, date:"2025-09-28", kickoffLabel:"Sun 28 Sep · 16:30", homeTeam:"Wolves",         awayTeam:"Leicester",     homeAbbr:"WOL", awayAbbr:"LEI", homePredicted:1, awayPredicted:0, actualHome:2, actualAway:0, state:"Completed", pointsEarned:2 },
  { id:"r2-gw6-10", round:2, gameweek:6, date:"2025-09-29", kickoffLabel:"Mon 29 Sep · 20:00", homeTeam:"Nottm Forest",   awayTeam:"Chelsea",       homeAbbr:"NFO", awayAbbr:"CHE", homePredicted:0, awayPredicted:1, actualHome:0, actualAway:0, state:"Completed", pointsEarned:0 },

  // GW7
  { id:"r2-gw7-1",  round:2, gameweek:7, date:"2025-10-04", kickoffLabel:"Sat 4 Oct · 12:30",  homeTeam:"Arsenal",        awayTeam:"Man City",      homeAbbr:"ARS", awayAbbr:"MCI", homePredicted:1, awayPredicted:1, actualHome:2, actualAway:1, state:"Completed", pointsEarned:0 },
  { id:"r2-gw7-2",  round:2, gameweek:7, date:"2025-10-04", kickoffLabel:"Sat 4 Oct · 15:00",  homeTeam:"Aston Villa",    awayTeam:"Spurs",         homeAbbr:"AVL", awayAbbr:"TOT", homePredicted:2, awayPredicted:0, actualHome:2, actualAway:0, state:"Completed", pointsEarned:5 },
  { id:"r2-gw7-3",  round:2, gameweek:7, date:"2025-10-04", kickoffLabel:"Sat 4 Oct · 15:00",  homeTeam:"Brentford",      awayTeam:"Brighton",      homeAbbr:"BRE", awayAbbr:"BHA", homePredicted:1, awayPredicted:1, actualHome:1, actualAway:1, state:"Completed", pointsEarned:5 },
  { id:"r2-gw7-4",  round:2, gameweek:7, date:"2025-10-04", kickoffLabel:"Sat 4 Oct · 15:00",  homeTeam:"Everton",        awayTeam:"Chelsea",       homeAbbr:"EVE", awayAbbr:"CHE", homePredicted:0, awayPredicted:2, actualHome:0, actualAway:1, state:"Completed", pointsEarned:2 },
  { id:"r2-gw7-5",  round:2, gameweek:7, date:"2025-10-04", kickoffLabel:"Sat 4 Oct · 15:00",  homeTeam:"Fulham",         awayTeam:"Southampton",   homeAbbr:"FUL", awayAbbr:"SOU", homePredicted:2, awayPredicted:0, actualHome:2, actualAway:0, state:"Completed", pointsEarned:5 },
  { id:"r2-gw7-6",  round:2, gameweek:7, date:"2025-10-04", kickoffLabel:"Sat 4 Oct · 15:00",  homeTeam:"Leicester",      awayTeam:"West Ham",      homeAbbr:"LEI", awayAbbr:"WHU", homePredicted:1, awayPredicted:2, actualHome:0, actualAway:2, state:"Completed", pointsEarned:2 },
  { id:"r2-gw7-7",  round:2, gameweek:7, date:"2025-10-04", kickoffLabel:"Sat 4 Oct · 17:30",  homeTeam:"Newcastle",      awayTeam:"Man Utd",       homeAbbr:"NEW", awayAbbr:"MNU", homePredicted:1, awayPredicted:1, actualHome:2, actualAway:1, state:"Completed", pointsEarned:0 },
  { id:"r2-gw7-8",  round:2, gameweek:7, date:"2025-10-05", kickoffLabel:"Sun 5 Oct · 14:00",  homeTeam:"Liverpool",      awayTeam:"Crystal Palace", homeAbbr:"LIV", awayAbbr:"CRY", homePredicted:3, awayPredicted:0, actualHome:3, actualAway:0, state:"Completed", pointsEarned:5 },
  { id:"r2-gw7-9",  round:2, gameweek:7, date:"2025-10-05", kickoffLabel:"Sun 5 Oct · 16:30",  homeTeam:"Wolves",         awayTeam:"Nottm Forest",  homeAbbr:"WOL", awayAbbr:"NFO", homePredicted:0, awayPredicted:1, actualHome:1, actualAway:1, state:"Completed", pointsEarned:0 },
  { id:"r2-gw7-10", round:2, gameweek:7, date:"2025-10-06", kickoffLabel:"Mon 6 Oct · 20:00",  homeTeam:"Bournemouth",    awayTeam:"Ipswich",       homeAbbr:"BOU", awayAbbr:"IPS", homePredicted:2, awayPredicted:1, actualHome:2, actualAway:1, state:"Completed", pointsEarned:5 },

  // GW8
  { id:"r2-gw8-1",  round:2, gameweek:8, date:"2025-10-18", kickoffLabel:"Sat 18 Oct · 12:30", homeTeam:"Brighton",       awayTeam:"Arsenal",       homeAbbr:"BHA", awayAbbr:"ARS", homePredicted:1, awayPredicted:2, actualHome:1, actualAway:2, state:"Completed", pointsEarned:5 },
  { id:"r2-gw8-2",  round:2, gameweek:8, date:"2025-10-18", kickoffLabel:"Sat 18 Oct · 15:00", homeTeam:"Chelsea",        awayTeam:"Newcastle",     homeAbbr:"CHE", awayAbbr:"NEW", homePredicted:2, awayPredicted:1, actualHome:2, actualAway:1, state:"Completed", pointsEarned:5 },
  { id:"r2-gw8-3",  round:2, gameweek:8, date:"2025-10-18", kickoffLabel:"Sat 18 Oct · 15:00", homeTeam:"Crystal Palace", awayTeam:"Brentford",     homeAbbr:"CRY", awayAbbr:"BRE", homePredicted:1, awayPredicted:1, actualHome:0, actualAway:0, state:"Completed", pointsEarned:2 },
  { id:"r2-gw8-4",  round:2, gameweek:8, date:"2025-10-18", kickoffLabel:"Sat 18 Oct · 15:00", homeTeam:"Ipswich",        awayTeam:"Aston Villa",   homeAbbr:"IPS", awayAbbr:"AVL", homePredicted:0, awayPredicted:2, actualHome:0, actualAway:2, state:"Completed", pointsEarned:5 },
  { id:"r2-gw8-5",  round:2, gameweek:8, date:"2025-10-18", kickoffLabel:"Sat 18 Oct · 15:00", homeTeam:"Man City",       awayTeam:"Fulham",        homeAbbr:"MCI", awayAbbr:"FUL", homePredicted:3, awayPredicted:0, actualHome:2, actualAway:0, state:"Completed", pointsEarned:2 },
  { id:"r2-gw8-6",  round:2, gameweek:8, date:"2025-10-18", kickoffLabel:"Sat 18 Oct · 15:00", homeTeam:"Man Utd",        awayTeam:"West Ham",      homeAbbr:"MNU", awayAbbr:"WHU", homePredicted:1, awayPredicted:0, actualHome:1, actualAway:0, state:"Completed", pointsEarned:5 },
  { id:"r2-gw8-7",  round:2, gameweek:8, date:"2025-10-18", kickoffLabel:"Sat 18 Oct · 17:30", homeTeam:"Southampton",    awayTeam:"Wolves",        homeAbbr:"SOU", awayAbbr:"WOL", homePredicted:0, awayPredicted:1, actualHome:0, actualAway:1, state:"Completed", pointsEarned:5 },
  { id:"r2-gw8-8",  round:2, gameweek:8, date:"2025-10-19", kickoffLabel:"Sun 19 Oct · 14:00", homeTeam:"Spurs",          awayTeam:"Liverpool",     homeAbbr:"TOT", awayAbbr:"LIV", homePredicted:0, awayPredicted:2, actualHome:0, actualAway:2, state:"Completed", pointsEarned:5 },
  { id:"r2-gw8-9",  round:2, gameweek:8, date:"2025-10-19", kickoffLabel:"Sun 19 Oct · 16:30", homeTeam:"Nottm Forest",   awayTeam:"Everton",       homeAbbr:"NFO", awayAbbr:"EVE", homePredicted:1, awayPredicted:0, actualHome:1, actualAway:0, state:"Completed", pointsEarned:5 },
  { id:"r2-gw8-10", round:2, gameweek:8, date:"2025-10-20", kickoffLabel:"Mon 20 Oct · 20:00", homeTeam:"Leicester",      awayTeam:"Bournemouth",   homeAbbr:"LEI", awayAbbr:"BOU", homePredicted:1, awayPredicted:1, actualHome:2, actualAway:1, state:"Completed", pointsEarned:0 },

  // ─── ROUND 3 — GW 9-12 — ACTIVE ───────────────────────────────────────────

  // GW9 — some submitted/locked/open
  { id:"r3-gw9-1",  round:3, gameweek:9, date:"2025-10-25", kickoffLabel:"Sat 25 Oct · 12:30", homeTeam:"Arsenal",        awayTeam:"Liverpool",     homeAbbr:"ARS", awayAbbr:"LIV", homePredicted:1, awayPredicted:1, actualHome:null, actualAway:null, state:"Submitted" },
  { id:"r3-gw9-2",  round:3, gameweek:9, date:"2025-10-25", kickoffLabel:"Sat 25 Oct · 15:00", homeTeam:"Aston Villa",    awayTeam:"Chelsea",       homeAbbr:"AVL", awayAbbr:"CHE", homePredicted:1, awayPredicted:2, actualHome:null, actualAway:null, state:"Submitted" },
  { id:"r3-gw9-3",  round:3, gameweek:9, date:"2025-10-25", kickoffLabel:"Sat 25 Oct · 15:00", homeTeam:"Brentford",      awayTeam:"Fulham",        homeAbbr:"BRE", awayAbbr:"FUL", homePredicted:2, awayPredicted:1, actualHome:null, actualAway:null, state:"Locked"    },
  { id:"r3-gw9-4",  round:3, gameweek:9, date:"2025-10-25", kickoffLabel:"Sat 25 Oct · 15:00", homeTeam:"Brighton",       awayTeam:"Leicester",     homeAbbr:"BHA", awayAbbr:"LEI", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open"  },
  { id:"r3-gw9-5",  round:3, gameweek:9, date:"2025-10-25", kickoffLabel:"Sat 25 Oct · 15:00", homeTeam:"Everton",        awayTeam:"Man Utd",       homeAbbr:"EVE", awayAbbr:"MNU", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open"  },
  { id:"r3-gw9-6",  round:3, gameweek:9, date:"2025-10-25", kickoffLabel:"Sat 25 Oct · 15:00", homeTeam:"Fulham",         awayTeam:"Bournemouth",   homeAbbr:"FUL", awayAbbr:"BOU", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open"  },
  { id:"r3-gw9-7",  round:3, gameweek:9, date:"2025-10-25", kickoffLabel:"Sat 25 Oct · 17:30", homeTeam:"Man City",       awayTeam:"Southampton",   homeAbbr:"MCI", awayAbbr:"SOU", homePredicted:3, awayPredicted:0, actualHome:null, actualAway:null, state:"Submitted" },
  { id:"r3-gw9-8",  round:3, gameweek:9, date:"2025-10-26", kickoffLabel:"Sun 26 Oct · 14:00", homeTeam:"Newcastle",      awayTeam:"Wolves",        homeAbbr:"NEW", awayAbbr:"WOL", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open"  },
  { id:"r3-gw9-9",  round:3, gameweek:9, date:"2025-10-26", kickoffLabel:"Sun 26 Oct · 16:30", homeTeam:"Spurs",          awayTeam:"Crystal Palace", homeAbbr:"TOT", awayAbbr:"CRY", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw9-10", round:3, gameweek:9, date:"2025-10-27", kickoffLabel:"Mon 27 Oct · 20:00", homeTeam:"Nottm Forest",   awayTeam:"Ipswich",       homeAbbr:"NFO", awayAbbr:"IPS", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Void", },

  // GW10-12 — future, no predictions
  { id:"r3-gw10-1", round:3, gameweek:10, date:"2025-11-01", kickoffLabel:"Sat 1 Nov · 12:30",  homeTeam:"Arsenal",        awayTeam:"Chelsea",       homeAbbr:"ARS", awayAbbr:"CHE", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw10-2", round:3, gameweek:10, date:"2025-11-01", kickoffLabel:"Sat 1 Nov · 15:00",  homeTeam:"Bournemouth",    awayTeam:"Man City",      homeAbbr:"BOU", awayAbbr:"MCI", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw10-3", round:3, gameweek:10, date:"2025-11-01", kickoffLabel:"Sat 1 Nov · 15:00",  homeTeam:"Brighton",       awayTeam:"Aston Villa",   homeAbbr:"BHA", awayAbbr:"AVL", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw10-4", round:3, gameweek:10, date:"2025-11-01", kickoffLabel:"Sat 1 Nov · 15:00",  homeTeam:"Crystal Palace", awayTeam:"Everton",       homeAbbr:"CRY", awayAbbr:"EVE", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw10-5", round:3, gameweek:10, date:"2025-11-01", kickoffLabel:"Sat 1 Nov · 15:00",  homeTeam:"Ipswich",        awayTeam:"Newcastle",     homeAbbr:"IPS", awayAbbr:"NEW", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw10-6", round:3, gameweek:10, date:"2025-11-01", kickoffLabel:"Sat 1 Nov · 15:00",  homeTeam:"Leicester",      awayTeam:"Spurs",         homeAbbr:"LEI", awayAbbr:"TOT", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw10-7", round:3, gameweek:10, date:"2025-11-01", kickoffLabel:"Sat 1 Nov · 17:30",  homeTeam:"Liverpool",      awayTeam:"Brentford",     homeAbbr:"LIV", awayAbbr:"BRE", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw10-8", round:3, gameweek:10, date:"2025-11-02", kickoffLabel:"Sun 2 Nov · 14:00",  homeTeam:"Man Utd",        awayTeam:"Leicester",     homeAbbr:"MNU", awayAbbr:"LEI", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw10-9", round:3, gameweek:10, date:"2025-11-02", kickoffLabel:"Sun 2 Nov · 16:30",  homeTeam:"West Ham",       awayTeam:"Nottm Forest",  homeAbbr:"WHU", awayAbbr:"NFO", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw10-10",round:3, gameweek:10, date:"2025-11-03", kickoffLabel:"Mon 3 Nov · 20:00",  homeTeam:"Wolves",         awayTeam:"Fulham",        homeAbbr:"WOL", awayAbbr:"FUL", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },

  { id:"r3-gw11-1", round:3, gameweek:11, date:"2025-11-08", kickoffLabel:"Sat 8 Nov · 12:30",  homeTeam:"Aston Villa",    awayTeam:"Newcastle",     homeAbbr:"AVL", awayAbbr:"NEW", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw11-2", round:3, gameweek:11, date:"2025-11-08", kickoffLabel:"Sat 8 Nov · 15:00",  homeTeam:"Bournemouth",    awayTeam:"Wolves",        homeAbbr:"BOU", awayAbbr:"WOL", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw11-3", round:3, gameweek:11, date:"2025-11-08", kickoffLabel:"Sat 8 Nov · 15:00",  homeTeam:"Chelsea",        awayTeam:"Arsenal",       homeAbbr:"CHE", awayAbbr:"ARS", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw11-4", round:3, gameweek:11, date:"2025-11-08", kickoffLabel:"Sat 8 Nov · 15:00",  homeTeam:"Everton",        awayTeam:"West Ham",      homeAbbr:"EVE", awayAbbr:"WHU", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw11-5", round:3, gameweek:11, date:"2025-11-08", kickoffLabel:"Sat 8 Nov · 15:00",  homeTeam:"Fulham",         awayTeam:"Brighton",      homeAbbr:"FUL", awayAbbr:"BHA", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw11-6", round:3, gameweek:11, date:"2025-11-08", kickoffLabel:"Sat 8 Nov · 15:00",  homeTeam:"Leicester",      awayTeam:"Crystal Palace", homeAbbr:"LEI", awayAbbr:"CRY", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw11-7", round:3, gameweek:11, date:"2025-11-08", kickoffLabel:"Sat 8 Nov · 17:30",  homeTeam:"Man City",       awayTeam:"Ipswich",       homeAbbr:"MCI", awayAbbr:"IPS", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw11-8", round:3, gameweek:11, date:"2025-11-09", kickoffLabel:"Sun 9 Nov · 14:00",  homeTeam:"Nottm Forest",   awayTeam:"Brentford",     homeAbbr:"NFO", awayAbbr:"BRE", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw11-9", round:3, gameweek:11, date:"2025-11-09", kickoffLabel:"Sun 9 Nov · 16:30",  homeTeam:"Southampton",    awayTeam:"Liverpool",     homeAbbr:"SOU", awayAbbr:"LIV", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw11-10",round:3, gameweek:11, date:"2025-11-10", kickoffLabel:"Mon 10 Nov · 20:00", homeTeam:"Spurs",          awayTeam:"Man Utd",       homeAbbr:"TOT", awayAbbr:"MNU", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },

  { id:"r3-gw12-1", round:3, gameweek:12, date:"2025-11-22", kickoffLabel:"Sat 22 Nov · 12:30", homeTeam:"Arsenal",        awayTeam:"Nottm Forest",  homeAbbr:"ARS", awayAbbr:"NFO", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw12-2", round:3, gameweek:12, date:"2025-11-22", kickoffLabel:"Sat 22 Nov · 15:00", homeTeam:"Brentford",      awayTeam:"Everton",       homeAbbr:"BRE", awayAbbr:"EVE", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw12-3", round:3, gameweek:12, date:"2025-11-22", kickoffLabel:"Sat 22 Nov · 15:00", homeTeam:"Chelsea",        awayTeam:"Leicester",     homeAbbr:"CHE", awayAbbr:"LEI", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw12-4", round:3, gameweek:12, date:"2025-11-22", kickoffLabel:"Sat 22 Nov · 15:00", homeTeam:"Crystal Palace", awayTeam:"Spurs",         homeAbbr:"CRY", awayAbbr:"TOT", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw12-5", round:3, gameweek:12, date:"2025-11-22", kickoffLabel:"Sat 22 Nov · 15:00", homeTeam:"Ipswich",        awayTeam:"Southampton",   homeAbbr:"IPS", awayAbbr:"SOU", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw12-6", round:3, gameweek:12, date:"2025-11-22", kickoffLabel:"Sat 22 Nov · 15:00", homeTeam:"Liverpool",      awayTeam:"Man City",      homeAbbr:"LIV", awayAbbr:"MCI", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw12-7", round:3, gameweek:12, date:"2025-11-22", kickoffLabel:"Sat 22 Nov · 17:30", homeTeam:"Man Utd",        awayTeam:"Bournemouth",   homeAbbr:"MNU", awayAbbr:"BOU", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw12-8", round:3, gameweek:12, date:"2025-11-23", kickoffLabel:"Sun 23 Nov · 14:00", homeTeam:"Newcastle",      awayTeam:"Fulham",        homeAbbr:"NEW", awayAbbr:"FUL", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw12-9", round:3, gameweek:12, date:"2025-11-23", kickoffLabel:"Sun 23 Nov · 16:30", homeTeam:"West Ham",       awayTeam:"Brighton",      homeAbbr:"WHU", awayAbbr:"BHA", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r3-gw12-10",round:3, gameweek:12, date:"2025-11-24", kickoffLabel:"Mon 24 Nov · 20:00", homeTeam:"Wolves",         awayTeam:"Aston Villa",   homeAbbr:"WOL", awayAbbr:"AVL", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },

  // ─── ROUNDS 4-9 — UPCOMING — just a sample, no predictions ────────────────
  { id:"r4-gw13-1", round:4, gameweek:13, date:"2025-11-29", kickoffLabel:"Sat 29 Nov · 15:00", homeTeam:"Arsenal",        awayTeam:"Fulham",        homeAbbr:"ARS", awayAbbr:"FUL", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r4-gw13-2", round:4, gameweek:13, date:"2025-11-29", kickoffLabel:"Sat 29 Nov · 15:00", homeTeam:"Chelsea",        awayTeam:"Aston Villa",   homeAbbr:"CHE", awayAbbr:"AVL", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r4-gw13-3", round:4, gameweek:13, date:"2025-11-29", kickoffLabel:"Sat 29 Nov · 15:00", homeTeam:"Liverpool",      awayTeam:"Southampton",   homeAbbr:"LIV", awayAbbr:"SOU", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r4-gw13-4", round:4, gameweek:13, date:"2025-11-29", kickoffLabel:"Sat 29 Nov · 15:00", homeTeam:"Man City",       awayTeam:"Spurs",         homeAbbr:"MCI", awayAbbr:"TOT", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r4-gw13-5", round:4, gameweek:13, date:"2025-11-29", kickoffLabel:"Sat 29 Nov · 15:00", homeTeam:"Newcastle",      awayTeam:"Brighton",      homeAbbr:"NEW", awayAbbr:"BHA", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r4-gw14-1", round:4, gameweek:14, date:"2025-12-06", kickoffLabel:"Sat 6 Dec · 15:00",  homeTeam:"Everton",        awayTeam:"Arsenal",       homeAbbr:"EVE", awayAbbr:"ARS", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r4-gw14-2", round:4, gameweek:14, date:"2025-12-06", kickoffLabel:"Sat 6 Dec · 15:00",  homeTeam:"Man Utd",        awayTeam:"Liverpool",     homeAbbr:"MNU", awayAbbr:"LIV", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r4-gw15-1", round:4, gameweek:15, date:"2025-12-13", kickoffLabel:"Sat 13 Dec · 15:00", homeTeam:"Arsenal",        awayTeam:"Everton",       homeAbbr:"ARS", awayAbbr:"EVE", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r4-gw16-1", round:4, gameweek:16, date:"2025-12-20", kickoffLabel:"Sat 20 Dec · 15:00", homeTeam:"Liverpool",      awayTeam:"Spurs",         homeAbbr:"LIV", awayAbbr:"TOT", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },

  { id:"r5-gw17-1", round:5, gameweek:17, date:"2025-12-26", kickoffLabel:"Fri 26 Dec · 15:00", homeTeam:"Man City",       awayTeam:"Arsenal",       homeAbbr:"MCI", awayAbbr:"ARS", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r5-gw18-1", round:5, gameweek:18, date:"2026-01-01", kickoffLabel:"Thu 1 Jan · 15:00",  homeTeam:"Arsenal",        awayTeam:"Man City",      homeAbbr:"ARS", awayAbbr:"MCI", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r5-gw19-1", round:5, gameweek:19, date:"2026-01-10", kickoffLabel:"Sat 10 Jan · 15:00", homeTeam:"Liverpool",      awayTeam:"Man Utd",       homeAbbr:"LIV", awayAbbr:"MNU", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r5-gw20-1", round:5, gameweek:20, date:"2026-01-17", kickoffLabel:"Sat 17 Jan · 15:00", homeTeam:"Chelsea",        awayTeam:"Liverpool",     homeAbbr:"CHE", awayAbbr:"LIV", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },

  { id:"r6-gw21-1", round:6, gameweek:21, date:"2026-01-21", kickoffLabel:"Wed 21 Jan · 20:00", homeTeam:"Arsenal",        awayTeam:"Aston Villa",   homeAbbr:"ARS", awayAbbr:"AVL", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r6-gw22-1", round:6, gameweek:22, date:"2026-01-31", kickoffLabel:"Sat 31 Jan · 15:00", homeTeam:"Man City",       awayTeam:"Chelsea",       homeAbbr:"MCI", awayAbbr:"CHE", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r6-gw23-1", round:6, gameweek:23, date:"2026-02-07", kickoffLabel:"Sat 7 Feb · 15:00",  homeTeam:"Liverpool",      awayTeam:"Arsenal",       homeAbbr:"LIV", awayAbbr:"ARS", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r6-gw24-1", round:6, gameweek:24, date:"2026-02-14", kickoffLabel:"Sat 14 Feb · 15:00", homeTeam:"Arsenal",        awayTeam:"Man Utd",       homeAbbr:"ARS", awayAbbr:"MNU", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },

  { id:"r7-gw25-1", round:7, gameweek:25, date:"2026-02-21", kickoffLabel:"Sat 21 Feb · 15:00", homeTeam:"Chelsea",        awayTeam:"Man City",      homeAbbr:"CHE", awayAbbr:"MCI", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r7-gw26-1", round:7, gameweek:26, date:"2026-02-28", kickoffLabel:"Sat 28 Feb · 15:00", homeTeam:"Man Utd",        awayTeam:"Arsenal",       homeAbbr:"MNU", awayAbbr:"ARS", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r7-gw27-1", round:7, gameweek:27, date:"2026-03-07", kickoffLabel:"Sat 7 Mar · 15:00",  homeTeam:"Arsenal",        awayTeam:"Chelsea",       homeAbbr:"ARS", awayAbbr:"CHE", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r7-gw28-1", round:7, gameweek:28, date:"2026-03-14", kickoffLabel:"Sat 14 Mar · 15:00", homeTeam:"Liverpool",      awayTeam:"Chelsea",       homeAbbr:"LIV", awayAbbr:"CHE", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },

  { id:"r8-gw29-1", round:8, gameweek:29, date:"2026-03-21", kickoffLabel:"Sat 21 Mar · 15:00", homeTeam:"Man City",       awayTeam:"Liverpool",     homeAbbr:"MCI", awayAbbr:"LIV", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r8-gw30-1", round:8, gameweek:30, date:"2026-04-04", kickoffLabel:"Sat 4 Apr · 15:00",  homeTeam:"Arsenal",        awayTeam:"Newcastle",     homeAbbr:"ARS", awayAbbr:"NEW", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r8-gw31-1", round:8, gameweek:31, date:"2026-04-11", kickoffLabel:"Sat 11 Apr · 15:00", homeTeam:"Chelsea",        awayTeam:"Spurs",         homeAbbr:"CHE", awayAbbr:"TOT", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r8-gw32-1", round:8, gameweek:32, date:"2026-04-18", kickoffLabel:"Sat 18 Apr · 15:00", homeTeam:"Liverpool",      awayTeam:"Everton",       homeAbbr:"LIV", awayAbbr:"EVE", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r8-gw33-1", round:8, gameweek:33, date:"2026-04-25", kickoffLabel:"Sat 25 Apr · 15:00", homeTeam:"Man City",       awayTeam:"Man Utd",       homeAbbr:"MCI", awayAbbr:"MNU", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },

  { id:"r9-gw34-1", round:9, gameweek:34, date:"2026-05-02", kickoffLabel:"Sat 2 May · 15:00",  homeTeam:"Arsenal",        awayTeam:"Liverpool",     homeAbbr:"ARS", awayAbbr:"LIV", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r9-gw35-1", round:9, gameweek:35, date:"2026-05-09", kickoffLabel:"Sat 9 May · 15:00",  homeTeam:"Chelsea",        awayTeam:"Arsenal",       homeAbbr:"CHE", awayAbbr:"ARS", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r9-gw36-1", round:9, gameweek:36, date:"2026-05-16", kickoffLabel:"Sat 16 May · 15:00", homeTeam:"Liverpool",      awayTeam:"Chelsea",       homeAbbr:"LIV", awayAbbr:"CHE", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r9-gw37-1", round:9, gameweek:37, date:"2026-05-17", kickoffLabel:"Sun 17 May · 15:00", homeTeam:"Man City",       awayTeam:"Arsenal",       homeAbbr:"MCI", awayAbbr:"ARS", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
  { id:"r9-gw38-1", round:9, gameweek:38, date:"2026-05-24", kickoffLabel:"Sun 24 May · 16:00", homeTeam:"Arsenal",        awayTeam:"Everton",       homeAbbr:"ARS", awayAbbr:"EVE", homePredicted:null, awayPredicted:null, actualHome:null, actualAway:null, state:"Open" },
];

// Helper to get fixtures for a specific round
export function getFixturesByRound(round: number): SeasonFixture[] {
  return ALL_SEASON_FIXTURES.filter(f => f.round === round);
}

// Helper to get fixtures grouped by gameweek within a round
export function getFixturesByRoundGrouped(round: number): Map<number, SeasonFixture[]> {
  const fixtures = getFixturesByRound(round);
  const map = new Map<number, SeasonFixture[]>();
  fixtures.forEach(f => {
    if (!map.has(f.gameweek)) map.set(f.gameweek, []);
    map.get(f.gameweek)!.push(f);
  });
  return map;
}

// Leaderboard generator
export function generateLeaderboard(leagueId: string, currentUserName: string) {
  const names = [
    "Mason Trent","Aisha Cole","Luca Shaw","Dan Briggs","Sophie Wells","Kai Morton","Emma Grant",
    "Finn Okafor","Priya Nair","Josh Hartley","Chloe Beck","Ryan Moss","Leila Patel","Tom Chase",
    "Hannah Voss","Sam Burke","Zara Ahmed","Ollie Penn","Jade Cross","Marcus Reid","Lucy Carr",
    "Ben Foley","Nina Holt","Alex Drake","Cait Moore","Declan Fox","Iris Tang","Owen Kirk",
    "Maya Shah","Felix Webb","Sasha Long","Connor Ray","Tia James","Rhys Owen","Clara Stone",
    "Idris Mann","Zoe Hunt","Tyler Bass","Amara Diop","Kieran Fry","Rosa Lim","Harvey Cole",
    "Nadia Syed","Jack Pine","Ellie Forde","Calum West","Freya Nash","Dion Osei","Mia Cross",
    "Luke Baird", currentUserName,
    "Yusuf Ali","Petra Kos","Adrian Grey","Simone Park","Beau Lane","Orla Dunn","Remi Blanc",
    "Celia Rao","Angus Hope","Tanya Frost","Eli Chen","Vera Shah","Dara Mack","Jasper Flynn",
    "Ingrid Sol","Piers Daye","Carmen Wu","Noel Hayes","Bree Scott","Marco Bell","Lena Kim",
    "Aaron Pike","Fleur Dodd","Seth Vance","Nina Rees","Oscar Tang","Isla Ford","Hugh Tate",
    "Wendy Sims","Cyrus Bok","Demi Park","Lance Nunn","Rita Fenn","Gareth Snow","Asha Rowe",
    "Cleo Dale","Bruno Rex","Tilda Knox","Zach Moon","Petra Drum","Nico Hale","Fern Bale",
    "Sven Loch","Joy Birch","Kira Ash","Nate Drum","Suki Fen","Len Pratt","Dot Gibbs",
    "Walt Foss","Uma Cope",
  ];

  const pts = Array.from({ length: 100 }, (_, i) => Math.max(1, 89 - i));

  return names.slice(0, 100).map((name, i) => ({
    pos: i + 1,
    name,
    isMe: name === currentUserName,
    pts: pts[i],
    results: Math.max(0, 18 - Math.floor(i * 0.18)),
    scores: Math.max(0, 8 - Math.floor(i * 0.08)),
    movement: [2, -1, 0, 3, -2, 1, 0, -1, 2, -3][i % 10],
  }));
}

export const ALL_LEAGUES = [
  { id: "kickoff-one",   name: "Kickoff One",   entry: 1,  players: 248, prize: "£248",   status: "Open",    joined: true  },
  { id: "matchday-five", name: "Matchday Five", entry: 5,  players: 182, prize: "£910",   status: "Open",    joined: false },
  { id: "premier-ten",   name: "Premier Ten",   entry: 10, players: 139, prize: "£1,390", status: "Limited", joined: true  },
  { id: "grand-twenty",  name: "Grand Twenty",  entry: 20, players: 87,  prize: "£1,740", status: "Closing", joined: false },
  { id: "elite-fifty",   name: "Elite Fifty",   entry: 50, players: 36,  prize: "£1,800", status: "Closing", joined: false },
];

export const LEAGUE_ACCENT: Record<string, string> = {
  "kickoff-one":   "#34d379",
  "matchday-five": "#2dd4bf",
  "premier-ten":   "#a3e635",
  "grand-twenty":  "#fbbf24",
  "elite-fifty":   "#f59e0b",
};

export const PAYMENTS = [
  { id:1, league:"Premier Ten",  round:"Round 3", amount:"£10.00", date:"12 Oct 2025", status:"Paid" },
  { id:2, league:"Kickoff One",  round:"Round 3", amount:"£1.00",  date:"12 Oct 2025", status:"Paid" },
  { id:3, league:"Premier Ten",  round:"Round 2", amount:"£10.00", date:"5 Sep 2025",  status:"Paid" },
  { id:4, league:"Kickoff One",  round:"Round 2", amount:"£1.00",  date:"5 Sep 2025",  status:"Paid" },
  { id:5, league:"Premier Ten",  round:"Round 1", amount:"£10.00", date:"1 Aug 2025",  status:"Paid" },
];
