'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useSocket } from './useSocket';

interface ReconnectOptions {
  pin: string;
  teamName: string;
  teamId?: number;
  role?: 'player' | 'host' | 'venue';
  onStateRestored?: (gameState: any) => void;
}

/**
 * Ensures the socket is always joined to the correct session room.
 * Emits the appropriate event on first connect AND every subsequent reconnect.
 */
export const useReconnect = ({ pin, teamName, teamId, role = 'player', onStateRestored }: ReconnectOptions) => {
  const { socket, isConnected } = useSocket();
  const [isReconnecting, setIsReconnecting] = useState(false);
  const joinedRef = useRef(false);

  const emitJoin = useCallback(() => {
    if (!socket || !pin) return;

    setIsReconnecting(true);

    if (role === 'player' && teamName) {
      socket.emit('join_session', { pin, teamName });
    } else if (role === 'host') {
      socket.emit('host_connect', { pin });
    } else if (role === 'venue') {
      socket.emit('venue_connect', { pin });
    }

    setTimeout(() => setIsReconnecting(false), 2000);
  }, [socket, pin, teamName, role]);

  useEffect(() => {
    if (!socket || !pin) return;

    const handleConnect = () => {
      emitJoin();
    };

    const handleSessionState = (data: any) => {
      if (data.gameState || data.state) {
        onStateRestored?.(data);
      }
      setIsReconnecting(false);
    };

    socket.on('connect', handleConnect);
    socket.on('session_state', handleSessionState);

    if (isConnected && !joinedRef.current) {
      joinedRef.current = true;
      emitJoin();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('session_state', handleSessionState);
    };
  }, [socket, isConnected, pin, emitJoin, onStateRestored]);

  return { isConnected, isReconnecting };
};
