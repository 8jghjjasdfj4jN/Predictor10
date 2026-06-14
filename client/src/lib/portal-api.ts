/*
Predictor10 — typed client wrappers for the portal API.

DTO types here mirror server/lib/portal-data.ts; keep them in sync. When
this app gains a shared types package we'll move them there. For now the
duplication is small and intentional — each side compiles independently.
*/

export type CurrentRound = {
  stageId: string;
  name: string;
  ordinal: number;
  matchdays: number[];
  matchdayLabel: "GW" | "MD";
  startDate: string | null;
  endDate: string | null;
};

export type Tier = {
  slug: string;
  name: string;
  entryFee: string; // numeric string from postgres decimal
  ordinal: number;
};

export type Pool = {
  id: string;
  name: string;
  tier: Tier;
  opensAt: string;
  closesAt: string;
  entryCount: number;
  status: "draft" | "open" | "locked" | "settled" | "void";
  /**
   * Per-rank prize amounts for the current entry count, net of house fee
   * (step 2n — 25% commission, top 3 at 60/25/15). Amounts are pounds.pence
   * strings ready for display ("22.49"). Empty when entryCount=0 — no pot
   * yet. Settlement uses the same rounding so these numbers match what
   * actually gets paid out.
   */
  prizeBreakdown: PrizeBreakdownEntry[];
};

export type PrizeBreakdownEntry = {
  rank: number;
  amount: string; // "22.49"
};

export type Competition = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  externalCode: string;
  /**
   * Per-competition postponement policy. UI uses this to branch the Home
   * card CTA: `'wait'` (PL/Champ) → tier picker; `'forfeit'` (WC) →
   * single-Enter confirm screen.
   */
  postponedPolicy: "wait" | "forfeit";
  currentRound: CurrentRound;
  pools: Pool[];
};

export type UserEntry = {
  id: string;
  poolId: string;
  competitionId: string;
  competitionSlug: string;
  competitionShortName: string;
  /** "forfeit" = tournament-style (WC). UI groups these under TOURNAMENT. */
  postponedPolicy: "wait" | "forfeit";
  poolName: string;
  tierName: string;
  roundName: string;
  closesAt: string;
  roundEndDate: string | null;
  enteredAt: string;
  predictionsTotal: number;
  predictionsMade: number;
};

export type PoolDetail = {
  id: string;
  name: string;
  status: "draft" | "open" | "locked" | "settled" | "void";
  opensAt: string;
  closesAt: string;
  entryCount: number;
  tier: Tier;
  competition: {
    id: string;
    slug: string;
    name: string;
    shortName: string;
    externalCode: string;
  };
  currentRound: CurrentRound;
  entryWindow: "open" | "late" | "closed";
  firstKickoffAt: string | null;
  matchesLocked: number;
  matchesTotal: number;
  bypassActive: boolean;
  myEntry: { id: string; enteredAt: string } | null;
  /** Same shape as Pool.prizeBreakdown. */
  prizeBreakdown: PrizeBreakdownEntry[];
};

export type EnterPoolResponse = {
  entryId: string;
  alreadyEntered: boolean;
};

export type EntryMatchPrediction = {
  homeScore: number;
  awayScore: number;
  updatedAt: string;
  // null until the outcome sync runs for this match.
  points: number | null;
  isExact: boolean | null;
  isCorrectResult: boolean | null;
};

export type EntryMatchOutcome = {
  homeScore: number;
  awayScore: number;
  finishedAt: string;
};

export type EntryMatch = {
  eventId: string;
  matchday: number | null;
  // Nullable since step 3a.4 — tournament knockout fixtures expose null
  // teams until the bracket fills in. UI renders "TBD" via displayTeamName.
  homeTeam: string | null;
  awayTeam: string | null;
  homeTeamShort: string | null;
  awayTeamShort: string | null;
  /** "A", "B", ... "L" for tournament group-stage matches. Null otherwise. */
  groupLabel: string | null;
  /**
   * Football-data stage string. "GROUP_STAGE" for group matches; "LAST_32",
   * "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE_PLAYOFF" or
   * "FINAL" for knockouts. Null for league matches. The Predict screen
   * uses this to render sub-headings in the Knockout Stages tab.
   */
  fdStage: string | null;
  kickoffAt: string;
  predictionLockAt: string;
  isLocked: boolean;
  status: "scheduled" | "live" | "finished" | "postponed" | "cancelled" | "void";
  prediction: EntryMatchPrediction | null;
  outcome: EntryMatchOutcome | null;
};

