import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppShell } from "./components/predictor10/AppShell";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import CartPage from "./pages/CartPage";
import FixturesPage from "./pages/FixturesPage";
import HistoryPage from "./pages/HistoryPage";
import Home from "./pages/Home";
import LeaderboardPage from "./pages/LeaderboardPage";
import LeaguesPage from "./pages/LeaguesPage";
import RulesPage from "./pages/RulesPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import Dashboard from "./pages/Dashboard";

// Public app — original screens, always accessible to logged-out users.
function PublicRouter() {
  return (
    <AppShell>
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
    </AppShell>
  );
}

function Router() {
  const { isLoggedIn } = useAuth();

  return (
    <Switch>
      {/* Auth pages — full-page, no AppShell. Redirect to dashboard if already signed in. */}
      <Route path="/login">
        {isLoggedIn ? <Dashboard /> : <LoginPage />}
      </Route>
      <Route path="/register">
        {isLoggedIn ? <Dashboard /> : <RegisterPage />}
      </Route>

      {/* Everything else: logged-in → Dashboard, logged-out → public marketing app */}
      <Route>
        {isLoggedIn ? <Dashboard /> : <PublicRouter />}
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
