const { SCORING } = require('shared/constants/scoring');

/**
 * Final Multiple Choice: Same as regular MC (+20 / -2)
 */
const calculate = ({ question, responses }) => {
  const scores = {};
  const correctIndex = question.options.findIndex((o) => o.isCorrect);

  for (const [teamId, response] of Object.entries(responses)) {
    if (!response || Number(response.selectedOptionIndex) < 0) {
      scores[teamId] = 0;
      continue;
    }
    const isCorrect = Number(response.selectedOptionIndex) === correctIndex;
    scores[teamId] = isCorrect
      ? SCORING.FINAL_MULTIPLE_CHOICE.CORRECT
      : SCORING.FINAL_MULTIPLE_CHOICE.INCORRECT;
  }

  return { scores, eliminations: [], allWrong: false };
};

module.exports = { calculate };
