import { useState, FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { AuthShell, AuthField, inputClasses } from "@/components/predictor10/AuthShell";

export default function LoginPage() {
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch {
      setError("Sign in failed. Check your details and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="space-y-1 text-center">
        <h1 className="font-['Barlow_Condensed'] text-3xl font-bold uppercase tracking-[0.02em] text-white sm:text-4xl">
          Welcome back
        </h1>
        <p className="text-sm text-white/55">Sign in to make picks and check your standings.</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <AuthField label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            disabled={loading}
            className={inputClasses}
          />
        </AuthField>

        <AuthField label="Password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            disabled={loading}
            className={inputClasses}
          />
          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-[0.78rem] font-semibold text-emerald-300 hover:text-emerald-200"
            >
              Forgot password?
            </Link>
          </div>
        </AuthField>

        {error && (
          <div className="rounded-xl border border-red-400/30 bg-red-500/8 px-3 py-2.5 text-[0.82rem] text-red-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-emerald-400 px-6 py-3.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mt-6 border-t border-white/8 pt-5 text-center text-sm text-white/55">
        New to Predictor10?{" "}
        <Link href="/register" className="font-semibold text-emerald-300 hover:text-emerald-200">
          Create an account →
        </Link>
      </div>
    </AuthShell>
  );
}
