/*
Brand reminder — Broadcast Noir Athletics:
Premium football-broadcast feel, dark green-black base, disciplined hierarchy,
refined emerald highlights, plaque-like surfaces, competitive editorial pacing.
*/

export type FixtureState =
  | "Open"
  | "Locked"
  | "Submitted"
  | "Void"
  | "Completed"
  | "Syncing";

export type Fixture = {
  id: string;
  gameweek: number;
  round: number;
  date: string;
  kickoffLabel: string;
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string;
  awayAbbr: string;
  homeColor: string;
  awayColor: string;
  homePredicted: number | null;
  awayPredicted: number | null;
  actualHome: number | null;
  actualAway: number | null;
  state: FixtureState;
  venue: string;
  note?: string;
};

export type LeagueTier = {
  id: string;
  name: string;
  entry: number;
  tagline: string;
  players: number;
  prizePool: string;
  status: "Open" | "Limited" | "Closing";
  roundDuration: string;
  description: string;
  accent: string;
};

export type LeaderboardEntry = {
  position: number;
  name: string;
  movement: number;
  correctResults: number;
  correctScores: number;
  totalPoints: number;
  leagueId: string;
  streak: string;
};

export type HistoryRow = {
  fixture: string;
  prediction: string;
  result: string;
  gotResult: boolean;
  gotScore: boolean;
  points: number;
  state: FixtureState;
};

export type PlayerHistory = {
  playerName: string;
  league: string;
  round: string;
  season: string;
  summary: {
    points: number;
    correctResults: number;
    correctScores: number;
    rank: string;
  };
  rows: HistoryRow[];
};

export type PaymentState = "Ready" | "Pending" | "Success" | "Failed";

export const appMeta = {
  brand: "Predictor10",
  season: "2025/2026",
  currentRound: 3,
  currentGameweekBand: "Gameweeks 9–12",
  lockNotice: "Predictions close the day before kickoff",
  syncedAt: "Updated 14 minutes ago",
  nextDeadline: "Friday 18 Oct, 18:00",
};

export const leagueTiers: LeagueTier[] = [
  {
    id: "kickoff-one",
    name: "Kickoff One",
    entry: 1,
    tagline: "Weekly entry, low-friction start",
    players: 248,
    prizePool: "£248 projected",
    status: "Open",
    roundDuration: "Round 3 · 4 gameweeks",
    description: "Ideal for casual entry with full weekly competition energy.",
    accent: "from-emerald-500/40 via-emerald-400/10 to-transparent",
  },
  {
    id: "matchday-five",
    name: "Matchday Five",
    entry: 5,
    tagline: "Balanced value with sharper competition",
    players: 182,
    prizePool: "£910 projected",
    status: "Open",
    roundDuration: "Round 3 · 4 gameweeks",
    description: "The most active mid-tier pool with strong weekly movement.",
    accent: "from-teal-400/40 via-emerald-300/10 to-transparent",
  },
  {
    id: "premier-ten",
    name: "Premier Ten",
    entry: 10,
    tagline: "Popular tier for serious predictors",
    players: 139,
    prizePool: "£1,390 projected",
    status: "Limited",
    roundDuration: "Round 3 · 4 gameweeks",
    description: "A premium tier where exact scores start to separate the table.",
    accent: "from-lime-300/35 via-emerald-200/10 to-transparent",
  },
  {
    id: "grand-twenty",
    name: "Grand Twenty",
    entry: 20,
    tagline: "Sharper field, higher weekly tension",
    players: 87,
    prizePool: "£1,740 projected",
    status: "Closing",
    roundDuration: "Round 3 · 4 gameweeks",
    description: "Built for competitive users who want a more exclusive leaderboard.",
    accent: "from-amber-300/35 via-emerald-300/10 to-transparent",
  },
  {
    id: "elite-fifty",
    name: "Elite Fifty",
    entry: 50,
    tagline: "Invitation-feel competition tier",
    players: 36,
    prizePool: "£1,800 projected",
    status: "Closing",
    roundDuration: "Round 3 · 4 gameweeks",
    description: "Aspirational tier with tighter tables and a more elite identity.",
    accent: "from-yellow-200/40 via-emerald-300/10 to-transparent",
  },
];

export const currentLeague = leagueTiers[2];

export const roundOptions = [
  "Round 1 · Gameweeks 1–4",
  "Round 2 · Gameweeks 5–8",
  "Round 3 · Gameweeks 9–12",
  "Round 4 · Gameweeks 13–16",
  "Round 5 · Gameweeks 17–20",
  "Round 6 · Gameweeks 21–24",
  "Round 7 · Gameweeks 25–28",
  "Round 8 · Gameweeks 29–33",
  "Round 9 · Gameweeks 34–38",
];

