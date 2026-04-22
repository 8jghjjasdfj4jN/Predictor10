import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── FOOTBALL DATA CACHE ─────────────────────────────────────────────────────
// One cached copy of fixtures/results, refreshed at most once per hour.
// Free tier = 10 req/min. With caching we use ~24 calls/day maximum.

const FOOTBALL_API_BASE = "https://api.football-data.org/v4";
const PL = "PL";
const TTL = 60 * 60 * 1000; // 1 hour in ms
const LIVE_TTL = 60 * 1000; // 60 seconds for live scores

type CacheEntry = { data: unknown; fetchedAt: number };
const cache = new Map<string, CacheEntry>();

function fresh(entry: CacheEntry, ttl = TTL) {
  return Date.now() - entry.fetchedAt < ttl;
}

async function footballFetch(urlPath: string, ttl = TTL): Promise<unknown> {
  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) throw new Error("FOOTBALL_API_KEY env var not set");

  const hit = cache.get(urlPath);
  if (hit && fresh(hit, ttl)) {
    console.log(`[football] cache hit: ${urlPath}`);
    return hit.data;
  }

  console.log(`[football] fetching: ${FOOTBALL_API_BASE}${urlPath}`);
  const res = await fetch(`${FOOTBALL_API_BASE}${urlPath}`, {
    headers: { "X-Auth-Token": apiKey },
  });

  if (!res.ok) {
    throw new Error(`football-data.org ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  cache.set(urlPath, { data, fetchedAt: Date.now() });
  return data;
}

async function startServer() {
  const app = express();
  app.use(express.json());
  const server = createServer(app);

  // All Premier League matches for the season (cached 1 hour)
  app.get("/api/fixtures", async (_req, res) => {
    try {
      const data = await footballFetch(`/competitions/${PL}/matches?season=2025`);
      res.json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[football] /api/fixtures:", msg);
      res.status(502).json({ error: msg });
    }
  });

  // Live / in-play matches only (cached 60 seconds)
  app.get("/api/fixtures/live", async (_req, res) => {
    try {
      const data = await footballFetch(
        `/competitions/${PL}/matches?status=IN_PLAY,PAUSED`,
        LIVE_TTL
      );
      res.json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      res.status(502).json({ error: msg });
    }
  });

  // Single gameweek (cached 1 hour)
  app.get("/api/fixtures/gameweek/:gw", async (req, res) => {
    try {
      const gw = parseInt(req.params.gw);
      if (isNaN(gw) || gw < 1 || gw > 38) {
        res.status(400).json({ error: "Gameweek must be 1-38" });
        return;
      }
      const data = await footballFetch(
        `/competitions/${PL}/matches?matchday=${gw}&season=2025`
      );
      res.json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      res.status(502).json({ error: msg });
    }
  });

  // League standings (cached 1 hour)
  app.get("/api/standings", async (_req, res) => {
    try {
      const data = await footballFetch(`/competitions/${PL}/standings?season=2025`);
      res.json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      res.status(502).json({ error: msg });
    }
  });

  // Cache status — for debugging
  app.get("/api/cache-status", (_req, res) => {
    const entries = Array.from(cache.entries()).map(([key, val]) => ({
      key,
      fetchedAt: new Date(val.fetchedAt).toISOString(),
      ageSeconds: Math.round((Date.now() - val.fetchedAt) / 1000),
      fresh: fresh(val),
    }));
    res.json({ cacheSize: cache.size, entries });
  });

  // Static frontend
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // SPA fallback — must be last
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`Server on http://localhost:${port}`);
    console.log(`Football API key: ${process.env.FOOTBALL_API_KEY ? "✓ set" : "✗ MISSING"}`);
  });
}

startServer().catch(console.error);
