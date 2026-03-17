const { Team, Session } = require('../models');
const logger = require('../utils/logger');

/**
 * Get all teams for a session
 * @param {number} sessionId
 * @returns {Promise<object[]>}
 */
const getTeamsBySession = async (sessionId) => {
  return Team.findAll({
    where: { sessionId },
    order: [['score', 'DESC']],
  });
};

/**
 * Get a single team
 * @param {number} teamId
 * @returns {Promise<object | null>}
 */
const getTeamById = async (teamId) => {
  return Team.findByPk(teamId, {
    include: [{ model: Session, as: 'session', attributes: ['id', 'pin', 'status'] }],
  });
};

/**
 * Update team score
 * @param {number} teamId
 * @param {number} score
 * @returns {Promise<object | null>}
 */
const updateTeamScore = async (teamId, score) => {
  const team = await Team.findByPk(teamId);
  if (!team) return null;

  await team.update({ score });
  logger.info('Team score updated via API', { teamId, score });
  return team;
};

/**
 * Remove a team
 * @param {number} teamId
 * @returns {Promise<boolean>}
 */
const removeTeam = async (teamId) => {
  const team = await Team.findByPk(teamId);
  if (!team) return false;

  await team.destroy();
  logger.info('Team removed via API', { teamId });
  return true;
};

module.exports = {
  getTeamsBySession,
  getTeamById,
  updateTeamScore,
  removeTeam,
};
