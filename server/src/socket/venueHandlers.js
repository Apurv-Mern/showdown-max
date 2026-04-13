const { Op } = require('sequelize');
const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const logger = require('../utils/logger');
const redisStore = require('../services/redisSessionStore');
const { Session } = require('../models');

const parseStoredResponse = (raw) => {
  if (!raw) return { selectedOptionIndex: -1, responseTime: null };
  try {
    const parsed = JSON.parse(raw);
    const selectedOptionIndex = Number(parsed.selectedOptionIndex);
    const responseTime = Number(parsed.responseTime);
    return {
      selectedOptionIndex: Number.isFinite(selectedOptionIndex) ? selectedOptionIndex : -1,
      responseTime: Number.isFinite(responseTime) ? responseTime : null,
    };
  } catch {
    const selectedOptionIndex = Number(raw);
    return {
      selectedOptionIndex: Number.isFinite(selectedOptionIndex) ? selectedOptionIndex : -1,
      responseTime: null,
    };
  }
};

const buildReconnectRevealPayload = async (pin, gameState, currentQuestion) => {
  const responsesRaw = currentQuestion?.id
    ? await redisStore.getResponses(pin, currentQuestion.id)
    : {};
  const teams = Object.values(gameState.teams || {}).map((team) => ({
    teamId: Number(team.teamId),
    teamName: String(team.teamName || ''),
    score: Number(team.score || 0),
    isEliminated: Boolean(team.isEliminated),
  }));
  const responseDetails = teams.map((team) => {
    const parsed = parseStoredResponse(responsesRaw[String(team.teamId)]);
    return {
      teamId: team.teamId,
      selectedOptionIndex: parsed.selectedOptionIndex,
      responseTime: parsed.responseTime,
    };
  });
  const correctOptionIndex = (currentQuestion?.options || []).findIndex((option) => option?.isCorrect);
  const allWrong =
    correctOptionIndex < 0
      ? true
      : responseDetails.every((response) => response.selectedOptionIndex !== correctOptionIndex);

  return {
    correctOptionIndex,
    correctText: currentQuestion?.options?.[correctOptionIndex]?.text || '',
    scores: {},
    responseDetails,
    eliminations: teams.filter((team) => team.isEliminated).map((team) => team.teamId),
    allWrong,
    teams,
  };
};

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
        socket.emit(SOCKET_EVENTS.SESSION_STATE, buildFullStatePayload(gameState, pin));
        const currentRound = gameState.rounds?.[gameState.currentRoundIndex];
        const currentQuestion = currentRound?.questions?.[gameState.currentQuestionIndex] || null;
        if (
          gameState.state === 'QUESTION' &&
          gameState.questionState === 'REVEALED' &&
          currentQuestion
        ) {
          const revealPayload = await buildReconnectRevealPayload(pin, gameState, currentQuestion);
          socket.emit(SOCKET_EVENTS.ANSWER_REVEAL, revealPayload);
          socket.emit(SOCKET_EVENTS.TIMER_UPDATE, { remaining: 0 });
        }
      } else {
        const session = await Session.findOne({ where: { pin, status: { [Op.in]: ['pending', 'active'] } } });
        if (session) {
          socket.emit(SOCKET_EVENTS.SESSION_STATE, {
            state: 'LOBBY',
            pin,
            qrCodeData: session.qrCodeData,
            teams: [],
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
        socket.emit(SOCKET_EVENTS.SESSION_STATE, buildFullStatePayload(gameState, pin));
        const currentRound = gameState.rounds?.[gameState.currentRoundIndex];
        const currentQuestion = currentRound?.questions?.[gameState.currentQuestionIndex] || null;
        if (
          gameState.state === 'QUESTION' &&
          gameState.questionState === 'REVEALED' &&
          currentQuestion
        ) {
          const revealPayload = await buildReconnectRevealPayload(pin, gameState, currentQuestion);
          socket.emit(SOCKET_EVENTS.ANSWER_REVEAL, revealPayload);
          socket.emit(SOCKET_EVENTS.TIMER_UPDATE, { remaining: 0 });
        }
      } else {
        const session = await Session.findOne({ where: { pin } });
        const lobbyTeams = await redisStore.getLobbyTeams(pin);
        socket.emit(SOCKET_EVENTS.SESSION_STATE, {
          state: 'LOBBY',
          pin,
          teams: lobbyTeams.reduce((acc, t) => { acc[t.teamId] = t; return acc; }, {}),
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
const buildFullStatePayload = (gameState, pin) => {
  const currentRound = gameState.rounds?.[gameState.currentRoundIndex];
  const currentQuestion = currentRound?.questions?.[gameState.currentQuestionIndex] || null;

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
