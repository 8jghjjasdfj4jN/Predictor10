/*
PredictMatchRow — arch §8.5 single-match row.

States rendered (4 of 5 per Decided Rule #12):
  - Editable (no prediction)        — empty inputs, "Tap to predict" hint
  - Editable (saved prediction)     — inputs filled with user's pick; edits
                                      until predictionLockAt re-fire save
  - Half-saved                      — one input has a value, the other doesn't;
                                      amber "Half-saved" tag, no save fires
  - Locked                          — predictionLockAt has passed; inputs
                                      read-only. If a prediction exists,
                                      show it; otherwise show "Missed".

Auto-save:
  - 800ms debounce after the last keystroke on this row.
  - Fires only when BOTH scores parse as 0-99 ints AND differ from the
    currently-saved values.
  - In-flight rejection (403 EVENT_LOCKED) bubbles via onError so the parent
    can refetch and re-render this row as locked. The local input state
    snaps back to the saved values on the next prop refresh.

The "Finished" state (FT score + points pill) and "Live (in-play)" state
live behind settlement / live-sync — step 2g+.
*/

import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  savePrediction,
  SavePredictionError,
  type EntryMatch,
  type SavePredictionResponse,
} from "@/lib/portal-api";

type Props = {
  match: EntryMatch;
  entryId: string;
  onSaved: (response: SavePredictionResponse) => void;
  onError: (message: string, isLockRejection: boolean) => void;
};

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatKickoff(iso: string): string {
  return TIME_FMT.format(new Date(iso));
}

function parseScore(text: string): number | null {
  if (text === "") return null;
  const n = parseInt(text, 10);
  if (!Number.isInteger(n) || n < 0 || n > 99 || String(n) !== text) return null;
  return n;
}

