import { ScreenFrame } from "@/components/predictor10/Primitives";
import { HeroSection } from "@/components/predictor10/HeroSection";
import { LeagueShowcase } from "@/components/predictor10/LeagueShowcase";
import { HowItWorks } from "@/components/predictor10/HowItWorks";
import { LeaderboardPreview } from "@/components/predictor10/LeaderboardPreview";
import { TrustBand } from "@/components/predictor10/TrustBand";
import { SiteFooter } from "@/components/predictor10/SiteFooter";

export default function Home() {
  return (
    <ScreenFrame className="space-y-6">
      <HeroSection />
      <div id="leagues">
        <LeagueShowcase />
      </div>
      <HowItWorks />
      <div id="leaderboard">
        <LeaderboardPreview />
      </div>
      <TrustBand />
      <SiteFooter />
    </ScreenFrame>
  );
}
