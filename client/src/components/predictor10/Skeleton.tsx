/*
Skeleton — a shimmering placeholder block for loading states.

RG-safe juice (arch §23): replaces bare spinners so loading feels alive.
Uses the `.p10-skeleton` utility from index.css (shimmer gated behind
prefers-reduced-motion; a plain grey block when motion is reduced).

Usage:
  <Skeleton className="h-4 w-24" />
  <SkeletonRows count={5} />
*/

import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("p10-skeleton", className)} />;
}

/**
 * A small stack of skeleton lines — handy for list/table loading states.
 * Renders `count` rows of a title + subtitle shimmer.
 */
export function SkeletonRows({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)} aria-label="Loading" role="status">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.02] px-3.5 py-3"
        >
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
          <Skeleton className="h-6 w-12 rounded-full" />
        </div>
      ))}
    </div>
  );
}