export function PredictMatchRow({ match, entryId, onSaved, onError }: Props) {
  // Initial input values mirror the saved prediction (if any).
  const initialHome = match.prediction ? String(match.prediction.homeScore) : "";
  const initialAway = match.prediction ? String(match.prediction.awayScore) : "";

  const [homeText, setHomeText] = useState(initialHome);
  const [awayText, setAwayText] = useState(initialAway);
  const [saving, setSaving] = useState(false);

  // Reset local state when the underlying match (or its saved prediction)
  // changes — e.g. after a parent refetch following a lock-rejection.
  const savedSnapshotRef = useRef({
    eventId: match.eventId,
    home: match.prediction?.homeScore ?? null,
    away: match.prediction?.awayScore ?? null,
  });
  useEffect(() => {
    const next = {
      eventId: match.eventId,
      home: match.prediction?.homeScore ?? null,
      away: match.prediction?.awayScore ?? null,
    };
    const snap = savedSnapshotRef.current;
    if (next.eventId !== snap.eventId || next.home !== snap.home || next.away !== snap.away) {
      savedSnapshotRef.current = next;
      setHomeText(next.home == null ? "" : String(next.home));
      setAwayText(next.away == null ? "" : String(next.away));
    }
  }, [match.eventId, match.prediction?.homeScore, match.prediction?.awayScore]);

  // Debounced auto-save. Skipped entirely when locked.
  useEffect(() => {
    if (match.isLocked) return;
    const home = parseScore(homeText);
    const away = parseScore(awayText);
    if (home === null || away === null) return; // half-saved or invalid

    const savedHome = match.prediction?.homeScore ?? null;
    const savedAway = match.prediction?.awayScore ?? null;
    if (home === savedHome && away === savedAway) return; // no change

    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        const response = await savePrediction(entryId, match.eventId, home, away);
        onSaved(response);
      } catch (err) {
        const isLockRejection =
          err instanceof SavePredictionError && err.status === 403;
        const message = err instanceof Error ? err.message : "Couldn't save.";
        onError(message, isLockRejection);
      } finally {
        setSaving(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [
    homeText,
    awayText,
    match.isLocked,
    match.eventId,
    match.prediction?.homeScore,
    match.prediction?.awayScore,
    entryId,
    onSaved,
    onError,
  ]);

  // ─── Derived UI state ──────────────────────────────────────────────────
  const homeNum = parseScore(homeText);
  const awayNum = parseScore(awayText);
  const halfSaved =
    !match.isLocked &&
    ((homeText !== "" && awayText === "") || (homeText === "" && awayText !== ""));
  const hasSavedPrediction = match.prediction !== null;
  const hasLocalPrediction = homeNum !== null && awayNum !== null;
  const editedSinceSave =
    hasLocalPrediction &&
    (homeNum !== (match.prediction?.homeScore ?? null) ||
      awayNum !== (match.prediction?.awayScore ?? null));

  // Status copy in the meta line.
  let metaTag: { label: string; tone: "neutral" | "emerald" | "amber" | "muted" } | null = null;
  if (match.isLocked) {
    metaTag = hasSavedPrediction
      ? { label: "Locked", tone: "muted" }
      : { label: "Missed — 0 pts", tone: "muted" };
  } else if (saving) {
    metaTag = { label: "Saving…", tone: "neutral" };
  } else if (halfSaved) {
    metaTag = { label: "Half-saved", tone: "amber" };
  } else if (editedSinceSave) {
    metaTag = { label: "Pending…", tone: "neutral" };
  } else if (hasSavedPrediction) {
    metaTag = { label: "Saved", tone: "emerald" };
  }

  const inputDisabled = match.isLocked;

  // ─── Render ────────────────────────────────────────────────────────────
  const displayHome =
    match.isLocked && !hasSavedPrediction ? "" : homeText;
  const displayAway =
    match.isLocked && !hasSavedPrediction ? "" : awayText;

  return (
    <div
      className={cn(
        "rounded-2xl border px-3.5 py-3 transition",
        match.isLocked
          ? "border-white/8 bg-white/[0.015]"
          : halfSaved
            ? "border-amber-300/25 bg-amber-400/[0.03]"
            : hasSavedPrediction && !editedSinceSave
              ? "border-emerald-400/20 bg-emerald-400/[0.025]"
              : "border-white/10 bg-white/[0.03]",
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex flex-1 items-center justify-end gap-2 min-w-0">
          <span
            className={cn(
              "truncate font-['Barlow_Condensed'] text-[0.95rem] font-bold uppercase tracking-[0.04em] text-right",
              match.isLocked ? "text-white/55" : "text-white",
            )}
          >
            {match.homeTeamShort ?? match.homeTeam}
          </span>
        </div>

        <ScoreInput
          ariaLabel={`${match.homeTeam} score`}
          value={displayHome}
          disabled={inputDisabled}
          onChange={setHomeText}
        />
        <span aria-hidden className="font-['Barlow_Condensed'] text-[1.1rem] font-extrabold text-white/40">
          –
        </span>
        <ScoreInput
          ariaLabel={`${match.awayTeam} score`}
          value={displayAway}
          disabled={inputDisabled}
          onChange={setAwayText}
        />

        <div className="flex flex-1 items-center gap-2 min-w-0">
          <span
            className={cn(
              "truncate font-['Barlow_Condensed'] text-[0.95rem] font-bold uppercase tracking-[0.04em]",
              match.isLocked ? "text-white/55" : "text-white",
            )}
          >
            {match.awayTeamShort ?? match.awayTeam}
          </span>
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-center gap-2 font-['Manrope'] text-[0.7rem] text-white/45">
        <span>{formatKickoff(match.kickoffAt)}</span>
        {metaTag && (
          <>
            <span aria-hidden className="text-white/20">·</span>
            <span
              className={cn(
                "inline-flex items-center gap-1",
                metaTag.tone === "emerald" && "text-emerald-300/85",
                metaTag.tone === "amber" && "text-amber-200/85",
                metaTag.tone === "muted" && "text-white/40",
                metaTag.tone === "neutral" && "text-white/65",
              )}
            >
              {match.isLocked && <Lock className="h-2.5 w-2.5" aria-hidden />}
              <span>{metaTag.label}</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function ScoreInput({
  value,
  disabled,
  ariaLabel,
  onChange,
}: {
  value: string;
  disabled: boolean;
  ariaLabel: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={2}
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        // Strip non-digits as the user types so paste / autofill don't blow up.
        const cleaned = e.target.value.replace(/\D+/g, "").slice(0, 2);
        onChange(cleaned);
      }}
      onFocus={(e) => e.currentTarget.select()}
      className={cn(
        "h-11 w-11 flex-shrink-0 rounded-lg border text-center",
        "font-['Barlow_Condensed'] text-[1.3rem] font-extrabold leading-none",
        "outline-none transition",
        disabled
          ? "border-white/8 bg-white/[0.02] text-white/55"
          : value === ""
            ? "border-white/15 bg-white/[0.04] text-white placeholder:text-white/30 hover:border-white/30 focus:border-emerald-400/70 focus:bg-emerald-400/[0.06]"
            : "border-emerald-400/30 bg-emerald-400/[0.06] text-white focus:border-emerald-400/70",
      )}
    />
  );
}
