/*
Brand reminder — Broadcast Noir Athletics:
This shell wraps the public, logged-out marketing surface — landing, leagues
preview, leaderboard, history, rules. Desktop uses a left control rail; mobile
keeps the app-style bottom navigation. The post-login portal uses AppShell.
*/

import { Link, useLocation } from "wouter";
import { CreditCard, House, LayoutList, LogIn, ScrollText, ShieldQuestion, Trophy, User } from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { href: "/",            label: "Play",        icon: House         },
  { href: "/leagues",     label: "Leagues",     icon: Trophy        },
  { href: "/leaderboard", label: "Leaderboard", icon: LayoutList    },
  { href: "/history",     label: "History",     icon: ScrollText    },
  { href: "/rules",       label: "Rules",       icon: ShieldQuestion },
];

export function MarketingShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { isLoggedIn, user } = useAuth();

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(46,204,113,0.18),transparent_28%),radial-gradient(circle_at_85%_10%,rgba(255,214,102,0.08),transparent_16%),linear-gradient(180deg,rgba(4,10,8,1),rgba(7,17,12,1))]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-50 mix-blend-screen"
        style={{
          backgroundImage:
            "url(https://d2xsxph8kpxj0f.cloudfront.net/310519663048135071/Hs9KYYBFCMZwearV4cmxdF/predictor10-pattern-surface-9crvNiZWEVeNZqnWS4Q7gX.webp)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1520px] flex-col px-3 pb-28 pt-3 sm:px-5 sm:pb-32 sm:pt-5 lg:px-6 lg:pt-6">
        <div className="relative flex-1 overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] shadow-[0_30px_120px_rgba(0,0,0,0.34)] backdrop-blur-xl lg:rounded-[2.4rem]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(29,185,84,0.09),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.04),transparent_18%)]" />

          <div className="relative z-10 lg:grid lg:min-h-[calc(100vh-3rem)] lg:grid-cols-[260px_minmax(0,1fr)]">

            {/* Desktop sidebar */}
            <aside className="hidden border-r border-white/8 bg-[linear-gradient(180deg,rgba(0,0,0,0.16),rgba(255,255,255,0.02))] lg:flex lg:flex-col lg:justify-between lg:px-5 lg:py-5">
              <div className="space-y-5">
                <Link href="/" className="block w-fit max-w-full">
                  <BrandLogo compact className="max-w-full" />
                </Link>

                <div className="space-y-2">
                  <p className="px-2 font-['Manrope'] text-[0.62rem] font-semibold uppercase tracking-[0.3em] text-white/38">
                    Navigation
                  </p>
                  <nav className="space-y-1">
                    {navItems.map(({ href, label, icon: Icon }) => {
                      const active = location === href;
                      return (
                        <Link
                          key={href}
                          href={href}
                          className={cn(
                            "flex items-center gap-3 rounded-[1.25rem] border border-transparent px-4 py-3 text-sm font-semibold tracking-[0.12em] text-white/58 transition",
                            active
                              ? "border-emerald-300/20 bg-emerald-400/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                              : "hover:border-white/10 hover:bg-white/6 hover:text-white/82",
                          )}
                        >
                          <Icon className={cn("h-4 w-4", active && "text-emerald-300")} />
                          <span>{label}</span>
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              </div>

              {/* Auth section in sidebar */}
              <div className="space-y-3">
                {isLoggedIn ? (
                  <Link
                    href="/login"
                    className="flex items-center gap-3 rounded-[1.25rem] border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400/15"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-400/15">
                      <span className="font-['Barlow_Condensed'] text-xs font-bold text-emerald-300">
                        {user?.avatar}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
                      <p className="text-[0.65rem] text-emerald-300/70">My Dashboard →</p>
                    </div>
                  </Link>
                ) : (
                  <Link
                    href="/login"
                    className="flex items-center gap-3 rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-3 text-sm font-semibold text-white/70 transition hover:border-emerald-300/20 hover:bg-emerald-400/10 hover:text-white"
                  >
                    <LogIn className="h-4 w-4 text-emerald-300" />
                    <span>Sign In / Register</span>
                  </Link>
                )}

                <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center gap-3 text-white/80">
                    <CreditCard className="h-4 w-4 text-emerald-300" />
                    <p className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.24em]">
                      Predictor10 · 2025/26
                    </p>
                  </div>
                </div>
              </div>
            </aside>

            <main className="min-w-0">{children}</main>
          </div>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.65rem)] pt-3 sm:px-5 lg:hidden">
        <div className="mx-auto w-full max-w-[860px]">
          <div className="mx-auto flex max-w-[920px] flex-col items-center gap-2">
            <nav className="grid w-full grid-cols-6 gap-1 rounded-[1.7rem] border border-white/10 bg-[rgba(8,18,13,0.92)] p-2 shadow-[0_-10px_40px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
              {navItems.map(({ href, label, icon: Icon }) => {
                const active = location === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[0.62rem] font-semibold tracking-[0.1em] text-white/56 transition",
                      active &&
                        "bg-emerald-400/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-emerald-300/20",
                    )}
                  >
                    <Icon className={cn("h-4 w-4", active && "text-emerald-300")} />
                    <span className="truncate">{label}</span>
                  </Link>
                );
              })}

              {/* Sign In / Avatar as 6th nav item on mobile */}
              <Link
                href="/login"
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[0.62rem] font-semibold tracking-[0.1em] transition",
                  isLoggedIn
                    ? "bg-emerald-400/12 text-emerald-300 ring-1 ring-emerald-300/20"
                    : "text-white/56 hover:text-white/80",
                )}
              >
                {isLoggedIn ? (
                  <>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-400/20 font-['Barlow_Condensed'] text-[0.6rem] font-bold text-emerald-300">
                      {user?.avatar?.slice(0, 1)}
                    </span>
                    <span className="truncate">Me</span>
                  </>
                ) : (
                  <>
                    <User className="h-4 w-4" />
                    <span className="truncate">Sign In</span>
                  </>
                )}
              </Link>
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}
