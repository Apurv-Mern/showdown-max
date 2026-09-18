const { SCORING } = require('shared/constants/scoring');
const { isUnanswered } = require('../unanswered');

/**
 * Final Wager: Wager 0–100% of current score.
 * Correct → +wager, Wrong / unanswered → -wager. Can go negative.
 */
const calculate = ({ question, responses, teams }) => {
  const scores = {};
  const correctIndex = question.options.findIndex((o) => o.isCorrect);

  for (const [teamId, response] of Object.entries(responses)) {
    const team = teams[teamId] || teams[String(teamId)];
    const currentScore = team?.score || 0;

    const percentage = Math.min(
      Math.max(Number(response?.wagerAmount) || 0, SCORING.FINAL_WAGER.MIN_PERCENT),
      SCORING.FINAL_WAGER.MAX_PERCENT,
    );
    const wager = Math.round((currentScore * percentage) / 100);

    if (isUnanswered(response, question)) {
      scores[teamId] = -wager;
      continue;
    }

    const isCorrect = Number(response.selectedOptionIndex) === correctIndex;
    scores[teamId] = isCorrect ? wager : -wager;
  }

  return { scores, eliminations: [], allWrong: false };
};

module.exports = { calculate };
