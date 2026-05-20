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
  - Finished (NEW step 2i)          — match has an outcome row. Show FT
                                      score in solid emerald boxes, then a
                                      meta line with prediction recap and a
                                      points pill (+5 emerald / +2 amber /
                                      0 rose). "Missed" when no prediction.

Auto-save (editable rows only):
  - 800ms debounce after the last keystroke on this row.
  - Fires only when BOTH scores parse as 0-99 ints AND differ from the
    currently-saved values.
  - 403 EVENT_LOCKED → bubbles via onError so the parent refetches; the
    row then snaps to its read-only locked/finished state.

The "Live (in-play)" state lives behind live-sync — step 2j+.
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

/**
 * Strip football-data's trailing " FC" / " AFC" so team names read cleanly.
 * "Liverpool FC" → "Liverpool", "AFC Bournemouth" → "AFC Bournemouth" (leading
 * AFC is part of the brand and stays). Truncate handles anything still too
 * long for the column.
 */
function displayTeamName(name: string | null): string {
  if (!name) return "TBD";
  return name.replace(/\s+FC$/, "").replace(/\s+AFC$/, "");
}

function pointsTone(points: number): "emerald" | "amber" | "rose" {
  if (points >= 5) return "emerald";
  if (points >= 2) return "amber";
  return "rose";
}

export function PredictMatchRow({ match, entryId, onSaved, onError }: Props) {
  // For finished matches we render a static "FT" view — auto-save is bypassed.
  // For editable + locked-no-outcome rows we track input state as before.
  const isFinished = match.outcome !== null;

  const initialHome = match.prediction ? String(match.prediction.homeScore) : "";
  const initialAway = match.prediction ? String(match.prediction.awayScore) : "";

  const [homeText, setHomeText] = useState(initialHome);
  const [awayText, setAwayText] = useState(initialAway);
  const [saving, setSaving] = useState(false);

  // Reset local state when the underlying match (or its saved prediction)
  // changes — e.g. after a parent refetch following a lock-rejection or
  // outcome sync.
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

  // Debounced auto-save. Skipped for locked OR finished rows. Also skipped
  // for null-team knockout slots (arch §13 Rule #17) — the inputs are
  // disabled in the editable view, but this is a defence in depth.
  useEffect(() => {
    if (match.isLocked || isFinished) return;
    if (match.homeTeam === null || match.awayTeam === null) return;
    const home = parseScore(homeText);
    const away = parseScore(awayText);
    if (home === null || away === null) return;

    const savedHome = match.prediction?.homeScore ?? null;
    const savedAway = match.prediction?.awayScore ?? null;
    if (home === savedHome && away === savedAway) return;

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
    isFinished,
    match.eventId,
    match.prediction?.homeScore,
    match.prediction?.awayScore,
    entryId,
    onSaved,
    onError,
  ]);

  // ─── Render dispatch ───────────────────────────────────────────────────

  if (isFinished) {
    return <FinishedView match={match} />;
  }
  return (
    <EditableOrLockedView
      match={match}
      homeText={homeText}
      awayText={awayText}
      onHome={setHomeText}
      onAway={setAwayText}
      saving={saving}
    />
  );
}

// ─── Finished view ───────────────────────────────────────────────────────

