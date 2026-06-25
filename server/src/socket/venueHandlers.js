const { Op } = require('sequelize');
const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const { DEFAULT_KANGAROO_NAMES } = require('shared/constants/kangarooRace');
const logger = require('../utils/logger');
const redisStore = require('../services/redisSessionStore');
const timerManager = require('../services/game-engine/timerManager');
const { getBreakRemainingSeconds } = require('../utils/breakWallClock');
const { buildRevealSnapshot } = require('../services/revealSnapshot');
const { Session } = require('../models');
const { mapClientQuestionPayload } = require('../utils/clientQuestionPayload');

const buildPreGameLobbyPayload = async (pin, session, lobbyTeams) => {
  const lobbyPhase = await redisStore.getLobbyPhase(pin);
  return {
    state: 'LOBBY',
    lobbyPhase,
    pin,
    qrCodeData: session?.qrCodeData,
    teams: lobbyTeams.reduce((acc, t) => {
      acc[t.teamId] = t;
      return acc;
    }, {}),
    totalTeams: lobbyTeams.length,
    maxTeams: session?.maxTeams || lobbyTeams.length,
  };
};

const normalizeMiniGameId = (game) =>
  game == null || game === '' ? '' : String(game).toLowerCase().replace(/-/g, '_');

const normalizeKangarooNames = (input) => {
  const source = Array.isArray(input) && input.length >= 6 ? input : DEFAULT_KANGAROO_NAMES;
  return source.slice(0, 6).map((value) =>
    String(value || '')
      .trim()
      .replace(/\s+/g, ' '),
  );
};

/**
 * Venue display refreshed — Unity must reload. Reset pre-reveal mini-game flags so the
 * host can press Start Race / Start Game again after the venue reports ready.
 * @param {string} pin
 * @param {object} gameState
 * @returns {Promise<object>}
 */
const resetMiniGameForVenueReload = async (pin, gameState) => {
  const active = normalizeMiniGameId(gameState.activeMiniGame);
  const mgs = gameState.miniGameState;
  if (!active || !mgs || mgs.revealed) return gameState;

  const patched = await redisStore.updateGameState(pin, (current) => {
    const live = current.miniGameState;
    if (!live || live.revealed) return null;

    if (active === 'kangaroo_race') {
      const names = normalizeKangarooNames(
        live.kangarooNames || current.miniGameConfig?.kangarooNames,
      );
      return {
        miniGameState: {
          ...live,
          game: 'kangaroo_race',
          ready: false,
          gameStarted: false,
          revealed: false,
          kangarooNames: names,
          finishOrder: [],
          resultsAwarded: false,
          selections: {},
          pickCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
          pickDeadlineAt: null,
        },
      };
    }

    if (active === 'card_shuffle') {
      return {
        miniGameState: {
          ...live,
          game: 'card_shuffle',
          ready: false,
          gameStarted: false,
          revealed: false,
          activeRound: null,
          correctPosition: null,
          cardPositions: [],
          selections: {},
          pickCounts: { 1: 0, 2: 0, 3: 0 },
        },
      };
    }

    return { miniGameState: { ...live, ready: false, gameStarted: false } };
  });

  return patched || gameState;
};

const emitMiniGameStartForVenue = (socket, gameState) => {
  const active = normalizeMiniGameId(gameState.activeMiniGame);
  if (!active) return;

  const payload = { game: active, venueReload: true };
  if (active === 'kangaroo_race') {
    payload.kangarooNames = normalizeKangarooNames(
      gameState.miniGameState?.kangarooNames || gameState.miniGameConfig?.kangarooNames,
    );
  }
  socket.emit(SOCKET_EVENTS.MINI_GAME_START, payload);
};

