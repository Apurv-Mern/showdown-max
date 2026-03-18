const { Op } = require('sequelize');
const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const logger = require('../utils/logger');
const redisStore = require('../services/redisSessionStore');
const { Session } = require('../models');

/**
 * Registers venue display and host reconnection socket event handlers.
 * On refresh, the full game state is pushed back so UI can re-render the correct phase.
 * @param {import('socket.io').Server} _io
 * @param {import('socket.io').Socket} socket
 */
const venueHandlers = (_io, socket) => {
  socket.on('venue_connect', async (data) => {
    try {
      const { pin } = data;
      if (!pin) return;

      socket.join(`session:${pin}`);
      socket.data = { pin, role: 'venue' };

      const gameState = await redisStore.getGameState(pin);
      if (gameState) {
        socket.emit(SOCKET_EVENTS.SESSION_STATE, buildFullStatePayload(gameState, pin));
      } else {
        const session = await Session.findOne({ where: { pin, status: { [Op.in]: ['pending', 'active'] } } });
        if (session) {
          socket.emit(SOCKET_EVENTS.SESSION_STATE, {
            state: 'LOBBY',
            pin,
            qrCodeData: session.qrCodeData,
            teams: [],
          });
        }
      }

      logger.info('Venue connected', { pin });
    } catch (err) {
      logger.error('venue_connect error', { error: err.message });
    }
  });

  socket.on('host_connect', async (data) => {
    try {
      const { pin } = data;
      if (!pin) return;

      socket.join(`session:${pin}`);
      socket.data = { pin, role: 'host' };

      const gameState = await redisStore.getGameState(pin);
      if (gameState) {
        socket.emit(SOCKET_EVENTS.SESSION_STATE, buildFullStatePayload(gameState, pin));
      } else {
        const lobbyTeams = await redisStore.getLobbyTeams(pin);
        socket.emit(SOCKET_EVENTS.SESSION_STATE, {
          state: 'LOBBY',
          pin,
          teams: lobbyTeams.reduce((acc, t) => { acc[t.teamId] = t; return acc; }, {}),
          totalTeams: lobbyTeams.length,
        });
      }

      logger.info('Host connected/reconnected', { pin });
    } catch (err) {
      logger.error('host_connect error', { error: err.message });
    }
  });
};

/**
 * Build a full state payload for reconnection — contains everything the
 * host/venue needs to render the correct UI phase without missing data.
 * @param {object} gameState
 * @param {string} pin
 * @returns {object}
 */
const buildFullStatePayload = (gameState, pin) => {
  const sanitizedRounds = gameState.rounds
    ? gameState.rounds.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        timerDuration: r.timerDuration,
        questions: r.questions.map((q) => ({
          id: q.id,
          text: q.text,
          optionCount: q.options?.length || 0,
          mediaUrl: q.mediaUrl,
          mediaType: q.mediaType,
        })),
      }))
    : [];

  return {
    state: gameState.state,
    questionState: gameState.questionState,
    currentRoundIndex: gameState.currentRoundIndex,
    currentQuestionIndex: gameState.currentQuestionIndex,
    timerRemaining: gameState.timerRemaining,
    timerRunning: gameState.timerRunning,
    responseCount: gameState.responseCount,
    totalTeams: gameState.totalTeams,
    rounds: sanitizedRounds,
    teams: gameState.teams,
    activeTeamIds: gameState.activeTeamIds,
    breakDuration: gameState.breakDuration,
    breakRemaining: gameState.breakRemaining,
    activeMiniGame: gameState.activeMiniGame,
    qrCodeData: gameState.qrCodeData,
    pin,
  };
};

module.exports = venueHandlers;
