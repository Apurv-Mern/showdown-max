const { SCORING } = require('shared/constants/scoring');

/**
 * Multiple Choice: +10 correct, -2 incorrect
 */
const calculate = ({ question, responses }) => {
  const scores = {};
  const correctIndex = question.options.findIndex((o) => o.isCorrect);

  for (const [teamId, response] of Object.entries(responses)) {
    const isCorrect = response.selectedOptionIndex === correctIndex;
    scores[teamId] = isCorrect ? SCORING.MULTIPLE_CHOICE.CORRECT : SCORING.MULTIPLE_CHOICE.INCORRECT;
  }

  return { scores, eliminations: [], allWrong: false };
};

module.exports = { calculate };
