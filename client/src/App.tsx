import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
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
import AccountPage from "./pages/portal/AccountPage";

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
        <Route path="/pools" component={PoolsPage} />
        <Route path="/account" component={AccountPage} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function Router() {
  const { isLoggedIn } = useAuth();

  return (
    <Switch>
      {/* Auth pages — full-page, no shell. Already-signed-in users get bounced to portal Home. */}
      <Route path="/login">
        {isLoggedIn ? <PortalRouter /> : <LoginPage />}
      </Route>
      <Route path="/register">
        {isLoggedIn ? <PortalRouter /> : <RegisterPage />}
      </Route>

      {/* Everything else: logged-in → portal, logged-out → public marketing. */}
      <Route>
        {isLoggedIn ? <PortalRouter /> : <MarketingRouter />}
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
