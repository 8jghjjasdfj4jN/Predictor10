/*
Brand reminder — Broadcast Noir Athletics:
Post-login portal shell. Mobile-first, max 480px column on desktop (arch §1).
Sticky top bar (logo · live badge · greeting+avatar) + sticky 4-tab bottom
nav (Home · Predict · Tables · Account). Auth pages and the public marketing
surface use AuthShell / MarketingShell respectively — this is the shell behind
login only.

Step 2m: third slot in the bottom nav repurposed. Was POOLS (Trophy icon →
/pools); now TABLES (Trophy icon stays → /tables). Match prefix updated so
the tab highlights for /tables/... but no longer for /pools/... (legacy
redirects route those URLs elsewhere anyway).
*/

import { Link, useLocation } from "wouter";
import { House, ListChecks, Shield, Trophy, User2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

type NavItem = {
  href: string;
  label: string;
  icon: typeof House;
  /** Routes considered "this tab" beyond the exact href (e.g. /tables/* belongs to Tables). */
  matchPrefix?: string;
};

const NAV: NavItem[] = [
  { href: "/",        label: "Home",    icon: House                                },
  { href: "/predict", label: "Predict", icon: ListChecks, matchPrefix: "/predict"  },
  { href: "/tables",  label: "Tables",  icon: Trophy,     matchPrefix: "/tables"   },
  { href: "/account", label: "Account", icon: User2,      matchPrefix: "/account"  },
];

// Appended for users.is_admin only. Sits to the right of Account so the
// usual 4 tabs keep their muscle-memory positions; admins see a 5-tab grid.
const ADMIN_NAV: NavItem = {
  href: "/admin",
  label: "Admin",
  icon: Shield,
  matchPrefix: "/admin",
};

function isActive(currentPath: string, item: NavItem) {
  if (item.matchPrefix) return currentPath === item.href || currentPath.startsWith(`${item.matchPrefix}/`);
  return currentPath === "/";
}

/**
 * Live badge.
 *
 * Architecture §5: appears only when ≥1 match is IN_PLAY/PAUSED across active
 * competitions. Tap → bottom-sheet of live matches grouped by competition
 * (arch §9.1).
 *
 * Currently the count is hard-zero — the live polling endpoint and bottom-sheet
 * land in a later step. Plumbed here so wiring is a one-line swap.
 */
function LiveBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      // TODO: open live-matches bottom sheet (arch §9.1).
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/12 px-2.5 py-1",
        "font-['Barlow_Condensed'] text-[0.68rem] font-bold uppercase tracking-[0.18em] text-rose-200",
        "transition hover:border-rose-300/60 hover:bg-rose-500/18",
      )}
      aria-label={`${count} live match${count === 1 ? "" : "es"} — open live overview`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-70" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-400" />
      </span>
      <span>{count} live</span>
    </button>
  );
}