export const currentFixtures: Fixture[] = [
  {
    id: "r3-gw9-1",
    gameweek: 9,
    round: 3,
    date: "2025-10-18T12:30:00",
    kickoffLabel: "Sat 18 Oct · 12:30",
    homeTeam: "North London FC",
    awayTeam: "Merseyside Red",
    homeAbbr: "NLD",
    awayAbbr: "MRD",
    homeColor: "from-red-500 to-red-700",
    awayColor: "from-rose-500 to-red-900",
    homePredicted: 2,
    awayPredicted: 1,
    actualHome: null,
    actualAway: null,
    state: "Submitted",
    venue: "Atlas Park",
  },
  {
    id: "r3-gw9-2",
    gameweek: 9,
    round: 3,
    date: "2025-10-18T15:00:00",
    kickoffLabel: "Sat 18 Oct · 15:00",
    homeTeam: "Blue Bridge",
    awayTeam: "Midlands City",
    homeAbbr: "BLU",
    awayAbbr: "MCI",
    homeColor: "from-blue-500 to-sky-700",
    awayColor: "from-cyan-400 to-blue-800",
    homePredicted: 1,
    awayPredicted: 1,
    actualHome: null,
    actualAway: null,
    state: "Open",
    venue: "Harbour Ground",
  },
  {
    id: "r3-gw9-3",
    gameweek: 9,
    round: 3,
    date: "2025-10-19T14:00:00",
    kickoffLabel: "Sun 19 Oct · 14:00",
    homeTeam: "Westford Athletic",
    awayTeam: "Tyne United",
    homeAbbr: "WFA",
    awayAbbr: "TYU",
    homeColor: "from-orange-400 to-amber-700",
    awayColor: "from-stone-400 to-neutral-700",
    homePredicted: null,
    awayPredicted: null,
    actualHome: null,
    actualAway: null,
    state: "Open",
    venue: "Crown Lane",
  },
  {
    id: "r3-gw9-4",
    gameweek: 9,
    round: 3,
    date: "2025-10-19T16:30:00",
    kickoffLabel: "Sun 19 Oct · 16:30",
    homeTeam: "South Coast Albion",
    awayTeam: "Manchester Slate",
    homeAbbr: "SCA",
    awayAbbr: "MSL",
    homeColor: "from-sky-300 to-blue-600",
    awayColor: "from-zinc-400 to-zinc-800",
    homePredicted: 0,
    awayPredicted: 2,
    actualHome: null,
    actualAway: null,
    state: "Locked",
    venue: "Marine End",
    note: "Locked after deadline",
  },
  {
    id: "r3-gw10-1",
    gameweek: 10,
    round: 3,
    date: "2025-10-25T15:00:00",
    kickoffLabel: "Sat 25 Oct · 15:00",
    homeTeam: "Capital Rovers",
    awayTeam: "Lancaster Vale",
    homeAbbr: "CPR",
    awayAbbr: "LNV",
    homeColor: "from-violet-400 to-fuchsia-800",
    awayColor: "from-emerald-400 to-green-800",
    homePredicted: null,
    awayPredicted: null,
    actualHome: null,
    actualAway: null,
    state: "Syncing",
    venue: "Riverlight Stadium",
    note: "Awaiting final TV slot confirmation",
  },
  {
    id: "r3-gw10-2",
    gameweek: 10,
    round: 3,
    date: "2025-10-26T16:00:00",
    kickoffLabel: "Sun 26 Oct · 16:00",
    homeTeam: "East Borough",
    awayTeam: "Seaside Wanderers",
    homeAbbr: "EBO",
    awayAbbr: "SEA",
    homeColor: "from-yellow-400 to-orange-700",
    awayColor: "from-cyan-300 to-teal-700",
    homePredicted: null,
    awayPredicted: null,
    actualHome: null,
    actualAway: null,
    state: "Void",
    venue: "Borough Lane",
    note: "Fixture void if rescheduling is confirmed",
  },
];

