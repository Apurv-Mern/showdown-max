const { SCORING } = require('shared/constants/scoring');

/**
 * Final Wager: Wager 0–50% of current score (UI uses fixed steps; server clamps to SCORING).
 * Correct → +wager, Wrong → -wager. Can go negative.
 */
const calculate = ({ question, responses, teams }) => {
  const scores = {};
  const correctIndex = question.options.findIndex((o) => o.isCorrect);

  for (const [teamId, response] of Object.entries(responses)) {
    if (!response || Number(response.selectedOptionIndex) < 0) {
      scores[teamId] = 0;
      continue;
    }
    const team = teams[teamId];
    const currentScore = team?.score || 0;

    const percentage = Math.min(
      Math.max(response.wagerAmount || 0, SCORING.FINAL_WAGER.MIN_PERCENT),
      SCORING.FINAL_WAGER.MAX_PERCENT,
    );
    const wager = Math.round((currentScore * percentage) / 100);

    const isCorrect = Number(response.selectedOptionIndex) === correctIndex;
    scores[teamId] = isCorrect ? wager : -wager;
  }

  return { scores, eliminations: [], allWrong: false };
};

module.exports = { calculate };
