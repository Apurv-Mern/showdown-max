const { SCORING } = require('shared/constants/scoring');

/**
 * Wager (standard): +wager if correct, -wager if incorrect. Wager 0–50.
 */
const calculate = ({ question, responses }) => {
  const scores = {};
  const correctIndex = question.options.findIndex((o) => o.isCorrect);

  for (const [teamId, response] of Object.entries(responses)) {
    const wager = Math.min(
      Math.max(response.wagerAmount || 0, SCORING.WAGER.MIN),
      SCORING.WAGER.MAX,
    );
    const isCorrect = response.selectedOptionIndex === correctIndex;
    scores[teamId] = isCorrect ? wager : -wager;
  }

  return { scores, eliminations: [], allWrong: false };
};

module.exports = { calculate };
