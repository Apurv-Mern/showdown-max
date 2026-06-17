const SCORING = Object.freeze({
  MULTIPLE_CHOICE: {
    CORRECT: 20,
    INCORRECT: -2,
  },
  FINAL_MULTIPLE_CHOICE: {
    CORRECT: 10,
    INCORRECT: -2,
  },
  MUSIC: {
    CORRECT: 20,
    INCORRECT: -2,
  },
  WAGER: {
    MIN: 0,
    MAX: 50,
  },
  FINAL_WAGER: {
    MIN_PERCENT: 0,
    MAX_PERCENT: 100,
  },
  MAJORITY_RULES: {
    MAJORITY: 50,
    MINORITY: -50,
  },
  ELIMINATION: {
    BASE_POINTS: 10,
    INCREMENT: 10,
    MAX_QUESTIONS: 12,
  },
});

/**
 * @param {number} questionIndex - 0-based index of the question in the elimination round
 * @returns {number} Points for that question
 */
const getEliminationPoints = (questionIndex) => {
  return (questionIndex + 1) * SCORING.ELIMINATION.INCREMENT;
};

module.exports = { SCORING, getEliminationPoints };
