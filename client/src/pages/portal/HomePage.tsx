/*
Brand reminder — Broadcast Noir Athletics:
Home (arch §8.1). State-aware: live entries in current Round + available
tiers. Real layout lands in Phase 1 step 2; this stub exists so the AppShell
top tab routes resolve.
*/

import { useAuth } from "@/contexts/AuthContext";

export default function HomePage() {
  const { user } = useAuth();
  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="px-4 py-6">
      <div className="space-y-1">
        <p className="font-['Manrope'] text-[0.66rem] font-semibold uppercase tracking-[0.32em] text-emerald-300/70">
          Home
        </p>
        <h1 className="font-['Barlow_Condensed'] text-[1.85rem] font-bold uppercase leading-[1.05] tracking-[0.04em] text-white">
          Welcome back, {firstName}.
        </h1>
        <p className="text-sm text-white/55">
          Your live entries and the tiers still open in this Round will land here next.
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
        <p className="font-['Barlow_Condensed'] text-[0.78rem] font-bold uppercase tracking-[0.22em] text-white/40">
          Step 2 placeholder
        </p>
        <p className="mt-2 text-xs text-white/40">
          Live entries · Available tiers — arch §8.1
        </p>
      </div>
    </div>
  );
}
