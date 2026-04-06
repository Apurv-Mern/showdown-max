'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { usePlayerSession } from '../layout';

export default function LobbyPage() {
  const router = useRouter();
  const { socket } = useSocket();
  const { session, clearSession } = usePlayerSession();
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  useEffect(() => {
    if (!session.pin || !session.teamId) {
      router.replace('/play/join');
    }
  }, [session, router]);

  useEffect(() => {
    if (!socket) return;

    const handleRoundIntro = (data: any) => {
      if (data) sessionStorage.setItem('roundIntro', JSON.stringify(data));
      router.push('/play/game');
    };
    const handleQuestionActive = (data: any) => {
      if (data) sessionStorage.setItem('questionActive', JSON.stringify(data));
      router.push('/play/game');
    };
    const handleMiniGameStart = (data: { game: string }) => router.push(`/play/mini-game?game=${data.game}`);
    const handleGameStarted = () => router.push('/play/game');
    const handleGameEnd = () => {
      clearSession();
      router.replace('/play/join');
    };

    const handleSessionState = (data: any) => {
      if (data.gameState && data.gameState.state && data.gameState.state !== 'LOBBY') {
        router.push('/play/game');
      }
    };

    socket.on('round_intro', handleRoundIntro);
    socket.on('question_active', handleQuestionActive);
    socket.on('mini_game_start', handleMiniGameStart);
    socket.on('game_started', handleGameStarted);
    socket.on('game_end', handleGameEnd);
    socket.on('session_state', handleSessionState);

    return () => {
      socket.off('round_intro', handleRoundIntro);
      socket.off('question_active', handleQuestionActive);
      socket.off('mini_game_start', handleMiniGameStart);
      socket.off('game_started', handleGameStarted);
      socket.off('game_end', handleGameEnd);
      socket.off('session_state', handleSessionState);
    };
  }, [socket, router, clearSession]);

  return (
    <div className="flex-1 h-full min-h-0 flex justify-center bg-[#050017]">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative h-full min-h-0 w-full max-w-[390px] overflow-hidden border-2 border-[#06c6ff] mobile-play-bg text-center"
        style={{ backgroundImage: "url('/Mobile_BG.png')", backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
      >
        <div className="relative z-10 flex h-full flex-col">
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.35 }}
              className="mb-6 flex h-[86px] w-[86px] items-center justify-center rounded-full border-2 border-[#00d8ff] bg-[rgba(5,14,34,0.75)] shadow-[0_0_18px_rgba(0,216,255,0.35)]"
            >
              <svg
                width="42"
                height="42"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#00d8ff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="drop-shadow-[0_0_8px_rgba(0,216,255,0.55)]"
                aria-hidden
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="3" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a3 3 0 0 1 0 5.74" />
              </svg>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 }}
              className="text-[41px] font-bold leading-[1.05] text-white"
            >
              Waiting for game to start
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.38 }}
              className="mt-2 text-[22px] font-medium leading-[1.2] text-white/70"
            >
              The host will start the game shortly
            </motion.p>

            <div className="mt-8 flex items-center gap-3">
              <span className="h-3.5 w-3.5 rounded-full bg-[#00d8ff] shadow-[0_0_9px_rgba(0,216,255,0.6)]" />
              <span className="h-3.5 w-3.5 rounded-full bg-[#00d8ff]/65 shadow-[0_0_8px_rgba(0,216,255,0.45)]" />
              <span className="h-3.5 w-3.5 rounded-full bg-[#00d8ff]/35" />
            </div>
          </div>
        </div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.8 }}
          transition={{ delay: 0.7 }}
          onClick={() => setShowExitConfirm(true)}
          className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 text-xs text-[#ff6f94] underline underline-offset-2 transition-colors hover:text-[#ff1744]"
        >
          Leave Game
        </motion.button>
      </motion.div>

      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="neon-border bg-surface rounded-2xl p-6 max-w-xs w-full text-center"
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
      )}
    </div>
  );
}
