/*
Brand reminder — Broadcast Noir Athletics:
Top-level routing should feel like a premium football app shell with a persistent header,
clear page structure, and confident dark-mode default.
*/

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppShell } from "./components/predictor10/AppShell";
import { ThemeProvider } from "./contexts/ThemeContext";
import CartPage from "./pages/CartPage";
import FixturesPage from "./pages/FixturesPage";
import HistoryPage from "./pages/HistoryPage";
import Home from "./pages/Home";
import LeaderboardPage from "./pages/LeaderboardPage";
import LeaguesPage from "./pages/LeaguesPage";
import RulesPage from "./pages/RulesPage";

function Router() {
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

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster theme="dark" richColors position="top-center" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
