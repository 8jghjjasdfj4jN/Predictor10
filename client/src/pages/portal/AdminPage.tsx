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
  fetchScoreAlerts,
  fetchAdminUserEntries,
  voidAdminPoolEntry,
  AdminAccessError,
  type AdminUser,
  type AdminUserEntry,
  type ScoreAlert,
} from "@/lib/portal-api";
import { cn } from "@/lib/utils";
import { Loader2, Shield, KeyRound, Check, X, AlertTriangle, UserMinus } from "lucide-react";

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [alerts, setAlerts] = useState<ScoreAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-row in-flight state — keyed by userId. Prevents double-clicks
  // during the network round-trip and shows a small spinner on the row.
  const [savingPaid, setSavingPaid] = useState<Set<string>>(new Set());

  // Password-reset modal target. null = closed.
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);

  // Remove-from-pool modal target. null = closed.
  const [removeTarget, setRemoveTarget] = useState<AdminUser | null>(null);

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
        // Best-effort: load score alerts. Non-critical — never fail the page.
        try {
          const al = await fetchScoreAlerts();
          if (!cancelled) setAlerts(al);
        } catch {
          /* ignore — alerts are a secondary surface */
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

      {/* Score alerts — post-record divergences flagged by the results-checker */}
      <ScoreAlertsPanel alerts={alerts} />

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
                    <button
                      type="button"
                      onClick={() => setRemoveTarget(u)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border border-rose-400/25 bg-rose-500/[0.06]",
                        "px-2 py-1 text-[0.7rem] font-medium text-rose-200/85 hover:bg-rose-500/[0.12] hover:text-rose-100",
                      )}
                    >
                      <UserMinus className="h-3 w-3" />
                      Remove from pool
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

      {removeTarget && (
        <RemoveFromPoolModal
          target={removeTarget}
          onClose={() => setRemoveTarget(null)}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  );
}

// ─── Score alerts panel ───────────────────────────────────────────────

function ScoreAlertsPanel({ alerts }: { alerts: ScoreAlert[] }) {
  if (alerts.length === 0) return null;
  const unresolved = alerts.filter((a) => !a.resolved);

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-300" />
        <h2 className="font-['Barlow_Condensed'] text-lg font-bold uppercase tracking-[0.04em] text-white">
          Score alerts
        </h2>
        {unresolved.length > 0 && (
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-[0.18em] text-amber-300">
            {unresolved.length} to review
          </span>
        )}
      </div>
      <p className="mt-1 text-[0.7rem] text-white/40">
        Football-data reports a different result than the one recorded. Nothing is
        changed automatically — review, then correct deliberately.
      </p>

      <ul className="mt-3 space-y-2">
        {alerts.map((a) => (
          <li
            key={a.id}
            className={cn(
              "rounded-2xl border px-4 py-3",
              a.resolved
                ? "border-white/10 bg-[#070d0a] opacity-60"
                : "border-amber-400/30 bg-amber-400/[0.06]",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{a.match}</p>
                <p className="mt-0.5 text-xs text-white/60">
                  Recorded <span className="font-semibold text-white">{a.recorded}</span>
                  {" · "}football-data now{" "}
                  <span className="font-semibold text-amber-200">{a.footballData}</span>
                </p>
                <p className="mt-0.5 text-[0.65rem] text-white/30">
                  {new Date(a.detectedAt).toLocaleString("en-GB")}
                </p>
              </div>
              <span
                className={cn(
                  "flex-shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.14em]",
                  a.resolved
                    ? "border border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                    : "border border-amber-400/40 bg-amber-400/15 text-amber-200",
                )}
              >
                {a.resolved ? "Resolved" : "Review"}
              </span>
            </div>
          </li>
        ))}
      </ul>
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

// ─── Remove-from-pool modal ───────────────────────────────────────────
//
// Lists the player's CURRENT entries (live, not settled, not already
// removed) and lets the admin remove one with a required reason. Removal
// is a void, not a delete — the entry, its payment and the audit trail are
// retained; the player simply drops out of that round's pot and standings.
function RemoveFromPoolModal({
  target,
  onClose,
  onError,
}: {
  target: AdminUser;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [entries, setEntries] = useState<AdminUserEntry[] | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchAdminUserEntries(target.id);
        if (!cancelled) setEntries(list);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Couldn't load entries.";
        setLocalError(msg);
        setEntries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target.id]);

  const remove = async (entry: AdminUserEntry) => {
    const reason = (reasons[entry.entryId] ?? "").trim();
    if (reason.length < 3) {
      setLocalError("Add a short reason before removing.");
      return;
    }
    setLocalError(null);
    setSaving((s) => new Set(s).add(entry.entryId));
    try {
      await voidAdminPoolEntry(entry.entryId, reason);
      setRemoved((r) => new Set(r).add(entry.entryId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't remove entry.";
      setLocalError(msg);
      onError(msg);
    } finally {
      setSaving((s) => {
        const copy = new Set(s);
        copy.delete(entry.entryId);
        return copy;
      });
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
              Remove from pool
            </h2>
            <p className="mt-1 text-xs text-white/55">
              {target.nickname ?? target.email}. The entry is kept on record (not
              deleted) and they drop out of that round's pot and table.
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

        <div className="mt-4 space-y-3">
          {entries === null ? (
            <div className="flex justify-center py-6 text-white/40">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <p className="py-4 text-center text-sm text-white/45">
              No current entries to remove.
            </p>
          ) : (
            entries.map((e) => {
              const isRemoved = removed.has(e.entryId);
              const isSaving = saving.has(e.entryId);
              return (
                <div
                  key={e.entryId}
                  className={cn(
                    "rounded-xl border px-3 py-2.5",
                    isRemoved
                      ? "border-emerald-400/25 bg-emerald-400/[0.06] opacity-70"
                      : "border-white/10 bg-black/30",
                  )}
                >
                  <p className="text-sm font-semibold text-white">
                    {e.competitionName}
                    <span className="font-normal text-white/50"> · {e.tierName}</span>
                  </p>
                  <p className="mt-0.5 text-[0.7rem] text-white/40">{e.roundName}</p>

                  {isRemoved ? (
                    <p className="mt-2 inline-flex items-center gap-1 text-[0.78rem] font-medium text-emerald-300">
                      <Check className="h-3.5 w-3.5" /> Removed
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <input
                        type="text"
                        value={reasons[e.entryId] ?? ""}
                        onChange={(ev) =>
                          setReasons((r) => ({ ...r, [e.entryId]: ev.target.value }))
                        }
                        disabled={isSaving}
                        placeholder="Reason (e.g. didn't pay)"
                        className={cn(
                          "w-full rounded-md border border-white/15 bg-black/40 px-2.5 py-1.5 text-[0.82rem] text-white",
                          "outline-none focus:border-rose-400/60 placeholder:text-white/30",
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => remove(e)}
                        disabled={isSaving}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[0.8rem] font-semibold",
                          "bg-rose-500/90 text-white hover:bg-rose-500 disabled:opacity-50",
                        )}
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Removing
                          </>
                        ) : (
                          <>
                            <UserMinus className="h-3.5 w-3.5" /> Remove
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
          {localError && <p className="text-xs text-rose-300">{localError}</p>}
        </div>

        <div className="mt-5 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/75 hover:bg-white/10"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
