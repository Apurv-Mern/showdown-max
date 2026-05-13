'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useReconnect } from '@/hooks/useReconnect';
import { PlayerContext, defaultSession, type PlayerSession } from './playerSession';
import { PlayerSessionDeletedBridge } from './PlayerSessionDeletedBridge';

const PLAY_JOIN_FLASH_KEY = 'playJoinFlash';

function PlayerReconnector({
  session,
  setSession,
  clearSession,
}: {
  session: PlayerSession;
  setSession: (s: Partial<PlayerSession>) => void;
  clearSession: () => void;
}) {
  const router = useRouter();
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
    onJoinError: (data) => {
      if (data?.code === 'TEAM_REMOVED' && session.pin) {
        if (typeof window !== 'undefined' && data.message) {
          sessionStorage.setItem(PLAY_JOIN_FLASH_KEY, data.message);
        }
        clearSession();
        router.replace('/play/join');
        return;
      }
      if (data?.code === 'NO_ASSIGNED_HOST' && session.pin) {
        const p = String(session.pin);
        if (typeof window !== 'undefined' && data.message) {
          sessionStorage.setItem(PLAY_JOIN_FLASH_KEY, data.message);
        }
        clearSession();
        router.replace(`/play/join?pin=${encodeURIComponent(p)}`);
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
        const parsed = JSON.parse(stored) as PlayerSession;
        const n = Number(parsed.teamId);
        parsed.teamId = Number.isFinite(n) ? n : null;
        setSessionState(parsed);
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
      <PlayerSessionDeletedBridge />
      <div className="flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-[#050017] pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-full flex-1 flex-col overflow-hidden sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-3xl">
          {children}
          {session.pin && session.teamId && (
            <PlayerReconnector session={session} setSession={setSession} clearSession={clearSession} />
          )}
        </div>
      </div>
    </PlayerContext.Provider>
  );
}
