'use client';

import { useEffect, useState } from 'react';
import { useSocket } from './useSocket';

interface GameState {
  state: string;
  currentRoundIndex: number;
  currentQuestionIndex: number;
  questionState: string;
  timerRemaining: number;
  timerRunning: boolean;
}

const initialState: GameState = {
  state: 'LOBBY',
  currentRoundIndex: 0,
  currentQuestionIndex: 0,
  questionState: 'WAITING',
  timerRemaining: 0,
  timerRunning: false,
};

export const useGameState = () => {
  const { socket, isConnected } = useSocket();
  const [gameState, setGameState] = useState<GameState>(initialState);

  useEffect(() => {
    if (!socket) return;

    const onSessionState = (data: GameState) => {
      setGameState(data);
    };

    socket.on('session_state', onSessionState);

    return () => {
      socket.off('session_state', onSessionState);
    };
  }, [socket]);

  return { gameState, isConnected };
};
