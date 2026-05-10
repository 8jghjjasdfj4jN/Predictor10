import { createContext, useContext, useState, ReactNode } from "react";

export type User = {
  id: string;
  name: string;
  email: string;
  avatar: string;
  dateOfBirth?: string;
  country?: string;
  marketingConsent?: boolean;
};

export type RegisterPayload = {
  email: string;
  password: string;
  displayName: string;
  dateOfBirth: string;  // YYYY-MM-DD
  country: string;
  marketingConsent: boolean;
};

type AuthContextType = {
  user: User | null;
  isLoggedIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
  updateName: (name: string) => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = async (email: string, _password: string) => {
    // Frontend mock — replace with real API call later
    await new Promise((r) => setTimeout(r, 800));
    setUser({
      id: "usr_001",
      name: email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      email,
      avatar: email.slice(0, 2).toUpperCase(),
    });
  };

  const register = async (payload: RegisterPayload) => {
    // Frontend mock — replace with real API call later
    await new Promise((r) => setTimeout(r, 800));
    setUser({
      id: "usr_001",
      name: payload.displayName,
      email: payload.email,
      avatar: payload.displayName.slice(0, 2).toUpperCase(),
      dateOfBirth: payload.dateOfBirth,
      country: payload.country,
      marketingConsent: payload.marketingConsent,
    });
  };

  const logout = () => setUser(null);

  const updateName = (name: string) => {
    if (!user) return;
    setUser({ ...user, name, avatar: name.slice(0, 2).toUpperCase() });
  };

  return (
    <AuthContext.Provider
      value={{ user, isLoggedIn: !!user, login, register, logout, updateName }}
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
