// Shared "Back" affordance for Eliminator pages. Goes to the actual previous
// page (browser history) so it returns the user where they came from — the
// lobby, Home, Predict, wherever — rather than always jumping to Home. Falls
// back to a sensible route only on a cold/direct load with no history.

import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export function BackButton({
  fallbackHref = "/",
  label = "Back",
}: {
  fallbackHref?: string;
  label?: string;
}) {
  const [, navigate] = useLocation();

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      navigate(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="inline-flex items-center gap-1.5 font-['Manrope'] text-[0.78rem] font-semibold text-white/55 transition hover:text-white"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      <span>{label}</span>
    </button>
  );
}