export const recentResults: Fixture[] = [
  {
    id: "r2-gw8-1",
    gameweek: 8,
    round: 2,
    date: "2025-10-05T16:30:00",
    kickoffLabel: "Sun 5 Oct · FT",
    homeTeam: "Manchester Slate",
    awayTeam: "North London FC",
    homeAbbr: "MSL",
    awayAbbr: "NLD",
    homeColor: "from-zinc-400 to-zinc-800",
    awayColor: "from-red-500 to-red-700",
    homePredicted: 1,
    awayPredicted: 2,
    actualHome: 1,
    actualAway: 2,
    state: "Completed",
    venue: "Granite Arena",
  },
  {
    id: "r2-gw8-2",
    gameweek: 8,
    round: 2,
    date: "2025-10-04T15:00:00",
    kickoffLabel: "Sat 4 Oct · FT",
    homeTeam: "Merseyside Red",
    awayTeam: "Blue Bridge",
    homeAbbr: "MRD",
    awayAbbr: "BLU",
    homeColor: "from-rose-500 to-red-900",
    awayColor: "from-blue-500 to-sky-700",
    homePredicted: 2,
    awayPredicted: 2,
    actualHome: 2,
    actualAway: 1,
    state: "Completed",
    venue: "Dockside Park",
  },
  {
    id: "r2-gw8-3",
    gameweek: 8,
    round: 2,
    date: "2025-10-04T17:30:00",
    kickoffLabel: "Sat 4 Oct · FT",
    homeTeam: "Tyne United",
    awayTeam: "South Coast Albion",
    homeAbbr: "TYU",
    awayAbbr: "SCA",
    homeColor: "from-stone-400 to-neutral-700",
    awayColor: "from-sky-300 to-blue-600",
    homePredicted: 1,
    awayPredicted: 0,
    actualHome: 0,
    actualAway: 0,
    state: "Completed",
    venue: "North Forge",
  },
];

export const upcomingFixtures: Fixture[] = [
  {
    id: "r3-gw11-1",
    gameweek: 11,
    round: 3,
    date: "2025-11-01T12:30:00",
    kickoffLabel: "Sat 1 Nov · 12:30",
    homeTeam: "Midlands City",
    awayTeam: "Capital Rovers",
    homeAbbr: "MCI",
    awayAbbr: "CPR",
    homeColor: "from-cyan-400 to-blue-800",
    awayColor: "from-violet-400 to-fuchsia-800",
    homePredicted: null,
    awayPredicted: null,
    actualHome: null,
    actualAway: null,
    state: "Open",
    venue: "Northworks",
  },
  {
    id: "r3-gw11-2",
    gameweek: 11,
    round: 3,
    date: "2025-11-02T14:00:00",
    kickoffLabel: "Sun 2 Nov · 14:00",
    homeTeam: "Lancaster Vale",
    awayTeam: "Westford Athletic",
    homeAbbr: "LNV",
    awayAbbr: "WFA",
    homeColor: "from-emerald-400 to-green-800",
    awayColor: "from-orange-400 to-amber-700",
    homePredicted: null,
    awayPredicted: null,
    actualHome: null,
    actualAway: null,
    state: "Open",
    venue: "Vale Point",
  },
  {
    id: "r3-gw12-1",
    gameweek: 12,
    round: 3,
    date: "2025-11-09T16:30:00",
    kickoffLabel: "Sun 9 Nov · 16:30",
    homeTeam: "Seaside Wanderers",
    awayTeam: "North London FC",
    homeAbbr: "SEA",
    awayAbbr: "NLD",
    homeColor: "from-cyan-300 to-teal-700",
    awayColor: "from-red-500 to-red-700",
    homePredicted: null,
    awayPredicted: null,
    actualHome: null,
    actualAway: null,
    state: "Open",
    venue: "Harbour Crescent",
  },
];

export const leaderboardEntries: LeaderboardEntry[] = [
  {
    position: 1,
    name: "Mason Trent",
    movement: 2,
    correctResults: 12,
    correctScores: 4,
    totalPoints: 44,
    leagueId: "premier-ten",
    streak: "3 exact scores in last 5",
  },
  {
    position: 2,
    name: "Aisha Cole",
    movement: 0,
    correctResults: 13,
    correctScores: 3,
    totalPoints: 41,
    leagueId: "premier-ten",
    streak: "Consistent 4-week run",
  },
  {
    position: 3,
    name: "Luca Shaw",
    movement: 1,
    correctResults: 11,
    correctScores: 3,
    totalPoints: 37,
    leagueId: "premier-ten",
    streak: "Climbed after Round 2",
  },
  {
    position: 4,
    name: "Noah Sinclair",
    movement: -1,
    correctResults: 10,
    correctScores: 3,
    totalPoints: 35,
    leagueId: "premier-ten",
    streak: "1 point behind top 3",
  },
  {
    position: 5,
    name: "Zara Bennett",
    movement: 3,
    correctResults: 9,
    correctScores: 3,
    totalPoints: 33,
    leagueId: "premier-ten",
    streak: "Strong Round 2 finish",
  },
  {
    position: 6,
    name: "Theo Marsh",
    movement: -2,
    correctResults: 9,
    correctScores: 2,
    totalPoints: 28,
    leagueId: "premier-ten",
    streak: "Needs exact scores",
  },
];

