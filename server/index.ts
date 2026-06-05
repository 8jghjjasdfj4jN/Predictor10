import "dotenv/config";
import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { authMiddleware } from "./lib/auth-middleware";
import authRouter from "./routes/auth";
import accountRouter from "./routes/account";
import portalRouter from "./routes/portal";
import adminRouter from "./routes/admin";
import adminPortalRouter from "./routes/admin-portal";
import { startScheduler } from "./lib/scheduler";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pre-rebuild, this file also hosted a `footballFetch` cache and a set of
// public proxy routes (`/api/fixtures`, `/api/fixtures/live`,
// `/api/fixtures/gameweek/:gw`, `/api/standings`, `/api/cache-status`) that
// rendered the legacy Dashboard / FixturesPage straight off football-data.
// The portal rebuild moved fixtures into the `events` table (so predictions,
// locks, scoring, and settlement reference stable rows), and the only
// surface still calling the proxy was the now-unmounted Dashboard. Cleaned
// up in step 2l. football-data.org now has exactly one consumer in this
// codebase: `server/lib/fixture-sync.ts`, called from outcome-sync (cron)
// and seed (first-deploy bootstrap). FOOTBALL_API_KEY is still required.

async function startServer() {
  const app = express();
  app.set("trust proxy", 1); // honour X-Forwarded-For on Render so req.ip is the real client
  app.use(express.json());
  app.use(authMiddleware);
  const server = createServer(app);

  app.use("/api/auth", authRouter);
  app.use("/api/account", accountRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/admin-portal", adminPortalRouter);
  app.use("/api", portalRouter);

  // Static frontend
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  // Hashed asset bundle (Vite gives each build a content-hashed filename, so
  // the contents at any given URL are immutable — safe to cache aggressively).
  app.use(
    "/assets",
    express.static(path.join(staticPath, "assets"), {
      immutable: true,
      maxAge: "1y",
    }),
  );

  // Everything else (favicon, logo svg, etc.) — short cache; let browsers
  // revalidate so a redeploy of an unhashed asset is visible quickly.
  app.use(
    express.static(staticPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html")) {
          // index.html references hashed asset filenames that change every
          // build, so it MUST be revalidated on every load — otherwise a
          // browser holds a stale HTML pointing at a non-existent CSS/JS hash.
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );

  // SPA fallback — only for "page" routes, never for asset URLs. If someone
  // requests a missing .css/.js/etc, return a real 404 so the browser doesn't
  // try to parse an HTML document as a stylesheet.
  const ASSET_EXT = /\.(css|js|map|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|otf|json)$/i;
  app.get("*", (req, res) => {
    if (ASSET_EXT.test(req.path)) {
      res.status(404).send("Not found");
      return;
    }
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3001;
  server.listen(port, () => {
    console.log(`Server on http://localhost:${port}`);
    console.log(`DATABASE_URL:    ${process.env.DATABASE_URL ? "✓ set" : "✗ MISSING"}`);
    console.log(`FOOTBALL_API_KEY: ${process.env.FOOTBALL_API_KEY ? "✓ set" : "✗ MISSING"}`);
    startScheduler();
  });
}

startServer().catch(console.error);
