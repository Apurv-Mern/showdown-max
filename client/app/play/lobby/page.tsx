'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { cn } from '@/lib/utils';
import { usePlayerSession } from '../playerSession';
import { LoadingDots } from '../LoadingDots';
import { PlayerCodeOfConductScreen } from '@/components/player/PlayerCodeOfConductScreen';
// import { PlayerPracticeQuestionScreen } from '@/components/player/PlayerPracticeQuestionScreen';

type LobbyPhase = 'registration' | 'code_of_conduct' | 'practice_question';

const resolveLobbyPhase = (raw: unknown): LobbyPhase => {
  // if (raw === 'practice_question') return raw;
  if (raw === 'code_of_conduct') return raw;
  return 'registration';
};

const MOBILE_BG = "url('/Mobile_BG.png')";

export default function LobbyPage() {
  const router = useRouter();
  const { socket } = useSocket();
  const { session, setSession, clearSession } = usePlayerSession();
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [lobbyPhase, setLobbyPhase] = useState<LobbyPhase>('registration');

  useEffect(() => {
    if (!session.pin || !session.teamId) {
      router.replace('/play/join');
    }
  }, [session, router]);

  useEffect(() => {
    if (!socket || !session.pin || !session.teamName || session.teamId == null) return;

    const handleRoundIntro = (data: any) => {
      if (data) sessionStorage.setItem('roundIntro', JSON.stringify(data));
      router.push('/play/game');
    };
    const handleQuestionActive = (data: any) => {
      if (data) sessionStorage.setItem('questionActive', JSON.stringify(data));
      router.push('/play/game');
    };
    const handleMiniGameStart = (data: { game: string }) =>
      router.push(`/play/mini-game?game=${data.game}`);
    const handleGameStarted = () => router.push('/play/game');
    const handleGameEnd = () => {
      clearSession();
      router.replace('/play/join');
    };

    const applyLobbyPhaseFromPayload = (data: any) => {
      const gs = data?.gameState ?? data;
      if (gs?.state === 'LOBBY' || (!gs?.state && data?.joined)) {
        setLobbyPhase(resolveLobbyPhase(gs?.lobbyPhase ?? data?.lobbyPhase));
      }
    };

    const handleSessionState = (data: any) => {
      const gameState = data?.gameState ?? data;
      // The join reply carries the server's current team name — adopt it so a host rename
      // made while we were in the lobby doesn't linger in sessionStorage.
      if (data?.teamName && String(data.teamName) !== session.teamName) {
        setSession({ teamName: String(data.teamName) });
      }
      if (gameState?.activeMiniGame) {
        router.push(`/play/mini-game?game=${encodeURIComponent(String(gameState.activeMiniGame))}`);
        return;
      }
      applyLobbyPhaseFromPayload(data);
      if (gameState?.state && gameState.state !== 'LOBBY') {
        router.push('/play/game');
      }
    };

    const handleVenueLobbyPhase = (data: { phase?: LobbyPhase }) => {
      if (data?.phase) setLobbyPhase(resolveLobbyPhase(data.phase));
    };

    const handleTeamUpdated = (data: { teamId?: number; teamName?: string; score?: number }) => {
      if (Number(data?.teamId) !== Number(session.teamId)) return;
      const teamName = String(data?.teamName ?? '').trim();
      setSession({
        ...(teamName ? { teamName } : {}),
        ...(Number.isFinite(Number(data?.score)) ? { score: Number(data.score) } : {}),
      });
    };

    socket.on('round_intro', handleRoundIntro);
    socket.on('question_active', handleQuestionActive);
    socket.on('mini_game_start', handleMiniGameStart);
    socket.on('game_started', handleGameStarted);
    socket.on('game_end', handleGameEnd);
    socket.on('session_state', handleSessionState);
    socket.on('venue_lobby_phase', handleVenueLobbyPhase);
    socket.on('team_updated', handleTeamUpdated);

    socket.emit('join_session', {
      pin: session.pin,
      teamName: session.teamName,
      teamId: session.teamId,
    });

    return () => {
      socket.off('round_intro', handleRoundIntro);
      socket.off('question_active', handleQuestionActive);
      socket.off('mini_game_start', handleMiniGameStart);
      socket.off('game_started', handleGameStarted);
      socket.off('game_end', handleGameEnd);
      socket.off('session_state', handleSessionState);
      socket.off('venue_lobby_phase', handleVenueLobbyPhase);
      socket.off('team_updated', handleTeamUpdated);
    };
  }, [
    socket,
    router,
    clearSession,
    setSession,
    session.pin,
    session.teamName,
    session.teamId,
  ]);

  const shellClassName = cn(
    'relative h-full min-h-0 w-full overflow-hidden mobile-play-bg text-center',
    'flex min-h-0 w-full flex-1 flex-col',
    '-mt-[env(safe-area-inset-top,0px)] min-h-[calc(100%+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)]',
  );
  const shellStyle = {
    backgroundImage: MOBILE_BG,
    backgroundSize: '100% 100%',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  } as const;

  const leaveButton = (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.8 }}
      transition={{ delay: 0.7 }}
      onClick={() => setShowExitConfirm(true)}
      className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] left-1/2 z-20 -translate-x-1/2 text-xs text-[#ff6f94] underline underline-offset-2 transition-colors hover:text-[#ff1744] sm:text-sm"
    >
      Leave Game
    </motion.button>
  );

  const exitModal = showExitConfirm ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="neon-border bg-surface w-full max-w-xs rounded-2xl p-5 text-center sm:max-w-sm sm:p-6"
      >
        <h3 className="text-lg font-bold mb-2">Leave Game?</h3>
        <p className="text-foreground/50 text-sm mb-6">
          You will be removed from the session. You can rejoin with the same team name.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setShowExitConfirm(false)}
            className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-surface-light transition-colors"
          >
            Stay
          </button>
          <button
            onClick={() => {
              socket?.emit('leave_session');
              clearSession();
              router.replace('/play/join');
            }}
            className="flex-1 py-2.5 rounded-lg bg-neon-red/20 text-neon-red border border-neon-red/40 text-sm font-medium hover:bg-neon-red/30 transition-colors"
          >
            Leave
          </button>
        </div>
      </motion.div>
    </div>
  ) : null;

  if (lobbyPhase === 'code_of_conduct') {
    return (
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
          className={cn(shellClassName, 'px-4 py-5 pb-14 sm:px-5')}
          style={shellStyle}
        >
          <PlayerCodeOfConductScreen />
          {leaveButton}
        </motion.div>
        {exitModal}
      </>
    );
  }

  // if (lobbyPhase === 'practice_question') {
  //   return (
  //     <>
  //       <motion.div
  //         initial={{ opacity: 0 }}
  //         animate={{ opacity: 1 }}
  //         transition={{ duration: 0.35 }}
  //         className={cn(shellClassName, 'px-4 py-5 pb-14 sm:px-5')}
  //         style={shellStyle}
  //       >
  //         <div className="min-h-0 flex-1 overflow-y-auto">
  //           <PlayerPracticeQuestionScreen />
  //         </div>
  //         {leaveButton}
  //       </motion.div>
  //       {exitModal}
  //     </>
  //   );
  // }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={shellClassName}
        style={shellStyle}
      >
        <div className="relative z-10 flex h-full flex-col">
          <div className="flex flex-1 flex-col items-center justify-center px-4 sm:px-6 md:px-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.35 }}
            >
              <img src="/greentick.png" alt="" className="object-cover w-25 h-25 mb-5" />
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 }}
              className="text-[clamp(1.75rem,6vw,2.6rem)] font-bold leading-[1.05] md:text-[clamp(2rem,4vw,2.75rem)] text-[#38FF00]"
            >
              YOU ARE IN
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.38 }}
              className="mt-2 text-base font-medium leading-[1.2] text-white sm:text-lg md:text-xl"
            >
              THE HOST WILL START THE GAME SHORTLY
            </motion.p>
            <LoadingDots className="mt-6 sm:mt-8" />
            <img src="/logo.png" width={400} height={100} alt="Max Showdown" className="mt-40" />
          </div>
        </div>
        {leaveButton}
      </motion.div>
      {exitModal}
    </>
  );
}
