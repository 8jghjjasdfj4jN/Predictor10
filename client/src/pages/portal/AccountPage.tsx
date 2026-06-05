/*
Account (arch §8.7). Profile summary + nav into history, payments,
responsible-gambling, settings. Step 2j enables the History link (sub-page
shipped in this step); payments / RG / settings sub-pages still placeholder.
*/

import { Link } from "wouter";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronRight, LogOut, Pencil, Check, X } from "lucide-react";
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

// Client-side pattern mirror of the server rule. Submission still validates
// on the server (uniqueness + reserved list), so this is just a fast-fail
// for obvious format errors.
const NICKNAME_PATTERN = /^[A-Za-z0-9_]{3,15}$/;

export default function AccountPage() {
  const { user, logout, updateNickname } = useAuth();
  const initials = (user?.avatar ?? "··").slice(0, 2);

  // "First Last" for display. NULL last name (legacy rows pre-backfill,
  // e.g. Wez + Jason) falls back to just the first name.
  const fullName =
    user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : user?.firstName ?? null;

  // Inline edit state for the nickname row. Opens with the current value
  // pre-filled, server validates on save, errors surface inline.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(user?.nickname ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync the draft if the user object changes from elsewhere
  // (e.g. another tab updated their nickname).
  useEffect(() => {
    if (!editing) setDraft(user?.nickname ?? "");
  }, [user?.nickname, editing]);

  const startEdit = () => {
    setDraft(user?.nickname ?? "");
    setError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setError(null);
  };

  const saveEdit = async () => {
    const trimmed = draft.trim();
    if (!NICKNAME_PATTERN.test(trimmed)) {
      setError("3–15 characters, letters/digits/underscore only.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateNickname(trimmed);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update nickname.");
    } finally {
      setSaving(false);
    }
  };

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

      {/* Profile details — full name (private) + nickname (public).
          Full name is read-only in V1 (KYC field — editor lives in the
          Settings sub-page once that's built). Nickname is inline-editable;
          server validates uniqueness and writes an audit_log entry on
          every change. */}
      <dl className="mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] text-sm">
        <div className="flex items-center justify-between bg-[#070d0a] px-4 py-3">
          <dt className="text-white/55">Full name</dt>
          <dd className="truncate text-right font-medium text-white/90">
            {fullName ?? <span className="text-white/35">Not set</span>}
          </dd>
        </div>
        <div className="bg-[#070d0a] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-white/55">Nickname</dt>
            {editing ? (
              <div className="flex flex-1 items-center justify-end gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={15}
                  autoFocus
                  disabled={saving}
                  className={cn(
                    "w-32 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-right text-sm",
                    "text-white tabular-nums outline-none focus:border-emerald-400/60",
                  )}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    else if (e.key === "Escape") cancelEdit();
                  }}
                />
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={saving}
                  aria-label="Save nickname"
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md",
                    "border border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
                    "hover:bg-emerald-400/20 disabled:opacity-50",
                  )}
                >
                  <Check className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  aria-label="Cancel"
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md",
                    "border border-white/15 bg-white/5 text-white/70",
                    "hover:bg-white/10 disabled:opacity-50",
                  )}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startEdit}
                className="flex items-center gap-2 truncate text-right font-medium text-white/90 hover:text-emerald-300"
                aria-label="Edit nickname"
              >
                {user?.nickname ?? <span className="text-white/35">Not set</span>}
                <Pencil className="h-3.5 w-3.5 text-white/45" aria-hidden />
              </button>
            )}
          </div>
          {error && (
            <p className="mt-2 text-right text-xs text-rose-300">{error}</p>
          )}
          {editing && !error && (
            <p className="mt-2 text-right text-[0.7rem] text-white/40">
              3–15 chars · letters, digits, underscore · must be unique
            </p>
          )}
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
