const { SCORING } = require('shared/constants/scoring');

/**
 * Multiple Choice: +10 correct, -2 incorrect
 */
const calculate = ({ question, responses }) => {
  const scores = {};
  const isOrdering = question.options.some((o) => o.correctOrder !== undefined);
  let correctOrderStr = null;
  let correctIndex = -1;

  if (isOrdering) {
    const expectedOrder = [...question.options]
      .map((o, idx) => ({ idx, order: o.correctOrder }))
      .sort((a, b) => a.order - b.order)
      .map((x) => x.idx);
    correctOrderStr = JSON.stringify(expectedOrder);
  } else {
    correctIndex = question.options.findIndex((o) => o.isCorrect);
  }

  for (const [teamId, response] of Object.entries(responses)) {
    if (!response) {
      scores[teamId] = 0;
      continue;
    }

    if (isOrdering) {
      if (!Array.isArray(response.selectedOptionIndex)) {
        scores[teamId] = 0;
        continue;
      }
      const isCorrect = JSON.stringify(response.selectedOptionIndex) === correctOrderStr;
      scores[teamId] = isCorrect
        ? SCORING.MULTIPLE_CHOICE.CORRECT
        : SCORING.MULTIPLE_CHOICE.INCORRECT;
    } else {
      if (Number(response.selectedOptionIndex) < 0) {
        scores[teamId] = 0;
        continue;
      }
      const isCorrect = Number(response.selectedOptionIndex) === correctIndex;
      scores[teamId] = isCorrect
        ? SCORING.MULTIPLE_CHOICE.CORRECT
        : SCORING.MULTIPLE_CHOICE.INCORRECT;
    }
  }

  return { scores, eliminations: [], allWrong: false };
};

module.exports = { calculate };