function FinishedView({ match }: { match: EntryMatch }) {
  // outcome is guaranteed non-null by caller.
  const out = match.outcome!;
  const pred = match.prediction;
  const points = pred?.points ?? 0;
  const tone = pred ? pointsTone(points) : "muted";

  return (
    <div
      className={cn(
        "rounded-2xl border px-3.5 py-3 transition",
        "border-emerald-400/25 bg-emerald-400/[0.05]",
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex flex-1 items-center justify-end gap-2 min-w-0">
          <span className="line-clamp-2 break-words font-['Barlow_Condensed'] text-[0.8rem] font-bold uppercase leading-[1.15] tracking-[0.02em] text-right text-white">
            {displayTeamName(match.homeTeam)}
          </span>
        </div>

        <FtScoreBox value={out.homeScore} />
        <span aria-hidden className="font-['Barlow_Condensed'] text-[1.1rem] font-extrabold text-emerald-300/60">
          –
        </span>
        <FtScoreBox value={out.awayScore} />

        <div className="flex flex-1 items-center gap-2 min-w-0">
          <span className="line-clamp-2 break-words font-['Barlow_Condensed'] text-[0.8rem] font-bold uppercase leading-[1.15] tracking-[0.02em] text-white">
            {displayTeamName(match.awayTeam)}
          </span>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-['Manrope'] text-[0.7rem] text-white/55">
        {match.groupLabel && (
          <>
            <span className="font-semibold text-emerald-200/75">Group {match.groupLabel}</span>
            <span aria-hidden className="text-white/20">·</span>
          </>
        )}
        <span className="font-semibold text-emerald-300/85">FT</span>
        <span aria-hidden className="text-white/20">·</span>
        {pred ? (
          <>
            <span>
              You: {pred.homeScore}-{pred.awayScore}
            </span>
            <span aria-hidden className="text-white/20">·</span>
            <PointsPill points={points} tone={tone === "muted" ? "rose" : tone} />
          </>
        ) : (
          <span className="text-white/45">Missed — 0 pts</span>
        )}
      </div>
    </div>
  );
}

function FtScoreBox({ value }: { value: number }) {
  return (
    <div
      className={cn(
        "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg",
        "border border-emerald-400/40 bg-emerald-500/20",
        "font-['Barlow_Condensed'] text-[1.3rem] font-extrabold leading-none text-white",
      )}
      aria-label={`Full-time score ${value}`}
    >
      {value}
    </div>
  );
}

function PointsPill({ points, tone }: { points: number; tone: "emerald" | "amber" | "rose" }) {
  const label = points > 0 ? `+${points} pts` : `0 pts`;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5",
        "font-['Manrope'] text-[0.66rem] font-semibold",
        tone === "emerald" && "bg-emerald-400/15 text-emerald-200",
        tone === "amber" && "bg-amber-400/15 text-amber-200",
        tone === "rose" && "bg-rose-400/10 text-rose-200/80",
      )}
    >
      {label}
    </span>
  );
}

// ─── Editable / Locked view (no outcome yet) ─────────────────────────────

function EditableOrLockedView({
  match,
  homeText,
  awayText,
  onHome,
  onAway,
  saving,
}: {
  match: EntryMatch;
  homeText: string;
  awayText: string;
  onHome: (v: string) => void;
  onAway: (v: string) => void;
  saving: boolean;
}) {
  const awaitingTeams = match.homeTeam === null || match.awayTeam === null;
  const homeNum = parseScore(homeText);
  const awayNum = parseScore(awayText);
  const halfSaved =
    !match.isLocked && !awaitingTeams &&
    ((homeText !== "" && awayText === "") || (homeText === "" && awayText !== ""));
  const hasSavedPrediction = match.prediction !== null;
  const hasLocalPrediction = homeNum !== null && awayNum !== null;
  const editedSinceSave =
    hasLocalPrediction &&
    (homeNum !== (match.prediction?.homeScore ?? null) ||
      awayNum !== (match.prediction?.awayScore ?? null));

  let metaTag: { label: string; tone: "neutral" | "emerald" | "amber" | "muted" } | null = null;
  if (awaitingTeams) {
    metaTag = { label: "Awaiting teams", tone: "muted" };
  } else if (match.isLocked) {
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

  const inputDisabled = match.isLocked || awaitingTeams;
  const displayHome = (match.isLocked && !hasSavedPrediction) || awaitingTeams ? "" : homeText;
  const displayAway = (match.isLocked && !hasSavedPrediction) || awaitingTeams ? "" : awayText;

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
              "line-clamp-2 break-words font-['Barlow_Condensed'] text-[0.8rem] font-bold uppercase leading-[1.15] tracking-[0.02em] text-right",
              match.isLocked ? "text-white/55" : "text-white",
            )}
          >
            {displayTeamName(match.homeTeam)}
          </span>
        </div>

        <ScoreInput
          ariaLabel={`${displayTeamName(match.homeTeam)} score`}
          value={displayHome}
          disabled={inputDisabled}
          onChange={onHome}
        />
        <span aria-hidden className="font-['Barlow_Condensed'] text-[1.1rem] font-extrabold text-white/40">
          –
        </span>
        <ScoreInput
          ariaLabel={`${displayTeamName(match.awayTeam)} score`}
          value={displayAway}
          disabled={inputDisabled}
          onChange={onAway}
        />

        <div className="flex flex-1 items-center gap-2 min-w-0">
          <span
            className={cn(
              "line-clamp-2 break-words font-['Barlow_Condensed'] text-[0.8rem] font-bold uppercase leading-[1.15] tracking-[0.02em]",
              match.isLocked ? "text-white/55" : "text-white",
            )}
          >
            {displayTeamName(match.awayTeam)}
          </span>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-['Manrope'] text-[0.7rem] text-white/45">
        <span>{formatKickoff(match.kickoffAt)}</span>
        {match.groupLabel && (
          <>
            <span aria-hidden className="text-white/20">·</span>
            <span className="font-semibold text-emerald-200/75">Group {match.groupLabel}</span>
          </>
        )}
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
