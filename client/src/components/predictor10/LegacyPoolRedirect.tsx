/*
LegacyPoolRedirect — step 2m bookmark/back-button compatibility.

The prediction screen moved from /pools/:competitionSlug/:poolId to
/predict/:entryId in step 2m so the bottom nav's Predict tab stays
highlighted while users are making picks. Anyone with the old URL in their
browser history, a shared link, or a bookmark needs to land somewhere
sensible instead of a 404.

This component:
  1. Fetches the signed-in user's open entries.
  2. Looks for an entry whose poolId matches the URL.
  3. If found, replaces the URL with /predict/:entryId so the back button
     skips this hop.
  4. If not found (user wasn't entered in that pool, or the pool no longer
     exists), falls back to /tables.

If /api/entries/me fails (e.g. mid-session 401, network), it punts to
/tables rather than getting stuck on a spinner forever — portal-api.ts
already handles 401s by flipping auth state and triggering its own
redirect-to-login flow, so we don't need to duplicate that here.
*/

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { fetchMyEntries } from "@/lib/portal-api";

type Props = {
  poolId: string;
  competitionSlug: string;
};

export function LegacyPoolRedirect({ poolId }: Props) {
  const [, setLocation] = useLocation();
  const [stillResolving, setStillResolving] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      try {
        const entries = await fetchMyEntries();
        if (cancelled) return;
        const match = entries.find((e) => e.poolId === poolId);
        if (match) {
          setLocation(`/predict/${match.id}`, { replace: true });
        } else {
          setLocation("/tables", { replace: true });
        }
      } catch {
        if (cancelled) return;
        // Fallback: 401 has its own redirect flow; any other failure → /tables.
        setLocation("/tables", { replace: true });
      } finally {
        if (!cancelled) setStillResolving(false);
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [poolId, setLocation]);

  // Tiny inline splash. We expect this to be on screen for under a second in
  // most cases — entries.length is small (one open entry per pool the user
  // holds) and the endpoint is cheap.
  if (!stillResolving) return null;
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-white/50">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <p className="font-['Manrope'] text-xs">Redirecting…</p>
    </div>
  );
}
