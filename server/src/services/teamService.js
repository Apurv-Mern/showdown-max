const { Team, Session } = require('../models');
const logger = require('../utils/logger');
const { normalizeTeamName, sanitizeTeamName } = require('../utils/teamName');
const redisStore = require('./redisSessionStore');
const { getSocketIo } = require('../socket/ioRegistry');

/**
 * Create a new team for a session (admin REST endpoint).
 * Returns null if the team name is already taken in that session.
 */
const createTeam = async ({ sessionId, teamName, score = 0 }) => {
  const session = await Session.findByPk(sessionId);
  if (!session) return null;

  const cleanTeamName = sanitizeTeamName(teamName);
  const normalized = normalizeTeamName(cleanTeamName);
  const existingTeams = await Team.findAll({ where: { sessionId }, attributes: ['teamName'] });
  const existing = existingTeams.find((t) => normalizeTeamName(t.teamName) === normalized);
  if (existing) return null;

  const team = await Team.create({ sessionId, teamName: cleanTeamName, score });
  logger.info('Team created via admin API', {
    teamId: team.id,
    sessionId,
    teamName: cleanTeamName,
    score,
  });
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
  const team = await Team.findByPk(teamId, {
    include: [{ model: Session, as: 'session', attributes: ['id', 'pin'] }],
  });
  if (!team) return false;

  const pin = team.session?.pin ? String(team.session.pin) : null;

  await team.destroy();

  if (pin) {
    await redisStore.removeTeamFromLobby(pin, teamId);
    await redisStore.removeTeamData(pin, teamId);

    const existing = await redisStore.getGameState(pin);
    if (existing) {
      await redisStore.updateGameState(pin, (current) => {
        const teams = { ...(current.teams || {}) };
        delete teams[teamId];
        const activeTeamIds = (current.activeTeamIds || []).filter(
          (id) => Number(id) !== Number(teamId),
        );
        return {
          teams,
          activeTeamIds,
          totalTeams: Object.keys(teams).length,
        };
      });
    }

    const io = getSocketIo();
    if (io) {
      io.to(`session:${pin}`).emit('team_removed', { teamId: Number(teamId) });
    }
  }

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
