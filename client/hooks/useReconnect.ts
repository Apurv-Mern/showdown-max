'use client';

import { useEffect } from 'react';
import { useSocket } from './useSocket';

export const useReconnect = (sessionPin: string, teamName: string) => {
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    if (!socket || !isConnected || !sessionPin || !teamName) return;

    socket.emit('join_session', { pin: sessionPin, teamName });
  }, [socket, isConnected, sessionPin, teamName]);

  return { isConnected };
};
