const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const logger = require('../utils/logger');
const gameController = require('../services/game-engine/gameController');
const redisStore = require('../services/redisSessionStore');

const createCardShuffleRoundState = (roundNumber = null, gameStarted = true) => ({
  game: 'card_shuffle',
  ready: false,
  gameStarted,
  activeRound: roundNumber,
  revealed: false,
  correctPosition: null,
  cardPositions: [],
  selections: {},
  pickCounts: { 1: 0, 2: 0, 3: 0 },
});

const normalizeUnityPayload = (value) => {
  if (value === null || value === undefined) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (typeof value === 'object') return value;
  return {};
};

const extractCardShuffleReveal = (data = {}) => {
  const directValue = normalizeUnityPayload(data.value);
  const directPayload = normalizeUnityPayload(directValue.payload);

  if (String(directValue.type || '') === 'SHUFFLE_COMPLETE') {
    return {
      correctPosition: Number(directPayload.correct_position),
      cardPositions: Array.isArray(directPayload.card_positions)
        ? directPayload.card_positions.map((value) => Number(value))
        : [],
    };
  }

  if (String(data.action || '') === 'SHUFFLE_COMPLETE') {
    return {
      correctPosition: Number(directValue.correct_position),
      cardPositions: Array.isArray(directValue.card_positions)
        ? directValue.card_positions.map((value) => Number(value))
        : [],
    };
  }

  if (Number.isFinite(Number(directValue.correct_position))) {
    return {
      correctPosition: Number(directValue.correct_position),
      cardPositions: Array.isArray(directValue.card_positions)
        ? directValue.card_positions.map((value) => Number(value))
        : [],
    };
  }

  return null;
};

const hydrateCardShuffleState = async (pin, updater) => {
  const gameState = await redisStore.getGameState(pin);
  if (!gameState || gameState.activeMiniGame !== 'card_shuffle') {
    return null;
  }

  const baseState =
    gameState.miniGameState?.game === 'card_shuffle'
      ? gameState.miniGameState
      : createCardShuffleRoundState();

  gameState.miniGameState = updater({ ...baseState, selections: { ...(baseState.selections || {}) } });
  await redisStore.setGameState(pin, gameState);
  return gameState;
};

