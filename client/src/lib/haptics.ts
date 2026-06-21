/*
haptics — a tiny, safe wrapper for a light tap of vibration feedback.

RG-safe juice (arch §23): only ever called on a *prediction/pick* action
(locking in a pick), navigation, or a result reveal — NEVER on entering or
paying.

Reality of support today:
  - Android web / PWA (Chrome): navigator.vibrate works.
  - iOS Safari / iOS PWA: no Vibration API — this is a silent no-op.
  - When the app is wrapped natively (Capacitor), swap the body of `tap()`
    for `Haptics.impact({ style: ImpactStyle.Light })` to get a real tap on
    iPhone too. The call sites won't need to change.

So on Wez's iPhone (web) this does nothing yet; it lights up on Android web
now and on both once the native wrap lands.
*/

function canVibrate(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function"
  );
}

/** A short, light tap. Safe to call anywhere; no-ops where unsupported. */
export function tap(ms = 12): void {
  try {
    if (canVibrate()) navigator.vibrate(ms);
  } catch {
    /* never let a haptic break a real action */
  }
}

/** A slightly stronger double-pulse for a positive reveal (e.g. an exact score). */
export function success(): void {
  try {
    if (canVibrate()) navigator.vibrate([10, 40, 16]);
  } catch {
    /* no-op */
  }
}
