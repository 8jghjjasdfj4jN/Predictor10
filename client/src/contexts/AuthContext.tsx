/*
Predictor10 — auth context.

Real backend wiring: cookies + /api/auth/*. On mount we ask the server "who
am I?" — if the session cookie's valid we get a user object back; otherwise
we stay logged-out. Errors thrown by login/register carry the server's
message text so the UI can surface it directly.
*/

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type User = {
  id: string;
  email: string;
  name: string;
  avatar: string;
  emailVerified?: boolean;
  country?: string;
  marketingConsent?: boolean;
};

export type RegisterPayload = {
  email: string;
  password: string;
  displayName: string;
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
};

// Server response shape — kept private; mapped to client User via mapServerUser.
type ServerUser = {
  id: string;
  email: string;
  displayName: string;
  avatarInitials: string | null;
  emailVerified: boolean;
  countryCode: string;
  marketingConsent: boolean;
};

function mapServerUser(s: ServerUser): User {
  return {
    id: s.id,
    email: s.email,
    name: s.displayName,
    avatar: s.avatarInitials ?? s.displayName.slice(0, 2).toUpperCase(),
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount via the cookie. 401 is normal (= logged-out).
  // Render's web service can cold-start for 20-60s; cap our wait at 30s and
  // fall through as anonymous if /me hasn't responded by then. The user's
  // session cookie still exists — their next real action will pick it up.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    (async () => {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
          signal: controller.signal,
        });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { user: ServerUser };
          if (data?.user) setUser(mapServerUser(data.user));
        }
      } catch {
        // Abort, timeout, or network error on boot — treat as logged-out, don't block the UI.
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
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

  return (
    <AuthContext.Provider
      value={{ user, isLoggedIn: !!user, isLoading, login, register, logout, updateName }}
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
