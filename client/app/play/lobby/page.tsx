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
    const handleMiniGameStart = () => router.push('/play/mini-game');
    const handleGameStarted = () => router.push('/play/game');

    const handleSessionState = (data: any) => {
      if (data.gameState && data.gameState.state && data.gameState.state !== 'LOBBY') {
        router.push('/play/game');
      }
    };

    socket.on('round_intro', handleRoundIntro);
    socket.on('question_active', handleQuestionActive);
    socket.on('mini_game_start', handleMiniGameStart);
    socket.on('game_started', handleGameStarted);
    socket.on('session_state', handleSessionState);

    return () => {
      socket.off('round_intro', handleRoundIntro);
      socket.off('question_active', handleQuestionActive);
      socket.off('mini_game_start', handleMiniGameStart);
      socket.off('game_started', handleGameStarted);
      socket.off('session_state', handleSessionState);
    };
  }, [socket, router]);

  return (
    <div className="flex-1 flex items-center justify-center p-4 sci-fi-bg">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-sm"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          className="w-16 h-16 border-4 border-neon-cyan border-t-transparent rounded-full mx-auto mb-8 shadow-[0_0_15px_rgba(0,229,255,0.4)]"
        />

        <motion.h1
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="text-2xl font-bold mb-2 text-glow-cyan"
        >
          You&apos;re In!
        </motion.h1>
        <p className="text-foreground/50 mb-8">Waiting for the host to start the game...</p>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="neon-border rounded-xl p-5 bg-surface/80"
        >
          <p className="text-foreground/40 text-xs mb-1">Your Team</p>
          <p className="text-xl font-bold text-neon-cyan text-glow-cyan">{session.teamName}</p>
          <div className="mt-3 pt-3 border-t border-border/50 flex justify-between text-sm">
            <span className="text-foreground/40">PIN</span>
            <span className="font-mono font-bold text-neon-cyan">{session.pin}</span>
          </div>
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ delay: 0.6 }}
          onClick={() => setShowExitConfirm(true)}
          className="text-neon-red/60 hover:text-neon-red text-xs mt-6 underline underline-offset-2 transition-colors"
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
