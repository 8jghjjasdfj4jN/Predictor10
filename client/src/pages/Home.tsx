/*
Logged-out landing page — World Cup 2026 focus during the pre-licence
informal run.

Removed from the prior assembly:
  • LeaderboardPreview — mock "Premier league gameweek 35" data confused
    new visitors looking for the live World Cup pool.
  • TrustBand — copy ("Virtual credits, no money in or out") contradicts
    the live £10 entry. Reintroduce with accurate copy when the licence
    is granted and real-money play is enabled.
  • The #leagues anchor wrapper — no longer needed (single pool, no
    in-page tier picker).

The original multi-pool assembly is preserved at Home.tsx.bak in this
folder for restoration once PL/Champ pools come back online for the
2026/27 season (per arch §15 WC retirement playbook).
*/

import { ScreenFrame } from "@/components/predictor10/Primitives";
import { HeroSection } from "@/components/predictor10/HeroSection";
import { LeagueShowcase } from "@/components/predictor10/LeagueShowcase";
import { HowItWorks } from "@/components/predictor10/HowItWorks";
import { SiteFooter } from "@/components/predictor10/SiteFooter";

export default function Home() {
  return (
    <ScreenFrame className="space-y-6">
      <HeroSection />
      <LeagueShowcase />
      <HowItWorks />
      <SiteFooter />
    </ScreenFrame>
  );
}
