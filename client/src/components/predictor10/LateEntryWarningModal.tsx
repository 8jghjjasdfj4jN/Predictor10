/*
LateEntryWarningModal — arch §4.

Shown when a user attempts to enter a pool that's already in the late-entry
window: the Round's first match has kicked off (and/or BYPASS_LATE_ENTRY=true
is letting them past `closesAt`). User must explicitly acknowledge the
handicap before payment proceeds.

Copy mirrors the wireframe in arch §4:
  - N of M matches you can no longer predict — you'll score 0 on those
  - existing entrants are ahead on points

Cancel closes the modal. Confirm fires the parent's onConfirm and closes the
modal; the parent handles the loading/error state of the actual entry call.
*/

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  roundName: string;
  daysLive: number;
  matchesLocked: number;
  matchesTotal: number;
  feeLabel: string; // e.g. "£10"
  bypassActive: boolean;
  submitting: boolean;
};

function liveDurationCopy(daysLive: number): string {
  if (daysLive <= 0) return "is already in progress";
  if (daysLive === 1) return "has been live for 1 day";
  return `has been live for ${daysLive} days`;
}

export function LateEntryWarningModal({
  open,
  onOpenChange,
  onConfirm,
  roundName,
  daysLive,
  matchesLocked,
  matchesTotal,
  feeLabel,
  bypassActive,
  submitting,
}: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[420px] border border-amber-300/30 bg-[#0a1410] text-white shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)]">
        <AlertDialogHeader>
          <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-full border border-amber-300/30 bg-amber-400/10">
            <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden />
          </div>
          <AlertDialogTitle className="font-['Barlow_Condensed'] text-[1.5rem] font-extrabold uppercase tracking-[0.02em] text-white">
            Late entry — you'll be behind
          </AlertDialogTitle>
          <AlertDialogDescription className="font-['Manrope'] text-[0.85rem] leading-relaxed text-white/65">
            {roundName} {liveDurationCopy(daysLive)}.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="space-y-2 px-1 py-2 font-['Manrope'] text-[0.8rem] leading-snug text-white/70">
          <li className="flex gap-2">
            <span aria-hidden className="mt-0.5 inline-block h-1 w-1 flex-shrink-0 rounded-full bg-amber-300" />
            <span>
              {matchesLocked} of {matchesTotal} matches in this Round have already kicked off — you
              can't predict those and will score 0 on them.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="mt-0.5 inline-block h-1 w-1 flex-shrink-0 rounded-full bg-amber-300" />
            <span>Existing entrants are ahead of you on points.</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="mt-0.5 inline-block h-1 w-1 flex-shrink-0 rounded-full bg-amber-300" />
            <span>Your entry fee is non-refundable.</span>
          </li>
        </ul>

        {bypassActive && (
          <p className="rounded-md border border-amber-300/20 bg-amber-400/[0.06] px-2.5 py-2 font-['Manrope'] text-[0.7rem] text-amber-200/80">
            Dev mode: late-entry window override is active (BYPASS_LATE_ENTRY=true).
          </p>
        )}

        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel
            disabled={submitting}
            className="h-11 border-white/15 bg-white/5 font-['Manrope'] text-[0.82rem] font-semibold text-white/80 hover:bg-white/10 hover:text-white"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={submitting}
            className="h-11 bg-emerald-500 font-['Manrope'] text-[0.82rem] font-semibold text-black hover:bg-emerald-400 disabled:opacity-60"
          >
            {submitting ? "Entering…" : `I understand · ${feeLabel}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