export const featuredHistory: PlayerHistory = {
  playerName: "Mason Trent",
  league: "Premier Ten",
  round: "Round 2 · Gameweeks 5–8",
  season: "2025/2026",
  summary: {
    points: 17,
    correctResults: 5,
    correctScores: 1,
    rank: "1st in league",
  },
  rows: [
    {
      fixture: "Manchester Slate vs North London FC",
      prediction: "1–2",
      result: "1–2",
      gotResult: true,
      gotScore: true,
      points: 5,
      state: "Completed",
    },
    {
      fixture: "Merseyside Red vs Blue Bridge",
      prediction: "2–2",
      result: "2–1",
      gotResult: true,
      gotScore: false,
      points: 2,
      state: "Completed",
    },
    {
      fixture: "Tyne United vs South Coast Albion",
      prediction: "1–0",
      result: "0–0",
      gotResult: false,
      gotScore: false,
      points: 0,
      state: "Completed",
    },
    {
      fixture: "Capital Rovers vs East Borough",
      prediction: "3–1",
      result: "2–1",
      gotResult: true,
      gotScore: false,
      points: 2,
      state: "Completed",
    },
    {
      fixture: "Lancaster Vale vs Westford Athletic",
      prediction: "0–0",
      result: "0–0",
      gotResult: true,
      gotScore: true,
      points: 5,
      state: "Completed",
    },
    {
      fixture: "Seaside Wanderers vs Midlands City",
      prediction: "1–1",
      result: "2–2",
      gotResult: true,
      gotScore: false,
      points: 2,
      state: "Completed",
    },
    {
      fixture: "Blue Bridge vs Capital Rovers",
      prediction: "0–0",
      result: "Postponed",
      gotResult: false,
      gotScore: false,
      points: 0,
      state: "Void",
    },
    {
      fixture: "North London FC vs Merseyside Red",
      prediction: "Pending",
      result: "Upcoming",
      gotResult: false,
      gotScore: false,
      points: 0,
      state: "Open",
    },
  ],
};

export const rules = [
  "Predict Premier League scorelines for fixtures in each round.",
  "5 points for an exact score.",
  "2 points for the correct result.",
  "Round 1 = Gameweeks 1–4.",
  "Round 2 = Gameweeks 5–8.",
  "Round 3 = Gameweeks 9–12.",
  "Round 4 = Gameweeks 13–16.",
  "Round 5 = Gameweeks 17–20.",
  "Round 6 = Gameweeks 21–24.",
  "Round 7 = Gameweeks 25–28.",
  "Round 8 = Gameweeks 29–33.",
  "Round 9 = Gameweeks 34–38, with extra fixtures in the final two rounds.",
  "Predictions can be changed up to the day before kickoff.",
  "If a fixture is postponed, deleted, or void, it does not count.",
  "The leaderboard is shown per round.",
  "Entry money is required for each round before play.",
  "Users may still enter after a round starts, but the round price stays the same.",
];

export const paymentSummary = {
  leagueName: currentLeague.name,
  roundLabel: `Round ${appMeta.currentRound}`,
  entries: 1,
  subtotal: currentLeague.entry,
  total: currentLeague.entry,
  state: "Ready" as PaymentState,
};

export const paymentStates: Record<PaymentState, { title: string; detail: string }> = {
  Ready: {
    title: "Ready to pay",
    detail: "Your round entry is queued and the payment provider can plug in here later.",
  },
  Pending: {
    title: "Payment pending",
    detail: "Hold this state for provider confirmation or 3D Secure checks.",
  },
  Success: {
    title: "Entry secured",
    detail: "Predictions remain editable until the lock deadline is reached.",
  },
  Failed: {
    title: "Payment failed",
    detail: "Retry or choose another tier before the round deadline.",
  },
};

export const profilePlaceholders = [
  "Profile",
  "Settings",
  "Payment history",
  "Future login",
];

export const syncStatuses = [
  "Fixtures adapter: live placeholder",
  "Score calculation engine: ready for exact/result points",
  "Season calendar awareness: mocked for 2025/2026",
  "Reschedule handling: syncing / void states represented",
];
