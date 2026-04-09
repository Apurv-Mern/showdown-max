const { Server } = require('socket.io');
const crypto = require('crypto');
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
    socket.data.correlationId = crypto.randomUUID();

    logger.info('Client connected', {
      socketId: socket.id,
      recovered: socket.recovered,
      correlationId: socket.data.correlationId,
    });

    socket.onAny((eventName, payload = {}) => {
      const data = payload && typeof payload === 'object' ? payload : {};
      logger.debug('Socket event received', {
        socketId: socket.id,
        correlationId: socket.data.correlationId,
        eventName,
        pin: data.pin || socket.data?.pin,
        actorRole: socket.data?.role,
        teamId: socket.data?.teamId,
      });
    });

    hostHandlers(io, socket);
    playerHandlers(io, socket);
    venueHandlers(io, socket);
    miniGameHandlers(io, socket);

    socket.on(SOCKET_EVENTS.DISCONNECT, (reason) => {
      logger.info('Client disconnected', {
        socketId: socket.id,
        correlationId: socket.data.correlationId,
        reason,
        pin: socket.data?.pin,
        actorRole: socket.data?.role,
        teamId: socket.data?.teamId,
      });
    });

    socket.on('error', (err) => {
      logger.error('Socket error', {
        socketId: socket.id,
        correlationId: socket.data.correlationId,
        error: err.message,
        pin: socket.data?.pin,
        actorRole: socket.data?.role,
        teamId: socket.data?.teamId,
      });
    });
  });

  logger.info('Socket.io initialized');
  return io;
};

module.exports = { initializeSocket };
