/*
Predictor10 — one-shot seed + sync.

Run: `pnpm seed`

Idempotent. What it does:
  1. Sport row (football)
  2. Competition rows (Premier League, EFL Championship)
  3. Tier rows (5 leagues: Pound, Fiver, Tenner, Pony, Big One)
  4. Fixture sync from football-data.org for the 2025/26 season
     - Upserts events keyed by football-data match id
     - Groups them into the 9 Rounds per arch §3
     - Sets predictionLockAt = kickoff − 1 hour
  5. Pools for the **current** Round only (= lowest-ordinal Round still
     having future kickoffs). 5 pools per competition × 2 competitions = 10.

Past Rounds are populated as stages + events but get no pool rows — a brand-
new user shouldn't see "settled pools they were never in" cluttering the
archive (per the decision flagged at step 2c plan).

Network: 2 calls to football-data.org (one per competition). Well under
the 10 req/min free-tier ceiling.
*/

import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { sports, competitions, stages, events } from "../db/schema/sports";
import { leagues } from "../db/schema/leagues";
import { pools } from "../db/schema/pools";
import { ROUNDS_BY_CODE, roundForMatchday } from "../lib/rounds";

const SEASON = 2025; // football-data convention: starting year → 2025/26

const FOOTBALL_API_BASE = "https://api.football-data.org/v4";

const TIERS = [
  { slug: "pound",   name: "The Pound",   entryFee: "1.00",  ordinal: 1, accent: "#34d379", prizeStructure: { model: "top_n", splits: [0.70, 0.20, 0.10] } },
  { slug: "fiver",   name: "The Fiver",   entryFee: "5.00",  ordinal: 2, accent: "#34d379", prizeStructure: { model: "top_n", splits: [0.70, 0.20, 0.10] } },
  { slug: "tenner",  name: "The Tenner",  entryFee: "10.00", ordinal: 3, accent: "#34d379", prizeStructure: { model: "top_n", splits: [0.70, 0.20, 0.10] } },
  { slug: "pony",    name: "The Pony",    entryFee: "25.00", ordinal: 4, accent: "#34d379", prizeStructure: { model: "top_n", splits: [0.50, 0.25, 0.15, 0.07, 0.03] } },
  { slug: "big-one", name: "The Big One", entryFee: "50.00", ordinal: 5, accent: "#34d379", prizeStructure: { model: "top_n", splits: [0.50, 0.25, 0.15, 0.07, 0.03] } },
] as const;

const COMPETITIONS = [
  { code: "PL",  slug: "premier-league", name: "Premier League",   shortName: "PL",            countryCode: "GB" },
  { code: "ELC", slug: "championship",   name: "EFL Championship", shortName: "Championship",  countryCode: "GB" },
] as const;

// football-data.org match shape (subset we use)
type FDStatus =
  | "SCHEDULED" | "TIMED" | "IN_PLAY" | "PAUSED"
  | "FINISHED" | "SUSPENDED" | "POSTPONED" | "CANCELLED" | "AWARDED";

type FDMatch = {
  id: number;
  utcDate: string;
  status: FDStatus;
  matchday: number | null;
  homeTeam: { id: number; name: string; shortName?: string | null; tla?: string | null };
  awayTeam: { id: number; name: string; shortName?: string | null; tla?: string | null };
  venue?: string | null;
};

type InternalEventStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled" | "void";

function mapStatus(fd: FDStatus): InternalEventStatus {
  switch (fd) {
    case "SCHEDULED":
    case "TIMED":      return "scheduled";
    case "IN_PLAY":
    case "PAUSED":     return "live";
    case "FINISHED":
    case "AWARDED":    return "finished";
    case "POSTPONED":  return "postponed";
    case "CANCELLED":  return "cancelled";
    case "SUSPENDED":  return "void";
  }
}

function log(msg: string) {
  console.log(`[seed] ${msg}`);
}

async function footballFetch(path: string): Promise<unknown> {
  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) throw new Error("FOOTBALL_API_KEY env var not set");
  const url = `${FOOTBALL_API_BASE}${path}`;
  log(`  fetching ${url}`);
  const res = await fetch(url, { headers: { "X-Auth-Token": apiKey } });
  if (!res.ok) {
    throw new Error(`football-data.org ${res.status} ${res.statusText} for ${path}`);
  }
  return res.json();
}

