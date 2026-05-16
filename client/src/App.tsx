import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { useEffect, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppShell } from "./components/predictor10/AppShell";
import { MarketingShell } from "./components/predictor10/MarketingShell";
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

// Post-login portal pages (arch §7)
import HomePage from "./pages/portal/HomePage";
import PredictPage from "./pages/portal/PredictPage";
import PoolsPage from "./pages/portal/PoolsPage";
import PoolsCompetitionPage from "./pages/portal/PoolsCompetitionPage";
import PoolDetailPage from "./pages/portal/PoolDetailPage";
import PoolTablePage from "./pages/portal/PoolTablePage";
import AccountPage from "./pages/portal/AccountPage";
import AccountHistoryPage from "./pages/portal/AccountHistoryPage";

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

// Post-login portal — Home / Predict / Pools / Account top-level routes
// (arch §7). Nested /pools/:competitionSlug etc. land in step 3+.
function PortalRouter() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/predict" component={PredictPage} />
        {/* `/table` is more specific — must come before `/:poolId` in the Switch. */}
        <Route path="/pools/:competitionSlug/:poolId/table" component={PoolTablePage} />
        <Route path="/pools/:competitionSlug/:poolId" component={PoolDetailPage} />
        <Route path="/pools/:competitionSlug" component={PoolsCompetitionPage} />
        <Route path="/pools" component={PoolsPage} />
        <Route path="/account/history" component={AccountHistoryPage} />
        <Route path="/account" component={AccountPage} />
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
 * Portal URLs (/predict, /pools/..., /account/...) are auth-required. When a
 * logged-out user lands on one — typically a hard refresh after their session
 * cookie was purged (Safari ITP, manual cookie clear, server-side revoke) —
 * we'd previously fall through to MarketingRouter, which has no matching
 * route and renders the marketing-shell 404. Confusing: the user looks
 * "logged out" with a 404 even though their intent was just to reach a
 * page they had been on.
 *
 * Match what Wouter sees as the current path; redirect to /login carrying
 * the original URL as `redirect`. LoginPage / RegisterPage read it after
 * sign-in to bring the user back exactly where they were.
 */
const PORTAL_PATH = /^\/(predict|pools|account)(\/|$)/;

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