function TopBar() {
  const { user } = useAuth();
  // Prefer the real first name for the "Hi, X" greeting — friendlier than
  // the nickname for users who chose a handle that isn't their actual name.
  // Falls back to the nickname (user.name) when first name isn't set.
  const firstName = user?.firstName ?? user?.name ?? "";
  const initials = (user?.avatar ?? "··").slice(0, 2);
  // TODO: replace with `useLiveMatches()` hook reading /api/live (arch §9.2). Hard-zero today.
  const liveCount = 0;

  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex flex-shrink-0 items-center justify-between gap-2",
        "border-b border-white/[0.07] bg-[rgba(7,15,9,0.92)] px-4 py-2.5 backdrop-blur-xl",
      )}
    >
      {/* Brand monogram + wordmark — links to / */}
      <Link
        href="/"
        className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070f09]"
      >
        <span
          className={cn(
            "flex h-[30px] w-[30px] items-center justify-center rounded-[0.55rem]",
            "border border-emerald-400/30 bg-[linear-gradient(135deg,#0d2e1a,#1a4a28)]",
            "font-['Barlow_Condensed']",
          )}
          aria-hidden
        >
          <span className="text-[0.85rem] font-black leading-none text-emerald-400">P</span>
          <span className="mt-[3px] text-[0.55rem] font-bold leading-none text-emerald-400/70">10</span>
        </span>
        <span className="font-['Barlow_Condensed'] text-[1.05rem] font-extrabold uppercase tracking-[0.1em] text-white">
          Predictor<span className="text-emerald-400">10</span>
        </span>
      </Link>

      {/* Live badge — middle, only renders when count > 0. Reserve height so the
          bar doesn't twitch when the badge appears mid-session. */}
      <div className="flex flex-1 justify-center">
        {liveCount > 0 ? <LiveBadge count={liveCount} /> : <span className="block h-7" aria-hidden />}
      </div>

      {/* Greeting + avatar — links to /account */}
      <Link
        href="/account"
        className={cn(
          "flex items-center gap-2 rounded-full py-1 pl-2.5 pr-1",
          "transition hover:bg-white/[0.04] outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070f09]",
        )}
        aria-label={firstName ? `Account — Hi ${firstName}` : "Account"}
      >
        {firstName && (
          <span className="hidden text-[0.72rem] font-semibold text-white/55 sm:inline">
            Hi, {firstName}
          </span>
        )}
        <span
          className={cn(
            "flex h-[30px] w-[30px] items-center justify-center rounded-full",
            "border border-emerald-400/30 bg-[linear-gradient(135deg,#0d2e1a,#1a4a28)]",
          )}
          aria-hidden
        >
          <span className="font-['Barlow_Condensed'] text-[0.72rem] font-black text-emerald-400">
            {initials}
          </span>
        </span>
      </Link>
    </header>
  );
}

function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  // Admins see a 5th tab; everyone else keeps the 4-tab grid. Strict
  // equality (=== true) — defensive against any future type drift on the
  // user payload. A missing / undefined / false / null isAdmin = no tab,
  // no exception.
  const items: NavItem[] = user?.isAdmin === true ? [...NAV, ADMIN_NAV] : NAV;
  return (
    <nav
      className={cn(
        "sticky bottom-0 z-20 mt-auto flex-shrink-0",
        "border-t border-white/[0.07] bg-[rgba(7,15,9,0.96)] backdrop-blur-2xl",
        "px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]",
      )}
      aria-label="Primary"
    >
      <ul className={cn("grid gap-1", items.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(location, item);
          return (
            <li key={item.href} className="contents">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-[0.8rem] px-1 py-2 transition",
                  "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
                  active
                    ? "bg-emerald-400/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-emerald-300/20"
                    : "hover:bg-white/[0.03]",
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 transition",
                    active ? "text-emerald-400" : "text-white/40",
                  )}
                  strokeWidth={2}
                  aria-hidden
                />
                <span
                  className={cn(
                    "font-['Manrope'] text-[0.6rem] font-bold uppercase tracking-[0.12em] transition",
                    active ? "text-emerald-400" : "text-white/40",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    // Outer page background: literal #070f09 per Decided Rules / Dashboard parity.
    <div className="min-h-screen bg-[#070f09] font-['Manrope'] text-white">
      {/* Centred mobile-first column. Caps at 480px (the iPhone Pro width the
          design was authored against) and steps up at tablet/desktop breakpoints.
          Desktop cap is 1024px — fills a laptop screen comfortably without
          requiring a per-component redesign. Some elements (score boxes, nav
          tabs) look a bit airy at full desktop width; full desktop layout
          (sidebar nav, grid cards) is a future step (arch §1.3 — mobile-first,
          native ports later). */}
      <div
        className={cn(
          "relative mx-auto flex min-h-screen max-w-[480px] md:max-w-[720px] lg:max-w-[1024px] flex-col",
          "border-x border-white/[0.04]",
        )}
      >
        <TopBar />

        {/* Main scroll area. Sticky bottom nav sits inside the column flex flow. */}
        <main className="flex-1 overflow-y-auto">{children}</main>

        <BottomNav />
      </div>
    </div>
  );
}

// Re-exported for tests / future composition.
export { TopBar, BottomNav, LiveBadge };
