const { Op } = require('sequelize');
const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const logger = require('../utils/logger');
const redisStore = require('../services/redisSessionStore');
const { buildRevealSnapshot } = require('../services/revealSnapshot');
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

      let gameState = await redisStore.getGameState(pin);
      if (gameState) {
        if (!Number.isFinite(Number(gameState.maxTeams)) || Number(gameState.maxTeams) <= 0) {
          const session = await Session.findOne({ where: { pin } });
          if (session) {
            gameState.maxTeams = session.maxTeams;
            await redisStore.setGameState(pin, gameState);
          }
        }
        socket.emit(SOCKET_EVENTS.SESSION_STATE, await buildFullStatePayload(gameState, pin));
        if (gameState.state === 'QUESTION' && gameState.questionState === 'REVEALED') {
          const revealPayload = await buildRevealSnapshot(pin, gameState);
          if (revealPayload) {
            socket.emit(SOCKET_EVENTS.ANSWER_REVEAL, revealPayload);
            socket.emit(SOCKET_EVENTS.TIMER_UPDATE, { remaining: 0 });
          }
        }
        if (gameState.state === 'SCOREBOARD') {
          const revealPayload = await buildRevealSnapshot(pin, gameState);
          if (revealPayload) {
            socket.emit(SOCKET_EVENTS.ANSWER_REVEAL, revealPayload);
          }
        }
      } else {
        const session = await Session.findOne({
          where: { pin, status: { [Op.in]: ['pending', 'active'] } },
        });
        const lobbyTeams = await redisStore.getLobbyTeams(pin);
        if (session) {
          socket.emit(SOCKET_EVENTS.SESSION_STATE, {
            state: 'LOBBY',
            pin,
            qrCodeData: session.qrCodeData,
            teams: lobbyTeams.reduce((acc, t) => {
              acc[t.teamId] = t;
              return acc;
            }, {}),
            totalTeams: lobbyTeams.length,
            maxTeams: session.maxTeams,
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

      let gameState = await redisStore.getGameState(pin);
      if (gameState) {
        if (!Number.isFinite(Number(gameState.maxTeams)) || Number(gameState.maxTeams) <= 0) {
          const session = await Session.findOne({ where: { pin } });
          if (session) {
            gameState.maxTeams = session.maxTeams;
            await redisStore.setGameState(pin, gameState);
          }
        }
        socket.emit(SOCKET_EVENTS.SESSION_STATE, await buildFullStatePayload(gameState, pin));
        if (gameState.state === 'QUESTION' && gameState.questionState === 'REVEALED') {
          const revealPayload = await buildRevealSnapshot(pin, gameState);
          if (revealPayload) {
            socket.emit(SOCKET_EVENTS.ANSWER_REVEAL, revealPayload);
            socket.emit(SOCKET_EVENTS.TIMER_UPDATE, { remaining: 0 });
          }
        }
        if (gameState.state === 'SCOREBOARD') {
          const revealPayload = await buildRevealSnapshot(pin, gameState);
          if (revealPayload) {
            socket.emit(SOCKET_EVENTS.ANSWER_REVEAL, revealPayload);
          }
        }
      } else {
        const session = await Session.findOne({ where: { pin } });
        const lobbyTeams = await redisStore.getLobbyTeams(pin);
        socket.emit(SOCKET_EVENTS.SESSION_STATE, {
          state: 'LOBBY',
          pin,
          teams: lobbyTeams.reduce((acc, t) => {
            acc[t.teamId] = t;
            return acc;
          }, {}),
          totalTeams: lobbyTeams.length,
          maxTeams: session?.maxTeams || lobbyTeams.length,
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
const buildFullStatePayload = async (gameState, pin) => {
  const currentRound = gameState.rounds?.[gameState.currentRoundIndex];
  const currentQuestionRow = currentRound?.questions?.[gameState.currentQuestionIndex] || null;
  const includeQuestionPayload = gameState.state === 'QUESTION';
  const currentQuestion = includeQuestionPayload ? currentQuestionRow : null;
  const lobbyTeams = await redisStore.getLobbyTeams(pin);
  const teams =
    gameState.teams && Object.keys(gameState.teams).length > 0
      ? gameState.teams
      : lobbyTeams.reduce((acc, t) => {
          acc[t.teamId] = t;
          return acc;
        }, {});
  // Always derive totalTeams from the actual teams object, not from cached value
  const totalTeams = Object.keys(teams).length;

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
    totalTeams,
    rounds: sanitizedRounds,
    teams,
    activeTeamIds:
      Array.isArray(gameState.activeTeamIds) && gameState.activeTeamIds.length > 0
        ? gameState.activeTeamIds
        : Object.keys(teams).map(Number),
    breakDuration: gameState.breakDuration,
    breakRemaining: gameState.breakRemaining,
    activeMiniGame: gameState.activeMiniGame,
    miniGameState: gameState.miniGameState || null,
    maxTeams: Number(gameState.maxTeams || 0),
    currentQuestion: currentQuestion
      ? {
          questionIndex: gameState.currentQuestionIndex,
          totalQuestions: currentRound?.questions?.length || 0,
          question: {
            id: currentQuestion.id,
            text: currentQuestion.text,
            options: currentQuestion.options || [],
            mediaUrl: currentQuestion.mediaUrl,
            mediaType: currentQuestion.mediaType,
          },
          timerDuration: currentRound?.timerDuration || gameState.timerDuration || 30,
          roundType: currentRound?.type || '',
        }
      : null,
    qrCodeData: gameState.qrCodeData,
    pin,
  };
};

module.exports = venueHandlers;
