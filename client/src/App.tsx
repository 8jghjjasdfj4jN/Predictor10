import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { useEffect, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppShell } from "./components/predictor10/AppShell";
import { MarketingShell } from "./components/predictor10/MarketingShell";
import { LegacyPoolRedirect } from "./components/predictor10/LegacyPoolRedirect";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

// Public marketing pages (logged-out users)
import CartPage from "./pages/CartPage";
import FixturesPage from "./pages/FixturesPage";
import HistoryPage from "./pages/HistoryPage";
import Home from "./pages/Home";
import LeaderboardPage from "./pages/LeaderboardPage";
import LeaguesPage from "./pages/LeaguesPage";
import RulesPage from "./pages/RulesPage";

// Auth pages (no shell, no nav — arch §7)
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

// Post-login portal pages (arch §7 — IA restructured in step 2m)
import HomePage from "./pages/portal/HomePage";
import PredictPage from "./pages/portal/PredictPage";
import TablesPage from "./pages/portal/TablesPage";
import PoolDetailPage from "./pages/portal/PoolDetailPage";
import PoolTablePage from "./pages/portal/PoolTablePage";
import OpponentPredictionsPage from "./pages/portal/OpponentPredictionsPage";
import AccountPage from "./pages/portal/AccountPage";
import AccountHistoryPage from "./pages/portal/AccountHistoryPage";
import AdminPage from "./pages/portal/AdminPage";
import EnterPage from "./pages/portal/EnterPage";

// Tiny declarative redirect helper. Wouter 3 ships `Redirect`, but we avoid
// pulling it directly because the project applies a patch to wouter's ESM
// build — keeping the redirect inline insulates us from any future patch
// drift around the named exports.
function RedirectTo({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(to, { replace: true });
  }, [to, setLocation]);
  return null;
}

// Public marketing surface — original screens, accessible only to logged-out users.
function MarketingRouter() {
  return (
    <MarketingShell>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/leagues" component={LeaguesPage} />
        <Route path="/leaderboard" component={LeaderboardPage} />
        <Route path="/history" component={HistoryPage} />
        <Route path="/rules" component={RulesPage} />
        <Route path="/fixtures" component={FixturesPage} />
        <Route path="/cart" component={CartPage} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </MarketingShell>
  );
}

// Post-login portal — Home / Predict / Tables / Account top-level routes.
// Step 2m IA restructure: the prediction screen lives at /predict/:entryId
// (was /pools/:slug/:poolId); the third bottom-nav slot is /tables (was
// /pools). Old /pools/... URLs land on legacy redirect handlers so any
// bookmarks / browser history continue to work for ~30 days post-deploy.
function PortalRouter() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={HomePage} />

        {/* Predict tab + canonical prediction screen */}
        <Route path="/predict" component={PredictPage} />
        <Route path="/predict/:entryId" component={PoolDetailPage} />

        {/* Tables tab */}
        <Route path="/tables" component={TablesPage} />

        {/* Account */}
        <Route path="/account/history" component={AccountHistoryPage} />
        <Route path="/account" component={AccountPage} />

        {/* Admin portal — server-side gated on users.is_admin. Non-admins
            who navigate here get a "Not found" page rendered by AdminPage
            itself when the GET /users 404s. */}
        <Route path="/admin" component={AdminPage} />

        {/* Tournament entry confirm (arch §8.6.1, step 3a.7) */}
        <Route path="/enter/:competitionSlug" component={EnterPage} />

        {/* Legacy /pools URLs — kept alive temporarily for bookmark/history
            compatibility. `/table` is more specific — must come before the
            generic /:poolId match. PoolTablePage stays mounted at the old
            URL because Account History's [Table →] still links there. */}
        <Route path="/pools/:competitionSlug/:poolId/table/:entryId" component={OpponentPredictionsPage} />
        <Route path="/pools/:competitionSlug/:poolId/table" component={PoolTablePage} />
        <Route path="/pools/:competitionSlug/:poolId">
          {(params) => (
            <LegacyPoolRedirect
              poolId={params.poolId}
              competitionSlug={params.competitionSlug}
            />
          )}
        </Route>
        <Route path="/pools/:competitionSlug">
          <RedirectTo to="/tables" />
        </Route>
        <Route path="/pools">
          <RedirectTo to="/tables" />
        </Route>

        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

