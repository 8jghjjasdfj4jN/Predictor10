/*
Brand reminder — Broadcast Noir Athletics:
Persistent premium header, dark studio surfaces, disciplined green highlights,
mobile-first bottom navigation, and elegant placeholder future-account affordances.
*/

import { Link, useLocation } from "wouter";
import { Bell, CircleUserRound, CreditCard, House, LayoutList, ScrollText, ShieldQuestion, Trophy } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "./BrandLogo";
import { profilePlaceholders } from "@/lib/mockData";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Play", icon: House },
  { href: "/leagues", label: "Leagues", icon: Trophy },
  { href: "/leaderboard", label: "Leaderboard", icon: LayoutList },
  { href: "/history", label: "History", icon: ScrollText },
  { href: "/rules", label: "Rules", icon: ShieldQuestion },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(46,204,113,0.16),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(255,214,102,0.08),transparent_16%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-50 mix-blend-screen" style={{ backgroundImage: "url(https://d2xsxph8kpxj0f.cloudfront.net/310519663048135071/Hs9KYYBFCMZwearV4cmxdF/predictor10-pattern-surface-9crvNiZWEVeNZqnWS4Q7gX.webp)", backgroundSize: "cover", backgroundPosition: "center" }} />

      <header className="sticky top-0 z-30 border-b border-white/8 bg-[rgba(6,16,12,0.72)] backdrop-blur-2xl">
        <div className="container flex items-center justify-between gap-4 py-4">
          <Link href="/" className="min-w-0">
            <BrandLogo compact className="max-w-full" />
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toast.info("Notifications panel is a future-connected feature.")}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white/80 transition hover:border-emerald-300/35 hover:bg-white/10 hover:text-white"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() =>
                toast.info(`Planned account areas: ${profilePlaceholders.join(", ")}.`)
              }
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white/80 transition hover:border-emerald-300/35 hover:bg-white/10 hover:text-white"
              aria-label="Account"
            >
              <CircleUserRound className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 pb-28">{children}</main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/8 bg-[rgba(5,13,10,0.84)] px-3 pb-[calc(env(safe-area-inset-bottom)+0.65rem)] pt-3 backdrop-blur-2xl">
        <nav className="mx-auto grid max-w-xl grid-cols-5 gap-2 rounded-[1.7rem] border border-white/8 bg-white/6 p-2 shadow-[0_-10px_40px_rgba(0,0,0,0.35)]">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[0.7rem] font-semibold tracking-[0.14em] text-white/56 transition",
                  active &&
                    "bg-emerald-400/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-emerald-300/20",
                )}
              >
                <Icon className={cn("h-4 w-4", active && "text-emerald-300")} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mx-auto mt-3 flex max-w-xl items-center justify-center gap-2 text-[0.68rem] uppercase tracking-[0.28em] text-white/35">
          <CreditCard className="h-3.5 w-3.5" />
          Frontend MVP ready for payments and auth later
        </div>
      </div>
    </div>
  );
}
