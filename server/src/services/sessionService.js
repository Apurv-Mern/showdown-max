const { Op } = require('sequelize');
const { Session, Quiz, Round, Question, Team, Answer, HostAccount } = require('../models');
const { generatePin } = require('../utils/pinGenerator');
const { generateQRCode } = require('../utils/qrGenerator');
const { generateHostToken } = require('../utils/tokenGenerator');
const redisStore = require('./redisSessionStore');
const logger = require('../utils/logger');

/**
 * Get all sessions with optional filters
 * @param {{ status?: string, page?: number, limit?: number, sessionId?: number }} options
 * @returns {Promise<{ sessions: object[], total: number }>}
 */
const getSessions = async ({ status, page = 1, limit = 20, sessionId } = {}) => {
  const where = {};
  if (status) where.status = status;
  if (sessionId) where.id = sessionId;

  const offset = (page - 1) * limit;
  const { rows, count } = await Session.findAndCountAll({
    where,
    include: [
      { model: Quiz, as: 'quiz', attributes: ['id', 'title'] },
      { model: Team, as: 'teams', attributes: ['id', 'teamName', 'score', 'isConnected'] },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return { sessions: rows, total: count };
};

/**
 * Get a single session by ID
 * @param {number} sessionId
 * @returns {Promise<object | null>}
 */
const getSessionById = async (sessionId) => {
  return Session.findByPk(sessionId, {
    include: [
      { model: Quiz, as: 'quiz', attributes: ['id', 'title'] },
      {
        model: Team,
        as: 'teams',
        attributes: ['id', 'teamName', 'score', 'isConnected', 'isEliminated'],
      },
    ],
  });
};

/**
 * Create a new game session
 * @param {{ quizId: number, maxTeams?: number, breakDuration?: number }} data
 * @returns {Promise<object>}
 */
const createSession = async (data) => {
  const quiz = await Quiz.findByPk(data.quizId);
  if (!quiz) throw Object.assign(new Error('Quiz not found'), { statusCode: 404 });

  let pin = generatePin();
  let existing = await Session.findOne({
    where: { pin, status: { [Op.in]: ['pending', 'active'] } },
  });
  let attempts = 0;
  while (existing && attempts < 10) {
    pin = generatePin();
    existing = await Session.findOne({
      where: { pin, status: { [Op.in]: ['pending', 'active'] } },
    });
    attempts++;
  }

  const hostToken = generateHostToken();
  const joinUrl = `https://showdown-frontend.24livehost.com/play/join?pin=${pin}`;
  const qrCodeData = await generateQRCode(joinUrl);

  const session = await Session.create({
    quizId: data.quizId,
    pin,
    hostToken,
    qrCodeData,
    maxTeams: data.maxTeams || 50,
    breakDuration: Number.isFinite(Number(data.breakDuration)) ? Number(data.breakDuration) : 360,
    status: 'pending',
  });

  await redisStore.setSession(pin, session.id);
  logger.info('Session created', {
    sessionId: session.id,
    pin,
    breakDuration: session.breakDuration,
  });

  return {
    id: session.id,
    pin: session.pin,
    hostToken: session.hostToken,
    qrCodeData: session.qrCodeData,
    maxTeams: session.maxTeams,
    breakDuration: session.breakDuration,
    status: session.status,
    quizId: session.quizId,
    quizTitle: quiz.title,
  };
};

/**
 * Get session by PIN (pending/active) without requiring an assigned host.
 * Used for existence checks and authenticated routes; mobile join uses `getPlayerJoinEligibleSessionByPin`.
 * @param {string} pin
 * @returns {Promise<object | null>}
 */
const getSessionByPin = async (pin) => {
  const session = await Session.findOne({
    where: { pin, status: { [Op.in]: ['pending', 'active'] } },
    include: [{ model: Quiz, as: 'quiz', attributes: ['id', 'title'] }],
  });
  return session;
};

/**
 * Live session by PIN for venue display or player join: must exist, be pending/active,
 * and have an active host account assigned (same gate as venue PIN validation).
 */
const getHostReadyLiveSessionByPin = async (pin) => {
  return Session.findOne({
    where: { pin, status: { [Op.in]: ['pending', 'active'] } },
    include: [
      { model: Quiz, as: 'quiz', attributes: ['id', 'title'] },
      {
        model: HostAccount,
        as: 'assignedHost',
        attributes: ['id'],
        required: true,
        where: { isActive: true },
      },
    ],
  });
};

/** @alias — venue entry uses the host-ready gate */
const getVenueEligibleSessionByPin = getHostReadyLiveSessionByPin;

/** @alias — mobile join uses the same gate as venue */
const getPlayerJoinEligibleSessionByPin = getHostReadyLiveSessionByPin;

/**
 * End a session
 * @param {number} sessionId
 * @returns {Promise<object | null>}
 */
const endSession = async (sessionId) => {
  const session = await Session.findByPk(sessionId);
  if (!session) return null;

  await session.update({ status: 'completed' });
  await redisStore.cleanupSession(session.pin);

  logger.info('Session ended', { sessionId, pin: session.pin });
  return session;
};

/**
 * Permanently delete a session and dependent team/answer data.
 * @param {number} sessionId
 * @returns {Promise<object|null>}
 */
const deleteSession = async (sessionId) => {
  const session = await Session.findByPk(sessionId);
  if (!session) return null;

  /** Keep for socket broadcast — Sequelize may clear fields after `destroy()`. */
  const pin = String(session.pin || '');

  const teams = await Team.findAll({
    where: { sessionId },
    attributes: ['id'],
    raw: true,
  });
  const teamIds = teams.map((t) => t.id);

  if (teamIds.length > 0) {
    await Answer.destroy({ where: { teamId: { [Op.in]: teamIds } } });
  }
  await Team.destroy({ where: { sessionId } });

  await redisStore.cleanupSession(pin);
  await session.destroy();

  logger.info('Session deleted', { sessionId, pin, teamCount: teamIds.length });
  return { pin, id: sessionId };
};

/**
 * Get session results (teams sorted by score)
 * @param {number} sessionId
 * @returns {Promise<object | null>}
 */
const getSessionResults = async (sessionId) => {
  const session = await Session.findByPk(sessionId, {
    include: [
      { model: Quiz, as: 'quiz', attributes: ['id', 'title'] },
      {
        model: Team,
        as: 'teams',
        attributes: ['id', 'teamName', 'score'],
        order: [['score', 'DESC']],
      },
    ],
  });

  if (!session) return null;

  const teams = session.teams
    .sort((a, b) => b.score - a.score)
    .map((t, idx) => ({
      rank: idx + 1,
      teamId: t.id,
      teamName: t.teamName,
      score: t.score,
    }));

  return {
    sessionId: session.id,
    quizTitle: session.quiz?.title,
    pin: session.pin,
    status: session.status,
    teams,
  };
};

module.exports = {
  getSessions,
  getSessionById,
  createSession,
  getSessionByPin,
  getVenueEligibleSessionByPin,
  getPlayerJoinEligibleSessionByPin,
  endSession,
  deleteSession,
  getSessionResults,
};