/**
 * Loading splash shown while /api/auth/me restores the session on first mount.
 *
 * On Render starter/free tiers the web service can cold-start for 20-60s, so
 * we reveal progressively more text the longer this takes — the user sees a
 * loading state, not a broken page. After 60s a Reload affordance appears
 * for the rare case the boot has genuinely stuck (network drop, server
 * crash mid-boot).
 */
function LoadingSplash() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  // No label for the first 2 seconds — most loads resolve before that.
  let label: string | null = null;
  if (elapsed >= 60) label = "Taking longer than usual.";
  else if (elapsed >= 30) label = "Still waking up, hang tight…";
  else if (elapsed >= 8) label = "Server is waking up — won't be long…";
  else if (elapsed >= 2) label = "Loading…";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070f09] px-4 text-white">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="font-['Barlow_Condensed'] text-2xl font-extrabold uppercase tracking-[0.1em]">
          Predictor<span className="text-emerald-400">10</span>
        </span>
        <span className="relative flex h-2.5 w-2.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </span>
        {label && <p className="text-xs text-white/55">{label}</p>}
        {elapsed >= 60 && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 rounded-full border border-emerald-400/40 bg-emerald-400/5 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:border-emerald-300/60 hover:bg-emerald-400/10"
          >
            Reload
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Portal URLs (/predict, /tables, /pools/..., /account/...) are auth-required.
 * When a logged-out user lands on one — typically a hard refresh after their
 * session cookie was purged (Safari ITP, manual cookie clear, server-side
 * revoke) — we'd previously fall through to MarketingRouter, which has no
 * matching route and renders the marketing-shell 404. Confusing: the user
 * looks "logged out" with a 404 even though their intent was just to reach
 * a page they had been on.
 *
 * Match what Wouter sees as the current path; redirect to /login carrying
 * the original URL as `redirect`. LoginPage / RegisterPage read it after
 * sign-in to bring the user back exactly where they were.
 *
 * Step 2m: added `tables` to the portal-path regex. Kept `pools` so legacy
 * URLs still redirect through login → eventual /tables, not a 404 dead end.
 */
const PORTAL_PATH = /^\/(predict|pools|tables|account|enter)(\/|$)/;

function isPortalPath(path: string): boolean {
  return PORTAL_PATH.test(path);
}

function RedirectToLogin({ returnTo }: { returnTo: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const target = `/login?redirect=${encodeURIComponent(returnTo)}`;
    setLocation(target);
  }, [returnTo, setLocation]);
  return <LoadingSplash />;
}

function Router() {
  const { isLoggedIn, isLoading } = useAuth();
  const [path] = useLocation();

  if (isLoading) {
    // Brief splash while /api/auth/me resolves on first mount.
    // Avoids a flash of the marketing page for already-signed-in users.
    return <LoadingSplash />;
  }

  return (
    <Switch>
      {/* Auth pages — full-page, no shell. Already-signed-in users get bounced to portal Home. */}
      <Route path="/login">
        {isLoggedIn ? <PortalRouter /> : <LoginPage />}
      </Route>
      <Route path="/register">
        {isLoggedIn ? <PortalRouter /> : <RegisterPage />}
      </Route>

      {/* Everything else: logged-in → portal; logged-out → marketing,
         except logged-out users on portal URLs get redirected to /login
         with a return-to param so sign-in lands them back where they were. */}
      <Route>
        {isLoggedIn
          ? <PortalRouter />
          : isPortalPath(path)
            ? <RedirectToLogin returnTo={path} />
            : <MarketingRouter />}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <AuthProvider>
          <TooltipProvider>
            <Toaster theme="dark" richColors position="top-center" />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
