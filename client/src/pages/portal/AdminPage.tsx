/*
Admin portal — user list with paid-checkbox + password reset.

Visible only to users with users.is_admin = true. Non-admins who reach
/admin get a "Not found" message rendered locally (the API also returns
404 to non-admins so the surface stays invisible).

Compromises chosen for V1 scope:
  • No search / sort / pagination — we have 11 users and this list will
    fit on one mobile screen comfortably for the foreseeable future.
  • Password reset is a confirm-with-typed-value dialog rather than a
    polished form. Admin sets the new password directly; user is told
    out-of-band.
  • No revoke-admin / promote-admin UI — admin grants are managed via
    seed.ts only.
*/

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchAdminUsers,
  setAdminUserPaid,
  resetAdminUserPassword,
  AdminAccessError,
  type AdminUser,
} from "@/lib/portal-api";
import { cn } from "@/lib/utils";
import { Loader2, Shield, KeyRound, Check, X } from "lucide-react";

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-row in-flight state — keyed by userId. Prevents double-clicks
  // during the network round-trip and shows a small spinner on the row.
  const [savingPaid, setSavingPaid] = useState<Set<string>>(new Set());

  // Password-reset modal target. null = closed.
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);

  useEffect(() => {
    // Defence in depth: refuse to fetch admin data when the local user
    // state says we're not an admin. The server also gates this endpoint
    // with a 404 — this just stops the request being made at all.
    if (user?.isAdmin !== true) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchAdminUsers();
        if (!cancelled) {
          setUsers(list);
          setLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof AdminAccessError) {
          setAccessDenied(true);
        } else {
          setError(err instanceof Error ? err.message : "Couldn't load users.");
        }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.isAdmin]);

  const togglePaid = async (target: AdminUser, next: boolean) => {
    setSavingPaid((s) => new Set(s).add(target.id));
    // Optimistic update — server-confirm afterwards. If the request fails
    // we roll back below.
    setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, isPaid: next } : u)));
    try {
      await setAdminUserPaid(target.id, next);
    } catch (err) {
      // Roll back
      setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, isPaid: !next } : u)));
      setError(err instanceof Error ? err.message : "Couldn't update paid status.");
    } finally {
      setSavingPaid((s) => {
        const copy = new Set(s);
        copy.delete(target.id);
        return copy;
      });
    }
  };

  // ── Render ──────────────────────────────────────────────────────────

  if (!user) return null;

  if (accessDenied) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-sm text-white/55">Not found.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      {/* Heading */}
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
          <Shield className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-['Barlow_Condensed'] text-2xl font-bold uppercase tracking-[0.04em] text-white">
            Admin
          </h1>
          <p className="text-xs text-white/45">
            {loading ? "Loading…" : `${users.length} user${users.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-[0.82rem] text-rose-200">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 underline underline-offset-2 hover:text-rose-100"
          >
            dismiss
          </button>
        </div>
      )}

      {/* User list */}
      {loading ? (
        <div className="mt-8 flex justify-center text-white/40">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {users.map((u) => {
            const fullName =
              u.firstName && u.lastName
                ? `${u.firstName} ${u.lastName}`
                : u.firstName ?? "—";
            const saving = savingPaid.has(u.id);
            return (
              <li
                key={u.id}
                className="rounded-2xl border border-white/10 bg-[#070d0a] px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-white">
                        {u.nickname ?? u.displayName}
                      </p>
                      {u.isAdmin && (
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-[0.18em] text-emerald-300">
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-white/55">{fullName}</p>
                    <p className="mt-0.5 truncate text-[0.7rem] text-white/40">{u.email}</p>
                    <p className="mt-0.5 text-[0.65rem] text-white/30">
                      {u.countryCode} · joined {new Date(u.createdAt).toLocaleDateString("en-GB")}
                    </p>
                  </div>

                  {/* Right column: paid + reset */}
                  <div className="flex flex-shrink-0 flex-col items-end gap-2">
                    <label className="flex cursor-pointer items-center gap-2 select-none">
                      <span className="text-[0.78rem] font-medium text-white/75">Paid</span>
                      <input
                        type="checkbox"
                        checked={u.isPaid}
                        disabled={saving}
                        onChange={(e) => togglePaid(u, e.target.checked)}
                        className="h-4 w-4 cursor-pointer accent-emerald-400 disabled:opacity-50"
                        aria-label={`Mark ${u.nickname ?? u.email} as paid`}
                      />
                      {saving && (
                        <Loader2 className="h-3 w-3 animate-spin text-white/40" />
                      )}
                    </label>
                    <button
                      type="button"
                      onClick={() => setResetTarget(u)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/[0.04]",
                        "px-2 py-1 text-[0.7rem] font-medium text-white/70 hover:bg-white/[0.08] hover:text-white",
                      )}
                    >
                      <KeyRound className="h-3 w-3" />
                      Reset password
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {resetTarget && (
        <PasswordResetModal
          target={resetTarget}
          onClose={() => setResetTarget(null)}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  );
}

// ─── Password reset modal ─────────────────────────────────────────────

function PasswordResetModal({
  target,
  onClose,
  onError,
}: {
  target: AdminUser;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [newPw, setNewPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSave = async () => {
    if (newPw.length < 8) {
      setLocalError("Password must be at least 8 characters.");
      return;
    }
    setSaving(true);
    setLocalError(null);
    try {
      await resetAdminUserPassword(target.id, newPw);
      setSuccess(true);
      // Auto-close after a brief success indicator
      setTimeout(onClose, 1200);
    } catch (err) {
      setSaving(false);
      const msg = err instanceof Error ? err.message : "Couldn't reset password.";
      // Bubble up to the page-level banner AND keep the modal open with the
      // message visible inline.
      setLocalError(msg);
      onError(msg);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0a1411] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-['Barlow_Condensed'] text-xl font-bold uppercase tracking-[0.03em] text-white">
              Reset password
            </h2>
            <p className="mt-1 text-xs text-white/55">
              For {target.nickname ?? target.email}. Tell the user the new password
              out of band.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-white/55 hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <label className="block text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-white/50">
            New password
          </label>
          <input
            type="text"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            disabled={saving || success}
            autoFocus
            className={cn(
              "w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white",
              "outline-none focus:border-emerald-400/60",
            )}
            placeholder="At least 8 characters"
          />
          {localError && <p className="text-xs text-rose-300">{localError}</p>}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/75 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || success || newPw.length < 8}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold",
              success
                ? "bg-emerald-400 text-emerald-950"
                : "bg-emerald-400 text-emerald-950 hover:bg-emerald-300 disabled:opacity-50",
            )}
          >
            {success ? (
              <>
                <Check className="h-4 w-4" /> Saved
              </>
            ) : saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving
              </>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
