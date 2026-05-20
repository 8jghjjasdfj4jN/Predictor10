/*
Predictor10 — one-shot seed + sync.

Run: `pnpm seed`

Idempotent. What it does:
  1. Sport row (football)
  2. Competition rows (Premier League, EFL Championship)
  3. Tier rows (4 active leagues: Fiver, Tenner, Pony, Big One).
     The Pound (£1) is retired as of step 2m — the row stays in the DB
     for historical reference (Wez's Round 9 Pound entry settles 24 May
     2026) but is_active is flipped to false so it never appears in
     /api/competitions again.
  4. Fixture sync from football-data.org for the 2025/26 season
     - Upserts events keyed by football-data match id
     - Groups them into the 9 Rounds per arch §3
     - Sets predictionLockAt = kickoff − 1 hour
  5. Pools for the **current** Round only (= lowest-ordinal Round still
     having future kickoffs). 4 pools per competition × 2 competitions = 8.

Past Rounds are populated as stages + events but get no pool rows — a brand-
new user shouldn't see "settled pools they were never in" cluttering the
archive (per the decision flagged at step 2c plan).

Network: 2 calls to football-data.org (one per competition). Well under
the 10 req/min free-tier ceiling.
*/

import "dotenv/config";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { sports, competitions, stages, events } from "../db/schema/sports";
import { leagues } from "../db/schema/leagues";
import { pools } from "../db/schema/pools";
import { ROUNDS_BY_CODE, roundForMatchday } from "../lib/rounds";
import {
  fetchAllMatchesForSeason,
  upsertEventFromFootballData,
  type FDMatch,
  type InternalEventStatus,
} from "../lib/fixture-sync";

// Per-competition season is set in COMPETITIONS below (step 3a.3). The
// global SEASON constant was removed when WC was added — its 2025 default
// no longer applies to all comps.

// Active tiers from step 2m onwards. The Pound (£1) is retired — Stripe +
// merchant fees on a £1 entry leave negative margin after 90% prize-pool
// payout. Removed here so seedTiers() doesn't recreate it and
// seedPoolsForCurrentRound() doesn't open new Pound pools.
//
// Step 2n: standardised prize structure across all 4 tiers — 25% house fee,
// top 3 paid at 60/25/15 of the player pot. Settlement applies the house
// fee first then distributes the player pot per `splits`. See pool-settle.ts
// for the math and Decided Rule #14 for residual-penny handling (goes to
// rank 1).
const TIERS = [
  { slug: "fiver",          name: "The Fiver",      entryFee: "5.00",  ordinal: 2,  accent: "#34d379", prizeStructure: { model: "top_n", splits: [0.60, 0.25, 0.15], houseFeePct: 0.25 } },
  { slug: "tenner",         name: "The Tenner",     entryFee: "10.00", ordinal: 3,  accent: "#34d379", prizeStructure: { model: "top_n", splits: [0.60, 0.25, 0.15], houseFeePct: 0.25 } },
  { slug: "pony",           name: "The Pony",       entryFee: "25.00", ordinal: 4,  accent: "#34d379", prizeStructure: { model: "top_n", splits: [0.60, 0.25, 0.15], houseFeePct: 0.25 } },
  { slug: "big-one",        name: "The Big One",    entryFee: "50.00", ordinal: 5,  accent: "#34d379", prizeStructure: { model: "top_n", splits: [0.60, 0.25, 0.15], houseFeePct: 0.25 } },
  // Tournament-style dedicated tier (step 3a, arch §3 + §13 Rule #4). Used by
  // World Cup 2026 only — one Enter button, no tier choice. Retires via
  // RETIRED_TIER_SLUGS after the tournament settles (~22 July 2026).
  { slug: "world-cup-2026", name: "World Cup 2026", entryFee: "30.00", ordinal: 10, accent: "#34d379", prizeStructure: { model: "top_n", splits: [0.60, 0.25, 0.15], houseFeePct: 0.25 } },
] as const;

// Retired tiers — kept in the DB for historical reference, deactivated by
// seedTiers() on every run. Add a slug here to retire a tier going forward
// without losing past pool/entry/payment rows tied to it.
const RETIRED_TIER_SLUGS = ["pound"] as const;

// Per-competition metadata. `tiers` lists which TIER slugs apply (PL/Champ
// use the 4 league-style tiers; WC uses its single dedicated tier).
// `season` is football-data's season identifier — for league comps the
// starting year of the season (2025 = 2025/26); for tournaments the
// tournament year (2026 = WC 2026). `postponedPolicy` is enforced
// server-side at settlement time (arch §13 Rule #16). `isActive` controls
// whether seed runs the fixture sync + pool generation for the competition.
const COMPETITIONS = [
  {
    code: "PL",
    slug: "premier-league",
    name: "Premier League",
    shortName: "PL",
    countryCode: "GB",
    season: 2025,
    postponedPolicy: "wait" as const,
    tiers: ["fiver", "tenner", "pony", "big-one"],
    isActive: true,
  },
  {
    code: "ELC",
    slug: "championship",
    name: "EFL Championship",
    shortName: "Championship",
    countryCode: "GB",
    season: 2025,
    postponedPolicy: "wait" as const,
    tiers: ["fiver", "tenner", "pony", "big-one"],
    isActive: true,
  },
  {
    code: "WC",
    slug: "world-cup-2026",
    name: "World Cup 2026",
    shortName: "World Cup",
    countryCode: null,
    season: 2026,
    postponedPolicy: "forfeit" as const,
    tiers: ["world-cup-2026"],
    isActive: true, // step 3a.3 — turned on with tournament fixture handling
  },
] as const;

