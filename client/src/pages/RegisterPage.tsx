import { useState, FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { AuthShell, AuthField, inputClasses } from "@/components/predictor10/AuthShell";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Year range: 1900 to 18 years ago
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1900 + 1 }, (_, i) => CURRENT_YEAR - i);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function isOver18(dob: Date): boolean {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 18);
  return dob.getTime() <= cutoff.getTime();
}

export default function RegisterPage() {
  const { register } = useAuth();
  const [, navigate] = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [country, setCountry] = useState("GB");
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password || !displayName) {
      setError("Email, password and display name are all required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!day || !month || !year) {
      setError("Please enter your full date of birth.");
      return;
    }

    const dob = new Date(`${year}-${month}-${day}T00:00:00Z`);
    if (isNaN(dob.getTime())) {
      setError("That date of birth doesn't look right.");
      return;
    }
    if (!isOver18(dob)) {
      setError("You must be 18 or over to use Predictor10.");
      return;
    }
    if (!terms) {
      setError("You need to accept the terms to create an account.");
      return;
    }

    setLoading(true);
    try {
      await register({
        email,
        password,
        displayName,
        dateOfBirth: dob.toISOString().slice(0, 10),
        country,
        marketingConsent: marketing,
      });
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create your account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="space-y-1 text-center">
        <h1 className="font-['Barlow_Condensed'] text-3xl font-bold uppercase tracking-[0.02em] text-white sm:text-4xl">
          Create your account
        </h1>
        <p className="text-sm text-white/55">
          Free to play. Thirty seconds. Email confirmation will follow.
        </p>
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

        <AuthField label="Password" hint="At least 8 characters.">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="••••••••"
            disabled={loading}
            className={inputClasses}
          />
        </AuthField>

        <AuthField label="Display name" hint="Shown on the leaderboard.">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="nickname"
            placeholder="e.g. WezL"
            disabled={loading}
            maxLength={24}
            className={inputClasses}
          />
        </AuthField>

        <AuthField label="Date of birth" hint="You must be 18 or over.">
          <div className="grid grid-cols-3 gap-2">
            <select value={day} onChange={(e) => setDay(e.target.value)} disabled={loading} className={inputClasses}>
              <option value="">Day</option>
              {DAYS.map((d) => (
                <option key={d} value={String(d).padStart(2, "0")}>{d}</option>
              ))}
            </select>
            <select value={month} onChange={(e) => setMonth(e.target.value)} disabled={loading} className={inputClasses}>
              <option value="">Month</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>
              ))}
            </select>
            <select value={year} onChange={(e) => setYear(e.target.value)} disabled={loading} className={inputClasses}>
              <option value="">Year</option>
              {YEARS.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>
        </AuthField>

        <AuthField label="Country">
          <select value={country} onChange={(e) => setCountry(e.target.value)} disabled={loading} className={inputClasses}>
            <option value="GB">United Kingdom</option>
            <option value="IE">Ireland</option>
            <option value="OTHER">Other</option>
          </select>
        </AuthField>

        <div className="space-y-3 rounded-2xl border border-white/8 bg-black/20 p-4">
          <label className="flex cursor-pointer items-start gap-3 text-[0.85rem] leading-5 text-white/75">
            <input
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              disabled={loading}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-400"
            />
            <span>
              I'm 18 or over and accept the{" "}
              <a href="/terms" className="font-semibold text-emerald-300 hover:text-emerald-200">terms of use</a>{" "}
              and{" "}
              <a href="/privacy" className="font-semibold text-emerald-300 hover:text-emerald-200">privacy policy</a>.
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-[0.85rem] leading-5 text-white/65">
            <input
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
              disabled={loading}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-400"
            />
            <span>
              Send me match reminders and round results by email. <span className="text-white/40">(Optional, you can change this anytime.)</span>
            </span>
          </label>
        </div>

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
          {loading ? "Creating your account…" : "Create account"}
        </button>
      </form>

      <div className="mt-6 border-t border-white/8 pt-5 text-center text-sm text-white/55">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-emerald-300 hover:text-emerald-200">
          Sign in →
        </Link>
      </div>
    </AuthShell>
  );
}
