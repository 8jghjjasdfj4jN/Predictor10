/*
AnimatedNumber — a number that counts up to its value instead of snapping.

RG-safe juice (arch §23): used to make skill/standing figures (points, pot,
ranks) feel alive on reveal. Never wire celebratory motion to the act of
entering/paying.

Behaviour:
- First mount counts up from 0 → value.
- A later value change animates from the currently-shown number → new value.
- Respects prefers-reduced-motion (jumps straight to the value, no animation).
- Pure rAF, no dependencies. Render is a plain <span>; pass `format` for
  currency / padding, and `className` for styling (e.g. tabular-nums).
*/

import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function AnimatedNumber({
  value,
  durationMs = 600,
  format = (n: number) => String(Math.round(n)),
  className,
}: {
  value: number;
  durationMs?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  // Tracks the number currently shown, so a mid-flight value change can
  // animate smoothly from where we are rather than jumping.
  const shownRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      shownRef.current = value;
      setDisplay(value);
      return;
    }

    const from = shownRef.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return;
    }

    const start =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = durationMs > 0 ? Math.min(1, elapsed / durationMs) : 1;
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const current = from + (to - from) * eased;
      shownRef.current = current;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        shownRef.current = to;
        setDisplay(to);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  return <span className={className}>{format(display)}</span>;
}
