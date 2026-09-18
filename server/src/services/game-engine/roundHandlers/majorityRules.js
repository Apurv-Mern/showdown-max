const { SCORING } = require('shared/constants/scoring');
const { isUnanswered } = require('../unanswered');

/**
 * Majority Rules: Most popular answer = +50, minority / unanswered = -50.
 * Tie for majority: all tied teams get +50.
 */
const calculate = ({ responses, question }) => {
  const scores = {};

  const voteCounts = {};
  for (const [, response] of Object.entries(responses)) {
    if (isUnanswered(response, question)) continue;
    const idx = Number(response.selectedOptionIndex);
    if (!Number.isFinite(idx) || idx < 0) continue;
    voteCounts[idx] = (voteCounts[idx] || 0) + 1;
  }

  const maxVotes = Math.max(...Object.values(voteCounts), 0);

  const majorityOptions = Object.entries(voteCounts)
    .filter(([, count]) => count === maxVotes)
    .map(([idx]) => Number(idx));

  for (const [teamId, response] of Object.entries(responses)) {
    if (isUnanswered(response, question) || majorityOptions.length === 0) {
      scores[teamId] = SCORING.MAJORITY_RULES.MINORITY;
      continue;
    }
    const selectedIdx = Number(response.selectedOptionIndex);
    const isMajority = majorityOptions.includes(selectedIdx);
    scores[teamId] = isMajority
      ? SCORING.MAJORITY_RULES.MAJORITY
      : SCORING.MAJORITY_RULES.MINORITY;
  }

  return { scores, eliminations: [], allWrong: false };
};

module.exports = { calculate };
