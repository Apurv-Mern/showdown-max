'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { usePlayerSession } from '../playerSession';
import { PlayerScreenShell } from '@/components/player/PlayerScreenShell';
import { PUBLIC_API_URL } from '@/lib/env';

const TEAM_NAME_MAX_LENGTH = 20;
const PLAY_JOIN_FLASH_KEY = 'playJoinFlash';

const sanitizeTeamName = (name: string) => name.trim().replace(/\s+/g, ' ');

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { socket, isConnected } = useSocket();
  const { session, setSession } = usePlayerSession();

  const [pin, setPin] = useState(searchParams.get('pin') || session.pin || '');
  const [teamName, setTeamName] = useState(session.teamName || '');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const flash = sessionStorage.getItem(PLAY_JOIN_FLASH_KEY);
    if (flash) {
      setError(flash);
      sessionStorage.removeItem(PLAY_JOIN_FLASH_KEY);
    }
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onSessionState = (data: any) => {
      if (data.joined) {
        setError('');
        const gs = data.gameState;
        if (gs?.currentRound && gs.state === 'ROUND_INTRO') {
          sessionStorage.setItem(
            'roundIntro',
            JSON.stringify({
              round: gs.currentRound,
              roundIndex: gs.currentRoundIndex || 0,
              totalRounds: gs.totalRounds || 0,
            }),
          );
        }
        if (gs?.currentQuestion) {
          const rawTeams = gs.teams as
            | Record<string, { teamId?: number; isEliminated?: boolean }>
            | undefined;
          const eliminatedTeamIds = rawTeams
            ? Object.values(rawTeams)
                .filter((t) => t && t.isEliminated)
                .map((t) => Number(t.teamId))
                .filter((id) => Number.isFinite(id))
            : [];
          const tid = data.teamId != null ? Number(data.teamId) : NaN;
          const row = data.teamId != null && rawTeams ? rawTeams[String(data.teamId)] : undefined;
          const myEliminated =
            Boolean(row?.isEliminated) || (Number.isFinite(tid) && eliminatedTeamIds.includes(tid));
          sessionStorage.setItem(
            'questionActive',
            JSON.stringify({
              ...gs.currentQuestion,
              timerRemaining: gs.timerRemaining,
              timerRunning: gs.timerRunning,
              timerEndsAt: gs.timerEndsAt,
              serverNow: gs.serverNow,
              mySubmittedOptionIndex: gs.mySubmittedOptionIndex,
              eliminatedTeamIds,
              isEliminated: myEliminated,
            }),
          );
        }

        setSession({
          pin,
          teamId: data.teamId != null ? Number(data.teamId) : null,
          teamName: data.teamName,
          score:
            data.score !== undefined && data.score !== null
              ? Number(data.score) || 0
              : session.score,
        });
        setJoining(false);
        if (gs?.activeMiniGame) {
          router.push(`/play/mini-game?game=${encodeURIComponent(String(gs.activeMiniGame))}`);
        } else if (gs?.state && gs.state !== 'LOBBY') {
          router.push('/play/game');
        } else {
          router.push('/play/lobby');
        }
      }
    };

    const onJoinError = (data: { message: string }) => {
      setError(data.message);
      setJoining(false);
    };

    socket.on('session_state', onSessionState);
    socket.on('join_error', onJoinError);

    return () => {
      socket.off('session_state', onSessionState);
      socket.off('join_error', onJoinError);
    };
  }, [socket, pin, router, setSession, session.score]);

  const handleJoin = async () => {
    setError('');
    const cleanTeamName = sanitizeTeamName(teamName);

    if (!pin || pin.length !== 6) {
      setError('Please enter a valid 6-digit PIN');
      return;
    }
    if (!cleanTeamName) {
      setError('Please enter a team name');
      return;
    }
    if (cleanTeamName.length > TEAM_NAME_MAX_LENGTH) {
      setError(`Team name must be ${TEAM_NAME_MAX_LENGTH} characters or fewer`);
      return;
    }
    if (!socket || !isConnected) {
      setError('Connecting to server... please try again');
      return;
    }

    setJoining(true);
    try {
      const res = await fetch(`${PUBLIC_API_URL}/api/public/sessions/pin/${pin}`, {
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !json?.success) {
        setError(
          json?.error || 'Session not found, not active, or no host is assigned to this PIN yet.',
        );
        setJoining(false);
        return;
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setJoining(false);
      return;
    }

    socket.emit('join_session', {
      pin,
      teamName: cleanTeamName,
      ...(session.teamId != null ? { teamId: session.teamId } : {}),
    });
  };

  return (
    <div className="flex-1 h-full min-h-0 w-full bg-[#00010a]">
      <PlayerScreenShell>
        {showSplash ? (
          <motion.div
            key="join-splash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex h-full flex-col items-center justify-center px-5"
          >
            <img
              src="/logo.png"
              alt="Max Showdown logo"
              className="w-[min(91%,400px)] object-contain"
            />
            <div className="mt-6 px-1 text-center [text-shadow:0_2px_2px_rgba(0,0,0,0.5)]">
              <h1 className="text-[30px] font-extrabold uppercase leading-none text-white">
                Live Trivia Experience
              </h1>
              <p className="mt-2 text-[18px] font-extrabold uppercase leading-snug text-white">
                Get ready-the game is about to begin
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="join-form"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="mx-auto flex h-full w-full max-w-[400px] flex-col items-center px-[30px] pt-[112px]"
          >
            <img
              src="/logo.png"
              alt="Max Showdown logo"
              className="w-[400px] max-w-full object-contain object-bottom"
            />

            <div className="mt-10 flex w-full flex-col gap-[30px]">
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="rounded-[10px] border border-[#ff0000]/50 bg-[#250000] px-4 py-2.5 text-center text-sm text-white"
                >
                  {error}
                </motion.div>
              )}

              <div className="flex flex-col items-center">
                <label className="mb-2 text-center text-[20px] font-bold uppercase leading-6 text-white">
                  Enter Session PIN
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="ENTER SESSION PIN"
                  value={pin}
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setPin(next);
                    if (error) setError('');
                  }}
                  className="player-input text-center"
                  maxLength={6}
                  autoFocus
                />
              </div>

              <div className="flex flex-col items-center">
                <label className="mb-2 text-center text-[20px] font-bold uppercase leading-6 text-white">
                  Enter your Team Name
                </label>
                <input
                  type="text"
                  placeholder="ENTER TEAM NAME"
                  value={teamName}
                  onChange={(e) =>
                    setTeamName(
                      e.target.value.replace(/\s{2,}/g, ' ').slice(0, TEAM_NAME_MAX_LENGTH),
                    )
                  }
                  className="player-input text-center"
                  maxLength={TEAM_NAME_MAX_LENGTH}
                />
                <p className="sr-only">
                  {sanitizeTeamName(teamName).length}/{TEAM_NAME_MAX_LENGTH}
                </p>
              </div>

              <button
                type="button"
                onClick={handleJoin}
                disabled={joining || !pin || !teamName.trim()}
                className="player-join-btn disabled:opacity-45"
              >
                {joining ? 'Joining...' : 'JOIN GAME'}
              </button>

              <div className="flex items-center justify-center gap-2">
                <div
                  className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-[#38ff00] shadow-[0_0_6px_rgba(56,255,0,0.6)]' : 'bg-[#ff0000] shadow-[0_0_6px_rgba(255,0,0,0.6)]'}`}
                />
                <span className="text-xs text-white/50">
                  {isConnected ? 'Connected' : 'Connecting...'}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </PlayerScreenShell>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinContent />
    </Suspense>
  );
}
