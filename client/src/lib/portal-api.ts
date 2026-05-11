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
};

export type Competition = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  externalCode: string;
  currentRound: CurrentRound;
  pools: Pool[];
};

export type UserEntry = {
  id: string;
  poolId: string;
  competitionId: string;
  competitionSlug: string;
  competitionShortName: string;
  poolName: string;
  tierName: string;
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
};

export type EnterPoolResponse = {
  entryId: string;
  alreadyEntered: boolean;
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
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
  // 401 means logged-out — return empty rather than throwing, so Home can
  // render the empty-state without auth-coupling.
  const res = await fetch("/api/entries/me", { credentials: "include" });
  if (res.status === 401) return [];
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as UserEntry[];
}

export async function fetchPoolDetail(poolId: string): Promise<PoolDetail> {
  return getJson<PoolDetail>(`/api/pools/${encodeURIComponent(poolId)}`);
}

/**
 * Enter a pool — the mock-money flow. Returns the new (or existing) entry id.
 *
 * The server accepts both fresh entries (201) and idempotent re-hits (200);
 * both surface here as a successful response with `alreadyEntered` indicating
 * which case it was. Genuine errors (400/403/404/500) throw with the server
 * message text so the caller can show it.
 */
export async function enterPool(poolId: string): Promise<EnterPoolResponse> {
  const res = await fetch(`/api/pools/${encodeURIComponent(poolId)}/enter`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
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
