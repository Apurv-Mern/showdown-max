import { io, Socket } from 'socket.io-client';
import { clientLogger } from './clientLogger';
import { PUBLIC_SOCKET_URL } from './env';

const SOCKET_URL = PUBLIC_SOCKET_URL;

let socket: Socket | null = null;

const isVerboseSocketLogging = () =>
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DEBUG_LOGS === 'true';

/**
 * Returns a singleton Socket.io client instance
 */
export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });

    if (isVerboseSocketLogging()) {
      const originalEmit = socket.emit.bind(socket);
      socket.emit = ((event: string, ...args: unknown[]) => {
        clientLogger.debug('socket:outgoing', 'Socket event emitted', {
          eventName: event,
          payload: args[0],
        });
        return originalEmit(event, ...args);
      }) as Socket['emit'];

      socket.onAny((eventName, payload) => {
        clientLogger.debug('socket:incoming', 'Socket event received', {
          eventName,
          payload,
        });
      });
    }

    socket.on('connect', () => {
      clientLogger.info('socket', 'Socket connected', {
        socketId: socket?.id,
        url: SOCKET_URL,
      });
    });

    socket.on('disconnect', (reason) => {
      clientLogger.warn('socket', 'Socket disconnected', {
        socketId: socket?.id,
        reason,
      });
    });

    socket.io.on('reconnect_attempt', (attempt) => {
      clientLogger.warn('socket', 'Socket reconnect attempt', { attempt });
    });

    socket.io.on('reconnect', (attempt) => {
      clientLogger.info('socket', 'Socket reconnected', { attempt, socketId: socket?.id });
    });

    socket.io.on('reconnect_error', (error) => {
      clientLogger.error('socket', 'Socket reconnect error', {
        error: error instanceof Error ? error.message : 'Unknown reconnect error',
      });
    });
  }
  return socket;
};

export const connectSocket = (): Socket => {
  const s = getSocket();
  if (!s.connected) {
    clientLogger.info('socket', 'Connecting socket', { url: SOCKET_URL });
    s.connect();
  }
  return s;
};

export const disconnectSocket = (): void => {
  if (socket?.connected) {
    clientLogger.info('socket', 'Disconnecting socket', { socketId: socket.id });
    socket.disconnect();
  }
};
