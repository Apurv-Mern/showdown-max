const { ROUND_TYPES } = require('shared/constants/roundTypes');
const { SCORING, getEliminationPoints } = require('shared/constants/scoring');
const logger = require('../../utils/logger');

const roundHandlers = {
  [ROUND_TYPES.MULTIPLE_CHOICE]: require('./roundHandlers/multipleChoice'),
  [ROUND_TYPES.WAGER]: require('./roundHandlers/wager'),
  [ROUND_TYPES.MUSIC]: require('./roundHandlers/music'),
  [ROUND_TYPES.ELIMINATION]: require('./roundHandlers/elimination'),
  [ROUND_TYPES.MAJORITY_RULES]: require('./roundHandlers/majorityRules'),
  [ROUND_TYPES.FINAL_MULTIPLE_CHOICE]: require('./roundHandlers/finalMultipleChoice'),
  [ROUND_TYPES.FINAL_WAGER]: require('./roundHandlers/finalWager'),
};

/**
 * Calculate scores for all teams on a given question
 * @param {object} params
 * @param {string} params.roundType
 * @param {object} params.question - { options: [{ text, isCorrect }] }
 * @param {Record<number, { selectedOptionIndex: number, wagerAmount?: number }>} params.responses - teamId → response
 * @param {number} params.questionIndex - 0-based index within the round
 * @param {Record<number, { score: number }>} params.teams - teamId → team data
 * @param {number[]} params.activeTeamIds - teams that can answer (for elimination)
 * @returns {{ scores: Record<number, number>, eliminations: number[], allWrong: boolean }}
 */
const calculateScores = ({ roundType, question, responses, questionIndex, teams, activeTeamIds }) => {
  const handler = roundHandlers[roundType];

  if (!handler) {
    logger.error('No handler for round type', { roundType });
    return { scores: {}, eliminations: [], allWrong: false };
  }

  return handler.calculate({
    question,
    responses,
    questionIndex,
    teams,
    activeTeamIds,
  });
};

module.exports = { calculateScores };
