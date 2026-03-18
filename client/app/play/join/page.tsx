'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { usePlayerSession } from '../layout';
import { Button } from '@/components/shared/Button';

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { socket, isConnected } = useSocket();
  const { session, setSession } = usePlayerSession();

  const [pin, setPin] = useState(searchParams.get('pin') || session.pin || '');
  const [teamName, setTeamName] = useState(session.teamName || '');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!socket) return;

    socket.on('session_state', (data: any) => {
      if (data.joined) {
        setSession({
          pin,
          teamId: data.teamId,
          teamName: data.teamName,
          score: data.score || 0,
        });
        setJoining(false);
        router.push('/play/lobby');
      }
    });

    socket.on('join_error', (data: { message: string }) => {
      setError(data.message);
      setJoining(false);
    });

    return () => {
      socket.off('session_state');
      socket.off('join_error');
    };
  }, [socket, pin, router, setSession]);

  const handleJoin = () => {
    setError('');

    if (!pin || pin.length !== 6) {
      setError('Please enter a valid 6-digit PIN');
      return;
    }
    if (!teamName.trim()) {
      setError('Please enter a team name');
      return;
    }
    if (!socket || !isConnected) {
      setError('Connecting to server... please try again');
      return;
    }

    setJoining(true);
    socket.emit('join_session', { pin, teamName: teamName.trim() });
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-sm text-center"
      >
        <motion.h1
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="text-4xl font-bold mb-1"
        >
          MAX <span className="text-neon-cyan text-glow-cyan">SHOWDOWN</span>
        </motion.h1>
        <p className="text-foreground/50 text-sm mb-8">Enter the game PIN and your team name</p>

        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-neon-red/10 border border-neon-red/30 text-neon-red rounded-xl px-4 py-3 text-sm mb-4"
          >
            {error}
          </motion.div>
        )}

        <div className="space-y-4">
          <motion.input
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            type="text"
            inputMode="numeric"
            placeholder="Game PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full px-4 py-4 rounded-xl bg-surface neon-border text-neon-cyan text-center text-2xl font-mono tracking-[0.3em] placeholder:text-foreground/30 placeholder:tracking-normal placeholder:text-lg placeholder:font-sans focus:outline-none focus:border-neon-cyan transition-colors touch-manipulation"
            maxLength={6}
            autoFocus
          />
          <motion.input
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            type="text"
            placeholder="Team Name"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            className="w-full px-4 py-4 rounded-xl bg-surface neon-border text-foreground text-center text-lg placeholder:text-foreground/30 focus:outline-none focus:border-neon-cyan transition-colors touch-manipulation"
            maxLength={50}
          />
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Button
              onClick={handleJoin}
              disabled={joining || !pin || !teamName.trim()}
              className="w-full py-4 text-lg touch-manipulation"
            >
              {joining ? 'Joining...' : 'Join Game'}
            </Button>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-6 flex items-center justify-center gap-2"
        >
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-neon-green shadow-[0_0_6px_rgba(0,255,106,0.5)]' : 'bg-neon-red shadow-[0_0_6px_rgba(255,23,68,0.5)]'}`} />
          <span className="text-xs text-foreground/30">
            {isConnected ? 'Connected' : 'Connecting...'}
          </span>
        </motion.div>
      </motion.div>
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
