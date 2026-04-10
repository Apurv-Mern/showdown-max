const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const logger = require('../utils/logger');
const gameController = require('../services/game-engine/gameController');

/**
 * Registers mini-game socket event handlers.
 *
 * Flow:
 *  1. Host emits LAUNCH_MINI_GAME → gameController broadcasts MINI_GAME_START
 *  2. Venue emits MINI_GAME_READY → relayed to host + venue in the same session room
 *  3. Host emits MINI_GAME_COMMAND → relayed to venue in the same session room
 *  4. Players emit MINI_GAME_ACTION (choice) → relayed to venue + host
 *  5. Unity (venue) emits MINI_GAME_ACTION(source:'unity', action:'game_complete') → broadcast result + MINI_GAME_END
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
const miniGameHandlers = (io, socket) => {
  socket.on(SOCKET_EVENTS.MINI_GAME_READY, (data = {}) => {
    try {
      const pin = data.pin || socket.data?.pin;
      if (!pin) return;

      const payload = {
        game: data.game,
        ready: data.ready !== false,
        source: socket.data?.role || data.source || 'venue',
      };

      io.to(`session:${pin}`).emit(SOCKET_EVENTS.MINI_GAME_READY, payload);
      logger.debug('Mini-game readiness relayed', { pin, game: payload.game, ready: payload.ready });
    } catch (err) {
      logger.error('mini_game_ready error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.MINI_GAME_COMMAND, (data = {}) => {
    try {
      const pin = data.pin || socket.data?.pin;
      if (!pin) return;

      const payload = {
        game: data.game,
        command: data.command,
        roundNumber: data.roundNumber,
        source: socket.data?.role || data.source || 'host',
      };

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

  socket.on(SOCKET_EVENTS.MINI_GAME_ACTION, (data) => {
    try {
      const { pin, teamId } = socket.data || {};
      if (!pin) return;

      const room = `session:${pin}`;

      if (data.source === 'unity' && data.action === 'game_complete') {
        gameController.endMiniGame(io, pin).then(() => {
          logger.info('Mini-game completed via Unity', { pin });
        }).catch((err) => {
          logger.error('endMiniGame error on game_complete', { error: err.message });
        });
        return;
      }

      io.to(room).emit(SOCKET_EVENTS.MINI_GAME_UPDATE, {
        teamId,
        teamName: socket.data?.teamName,
        action: data.action,
        value: data.value,
        source: data.source || 'player',
      });

      logger.debug('Mini-game action relayed', { pin, teamId, action: data.action });
    } catch (err) {
      logger.error('mini_game_action error', { error: err.message });
    }
  });
};

module.exports = miniGameHandlers;