export type EntryGameweek = {
  matchday: number; // -1 reserved for "Unscheduled"
  label: string;
  matchCount: number;
  predictionCount: number;
  lockedCount: number;
  finishedCount: number;
  pointsTotal: number;
};

export type EntryDetail = {
  id: string;
  poolId: string;
  enteredAt: string;
  settledAt: string | null;
  finalPoints: number | null;
  finalRank: number | null;
  pool: {
    id: string;
    name: string;
    status: "draft" | "open" | "locked" | "settled" | "void";
  };
  tier: Tier;
  competition: {
    id: string;
    slug: string;
    name: string;
    shortName: string;
    externalCode: string;
  };
  currentRound: CurrentRound;
  matchesTotal: number;
  predictionsMade: number;
  pointsTotal: number;
  gameweeks: EntryGameweek[];
  matches: EntryMatch[];
};

export type SavePredictionResponse = {
  eventId: string;
  prediction: EntryMatchPrediction;
};

// ─── 401 interceptor (step 2l follow-up — refresh-on-portal bug) ─────────
// Lets AuthContext register a callback that fires when ANY portal API call
// comes back with 401. That covers the "cookie expired mid-session" case —
// API call fails, callback flips the auth context to logged-out, the
// portal-URL → /login redirect in App.tsx Router catches the navigation
// from there. Module-level so it works from non-React code paths.

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

function notify401IfNeeded(res: Response): void {
  if (res.status === 401 && unauthorizedHandler) {
    unauthorizedHandler();
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  notify401IfNeeded(res);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // non-JSON error body — fall through with status text
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export async function fetchCompetitions(): Promise<Competition[]> {
  return getJson<Competition[]>("/api/competitions");
}

export async function fetchMyEntries(): Promise<UserEntry[]> {
  const res = await fetch("/api/entries/me", { credentials: "include" });
  notify401IfNeeded(res);
  // Returning [] on 401 keeps HomePage rendering during the brief moment
  // before the auth-state flip + redirect-to-login propagate through the
  // tree. Without this we'd flash a thrown-error state.
  if (res.status === 401) return [];
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as UserEntry[];
}

export async function fetchPoolDetail(poolId: string): Promise<PoolDetail> {
  return getJson<PoolDetail>(`/api/pools/${encodeURIComponent(poolId)}`);
}

export async function enterPool(poolId: string): Promise<EnterPoolResponse> {
  const res = await fetch(`/api/pools/${encodeURIComponent(poolId)}/enter`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  notify401IfNeeded(res);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // non-JSON error body
    }
    throw new Error(message);
  }
  return (await res.json()) as EnterPoolResponse;
}

export async function fetchEntryDetail(entryId: string): Promise<EntryDetail> {
  return getJson<EntryDetail>(`/api/entries/${encodeURIComponent(entryId)}`);
}

/**
 * A SavePredictionError can carry an HTTP status so the caller can distinguish
 * "I should revert the input" (403 EVENT_LOCKED) from "retry later" (5xx) from
 * "show a generic toast" (4xx).
 */
export class SavePredictionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "SavePredictionError";
  }
}

export async function savePrediction(
  entryId: string,
  eventId: string,
  homeScore: number,
  awayScore: number,
): Promise<SavePredictionResponse> {
  const res = await fetch(
    `/api/entries/${encodeURIComponent(entryId)}/predictions/${encodeURIComponent(eventId)}`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeScore, awayScore }),
    },
  );
  notify401IfNeeded(res);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // non-JSON error body
    }
    throw new SavePredictionError(message, res.status);
  }
  return (await res.json()) as SavePredictionResponse;
}

// ─── Account history (step 2j) ───────────────────────────────────────────

