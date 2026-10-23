/** Quiz shows at most seven rounds — each has a dedicated intro art asset (1-based). */
export const ROUND_INTRO_IMAGE_COUNT = 7;

export function clampRoundIntroNumber(roundNumber: number): number {
  const n = Math.floor(Number(roundNumber));
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > ROUND_INTRO_IMAGE_COUNT) return ROUND_INTRO_IMAGE_COUNT;
  return n;
}

export function getVenueRoundIntroImageUrl(roundNumber: number): string {
  const n = clampRoundIntroNumber(roundNumber);
  return encodeURI(`/Round Intro Images/Venue/Round Intro ${n}.png`);
}

export function getMobileRoundIntroImageUrl(roundNumber: number): string {
  const n = clampRoundIntroNumber(roundNumber);
  return encodeURI(`/Round Intro Images/Mobile/Round Intro ${n}.png`);
}
