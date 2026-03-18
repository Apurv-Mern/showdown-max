const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const logger = require('../utils/logger');

/**
 * Registers mini-game socket event handlers.
 *
 * Flow:
 *  1. Host emits LAUNCH_MINI_GAME → gameController broadcasts MINI_GAME_START
 *  2. Players emit MINI_GAME_ACTION (choice) → relayed to venue + host
 *  3. Unity (venue) emits MINI_GAME_ACTION(source:'unity', action:'game_complete') → broadcast result + MINI_GAME_END
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
const miniGameHandlers = (io, socket) => {
  socket.on(SOCKET_EVENTS.MINI_GAME_ACTION, (data) => {
    try {
      const { pin, teamId } = socket.data || {};
      if (!pin) return;

      const room = `session:${pin}`;

      if (data.source === 'unity' && data.action === 'game_complete') {
        io.to(room).emit(SOCKET_EVENTS.MINI_GAME_END, {
          result: data.value,
          game: socket.data?.miniGameType || null,
        });
        logger.info('Mini-game completed via Unity', { pin });
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
