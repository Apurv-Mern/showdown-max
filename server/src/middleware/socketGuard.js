const logger = require('../utils/logger');

/**
 * Socket.io middleware that wraps every incoming event handler with error
 * catching and basic validation guards.
 * @param {import('socket.io').Socket} socket
 * @param {function} next
 */
const socketGuard = (socket, next) => {
  const originalOnevent = socket.onevent;

  socket.onevent = function (packet) {
    const [event, ...args] = packet.data || [];

    if (typeof event !== 'string') {
      return;
    }

    const data = args[0];
    if (data && typeof data === 'object' && data.pin) {
      if (typeof data.pin !== 'string' || data.pin.length !== 6 || !/^\d{6}$/.test(data.pin)) {
        const ack = args[args.length - 1];
        if (typeof ack === 'function') {
          ack({ error: 'Invalid PIN format' });
        }
        socket.emit('error', { message: 'Invalid PIN format' });
        logger.warn('Socket guard: invalid PIN', { event, pin: data.pin, socketId: socket.id });
        return;
      }
    }

    originalOnevent.call(this, packet);
  };

  next();
};

module.exports = { socketGuard };