// ─── Phase 1 — sports ─────────────────────────────────────────────────────

async function seedSports(): Promise<number> {
  log("sports…");
  const [existing] = await db.select().from(sports).where(eq(sports.slug, "football"));
  if (existing) {
    log(`  football already exists (id=${existing.id})`);
    return existing.id;
  }
  const [row] = await db.insert(sports).values({ slug: "football", name: "Football" }).returning();
  log(`  inserted football (id=${row.id})`);
  return row.id;
}

// ─── Phase 2 — competitions ───────────────────────────────────────────────

async function seedCompetitions(sportId: number): Promise<Map<string, string>> {
  log("competitions…");
  const byCode = new Map<string, string>();
  for (const def of COMPETITIONS) {
    const [existing] = await db.select().from(competitions).where(eq(competitions.slug, def.slug));
    if (existing) {
      byCode.set(def.code, existing.id);
      log(`  ${def.name} already exists`);
      continue;
    }
    const [row] = await db
      .insert(competitions)
      .values({
        sportId,
        externalId: def.code,
        externalSeasonId: String(SEASON),
        slug: def.slug,
        name: def.name,
        shortName: def.shortName,
        countryCode: def.countryCode,
      })
      .returning();
    byCode.set(def.code, row.id);
    log(`  inserted ${def.name}`);
  }
  return byCode;
}

// ─── Phase 3 — tiers ──────────────────────────────────────────────────────

async function seedTiers(): Promise<Map<string, string>> {
  log("tiers (leagues)…");
  const bySlug = new Map<string, string>();
  for (const tier of TIERS) {
    const [existing] = await db.select().from(leagues).where(eq(leagues.slug, tier.slug));
    if (existing) {
      bySlug.set(tier.slug, existing.id);
      log(`  ${tier.name} already exists`);
      continue;
    }
    const [row] = await db
      .insert(leagues)
      .values({
        slug: tier.slug,
        name: tier.name,
        description: `${tier.name} — £${tier.entryFee} entry`,
        entryFee: tier.entryFee,
        currency: "GBP",
        maxEntriesPerUser: 1,
        ordinal: tier.ordinal,
        accentColor: tier.accent,
      })
      .returning();
    bySlug.set(tier.slug, row.id);
    log(`  inserted ${tier.name}`);
  }
  return bySlug;
}

// ─── Phase 4 — fixtures, stages, events ───────────────────────────────────

