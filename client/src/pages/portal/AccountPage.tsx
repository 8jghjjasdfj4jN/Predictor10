/*
Account (arch §8.7). Profile summary + nav into history, payments,
responsible-gambling, settings. Filled in a later step. For now, exposes a
working Sign Out so the shell isn't a one-way trip during step-1 testing.
*/

import { useAuth } from "@/contexts/AuthContext";
import { ChevronRight, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const PLACEHOLDER_LINKS = [
  { label: "History (settled rounds)", href: "/account/history" },
  { label: "Payment history", href: "/account/payments" },
  { label: "Responsible gambling", href: "/account/responsible-gambling" },
  { label: "Settings", href: "/account/settings" },
];

export default function AccountPage() {
  const { user, logout } = useAuth();
  const initials = (user?.avatar ?? "··").slice(0, 2);

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
            {user?.name ?? "—"}
          </h1>
          <p className="truncate text-xs text-white/50">{user?.email ?? ""}</p>
        </div>
      </div>

      {/* Nav rows — placeholders, filled in later steps */}
      <ul className="mt-6 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        {PLACEHOLDER_LINKS.map((row) => (
          <li key={row.href}>
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center justify-between px-4 py-3.5 text-left transition disabled:opacity-50"
              aria-label={`${row.label} — coming soon`}
            >
              <span className="text-sm font-semibold text-white/72">{row.label}</span>
              <ChevronRight className="h-4 w-4 text-white/30" aria-hidden />
            </button>
          </li>
        ))}
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
          Account detail · sub-pages — arch §8.7 / §8.8 / §8.9
        </p>
      </div>
    </div>
  );
}
