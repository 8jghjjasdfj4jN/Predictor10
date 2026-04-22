// footballService.ts
// Fetches Premier League data from our own backend (/api/fixtures etc.)
// The backend proxies football-data.org and caches responses — the API key
// never touches the browser.

export type MatchStatus =
  | "SCHEDULED"
  | "TIMED"
  | "IN_PLAY"
  | "PAUSED"
  | "FINISHED"
  | "SUSPENDED"
  | "POSTPONED"
  | "CANCELLED"
  | "AWARDED";

export type FDMatch = {
  id: number;
  matchday: number;
  utcDate: string;
  status: MatchStatus;
  homeTeam: { id: number; name: string; shortName: string; tla: string };
  awayTeam: { id: number; name: string; shortName: string; tla: string };
  score: {
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
  };
};

export type FDFixturesResponse = {
  matches: FDMatch[];
  resultSet?: { count: number; first: string; last: string; played: number };
};

// Map football-data.org status → our app's FixtureState
export function mapStatus(
  status: MatchStatus,
  hasPrediction: boolean
): "Open" | "Locked" | "Submitted" | "Void" | "Completed" | "Syncing" {
  switch (status) {
    case "FINISHED":
    case "AWARDED":
      return "Completed";
    case "IN_PLAY":
    case "PAUSED":
      return "Syncing";
    case "POSTPONED":
    case "CANCELLED":
    case "SUSPENDED":
      return "Void";
    case "SCHEDULED":
    case "TIMED":
    default:
      return hasPrediction ? "Submitted" : "Open";
  }
}

// Format a UTC date string to a readable kickoff label
export function formatKickoff(utcDate: string): string {
  const d = new Date(utcDate);
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

// Fetch all season fixtures from our backend
export async function fetchAllFixtures(): Promise<FDFixturesResponse> {
  const res = await fetch("/api/fixtures");
  if (!res.ok) throw new Error(`Fixtures API error: ${res.status}`);
  return res.json();
}

// Fetch a single gameweek
export async function fetchGameweek(gw: number): Promise<FDFixturesResponse> {
  const res = await fetch(`/api/fixtures/gameweek/${gw}`);
  if (!res.ok) throw new Error(`Gameweek API error: ${res.status}`);
  return res.json();
}

// Fetch live/in-play matches
export async function fetchLive(): Promise<FDFixturesResponse> {
  const res = await fetch("/api/fixtures/live");
  if (!res.ok) throw new Error(`Live API error: ${res.status}`);
  return res.json();
}

// Map football-data.org matchday (1-38) to our Round (1-9)
// Round 1 = GW1-4, Round 2 = GW5-8, ... Round 8 = GW29-33, Round 9 = GW34-38
export function matchdayToRound(matchday: number): number {
  if (matchday <= 4) return 1;
  if (matchday <= 8) return 2;
  if (matchday <= 12) return 3;
  if (matchday <= 16) return 4;
  if (matchday <= 20) return 5;
  if (matchday <= 24) return 6;
  if (matchday <= 28) return 7;
  if (matchday <= 33) return 8;
  return 9;
}

// Convert a football-data.org match to our internal SeasonFixture shape
// (preserving any existing user predictions passed in)
export function fdMatchToFixture(
  match: FDMatch,
  predictions?: { homePredicted: number | null; awayPredicted: number | null }
) {
  const hasPrediction =
    predictions?.homePredicted !== null &&
    predictions?.awayPredicted !== null &&
    predictions?.homePredicted !== undefined &&
    predictions?.awayPredicted !== undefined;

  return {
    id: `fd-${match.id}`,
    round: matchdayToRound(match.matchday),
    gameweek: match.matchday,
    date: match.utcDate,
    kickoffLabel: formatKickoff(match.utcDate),
    homeTeam: match.homeTeam.name,
    awayTeam: match.awayTeam.name,
    homeAbbr: match.homeTeam.tla,
    awayAbbr: match.awayTeam.tla,
    homePredicted: predictions?.homePredicted ?? null,
    awayPredicted: predictions?.awayPredicted ?? null,
    actualHome: match.score.fullTime.home,
    actualAway: match.score.fullTime.away,
    state: mapStatus(match.status, hasPrediction),
    pointsEarned: calculatePoints(
      match.score.fullTime.home,
      match.score.fullTime.away,
      predictions?.homePredicted ?? null,
      predictions?.awayPredicted ?? null
    ),
  };
}

// Auto-calculate points from a completed match
export function calculatePoints(
  actualHome: number | null,
  actualAway: number | null,
  predHome: number | null,
  predAway: number | null
): number | undefined {
  if (
    actualHome === null || actualAway === null ||
    predHome === null || predAway === null
  ) return undefined;

  // Exact score = 5 points
  if (predHome === actualHome && predAway === actualAway) return 5;

  // Correct result (win/draw/loss) = 2 points
  const actualResult = Math.sign(actualHome - actualAway);
  const predResult = Math.sign(predHome - predAway);
  if (actualResult === predResult) return 2;

  return 0;
}
