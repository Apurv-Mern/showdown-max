'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { connectSocket } from '@/lib/socket';
import { PUBLIC_API_URL } from '@/lib/env';
import { usePlayerSession } from './playerSession';

/** Mirrors `client/app/play/join/page.tsx` — a sessionStorage flash banner shown on the next
 * mount of /play/join so the player understands why they were bounced. */
const PLAY_JOIN_FLASH_KEY = 'playJoinFlash';

/** When admin deletes the live session OR the host removes this team from the registered
 * teams panel, clear the player and return to join with a flash message. */
export function PlayerSessionDeletedBridge() {
  const router = useRouter();
  const { session, clearSession } = usePlayerSession();

  const exitIfSessionMissing = useCallback(async () => {
    const pin = session.pin ? String(session.pin) : '';
    if (!pin) return;
    try {
      const res = await fetch(`${PUBLIC_API_URL}/api/public/sessions/pin/${pin}?for=exists`, {
        method: 'GET',
        cache: 'no-store',
      });
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

    // Host removed this team from the Registered Teams panel — broadcast travels through the
    // session room as `team_removed` with `{ teamId }`. We only react when it's THIS player's
    // teamId; the same event is also used by the host/venue UIs to update their roster, so
    // narrowing the match here keeps unrelated removals (other teams) from kicking everyone out.
    const onTeamRemoved = (data: {
      teamId?: number | string;
      reason?: string;
      direct?: boolean;
    }) => {
      const removedId = data?.teamId != null ? Number(data.teamId) : NaN;
      const myId = session.teamId != null ? Number(session.teamId) : NaN;
      if (!Number.isFinite(removedId) || !Number.isFinite(myId)) return;
      if (removedId !== myId) return;
      // Passive tab refresh / network blip: server purges the old socket and broadcasts
      // `team_removed` with `reason: 'disconnected'`. That must NOT clear `playerSession` or
      // the next paint sends the player to /play/join even though they are still in the game.
      if (data?.reason === 'disconnected') return;

      const hostRemoved = data?.reason === 'host_removed' || data?.reason === 'removed_by_host';
      if (hostRemoved) {
        try {
          sessionStorage.setItem(
            PLAY_JOIN_FLASH_KEY,
            'You have been removed from the game by the host.',
          );
        } catch {
          /* private mode etc. — flash is optional */
        }
      }
      clearSession();
      router.replace('/play/join');
    };

    socket.on('session_deleted', onDeleted);
    socket.on('team_removed', onTeamRemoved);
    return () => {
      socket.off('session_deleted', onDeleted);
      socket.off('team_removed', onTeamRemoved);
    };
  }, [session.pin, session.teamId, clearSession, router]);

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
