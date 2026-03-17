const { SCORING } = require('shared/constants/scoring');

/**
 * Majority Rules: Most popular answer = +50, minority = -50.
 * Tie for majority: all tied teams get +50.
 */
const calculate = ({ responses }) => {
  const scores = {};

  const voteCounts = {};
  for (const [, response] of Object.entries(responses)) {
    const idx = response.selectedOptionIndex;
    voteCounts[idx] = (voteCounts[idx] || 0) + 1;
  }

  const maxVotes = Math.max(...Object.values(voteCounts), 0);

  const majorityOptions = Object.entries(voteCounts)
    .filter(([, count]) => count === maxVotes)
    .map(([idx]) => Number(idx));

  for (const [teamId, response] of Object.entries(responses)) {
    const isMajority = majorityOptions.includes(response.selectedOptionIndex);
    scores[teamId] = isMajority
      ? SCORING.MAJORITY_RULES.MAJORITY
      : SCORING.MAJORITY_RULES.MINORITY;
  }

  return { scores, eliminations: [], allWrong: false };
};

module.exports = { calculate };