type StageInfo = {
  stageId: string;
  round: number;
  startDate: Date | null;
  endDate: Date | null;
  totalMatchesCount: number;
  futureMatchesCount: number;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function syncFixtures(competitionsByCode: Map<string, string>): Promise<Map<string, StageInfo[]>> {
  log("fixtures + Rounds…");
  const result = new Map<string, StageInfo[]>();
  const now = new Date();

  for (const def of COMPETITIONS) {
    const compId = competitionsByCode.get(def.code);
    if (!compId) throw new Error(`competition ${def.code} not found in map`);
    const rounds = ROUNDS_BY_CODE[def.code];
    if (!rounds) throw new Error(`no Round structure for ${def.code}`);

    const data = (await footballFetch(`/competitions/${def.code}/matches?season=${SEASON}`)) as { matches: FDMatch[] };
    log(`  ${def.name}: ${data.matches.length} matches from football-data`);

    // Group by Round
    const matchesByRound = new Map<number, FDMatch[]>();
    let skipped = 0;
    for (const m of data.matches) {
      if (m.matchday == null) { skipped++; continue; }
      const round = roundForMatchday(def.code, m.matchday);
      if (round == null) { skipped++; continue; }
      const list = matchesByRound.get(round) ?? [];
      list.push(m);
      matchesByRound.set(round, list);
    }
    if (skipped > 0) log(`    skipped ${skipped} matches with no/invalid matchday`);

    const compStages: StageInfo[] = [];
    for (const r of rounds) {
      const matches = matchesByRound.get(r.round) ?? [];
      const kickoffs = matches.map((m) => new Date(m.utcDate)).sort((a, b) => a.getTime() - b.getTime());
      const startDate = kickoffs[0] ?? null;
      const endDate = kickoffs[kickoffs.length - 1] ?? null;
      const totalMatchesCount = matches.length;
      const futureMatchesCount = kickoffs.filter((k) => k.getTime() > now.getTime()).length;

      // Upsert stage by (competitionId, ordinal). No unique constraint exists,
      // so check-then-insert/update manually.
      const stageName = `Round ${r.round}`;
      const stageSlug = `${def.slug}-round-${r.round}`;
      let stageId: string;

      const [existingStage] = await db
        .select()
        .from(stages)
        .where(and(eq(stages.competitionId, compId), eq(stages.ordinal, r.round)));

      if (existingStage) {
        await db
          .update(stages)
          .set({
            startDate: startDate ? isoDate(startDate) : null,
            endDate:   endDate   ? isoDate(endDate)   : null,
          })
          .where(eq(stages.id, existingStage.id));
        stageId = existingStage.id;
      } else {
        const [row] = await db
          .insert(stages)
          .values({
            competitionId: compId,
            slug: stageSlug,
            name: stageName,
            ordinal: r.round,
            startDate: startDate ? isoDate(startDate) : null,
            endDate:   endDate   ? isoDate(endDate)   : null,
          })
          .returning();
        stageId = row.id;
      }

      // Upsert events keyed by external_id (football-data match id).
      for (const m of matches) {
        const kickoff = new Date(m.utcDate);
        const lockAt = new Date(kickoff.getTime() - 60 * 60 * 1000); // -1 hour
        const status = mapStatus(m.status);
        const values = {
          competitionId: compId,
          stageId,
          externalId: String(m.id),
          homeTeam: m.homeTeam.name,
          awayTeam: m.awayTeam.name,
          homeTeamShort: m.homeTeam.tla ?? null,
          awayTeamShort: m.awayTeam.tla ?? null,
          kickoffAt: kickoff,
          venue: m.venue ?? null,
          matchday: m.matchday,
          status,
          predictionLockAt: lockAt,
          lastSyncedAt: new Date(),
        };
        await db
          .insert(events)
          .values(values)
          .onConflictDoUpdate({
            target: events.externalId,
            set: {
              stageId,
              homeTeam: values.homeTeam,
              awayTeam: values.awayTeam,
              homeTeamShort: values.homeTeamShort,
              awayTeamShort: values.awayTeamShort,
              kickoffAt: values.kickoffAt,
              venue: values.venue,
              matchday: values.matchday,
              status: values.status,
              predictionLockAt: values.predictionLockAt,
              lastSyncedAt: values.lastSyncedAt,
            },
          });
      }

      compStages.push({ stageId, round: r.round, startDate, endDate, totalMatchesCount, futureMatchesCount });
      const tag =
        futureMatchesCount === 0
          ? " (all kicked off)"
          : futureMatchesCount === totalMatchesCount
            ? " (none kicked off yet)"
            : ` (${futureMatchesCount} still to play)`;
      log(`    Round ${r.round}: ${totalMatchesCount} matches${tag}`);
    }

    result.set(def.code, compStages);
  }

  return result;
}

// ─── Phase 5 — pools for the current Round ────────────────────────────────

/**
 * The current Round is the one most users would meaningfully want to enter
 * today. Two filters and a sort:
 *
 *   1) Substantive future: at least MIN_FUTURE_MATCHES still to play.
 *      Filters out Rounds whose only "future" matches are postponed
 *      stragglers — Round 8 PL in May 2026 with 1 rescheduled fixture isn't
 *      a Round anyone should be entering.
 *
 *   2) Prefer the most-recently-started Round (closest in time, but already
 *      underway). If none have started yet (pre-season), pick the one that
 *      starts soonest.
 *
 * Returns null if no Round qualifies — typically a competition whose season
 * has fully completed.
 */
const MIN_FUTURE_MATCHES = 5;

function pickCurrentRound(stagesForComp: StageInfo[], now: Date): StageInfo | null {
  const candidates = stagesForComp.filter(
    (s) => s.startDate !== null && s.futureMatchesCount >= MIN_FUTURE_MATCHES,
  );
  if (candidates.length === 0) return null;

  const nowMs = now.getTime();
  const started = candidates.filter((s) => s.startDate!.getTime() <= nowMs);
  if (started.length > 0) {
    // Most-recently-started among ongoing candidates.
    return started.reduce((best, s) =>
      s.startDate!.getTime() > best.startDate!.getTime() ? s : best,
    );
  }
  // All candidates are upcoming. Pick the one that starts soonest.
  return candidates.reduce((best, s) =>
    s.startDate!.getTime() < best.startDate!.getTime() ? s : best,
  );
}

async function seedPoolsForCurrentRound(
  competitionsByCode: Map<string, string>,
  stagesByCode: Map<string, StageInfo[]>,
  tiersBySlug: Map<string, string>,
): Promise<void> {
  log("pools for current Round only…");
  const now = new Date();

  for (const def of COMPETITIONS) {
    const compId = competitionsByCode.get(def.code);
    if (!compId) continue;
    const compStages = stagesByCode.get(def.code) ?? [];

    const currentStage = pickCurrentRound(compStages, now);
    if (!currentStage) {
      log(`  ${def.name}: no current Round (season complete?) — skipping pools`);
      continue;
    }
    if (!currentStage.startDate || !currentStage.endDate) {
      log(`  ${def.name}: current Round has no dates yet — skipping pools`);
      continue;
    }

    // Clean up stale 'open' pools for this competition that aren't for the
    // current Round and have no entries yet. Safe — only touches abandoned
    // pools (e.g. created when this script's selection algorithm was wrong,
    // or from a previous season cycle before settlement).
    const stalePools = await db
      .select({ id: pools.id, name: pools.name, stageId: pools.stageId })
      .from(pools)
      .where(and(eq(pools.competitionId, compId), eq(pools.status, "open")));

    let cleaned = 0;
    for (const p of stalePools) {
      if (p.stageId === currentStage.stageId) continue;
      // Check for any pool entries — never delete pools with user data.
      const entryCheck = await db.execute<{ count: number }>(
        sql`SELECT COUNT(*)::int AS count FROM pool_entries WHERE pool_id = ${p.id}`,
      );
      const entryCount = Number(entryCheck.at(0)?.count ?? 0);
      if (entryCount > 0) continue;
      await db.delete(pools).where(eq(pools.id, p.id));
      log(`    cleaned stale pool: ${p.name}`);
      cleaned++;
    }
    if (cleaned === 0) log(`  ${def.name}: no stale pools to clean`);

    const opensAt = currentStage.startDate;
    // Late-entry window per arch §4: 7 days after the Round's first kickoff.
    const closesAt = new Date(currentStage.startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    log(`  ${def.name}: current = Round ${currentStage.round} (${currentStage.futureMatchesCount} matches still to play), opens ${opensAt.toISOString()}, late-entry closes ${closesAt.toISOString()}`);

    let created = 0;
    for (const tier of TIERS) {
      const tierId = tiersBySlug.get(tier.slug);
      if (!tierId) continue;
      const poolName = `${def.shortName} · ${tier.name} · Round ${currentStage.round}`;
      const inserted = await db
        .insert(pools)
        .values({
          leagueId: tierId,
          competitionId: compId,
          stageId: currentStage.stageId,
          name: poolName,
          opensAt,
          closesAt,
          prizeStructure: tier.prizeStructure,
          status: "open",
        })
        .onConflictDoNothing({ target: [pools.leagueId, pools.stageId] })
        .returning({ id: pools.id });
      if (inserted.length > 0) created++;
    }
    log(`    ${created} pools created (${5 - created} already existed)`);
  }
}

// ─── Orchestration ────────────────────────────────────────────────────────

async function main() {
  const start = Date.now();
  log("starting…");

  const sportId = await seedSports();
  const competitionsByCode = await seedCompetitions(sportId);
  const tiersBySlug = await seedTiers();
  const stagesByCode = await syncFixtures(competitionsByCode);
  await seedPoolsForCurrentRound(competitionsByCode, stagesByCode, tiersBySlug);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`done in ${elapsed}s ✓`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] FAILED:", err);
  process.exit(1);
});
