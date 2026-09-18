const { SCORING } = require('shared/constants/scoring');
const { isUnanswered } = require('../unanswered');

/**
 * Music: Same as Multiple Choice. MP3 plays; no timer sound.
 * Unanswered is scored as incorrect.
 */
const calculate = ({ question, responses }) => {
  const scores = {};
  const correctIndex = question.options.findIndex((o) => o.isCorrect);

  for (const [teamId, response] of Object.entries(responses)) {
    if (isUnanswered(response, question)) {
      scores[teamId] = SCORING.MUSIC.INCORRECT;
      continue;
    }
    const isCorrect = Number(response.selectedOptionIndex) === correctIndex;
    scores[teamId] = isCorrect ? SCORING.MUSIC.CORRECT : SCORING.MUSIC.INCORRECT;
  }

  return { scores, eliminations: [], allWrong: false };
};

module.exports = { calculate };