export type SettledEntry = {
  id: string;
  poolId: string;
  competitionSlug: string;
  competitionShortName: string;
  competitionName: string;
  tierName: string;
  tierSlug: string;
  tierOrdinal: number;
  roundOrdinal: number;
  roundName: string;
  roundEndDate: string | null;
  finalRank: number;
  finalPoints: number;
  entryCount: number;
  payoutAmount: string | null; // decimal string ("0.70") or null when no payout
  cashed: boolean;
  settledAt: string;
};

export type AccountHistory = {
  stats: {
    rounds: number;
    cashes: number;
    bestRank: number | null;
  };
  entries: SettledEntry[];
};

export async function fetchAccountHistory(): Promise<AccountHistory> {
  return getJson<AccountHistory>("/api/account/history");
}

// ─── Pick distribution (how the table called a locked match) ──────────────

export type ScorelineCount = { home: number; away: number; count: number };

export type EventDistribution = {
  total: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  topScorelines: ScorelineCount[];
};

export type PoolDistribution = {
  /** Keyed by eventId. Only locked events with at least one pick appear. */
  byEvent: Record<string, EventDistribution>;
};

export async function fetchPoolDistribution(poolId: string): Promise<PoolDistribution> {
  return getJson<PoolDistribution>(`/api/pools/${encodeURIComponent(poolId)}/distribution`);
}

// ─── League table (step 2k) ──────────────────────────────────────────────

export type PoolEntry = {
  entryId: string;
  rank: number;
  displayName: string;
  isYou: boolean;
  points: number;
  exacts: number;
  results: number;
};

export type PoolEntriesPool = {
  id: string;
  status: "draft" | "open" | "locked" | "settled" | "void";
  competitionShortName: string;
  competitionSlug: string;
  tierName: string;
  roundName: string;
  roundOrdinal: number;
  matchdayLabel: "GW" | "MD";
  settledAt: string | null;
  currentMatchdayOrdinal: number | null;
  totalMatchdays: number;
  /**
   * Tournament-aware status pill label. Set for tournament-style comps
   * (e.g. World Cup) where the matchday-based "GW2 of 3" model breaks
   * down during knockouts. Values: "Group MD2 of 3", "Round of 32",
   * "Round of 16", "Quarter-finals", "Semi-finals", "Third-place
   * playoff", "Final", or "Awaiting settlement". Null for league comps
   * (client falls back to matchdayLabel + currentMatchdayOrdinal +
   * totalMatchdays as before).
   */
  liveStatusLabel: string | null;
};

export type PoolEntriesPayload = {
  pool: PoolEntriesPool;
  viewer: { isEntrant: boolean };
  entries: PoolEntry[];
};

/**
 * Errors from /api/pools/:id/entries carry the HTTP status so the page can
 * distinguish 401 (not signed in), 403 (signed in but not entered), 404
 * (no such pool) and surface helpful copy.
 */
export class FetchPoolEntriesError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "FetchPoolEntriesError";
  }
}

export async function fetchPoolEntries(poolId: string): Promise<PoolEntriesPayload> {
  const res = await fetch(`/api/pools/${encodeURIComponent(poolId)}/entries`, {
    credentials: "include",
  });
  notify401IfNeeded(res);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // non-JSON error body
    }
    throw new FetchPoolEntriesError(message, res.status);
  }
  return (await res.json()) as PoolEntriesPayload;
}

// ─── Opponent predictions (lock-gated view of another entrant's picks) ─────

export type OpponentMatchPrediction = {
  homeScore: number;
  awayScore: number;
  points: number | null;
  isExact: boolean | null;
  isCorrectResult: boolean | null;
};

export type OpponentMatch = {
  eventId: string;
  matchday: number | null;
  homeTeam: string | null;
  awayTeam: string | null;
  homeTeamShort: string | null;
  awayTeamShort: string | null;
  groupLabel: string | null;
  fdStage: string | null;
  kickoffAt: string;
  predictionLockAt: string;
  isLocked: boolean;
  status: "scheduled" | "live" | "finished" | "postponed" | "cancelled" | "void";
  // True once the match has locked (or the entry is the viewer's own). Only
  // then does `prediction` carry scores — before lock the server omits them.
  predictionVisible: boolean;
  // Whether the player made a pick. Revealed pre-lock; only the scores are hidden.
  hasPrediction: boolean;
  // Non-null ONLY when predictionVisible.
  prediction: OpponentMatchPrediction | null;
  outcome: EntryMatchOutcome | null;
};

