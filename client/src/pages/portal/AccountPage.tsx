/*
Account (arch §8.7). Profile summary + nav into history, payments,
responsible-gambling, settings. Step 2j enables the History link (sub-page
shipped in this step); payments / RG / settings sub-pages still placeholder.
*/

import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronRight, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

type NavRow = {
  label: string;
  href: string;
  active: boolean;
};

const NAV_ROWS: NavRow[] = [
  { label: "History (settled rounds)", href: "/account/history", active: true },
  { label: "Payment history", href: "/account/payments", active: false },
  { label: "Responsible gambling", href: "/account/responsible-gambling", active: false },
  { label: "Settings", href: "/account/settings", active: false },
];

export default function AccountPage() {
  const { user, logout } = useAuth();
  const initials = (user?.avatar ?? "··").slice(0, 2);

  // "First Last" for display. NULL last name (legacy rows pre-backfill,
  // e.g. Wez + Jason) falls back to just the first name.
  const fullName =
    user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : user?.firstName ?? null;

  return (
    <div className="px-4 py-6">
      {/* Profile summary */}
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full",
            "border border-emerald-400/30 bg-[linear-gradient(135deg,#0d2e1a,#1a4a28)]",
          )}
        >
          <span className="font-['Barlow_Condensed'] text-base font-black text-emerald-400">
            {initials}
          </span>
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-['Barlow_Condensed'] text-[1.4rem] font-bold uppercase tracking-[0.05em] text-white">
            {user?.nickname ?? user?.name ?? "—"}
          </h1>
          <p className="truncate text-xs text-white/50">{user?.email ?? ""}</p>
        </div>
      </div>

      {/* Profile details — full name (private) + nickname (public). Read
          only for V1; the Settings sub-page below is still placeholder and
          will host the editor once it's built. */}
      <dl className="mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] text-sm">
        <div className="flex items-center justify-between bg-[#070d0a] px-4 py-3">
          <dt className="text-white/55">Full name</dt>
          <dd className="truncate text-right font-medium text-white/90">
            {fullName ?? <span className="text-white/35">Not set</span>}
          </dd>
        </div>
        <div className="flex items-center justify-between bg-[#070d0a] px-4 py-3">
          <dt className="text-white/55">Nickname</dt>
          <dd className="truncate text-right font-medium text-white/90">
            {user?.nickname ?? <span className="text-white/35">Not set</span>}
          </dd>
        </div>
      </dl>

      {/* Nav rows — History live, rest placeholder */}
      <ul className="mt-6 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        {NAV_ROWS.map((row) =>
          row.active ? (
            <li key={row.href}>
              <Link
                href={row.href}
                className={cn(
                  "flex w-full items-center justify-between px-4 py-3.5 text-left transition",
                  "hover:bg-white/[0.04]",
                  "outline-none focus-visible:bg-white/[0.04]",
                  "min-h-[52px]",
                )}
              >
                <span className="text-sm font-semibold text-white/85">{row.label}</span>
                <ChevronRight className="h-4 w-4 text-white/45" aria-hidden />
              </Link>
            </li>
          ) : (
            <li key={row.href}>
              <button
                type="button"
                disabled
                className="flex w-full cursor-not-allowed items-center justify-between px-4 py-3.5 text-left transition disabled:opacity-50 min-h-[52px]"
                aria-label={`${row.label} — coming soon`}
              >
                <span className="text-sm font-semibold text-white/72">{row.label}</span>
                <ChevronRight className="h-4 w-4 text-white/30" aria-hidden />
              </button>
            </li>
          ),
        )}
      </ul>

      {/* Sign out — wired to the existing AuthContext logout */}
      <button
        type="button"
        onClick={logout}
        className={cn(
          "mt-4 flex w-full items-center justify-center gap-2 rounded-2xl",
          "border border-white/10 bg-white/[0.02] px-4 py-3.5",
          "font-['Manrope'] text-sm font-semibold text-white/72",
          "transition hover:border-rose-300/30 hover:bg-rose-500/10 hover:text-rose-100",
          "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
          "min-h-[52px]",
        )}
      >
        <LogOut className="h-4 w-4" aria-hidden />
        <span>Sign out</span>
      </button>

      <div className="mt-8 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
        <p className="font-['Barlow_Condensed'] text-[0.78rem] font-bold uppercase tracking-[0.22em] text-white/40">
          Step placeholder
        </p>
        <p className="mt-2 text-xs text-white/40">
          Payments · RG · Settings — arch §8.7 / §8.9
        </p>
      </div>
    </div>
  );
}