function log(msg: string) {
  console.log(`[seed] ${msg}`);
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
    // Use the per-competition season identifier set in COMPETITIONS.
    // PL/Champ use the league starting year (2025 = 2025/26); WC uses the
    // tournament year (2026 = WC 2026).
    const seasonStr = String(def.season);

    const [existing] = await db.select().from(competitions).where(eq(competitions.slug, def.slug));
    if (existing) {
      byCode.set(def.code, existing.id);
      // Idempotent re-sync of fields that may have changed in COMPETITIONS:
      // postponedPolicy (step 3a addition) and isActive. Other fields stay
      // immutable — slug/name/shortName/countryCode aren't expected to change.
      const drifted =
        existing.postponedPolicy !== def.postponedPolicy ||
        existing.isActive !== def.isActive;
      if (drifted) {
        await db
          .update(competitions)
          .set({
            postponedPolicy: def.postponedPolicy,
            isActive: def.isActive,
          })
          .where(eq(competitions.id, existing.id));
        log(`  ${def.name} already exists (re-synced policy/isActive)`);
      } else {
        log(`  ${def.name} already exists`);
      }
      continue;
    }
    const [row] = await db
      .insert(competitions)
      .values({
        sportId,
        externalId: def.code,
        externalSeasonId: seasonStr,
        slug: def.slug,
        name: def.name,
        shortName: def.shortName,
        countryCode: def.countryCode,
        postponedPolicy: def.postponedPolicy,
        isActive: def.isActive,
      })
      .returning();
    byCode.set(def.code, row.id);
    log(`  inserted ${def.name} (postponedPolicy=${def.postponedPolicy}, isActive=${def.isActive})`);
  }
  return byCode;
}

// ─── Phase 3 — tiers ──────────────────────────────────────────────────────

