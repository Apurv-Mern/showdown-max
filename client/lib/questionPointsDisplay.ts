/** Points at stake for the current question (trophy badge), not the team's running score. */

export const QUESTION_STAKE_POINTS = {
  MULTIPLE_CHOICE_CORRECT: 20,
  MUSIC_CORRECT: 20,
  FINAL_MC_CORRECT: 20,
  MAJORITY: 50,
  ELIMINATION_INCREMENT: 10,
  INCORRECT: -2,
} as const;

/** Correct-answer points for standard round types (matches shared/constants/scoring.js). */
export function getStandardRoundCorrectPoints(roundType?: string): number {
  const rt = (roundType || '').toUpperCase();
  if (rt === 'MULTIPLE_CHOICE') return QUESTION_STAKE_POINTS.MULTIPLE_CHOICE_CORRECT;
  if (rt === 'MUSIC') return QUESTION_STAKE_POINTS.MUSIC_CORRECT;
  if (rt === 'FINAL_MULTIPLE_CHOICE') return QUESTION_STAKE_POINTS.FINAL_MC_CORRECT;
  return QUESTION_STAKE_POINTS.MULTIPLE_CHOICE_CORRECT;
}

export type QuestionPointsInput = {
  roundType?: string;
  questionIndex?: number;
  pointsForQuestion?: number | null;
  lockedWagerAmount?: number | null;
};

export function formatQuestionPointsAtStake(
  input: QuestionPointsInput | null | undefined,
): string {
  if (!input) return '0';

  const rt = (input.roundType || '').toUpperCase();
  const idx = Number(input.questionIndex ?? 0);

  if (rt === 'WAGER') {
    const locked = input.lockedWagerAmount;
    if (locked != null && Number.isFinite(Number(locked))) return String(Number(locked));
    return '0-50';
  }

  if (rt === 'FINAL_WAGER') {
    const locked = input.lockedWagerAmount;
    if (locked != null && Number.isFinite(Number(locked))) return `${Number(locked)}%`;
    return '0-100%';
  }

  if (rt === 'MAJORITY_RULES') return String(QUESTION_STAKE_POINTS.MAJORITY);

  if (rt === 'ELIMINATION') {
    const pts =
      input.pointsForQuestion ??
      (idx + 1) * QUESTION_STAKE_POINTS.ELIMINATION_INCREMENT;
    return String(pts);
  }

  return String(getStandardRoundCorrectPoints(rt));
}
