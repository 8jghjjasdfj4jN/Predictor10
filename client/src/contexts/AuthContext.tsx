/*
Predictor10 — auth context.

Real backend wiring: cookies + /api/auth/*. On mount we ask the server "who
am I?" — if the session cookie's valid we get a user object back; otherwise
we stay logged-out. Errors thrown by login/register carry the server's
message text so the UI can surface it directly.

Cold-start tolerance (step 2l follow-up):
- Render's free tier can take 20-60s to wake a sleeping web service. We no
  longer impose a 30s hard timeout on the boot-time /api/auth/me round-trip
  (that timeout was kicking valid sessions out into a logged-out state when
  the server took longer than 30s to respond).
- Instead we retry transient network / 5xx failures (up to 3 attempts with
  exponential backoff). A genuine 401 — cookie expired or no cookie at all —
  resolves immediately as "logged out", no retry.
- LoadingSplash (in App.tsx) shows progressively more informative copy as
  time passes, with a Reload affordance after 60s for the rare case the boot
  hangs entirely.

Mid-session 401s are handled by `setUnauthorizedHandler` in portal-api.ts:
on mount we register a callback that clears `user`, and the App.tsx Router's
portal-URL → /login redirect catches the navigation from there.
*/

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { setUnauthorizedHandler } from "@/lib/portal-api";

export type User = {
  id: string;
  email: string;
  /** Public handle — nickname when set, falls back to legacy displayName. */
  name: string;
  /** Two-letter avatar initials derived from the public name. */
  avatar: string;
  /** Real first name — KYC/profile field, never public. May be NULL for legacy rows. */
  firstName: string | null;
  /** Real last name — KYC/profile field, never public. May be NULL for legacy rows. */
  lastName: string | null;
  /** Canonical public handle, unique platform-wide. May be NULL for legacy rows. */
  nickname: string | null;
  /** True for the founding admin allowlist. Gates the /admin route and the Admin bottom-nav tab. */
  isAdmin: boolean;
  /** WC informal-run paid flag — admin-managed, off-platform payment tracker. */
  isPaid: boolean;
  emailVerified?: boolean;
  country?: string;
  marketingConsent?: boolean;
};

export type RegisterPayload = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  nickname: string;
  dateOfBirth: string; // YYYY-MM-DD
  country: string;
  marketingConsent: boolean;
};

type AuthContextType = {
  user: User | null;
  isLoggedIn: boolean;
  /** True until the first /api/auth/me round-trip resolves. Gate routing on this to avoid a marketing-page flash for already-signed-in users. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  updateName: (name: string) => void;
  /**
   * Calls PATCH /api/account/nickname with the new value. Validates server-
   * side (pattern, reserved list, uniqueness). On success, refreshes the
   * user state from the server response so the new nickname appears
   * everywhere `useAuth().user` is read (header greeting, account page,
   * etc). Throws an Error with a user-facing message on validation failure
   * or collision — the caller renders that into the form.
   */
  updateNickname: (nickname: string) => Promise<void>;
};

// Server response shape — kept private; mapped to client User via mapServerUser.
type ServerUser = {
  id: string;
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  nickname: string | null;
  avatarInitials: string | null;
  emailVerified: boolean;
  countryCode: string;
  marketingConsent: boolean;
  isAdmin: boolean;
  isPaid: boolean;
};

function mapServerUser(s: ServerUser): User {
  // Public name preference: nickname → displayName → email local-part. The
  // last is a safety net for any malformed row; in practice everything has
  // at least a displayName.
  const publicName = s.nickname ?? s.displayName ?? s.email.split("@")[0];
  return {
    id: s.id,
    email: s.email,
    name: publicName,
    avatar: s.avatarInitials ?? publicName.slice(0, 2).toUpperCase(),
    firstName: s.firstName,
    lastName: s.lastName,
    nickname: s.nickname,
    isAdmin: s.isAdmin,
    isPaid: s.isPaid,
    emailVerified: s.emailVerified,
    country: s.countryCode,
    marketingConsent: s.marketingConsent,
  };
}

