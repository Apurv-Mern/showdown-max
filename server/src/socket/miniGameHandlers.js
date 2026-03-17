const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const logger = require('../utils/logger');

/**
 * Registers mini-game socket event handlers
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
const miniGameHandlers = (io, socket) => {
  socket.on(SOCKET_EVENTS.MINI_GAME_ACTION, (data) => {
    try {
      const { pin } = socket.data || {};
      if (!pin) return;

      io.to(`session:${pin}`).emit(SOCKET_EVENTS.MINI_GAME_UPDATE, {
        teamId: socket.data?.teamId,
        action: data.action,
        value: data.value,
      });

      logger.debug('Mini-game action', { pin, action: data.action });
    } catch (err) {
      logger.error('mini_game_action error', { error: err.message });
    }
  });
};

module.exports = miniGameHandlers;