/**
 * Registers mini-game socket event handlers.
 *
 * Flow:
 *  1. Host emits LAUNCH_MINI_GAME -> gameController broadcasts MINI_GAME_START
 *  2. Venue emits MINI_GAME_READY -> relayed to host + venue in the same session room
 *  3. Host emits MINI_GAME_COMMAND -> relayed to venue in the same session room
 *  4. Players emit MINI_GAME_ACTION (choice) -> relayed to venue + host and persisted for Card Shuffle
 *  5. Unity (venue) emits MINI_GAME_ACTION(source:'unity', action:'game_complete') -> broadcast MINI_GAME_REVEAL
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
const miniGameHandlers = (io, socket) => {
  socket.on(SOCKET_EVENTS.MINI_GAME_READY, async (data = {}) => {
    try {
      const pin = data.pin || socket.data?.pin;
      if (!pin) return;

      const payload = {
        game: data.game,
        ready: data.ready !== false,
        source: socket.data?.role || data.source || 'venue',
      };

      if (payload.game === 'card_shuffle') {
        await hydrateCardShuffleState(pin, (state) => ({
          ...state,
          ready: payload.ready,
        }));
      }

      io.to(`session:${pin}`).emit(SOCKET_EVENTS.MINI_GAME_READY, payload);
      logger.debug('Mini-game readiness relayed', { pin, game: payload.game, ready: payload.ready });
    } catch (err) {
      logger.error('mini_game_ready error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.MINI_GAME_COMMAND, async (data = {}) => {
    try {
      const pin = data.pin || socket.data?.pin;
      if (!pin) return;

      const payload = {
        game: data.game,
        command: data.command,
        roundNumber: data.roundNumber,
        source: socket.data?.role || data.source || 'host',
      };

      if (payload.game === 'card_shuffle') {
        await hydrateCardShuffleState(pin, (state) => {
          if (payload.command === 'start_game') {
            return {
              ...createCardShuffleRoundState(1, true),
              ready: state.ready,
            };
          }

          if (payload.command === 'next_round') {
            return {
              ...createCardShuffleRoundState(payload.roundNumber || null, true),
              ready: state.ready,
            };
          }

          if (payload.command === 'reveal_cards') {
            return {
              ...state,
              revealed: false,
              correctPosition: null,
              cardPositions: [],
            };
          }

          return state;
        });
      }

      io.to(`session:${pin}`).emit(SOCKET_EVENTS.MINI_GAME_COMMAND, payload);
      logger.info('Mini-game command relayed', {
        pin,
        game: payload.game,
        command: payload.command,
        roundNumber: payload.roundNumber,
      });
    } catch (err) {
      logger.error('mini_game_command error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.MINI_GAME_ACTION, async (data = {}) => {
    try {
      const { pin, teamId } = socket.data || {};
      const eventPin = pin || data.pin;
      if (!eventPin) return;

      const room = `session:${eventPin}`;

      if (data.source === 'unity') {
        const reveal = extractCardShuffleReveal(data);

        if (reveal) {
          const { correctPosition, cardPositions } = reveal;

          if (!Number.isFinite(correctPosition) || correctPosition < 1 || correctPosition > 3) {
            logger.warn('Card Shuffle reveal missing correct_position', {
              pin: eventPin,
              data,
            });
            return;
          }

          const gameState = await hydrateCardShuffleState(eventPin, (state) => ({
            ...state,
            revealed: true,
            correctPosition,
            cardPositions,
          }));

          io.to(room).emit(SOCKET_EVENTS.MINI_GAME_REVEAL, {
            game: 'card_shuffle',
            correctPosition,
            roundNumber: gameState?.miniGameState?.activeRound || undefined,
            cardPositions,
          });

          logger.info('Card Shuffle reveal received from Unity', {
            pin: eventPin,
            correctPosition,
            roundNumber: gameState?.miniGameState?.activeRound || undefined,
          });
          return;
        }

        if (String(data.action || '') === 'ROUND_COMPLETE') {
          logger.debug('Card Shuffle round complete received from Unity', { pin: eventPin });
          return;
        }

        if (data.action === 'game_complete') {
          const result = typeof data.value === 'object' && data.value ? data.value : {};
          const resultType = String(result.type || '');
          if (resultType === 'ROUND_COMPLETE') {
            logger.debug('Card Shuffle round complete received from Unity', { pin: eventPin });
            return;
          }
          await gameController.endMiniGame(io, eventPin);
          logger.info('Mini-game completed via Unity', { pin: eventPin, resultType });
          return;
        }
      }

      let shouldRelayPlayerSelection = true;

      if (
        socket.data?.role !== 'venue' &&
        data.action === 'select' &&
        Number.isFinite(Number(data.value))
      ) {
        await hydrateCardShuffleState(eventPin, (state) => {
          if (state.game !== 'card_shuffle' || state.revealed || !state.gameStarted || !teamId) {
            shouldRelayPlayerSelection = false;
            return state;
          }

          const choice = Number(data.value);
          if (choice < 1 || choice > 3) {
            shouldRelayPlayerSelection = false;
            return state;
          }
          if (state.selections[String(teamId)] !== undefined) {
            shouldRelayPlayerSelection = false;
            return state;
          }

          const selections = { ...(state.selections || {}), [String(teamId)]: choice };
          const pickCounts = { ...(state.pickCounts || { 1: 0, 2: 0, 3: 0 }) };
          pickCounts[choice] = Number(pickCounts[choice] || 0) + 1;

          return {
            ...state,
            selections,
            pickCounts,
          };
        });
      }

      if (data.action === 'select' && !shouldRelayPlayerSelection) {
        return;
      }

      io.to(room).emit(SOCKET_EVENTS.MINI_GAME_UPDATE, {
        teamId,
        teamName: socket.data?.teamName,
        action: data.action,
        value: data.value,
        source: data.source || 'player',
      });

      logger.debug('Mini-game action relayed', {
        pin: eventPin,
        teamId,
        action: data.action,
        value: data.value,
      });
    } catch (err) {
      logger.error('mini_game_action error', { error: err.message });
    }
  });
};

module.exports = miniGameHandlers;
