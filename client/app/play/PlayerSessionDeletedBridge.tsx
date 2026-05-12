'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { connectSocket } from '@/lib/socket';
import { PUBLIC_API_URL } from '@/lib/env';
import { usePlayerSession } from './playerSession';

/** When admin deletes the live session, clear the player and return to join. */
export function PlayerSessionDeletedBridge() {
  const router = useRouter();
  const { session, clearSession } = usePlayerSession();

  const exitIfSessionMissing = useCallback(async () => {
    const pin = session.pin ? String(session.pin) : '';
    if (!pin) return;
    try {
      const res = await fetch(
        `${PUBLIC_API_URL}/api/public/sessions/pin/${pin}?for=exists`,
        {
          method: 'GET',
          cache: 'no-store',
        },
      );
      if (res.status === 404) {
        clearSession();
        router.replace('/play/join');
      }
    } catch {
      /* ignore network errors */
    }
  }, [session.pin, clearSession, router]);

  useEffect(() => {
    const socket = connectSocket();
    const onDeleted = (data: { pin?: string }) => {
      const pin = data?.pin ? String(data.pin) : '';
      if (!pin || !session.pin || pin !== String(session.pin)) return;
      clearSession();
      router.replace('/play/join');
    };
    socket.on('session_deleted', onDeleted);
    return () => {
      socket.off('session_deleted', onDeleted);
    };
  }, [session.pin, clearSession, router]);

  useEffect(() => {
    if (!session.pin) return;
    void exitIfSessionMissing();
  }, [session.pin, exitIfSessionMissing]);

  /** Players on /play/join (not yet in the socket room) still have a stored PIN — poll + focus check. */
  useEffect(() => {
    if (!session.pin) return;
    const t = window.setInterval(() => {
      void exitIfSessionMissing();
    }, 8000);
    const onFocus = () => {
      void exitIfSessionMissing();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [session.pin, exitIfSessionMissing]);

  return null;
}
