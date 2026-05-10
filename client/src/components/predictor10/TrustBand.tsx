import { Shield, UserCheck, Heart } from "lucide-react";

const items = [
  {
    icon: Shield,
    title: "Free to play",
    body: "Virtual credits, no money in or out — until licensed.",
  },
  {
    icon: UserCheck,
    title: "Verified accounts",
    body: "Email confirmed, age checked at sign-up.",
  },
  {
    icon: Heart,
    title: "Responsible play",
    body: "Limits, self-exclusion, reality checks built in.",
  },
];

export function TrustBand() {
  return (
    <div className="grid gap-3 rounded-[1.4rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 md:grid-cols-3">
      {items.map(({ icon: Icon, title, body }) => (
        <div key={title} className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/25 bg-emerald-400/10 text-emerald-300">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{title}</p>
            <p className="text-[0.78rem] leading-6 text-white/55">{body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
