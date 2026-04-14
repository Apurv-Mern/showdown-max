'use client';

import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { connectSocket } from '@/lib/socket';

/**
 * Provides the singleton Socket.io client.
 * The socket stays connected across page navigations — it is NOT
 * disconnected on component unmount because multiple pages/components
 * share the same instance. Only the local event listeners are cleaned up.
 */
export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const s = connectSocket();
    setSocket(s);

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);

    if (s.connected) {
      setIsConnected(true);
    }

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, []);

  return { socket, isConnected };
};