/**
 * Registers venue display and host reconnection socket event handlers.
 * On refresh, the full game state is pushed back so UI can re-render the correct phase.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
const venueHandlers = (io, socket) => {
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
            const patched = await redisStore.updateGameState(pin, { maxTeams: session.maxTeams });
            if (patched) gameState = patched;
          }
        }

        if (gameState.activeMiniGame) {
          gameState = await resetMiniGameForVenueReload(pin, gameState);
          io.to(`session:${pin}`).emit(SOCKET_EVENTS.MINI_GAME_READY, {
            game: gameState.activeMiniGame,
            ready: false,
            source: 'venue_reload',
          });
          emitMiniGameStartForVenue(socket, gameState);
        }

        socket.emit(SOCKET_EVENTS.SESSION_STATE, await buildFullStatePayload(gameState, pin));
        await emitTriviaReconnectSideEvents(socket, pin, gameState);
      } else {
        const session = await Session.findOne({
          where: { pin, status: { [Op.in]: ['pending', 'active'] } },
        });
        const lobbyTeams = await redisStore.getAllTeamsData(pin);
        if (session) {
          socket.emit(
            SOCKET_EVENTS.SESSION_STATE,
            await buildPreGameLobbyPayload(pin, session, lobbyTeams),
          );
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
            const patched = await redisStore.updateGameState(pin, { maxTeams: session.maxTeams });
            if (patched) gameState = patched;
          }
        }
        socket.emit(SOCKET_EVENTS.SESSION_STATE, await buildFullStatePayload(gameState, pin));
        await emitTriviaReconnectSideEvents(socket, pin, gameState);
      } else {
        const session = await Session.findOne({ where: { pin } });
        const lobbyTeams = await redisStore.getAllTeamsData(pin);
        socket.emit(
          SOCKET_EVENTS.SESSION_STATE,
          await buildPreGameLobbyPayload(pin, session, lobbyTeams),
        );
      }

      logger.info('Host connected/reconnected', { pin });
    } catch (err) {
      logger.error('host_connect error', { error: err.message });
    }
  });
};

/**
 * Replay answer_reveal / scoreboard / timer side-events after reconnect.
 * Skipped while a mini-game is active so the venue is not forced into
 * "Processing Results…" (reveal phase without currentQuestion).
 */
const emitTriviaReconnectSideEvents = async (socket, pin, gameState) => {
  if (gameState.activeMiniGame) return;

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
  if (gameState.scoreboardVisible && gameState.state !== 'SCOREBOARD') {
    const sortedTeams = Object.values(gameState.teams || {}).sort((a, b) => b.score - a.score);
    const revealPayload = await buildRevealSnapshot(pin, gameState);
    socket.emit(SOCKET_EVENTS.SCOREBOARD, {
      teams: sortedTeams,
      source: 'manual',
      ...(revealPayload ? { revealSnapshot: revealPayload } : {}),
    });
  }
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
  // WAGER_COLLECTION needs the upcoming question id on the venue payload so the wager-lock
  // counter can be displayed alongside the question label without waiting for QUESTION_ACTIVE.
  const includeQuestionPayload =
    (gameState.state === 'QUESTION' || gameState.state === 'WAGER_COLLECTION') &&
    !gameState.activeMiniGame;
  const currentQuestion = includeQuestionPayload ? currentQuestionRow : null;
  const lobbyTeams = await redisStore.getAllTeamsData(pin);
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
    timerRemaining: timerManager.getReconnectTimerRemaining(pin, gameState),
    timerRunning: gameState.timerRunning,
    responseCount: gameState.responseCount,
    totalTeams,
    rounds: sanitizedRounds,
    teams,
    roundWagers: gameState.roundWagers || {},
    questionWagers: gameState.questionWagers || {},
    activeTeamIds:
      Array.isArray(gameState.activeTeamIds) && gameState.activeTeamIds.length > 0
        ? gameState.activeTeamIds
        : Object.keys(teams).map(Number),
    breakDuration: Number(gameState.breakDuration ?? 360),
    breakRemaining:
      gameState.state === 'BREAK'
        ? getBreakRemainingSeconds(gameState)
        : Number(gameState.breakRemaining ?? 0),
    activeMiniGame: gameState.activeMiniGame,
    miniGameState: gameState.miniGameState || null,
    miniGameConfig: gameState.miniGameConfig || null,
    scoreboardVisible: Boolean(gameState.scoreboardVisible),
    maxTeams: Number(gameState.maxTeams || 0),
    currentQuestion: currentQuestion
      ? {
          questionIndex: gameState.currentQuestionIndex,
          totalQuestions: currentRound?.questions?.length || 0,
          question: mapClientQuestionPayload(currentQuestion),
          timerDuration:
            currentQuestion?.timerDuration ??
            currentRound?.timerDuration ??
            gameState.timerDuration ??
            30,
          roundType: currentRound?.type || '',
        }
      : null,
    qrCodeData: gameState.qrCodeData,
    pin,
    ...(gameState.state === 'BREAK'
      ? {
          breakEndsAt:
            Number.isFinite(Number(gameState.breakEndsAt)) && Number(gameState.breakEndsAt) > 0
              ? Number(gameState.breakEndsAt)
              : undefined,
          serverNow: Date.now(),
        }
      : {}),
  };
};

venueHandlers.buildFullStatePayload = buildFullStatePayload;
venueHandlers.buildPreGameLobbyPayload = buildPreGameLobbyPayload;
module.exports = venueHandlers;
