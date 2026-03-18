const { Server } = require('socket.io');
const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const logger = require('../utils/logger');
const { socketGuard } = require('../middleware/socketGuard');
const hostHandlers = require('./hostHandlers');
const playerHandlers = require('./playerHandlers');
const venueHandlers = require('./venueHandlers');
const miniGameHandlers = require('./miniGameHandlers');

/**
 * Initializes Socket.io server on a Fastify HTTP server
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
const initializeSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    connectionStateRecovery: {
      maxDisconnectionDuration: 120000,
      skipMiddlewares: false,
    },
  });

  io.use(socketGuard);

  io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
    logger.info('Client connected', { socketId: socket.id, recovered: socket.recovered });

    hostHandlers(io, socket);
    playerHandlers(io, socket);
    venueHandlers(io, socket);
    miniGameHandlers(io, socket);

    socket.on(SOCKET_EVENTS.DISCONNECT, (reason) => {
      logger.info('Client disconnected', { socketId: socket.id, reason });
    });

    socket.on('error', (err) => {
      logger.error('Socket error', { socketId: socket.id, error: err.message });
    });
  });

  logger.info('Socket.io initialized');
  return io;
};

module.exports = { initializeSocket };
