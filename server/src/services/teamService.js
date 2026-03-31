const { Team, Session } = require('../models');
const logger = require('../utils/logger');

/**
 * Create a new team for a session (admin REST endpoint).
 * Returns null if the team name is already taken in that session.
 */
const createTeam = async ({ sessionId, teamName, score = 0 }) => {
  const session = await Session.findByPk(sessionId);
  if (!session) return null;

  const existing = await Team.findOne({ where: { sessionId, teamName } });
  if (existing) return null;

  const team = await Team.create({ sessionId, teamName, score });
  logger.info('Team created via admin API', { teamId: team.id, sessionId, teamName, score });
  return team;
};

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
  createTeam,
  getTeamsBySession,
  getTeamById,
  updateTeamScore,
  removeTeam,
};
