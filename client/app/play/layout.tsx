'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useReconnect } from '@/hooks/useReconnect';

interface PlayerSession {
  pin: string;
  teamId: number | null;
  teamName: string;
  score: number;
}

interface PlayerContextType {
  session: PlayerSession;
  setSession: (s: Partial<PlayerSession>) => void;
  clearSession: () => void;
}

const defaultSession: PlayerSession = { pin: '', teamId: null, teamName: '', score: 0 };

const PlayerContext = createContext<PlayerContextType>({
  session: defaultSession,
  setSession: () => {},
  clearSession: () => {},
});

export const usePlayerSession = () => useContext(PlayerContext);

function PlayerReconnector({ session, setSession }: { session: PlayerSession; setSession: (s: Partial<PlayerSession>) => void }) {
  const { isReconnecting } = useReconnect({
    pin: session.pin,
    teamName: session.teamName,
    teamId: session.teamId ?? undefined,
    role: 'player',
    onStateRestored: (data) => {
      if (data.score !== undefined) {
        setSession({ score: data.score });
      }
    },
  });

  if (isReconnecting) {
    return (
      <div className="fixed top-0 left-0 right-0 z-100 bg-warning/90 text-background text-center py-1 text-xs font-medium animate-pulse">
        Reconnecting...
      </div>
    );
  }

  return null;
}

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<PlayerSession>(defaultSession);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('playerSession');
    if (stored) {
      try {
        setSessionState(JSON.parse(stored));
      } catch {
        // corrupted storage, ignore
      }
    }
    setMounted(true);
  }, []);

  const setSession = useCallback((updates: Partial<PlayerSession>) => {
    setSessionState((prev) => {
      const next = { ...prev, ...updates };
      sessionStorage.setItem('playerSession', JSON.stringify(next));
      return next;
    });
  }, []);

  const clearSession = useCallback(() => {
    setSessionState(defaultSession);
    sessionStorage.removeItem('playerSession');
  }, []);

  if (!mounted) return null;

  return (
    <PlayerContext.Provider value={{ session, setSession, clearSession }}>
      <div className="h-[100dvh] w-full bg-[#050017] flex flex-col overflow-hidden">
        {session.pin && session.teamId && (
          <PlayerReconnector session={session} setSession={setSession} />
        )}
        {children}
      </div>
    </PlayerContext.Provider>
  );
}
