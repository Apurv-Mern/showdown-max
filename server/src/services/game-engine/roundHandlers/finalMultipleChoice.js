const { SCORING } = require('shared/constants/scoring');
const { isUnanswered } = require('../unanswered');

/**
 * Final Multiple Choice: Same as regular MC (+20 / -2). Unanswered is incorrect.
 */
const calculate = ({ question, responses }) => {
  const scores = {};
  const correctIndex = question.options.findIndex((o) => o.isCorrect);

  for (const [teamId, response] of Object.entries(responses)) {
    if (isUnanswered(response, question)) {
      scores[teamId] = SCORING.FINAL_MULTIPLE_CHOICE.INCORRECT;
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
