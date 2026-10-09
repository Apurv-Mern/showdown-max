const { SCORING } = require('shared/constants/scoring');
const { isUnanswered } = require('../unanswered');

/**
 * Wager (standard): +wager if correct, -wager if incorrect or unanswered. Wager 0–50.
 */
const calculate = ({ question, responses }) => {
  const scores = {};
  const correctIndex = question.options.findIndex((o) => o.isCorrect);

  const clampWager = (raw) =>
    Math.min(Math.max(Number(raw) || 0, SCORING.WAGER.MIN), SCORING.WAGER.MAX);

  for (const [teamId, response] of Object.entries(responses)) {
    const wager = clampWager(response?.wagerAmount);
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
