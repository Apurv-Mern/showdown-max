const { Team, Session } = require('../models');
const logger = require('../utils/logger');
const { normalizeTeamName, sanitizeTeamName } = require('../utils/teamName');
const { getSocketIo } = require('../socket/ioRegistry');
const { purgeTeamFromLiveSession } = require('./purgeTeamFromLiveSession');

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
  const removedSocketId = team.socketId || null;

  if (pin) {
    await purgeTeamFromLiveSession(pin, teamId, true);
  } else {
    await team.destroy();
  }

  const io = getSocketIo();
  if (io && pin) {
    io.to(`session:${pin}`).emit('team_removed', {
      teamId: Number(teamId),
      reason: 'host_removed',
    });
    if (removedSocketId) {
      io.to(removedSocketId).emit('team_removed', {
        teamId: Number(teamId),
        direct: true,
        reason: 'host_removed',
      });
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
