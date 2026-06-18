const logger = require('../../utils/logger');

/**
 * Manages elimination round state: active teams, knockouts, all-teams-wrong rule.
 */

/**
 * Initialize elimination round state
 * @param {number[]} teamIds - All team IDs in the session
 * @returns {{ activeTeamIds: number[], eliminatedTeamIds: number[], roundHistory: object[] }}
 */
const initEliminationRound = (teamIds) => ({
  activeTeamIds: [...teamIds],
  eliminatedTeamIds: [],
  roundHistory: [],
});

/**
 * Process elimination results for a single question
 * @param {object} eliminationState
 * @param {object} scoringResult - { scores, eliminations, allWrong } from scoring engine
 * @param {number} questionIndex
 * @returns {object} Updated elimination state
 */
const processElimination = (eliminationState, scoringResult, questionIndex) => {
  const { eliminations, allWrong } = scoringResult;
  const updated = { ...eliminationState };

  const entry = {
    questionIndex,
    allWrong,
    eliminated: [],
    survivorsCount: updated.activeTeamIds.length,
  };

  if (allWrong) {
    logger.info('Elimination: all teams wrong — no knockout', { questionIndex });
    entry.eliminated = [];
  } else if (eliminations.length > 0) {
    for (const teamId of eliminations) {
      const idx = updated.activeTeamIds.indexOf(teamId);
      if (idx !== -1) {
        updated.activeTeamIds.splice(idx, 1);
        updated.eliminatedTeamIds.push(teamId);
        entry.eliminated.push(teamId);
      }
    }
    logger.info('Elimination: teams knocked out', {
      questionIndex,
      knocked: eliminations,
      remaining: updated.activeTeamIds.length,
    });
  }

  entry.survivorsCount = updated.activeTeamIds.length;
  updated.roundHistory.push(entry);

  return updated;
};

/**
 * Check if the elimination round should end early (0 or 1 team left)
 * @param {object} eliminationState
 * @returns {boolean}
 */
const shouldEndEarly = (eliminationState) => {
  return eliminationState.activeTeamIds.length <= 1;
};

/**
 * Get the round summary
 * @param {object} eliminationState
 * @returns {{ survivors: number[], eliminated: number[], history: object[] }}
 */
const getRoundSummary = (eliminationState) => ({
  survivors: eliminationState.activeTeamIds,
  eliminated: eliminationState.eliminatedTeamIds,
  history: eliminationState.roundHistory,
});

module.exports = {
  initEliminationRound,
  processElimination,
  shouldEndEarly,
  getRoundSummary,
};