async function apiPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const data = await res.json();
      if (data && typeof data.error === "string") message = data.error;
    } catch {
      // non-JSON error body, fall through with default message
    }
    throw new Error(message);
  }
  return res.json();
}

const AuthContext = createContext<AuthContextType | null>(null);

const ME_RETRY_DELAYS_MS = [2_000, 5_000, 10_000]; // 3 retries; final attempt at ~17s elapsed

/**
 * Boot-time session restore — calls /api/auth/me, retrying transient failures.
 *
 * Returns the user on success, or null when the server resolves us as
 * logged-out (HTTP 401). Throws only after all retries exhaust on
 * network/5xx — caller treats that as a temporary failure and leaves
 * `user` null without flipping to a "definitely logged out" state.
 *
 * AbortSignal lets the cleanup function cancel an in-flight call on unmount.
 */
async function loadCurrentUser(signal: AbortSignal): Promise<User | null> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= ME_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
        signal,
      });
      if (signal.aborted) return null;
      if (res.status === 401) return null; // genuinely logged-out, don't retry
      if (res.ok) {
        const data = (await res.json()) as { user: ServerUser };
        return data?.user ? mapServerUser(data.user) : null;
      }
      // 5xx or other transient failure — fall through to retry
      lastError = new Error(`${res.status} ${res.statusText}`);
    } catch (err) {
      if (signal.aborted) return null;
      lastError = err;
    }
    const delay = ME_RETRY_DELAYS_MS[attempt];
    if (delay === undefined) break;
    await new Promise<void>((resolve) => {
      const timeoutId = window.setTimeout(resolve, delay);
      signal.addEventListener("abort", () => {
        window.clearTimeout(timeoutId);
        resolve();
      }, { once: true });
    });
    if (signal.aborted) return null;
  }
  // All retries exhausted. Bubble up so the caller can decide whether to
  // treat as logged-out or surface a retry UI.
  throw lastError ?? new Error("Auth check failed after retries");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Boot-time session restore. No hard timeout — cold starts on Render free
  // tier can legitimately take 30-60s, and dropping a valid session on the
  // floor with a 30s abort was the cause of the "refresh logs me out" bug.
  // Retries are handled inside loadCurrentUser; we just resolve loading
  // state when it returns.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const u = await loadCurrentUser(controller.signal);
        if (!controller.signal.aborted) setUser(u);
      } catch {
        // Retries exhausted on transient failures — treat as logged-out for
        // now. Next portal API call will re-trigger the 401 path and the
        // redirect-to-login flow takes over. Better than spinning forever.
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  // Wire portal-api.ts's 401 interceptor — any post-boot API call returning
  // 401 (e.g. cookie expired mid-session, server-side session revoked) flips
  // us to logged-out, which the App.tsx Router catches and redirects to
  // /login with the current URL preserved as `redirect`.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = async (email: string, password: string) => {
    const data = (await apiPost("/api/auth/login", { email, password })) as { user: ServerUser };
    setUser(mapServerUser(data.user));
  };

  const register = async (payload: RegisterPayload) => {
    const data = (await apiPost("/api/auth/signup", payload)) as { user: ServerUser };
    setUser(mapServerUser(data.user));
  };

  const logout = async () => {
    try {
      await apiPost("/api/auth/logout", {});
    } catch {
      // Already-expired session or server unreachable — clear locally anyway.
    } finally {
      setUser(null);
    }
  };

  const updateName = (name: string) => {
    if (!user) return;
    setUser({ ...user, name, avatar: name.slice(0, 2).toUpperCase() });
  };

  const updateNickname = async (nickname: string): Promise<void> => {
    const res = await fetch("/api/account/nickname", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      user?: ServerUser;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error ?? "Couldn't update nickname. Please try again.");
    }
    if (data.user) {
      setUser(mapServerUser(data.user));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoggedIn: !!user,
        isLoading,
        login,
        register,
        logout,
        updateName,
        updateNickname,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