async function seedTiers(): Promise<Map<string, string>> {
  log("tiers (leagues)…");
  const bySlug = new Map<string, string>();

  // Active tiers — insert if missing, ensure is_active=true if previously
  // retired then revived. (Idempotent: no-op when already correct.)
  for (const tier of TIERS) {
    const [existing] = await db.select().from(leagues).where(eq(leagues.slug, tier.slug));
    if (existing) {
      bySlug.set(tier.slug, existing.id);
      if (existing.isActive === false) {
        await db.update(leagues).set({ isActive: true }).where(eq(leagues.id, existing.id));
        log(`  ${tier.name} reactivated`);
      } else {
        log(`  ${tier.name} already exists`);
      }
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

  // Retired tiers — flip is_active=false so /api/competitions stops listing
  // them. Existing pool / pool_entries / payments rows for the retired tier
  // are untouched — they continue to play out and settle normally.
  for (const slug of RETIRED_TIER_SLUGS) {
    const [existing] = await db.select().from(leagues).where(eq(leagues.slug, slug));
    if (!existing) {
      log(`  retired tier '${slug}' not in DB — nothing to deactivate`);
      continue;
    }
    if (existing.isActive === false) {
      log(`  retired tier '${existing.name}' already deactivated`);
      continue;
    }
    await db.update(leagues).set({ isActive: false }).where(eq(leagues.id, existing.id));
    log(`  retired tier '${existing.name}' deactivated (is_active=false)`);
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
    if (!def.isActive) {
      log(`  ${def.name}: isActive=false — skipping fixture sync`);
      continue;
    }
    const compId = competitionsByCode.get(def.code);
    if (!compId) throw new Error(`competition ${def.code} not found in map`);
    const rounds = ROUNDS_BY_CODE[def.code];
    if (!rounds) throw new Error(`no Round structure for ${def.code}`);

    // Per-comp try/catch: a football-data outage on WC must not break PL/
    // Champ seeding. The catch keeps the seed idempotent — partial failures
    // resume cleanly on the next run.
    let allMatches: FDMatch[];
    try {
      allMatches = await fetchAllMatchesForSeason(def.code, def.season);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`  ${def.name}: fixture fetch failed (${message}) — skipping this comp`);
      continue;
    }
    log(`  ${def.name}: ${allMatches.length} matches from football-data (season ${def.season})`);

    // Group by Round. For league-style comps every match has a numeric
    // matchday; matches with null/unknown matchdays are dropped. For
    // tournament-style comps (any Round with matchdays:"all"),
    // roundForMatchday() returns Round 1 for every input — including null
    // matchdays — so every fetched match is captured.
    const matchesByRound = new Map<number, FDMatch[]>();
    let skipped = 0;
    for (const m of allMatches) {
      const round = roundForMatchday(def.code, m.matchday);
      if (round == null) { skipped++; continue; }
      const list = matchesByRound.get(round) ?? [];
      list.push(m);
      matchesByRound.set(round, list);
    }
    if (skipped > 0) log(`    skipped ${skipped} matches with no/invalid matchday`);

    // Batch existing-event lookup for this competition's full match set —
    // saves N round-trips inside the per-match loop below. Same pattern
    // outcome-sync uses.
    const allExtIds = allMatches.map((m) => String(m.id));
    const existingRows = allExtIds.length
      ? await db
          .select({
            id: events.id,
            externalId: events.externalId,
            status: events.status,
            kickoffAt: events.kickoffAt,
            matchday: events.matchday,
            // Pulled so the upsert helper can detect bracket fill-in
            // (null teams → real teams) and overwrite — step 3a.4.
            homeTeam: events.homeTeam,
            awayTeam: events.awayTeam,
            // Pulled so the upsert helper can detect group-label changes
            // (e.g. FD assigning groups after first fixture release).
            groupLabel: events.groupLabel,
            // Same for fd_stage, used by the Predict screen to group
            // knockout matches under sub-headings.
            fdStage: events.fdStage,
          })
          .from(events)
          .where(inArray(events.externalId, allExtIds))
      : [];
    const existingByExt = new Map(existingRows.map((e) => [e.externalId, e]));

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

      // Upsert events via the shared helper — same code path outcome-sync's
      // cron uses, so behaviour stays consistent across the two callers.
      // Helper preserves the "finished is terminal" safety rail; matches
      // already finished stay finished even if football-data transiently
      // re-emits a different status.
      for (const m of matches) {
        const existing = existingByExt.get(String(m.id));
        await upsertEventFromFootballData({
          fdMatch: m,
          competitionId: compId,
          stageId,
          existing: existing
            ? {
                id: existing.id,
                status: existing.status as InternalEventStatus,
                kickoffAt: existing.kickoffAt,
                matchday: existing.matchday,
                homeTeam: existing.homeTeam,
                awayTeam: existing.awayTeam,
                groupLabel: existing.groupLabel,
                fdStage: existing.fdStage,
              }
            : null,
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
    // Per-comp tier list (step 3a.3): PL/Champ create 4 league pools; WC
    // creates 1 dedicated-tier pool. Filters TIERS to def.tiers' slugs so
    // we don't accidentally create PL × WC tier pools or vice versa.
    const tiersForComp = TIERS.filter((t) => def.tiers.includes(t.slug as never));
    for (const tier of tiersForComp) {
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
    log(`    ${created} pools created (${tiersForComp.length - created} already existed)`);
  }
}

// ─── Phase 5b — sync open-pool prizeStructure to current tier values ────

/**
 * Pool rows snapshot the tier's `prizeStructure` JSON at creation time so
 * settled-pool payouts stay tied to whatever rules were in force when the
 * pool opened (Decided Rule #14). For OPEN pools, though, we want changes
 * to tier prize rules (e.g. the step-2n move to 60/25/15 + 25% house fee)
 * to flow through retroactively — those pools haven't paid out yet, so
 * there's no immutability concern.
 *
 * This step iterates each active tier, finds every open pool tied to that
 * tier, and updates the pool's prize_structure JSON to match the tier's
 * current value if they differ. Settled pools are deliberately left alone.
 *
 * Retired tiers (RETIRED_TIER_SLUGS) are skipped entirely — their existing
 * open pools (if any) stay on their original prize structure to settle
 * under the rules they were created with.
 */
async function syncOpenPoolPrizeStructure(
  tiersBySlug: Map<string, string>,
): Promise<void> {
  log("syncing open-pool prizeStructure to active tier values…");
  let synced = 0;
  let skippedAlreadyMatching = 0;

  for (const tier of TIERS) {
    const tierId = tiersBySlug.get(tier.slug);
    if (!tierId) continue;

    const openPools = await db
      .select({ id: pools.id, name: pools.name, prizeStructure: pools.prizeStructure })
      .from(pools)
      .where(and(eq(pools.leagueId, tierId), eq(pools.status, "open")));

    for (const p of openPools) {
      const currentJson = JSON.stringify(p.prizeStructure);
      const desiredJson = JSON.stringify(tier.prizeStructure);
      if (currentJson === desiredJson) {
        skippedAlreadyMatching++;
        continue;
      }
      await db
        .update(pools)
        .set({ prizeStructure: tier.prizeStructure })
        .where(eq(pools.id, p.id));
      log(`    updated ${p.name} → splits=[${tier.prizeStructure.splits.join(", ")}], houseFeePct=${tier.prizeStructure.houseFeePct}`);
      synced++;
    }
  }

  log(`  ${synced} pool(s) updated, ${skippedAlreadyMatching} already matching`);
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
  await syncOpenPoolPrizeStructure(tiersBySlug);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`done in ${elapsed}s ✓`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] FAILED:", err);
  process.exit(1);
});
