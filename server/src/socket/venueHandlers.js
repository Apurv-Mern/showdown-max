const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const logger = require('../utils/logger');
const redisStore = require('../services/redisSessionStore');

/**
 * Registers venue display socket event handlers
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
        socket.emit(SOCKET_EVENTS.SESSION_STATE, gameState);
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
        socket.emit(SOCKET_EVENTS.SESSION_STATE, gameState);
      }

      logger.info('Host connected', { pin });
    } catch (err) {
      logger.error('host_connect error', { error: err.message });
    }
  });
};

module.exports = venueHandlers;
