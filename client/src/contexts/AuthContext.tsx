import { createContext, useContext, useState, ReactNode } from "react";

export type User = {
  id: string;
  name: string;
  email: string;
  avatar: string;
};

type AuthContextType = {
  user: User | null;
  isLoggedIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
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

  const register = async (name: string, email: string, _password: string) => {
    await new Promise((r) => setTimeout(r, 800));
    setUser({
      id: "usr_001",
      name,
      email,
      avatar: name.slice(0, 2).toUpperCase(),
    });
  };

  const logout = () => setUser(null);

  const updateName = (name: string) => {
    if (!user) return;
    setUser({ ...user, name, avatar: name.slice(0, 2).toUpperCase() });
  };

  return (
    <AuthContext.Provider value={{ user, isLoggedIn: !!user, login, register, logout, updateName }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
