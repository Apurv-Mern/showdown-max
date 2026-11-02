'use client';

import { createContext, useContext } from 'react';

export interface PlayerSession {
  pin: string;
  teamId: number | null;
  teamName: string;
  score: number;
}

export interface PlayerContextType {
  session: PlayerSession;
  setSession: (s: Partial<PlayerSession>) => void;
  clearSession: () => void;
}

export const defaultSession: PlayerSession = { pin: '', teamId: null, teamName: '', score: 0 };

export const PlayerContext = createContext<PlayerContextType>({
  session: defaultSession,
  setSession: () => {},
  clearSession: () => {},
});

export const usePlayerSession = () => useContext(PlayerContext);