export type EntryPredictionsPayload = {
  pool: {
    id: string;
    status: "draft" | "open" | "locked" | "settled" | "void";
    competitionShortName: string;
    competitionSlug: string;
    tierName: string;
    roundName: string;
    isTournamentStyle: boolean;
    matchdayLabel: string;
    nullBucketLabel: string;
  };
  player: {
    entryId: string;
    displayName: string;
    isYou: boolean;
  };
  pointsVisibleTotal: number;
  matches: OpponentMatch[];
};

export class FetchEntryPredictionsError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "FetchEntryPredictionsError";
  }
}

export async function fetchEntryPredictions(
  poolId: string,
  entryId: string,
): Promise<EntryPredictionsPayload> {
  const res = await fetch(
    `/api/pools/${encodeURIComponent(poolId)}/entries/${encodeURIComponent(entryId)}/predictions`,
    { credentials: "include" },
  );
  notify401IfNeeded(res);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // non-JSON error body
    }
    throw new FetchEntryPredictionsError(message, res.status);
  }
  return (await res.json()) as EntryPredictionsPayload;
}

// ─── Admin portal ────────────────────────────────────────────────────────

export type AdminUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  nickname: string | null;
  displayName: string;
  countryCode: string;
  dateOfBirth: string;
  emailVerified: boolean;
  accountStatus: string;
  isAdmin: boolean;
  isPaid: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

export class AdminAccessError extends Error {
  constructor() {
    super("Admin access required.");
    this.name = "AdminAccessError";
  }
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const res = await fetch("/api/admin-portal/users", { credentials: "include" });
  notify401IfNeeded(res);
  if (res.status === 404) throw new AdminAccessError();
  if (!res.ok) throw new Error(`Failed to load users (${res.status}).`);
  const data = (await res.json()) as { users: AdminUser[] };
  return data.users;
}

export async function setAdminUserPaid(userId: string, isPaid: boolean): Promise<void> {
  const res = await fetch(`/api/admin-portal/users/${encodeURIComponent(userId)}/paid`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isPaid }),
  });
  notify401IfNeeded(res);
  if (!res.ok) {
    let message = `Failed to update paid status (${res.status}).`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* non-JSON */
    }
    throw new Error(message);
  }
}

export async function resetAdminUserPassword(userId: string, newPassword: string): Promise<void> {
  const res = await fetch(`/api/admin-portal/users/${encodeURIComponent(userId)}/password`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newPassword }),
  });
  notify401IfNeeded(res);
  if (!res.ok) {
    let message = `Failed to reset password (${res.status}).`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* non-JSON */
    }
    throw new Error(message);
  }
}

// ── WC CHAT (temporary) ── start — remove after WC (docs/wc-chat-teardown.md)

export type ChatMessage = {
  id: string;
  body: string;
  authorDisplayName: string;
  isMine: boolean;
  createdAt: string;
};

export type ChatPayload = {
  viewer: { isEntrant: boolean };
  messages: ChatMessage[];
};

/**
 * Chat errors carry the HTTP status so the page can distinguish 401 (sign in),
 * 403 (not an entrant), 404 (no pool) and surface the right copy.
 */
export class ChatError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ChatError";
  }
}

async function chatRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  notify401IfNeeded(res);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ChatError(message, res.status);
  }
  return (await res.json()) as T;
}

export async function fetchPoolMessages(poolId: string): Promise<ChatPayload> {
  return chatRequest<ChatPayload>(`/api/pools/${encodeURIComponent(poolId)}/messages`);
}

export async function postPoolMessage(poolId: string, body: string): Promise<ChatMessage> {
  const data = await chatRequest<{ message: ChatMessage }>(
    `/api/pools/${encodeURIComponent(poolId)}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    },
  );
  return data.message;
}

/** Admin-only — soft-delete (hide) a message. Server enforces is_admin. */
export async function hidePoolMessage(messageId: string, reason?: string): Promise<void> {
  await chatRequest<{ ok: true }>(
    `/api/admin-portal/messages/${encodeURIComponent(messageId)}/hide`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reason ? { reason } : {}),
    },
  );
}

// ── WC CHAT (temporary) ── end
