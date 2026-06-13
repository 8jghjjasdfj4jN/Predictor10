const linkGroups = [
  {
    heading: "Play",
    links: ["How it works", "Active pools", "Leaderboards", "Past rounds"],
  },
  {
    heading: "Trust",
    links: ["Responsible play", "Self-exclusion", "Complaints", "Fair play rules"],
  },
  {
    heading: "Legal",
    links: ["Terms of use", "Privacy policy", "Cookies", "Contact"],
  },
];

export function SiteFooter() {
  return (
    <div className="space-y-6 rounded-[1.6rem] border border-white/10 bg-black/30 p-5 sm:p-7">
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div className="space-y-4">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.32em] text-white/40">
            Predictor10
          </p>
          <p className="max-w-md text-sm leading-6 text-white/60">
            A football prediction pool for the 2026 world cup. Built for league competition, scored on knowledge, run on transparent rules.
          </p>
          <div className="rounded-[1rem] border border-dashed border-white/15 bg-white/3 px-4 py-3">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-white/55">
              Licence holder block
            </p>
            <p className="mt-1 text-[0.78rem] leading-5 text-white/40">
              UKGC operating licence number · ADR provider · registered office — populated post-licence
            </p>
          </div>
        </div>

        {linkGroups.map((group) => (
          <div key={group.heading} className="space-y-3">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.32em] text-white/40">
              {group.heading}
            </p>
            <ul className="space-y-2">
              {group.links.map((label) => (
                <li key={label}>
                  <a href="#" className="text-sm text-white/65 transition hover:text-white">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4 text-[0.78rem] text-white/40">
        <span>© 2026 Predictor10. All rights reserved.</span>
        <span>Need help? hello@predictor10.com</span>
      </div>
    </div>
  );
}
