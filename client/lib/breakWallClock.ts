/**
 * Server-authoritative break countdown: derive remaining seconds from `breakEndsAt`
 * (epoch ms) so UI stays aligned when tabs are throttled or devices sleep.
 */

export function breakClockSkewMs(serverNow: unknown): number {
  const sn = Number(serverNow);
  if (!Number.isFinite(sn) || sn <= 0) return 0;
  return sn - Date.now();
}

export function breakSecondsFromEndsAt(breakEndsAt: unknown, clockSkewMs = 0): number {
  const end = Number(breakEndsAt);
  if (!Number.isFinite(end) || end <= 0) return 0;
  return Math.max(0, Math.ceil((end - Date.now() - clockSkewMs) / 1000));
}

/** When `breakEndsAt` is missing, anchor a synthetic end from remaining + server clock. */
export function resolveBreakWallClock(params: {
  breakEndsAt?: unknown;
  breakRemaining?: unknown;
  breakDuration?: unknown;
  serverNow?: unknown;
}): { endsAt: number | null; skewMs: number; duration: number; remaining: number } {
  const skewMs = breakClockSkewMs(params.serverNow);
  const bd = Number(params.breakDuration);
  const safeDuration = Number.isFinite(bd) && bd > 0 ? bd : 360;
  const endRaw = Number(params.breakEndsAt);
  if (Number.isFinite(endRaw) && endRaw > 0) {
    const remaining = breakSecondsFromEndsAt(endRaw, skewMs);
    return { endsAt: endRaw, skewMs, duration: safeDuration, remaining };
  }
  const br = Number(params.breakRemaining);
  const safeRem =
    Number.isFinite(br) && br >= 0 ? Math.min(safeDuration, br) : safeDuration;
  const anchor =
    Number.isFinite(Number(params.serverNow)) && Number(params.serverNow) > 0
      ? Number(params.serverNow)
      : Date.now();
  const endsAt = anchor + safeRem * 1000;
  return {
    endsAt,
    skewMs,
    duration: safeDuration,
    remaining: Math.max(0, Math.ceil((endsAt - Date.now() - skewMs) / 1000)),
  };
}
