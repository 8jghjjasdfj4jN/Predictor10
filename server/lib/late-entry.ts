/*
late-entry — the entry-deadline bypass switch, locked to testing only.

Licence integrity (see portal-architecture.md §15/§22/§23): in PRODUCTION the
entry and late-entry deadlines are ALWAYS enforced. No environment variable, no
admin, nothing can override a fairness rule on the live app. The legacy
BYPASS_LATE_ENTRY switch is now honoured ONLY outside production, so it stays
useful for local/staging testing of late-entry flows while being completely
inert in the live product.

This is deliberate, regulator-facing behaviour: a UK pool-betting licence
expects game rules to be applied consistently, with no silent override path on
the live service.
*/

export function lateEntryBypassActive(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.BYPASS_LATE_ENTRY === "true"
  );
}
