const { SCORING } = require('shared/constants/scoring');

/**
 * Music: Same as Multiple Choice (+10 / -2). MP3 plays; no timer sound.
 */
const calculate = ({ question, responses }) => {
  const scores = {};
  const correctIndex = question.options.findIndex((o) => o.isCorrect);

  for (const [teamId, response] of Object.entries(responses)) {
    const isCorrect = response.selectedOptionIndex === correctIndex;
    scores[teamId] = isCorrect ? SCORING.MUSIC.CORRECT : SCORING.MUSIC.INCORRECT;
  }

  return { scores, eliminations: [], allWrong: false };
};

module.exports = { calculate };
