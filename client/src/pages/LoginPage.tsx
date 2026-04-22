import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) { setError("Please fill in all fields."); return; }
    if (mode === "register" && !name) { setError("Please enter a display name."); return; }
    setLoading(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(name, email, password);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "0.85rem 1rem",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "0.85rem", color: "#e8f5ee",
    fontSize: "0.95rem", outline: "none",
    fontFamily: "inherit", transition: "border-color 0.2s",
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#070f09",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Manrope', system-ui, sans-serif",
      padding: "1.5rem",
      position: "relative", overflow: "hidden",
    }}>

      {/* Pitch lines */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.045, pointerEvents: "none" }} viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
        <rect x="60" y="40" width="680" height="520" fill="none" stroke="#34d379" strokeWidth="2"/>
        <rect x="160" y="40" width="480" height="520" fill="none" stroke="#34d379" strokeWidth="1"/>
        <circle cx="400" cy="300" r="80" fill="none" stroke="#34d379" strokeWidth="1.5"/>
        <circle cx="400" cy="300" r="4" fill="#34d379"/>
        <line x1="400" y1="40" x2="400" y2="560" stroke="#34d379" strokeWidth="1"/>
        <rect x="60" y="170" width="100" height="160" fill="none" stroke="#34d379" strokeWidth="1"/>
        <rect x="640" y="170" width="100" height="160" fill="none" stroke="#34d379" strokeWidth="1"/>
      </svg>

      {/* Radial glow */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(29,185,84,0.13) 0%, transparent 70%)" }} />

      {/* Card */}
      <div style={{ width: "100%", maxWidth: 400, position: "relative", zIndex: 2 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 64, height: 64, marginBottom: "0.85rem",
            background: "linear-gradient(135deg, #0d2e1a, #163d22)",
            border: "1px solid rgba(52,211,119,0.25)", borderRadius: "1.25rem",
            boxShadow: "0 0 40px rgba(52,211,119,0.15), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: "1.7rem", color: "#34d379", lineHeight: 1 }}>P</span>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "1rem", color: "rgba(52,211,119,0.7)", marginTop: 8 }}>10</span>
          </div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: "1.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#fff" }}>
            PREDICTOR<span style={{ color: "#34d379" }}>10</span>
          </div>
          <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.32em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", marginTop: "0.3rem" }}>
            Premium Football Prediction
          </div>
        </div>

        {/* Glass card */}
        <div style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))",
          border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1.75rem",
          padding: "1.75rem", backdropFilter: "blur(20px)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.4)",
        }}>

          {/* Tabs */}
          <div style={{ display: "flex", marginBottom: "1.5rem", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "1px" }}>
            {(["login", "register"] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setError(""); }} style={{
                flex: 1, padding: "0.65rem", background: "none", border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase", transition: "all 0.2s",
                color: mode === m ? "#fff" : "rgba(255,255,255,0.35)",
                borderBottom: mode === m ? "2px solid #34d379" : "2px solid transparent",
                marginBottom: "-1px",
              }}>
                {m === "login" ? "Sign In" : "Register"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "1.5rem", letterSpacing: "0.04em", textTransform: "uppercase", color: "#fff" }}>
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h3>

            {mode === "register" && (
              <input
                value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Display name (shown on leaderboard)"
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = "rgba(52,211,119,0.45)"; }}
                onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; }}
              />
            )}

            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              style={inputStyle}
              onFocus={(e) => { e.target.style.borderColor = "rgba(52,211,119,0.45)"; }}
              onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; }}
            />

            <div>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = "rgba(52,211,119,0.45)"; }}
                onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; }}
              />
              {mode === "login" && (
                <div style={{ textAlign: "right", marginTop: "0.4rem" }}>
                  <button type="button" style={{ fontSize: "0.75rem", color: "#34d379", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                    Forgot password?
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div style={{ fontSize: "0.8rem", color: "#fca5a5", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "0.6rem", padding: "0.6rem 0.75rem" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              padding: "0.9rem", fontFamily: "inherit",
              background: "rgba(52,211,119,0.14)", border: "1px solid rgba(52,211,119,0.32)",
              borderRadius: "0.85rem", color: "#fff",
              fontSize: "0.9rem", fontWeight: 700, letterSpacing: "0.16em",
              textTransform: "uppercase", cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1, transition: "all 0.2s",
            }}>
              {loading ? "Please wait…" : mode === "login" ? "Sign In →" : "Create Account →"}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "1.25rem 0" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
            <span style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.25)", letterSpacing: "0.2em" }}>OR</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
          </div>

          <button type="button" style={{
            width: "100%", padding: "0.8rem", fontFamily: "inherit",
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: "0.85rem", color: "rgba(255,255,255,0.65)",
            fontSize: "0.88rem", fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "0.65rem",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
        </div>

        <p style={{ textAlign: "center", marginTop: "1.25rem", fontSize: "0.78rem", color: "rgba(255,255,255,0.28)" }}>
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }} style={{
            color: "#34d379", background: "none", border: "none", cursor: "pointer",
            fontSize: "0.78rem", fontWeight: 700, fontFamily: "inherit",
          }}>
            {mode === "login" ? "Register free" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
