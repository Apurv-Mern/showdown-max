'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { usePlayerSession } from '../layout';
import { Button } from '@/components/shared/Button';

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
    if (!socket) return;

    socket.on('session_state', (data: any) => {
      if (data.joined) {
        const gs = data.gameState;
        if (gs?.currentRound) {
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
          sessionStorage.setItem(
            'questionActive',
            JSON.stringify({
              ...gs.currentQuestion,
              timerRemaining: gs.timerRemaining,
            }),
          );
        }

        setSession({
          pin,
          teamId: data.teamId,
          teamName: data.teamName,
          score: data.score || 0,
        });
        setJoining(false);
        if (gs?.state && gs.state !== 'LOBBY') {
          router.push('/play/game');
        } else {
          router.push('/play/lobby');
        }
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
    const cleanTeamName = sanitizeTeamName(teamName);

    if (!pin || pin.length !== 6) {
      setError('Please enter a valid 6-digit PIN');
      return;
    }
    if (!cleanTeamName) {
      setError('Please enter a team name');
      return;
    }
    if (!socket || !isConnected) {
      setError('Connecting to server... please try again');
      return;
    }

    setJoining(true);
    socket.emit('join_session', { pin, teamName: cleanTeamName });
  };

  return (
    <div className="flex-1 h-full min-h-0 w-full bg-[#050017]">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative h-full min-h-0 w-full overflow-hidden mobile-play-bg px-5 pt-22.5"
        style={{
          backgroundImage: "url('/Mobile_BG.png')",
          backgroundSize: '100% 100%',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {showSplash ? (
          <motion.div
            key="join-splash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative z-10 flex justify-center  h-full flex-col"
          >
            <div className="" />
            <img
              src="/logo.png"
              alt="Max Showdown logo"
              className="mx-auto w-[92%] max-w-82.5 drop-shadow-[0_0_18px_rgba(0,229,255,0.22)]"
            />
            <div className="px-1 pb-14 pt-5 text-center">
              <h1 className="text-[30px] font-black uppercase leading-none text-[#00d8ff]">
                LIVE TRIVIA EXPERIENCE
              </h1>
              <p className="mt-2 text-[27px] font-semibold leading-[1.15] text-white">
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
            className="relative z-10"
          >
            <motion.img
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              src="/logo.png"
              alt="Max Showdown logo"
              className="mx-auto w-[94%] max-w-85 drop-shadow-[0_0_18px_rgba(0,229,255,0.22)]"
            />

            <div className="mt-8 space-y-5 text-left">
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="rounded-xl border border-[#ff3d6f]/40 bg-[#ff3d6f]/10 px-4 py-2.5 text-sm text-[#ff6f94]"
                >
                  {error}
                </motion.div>
              )}

              <div>
                <label className="mb-2 block text-[20px] font-semibold leading-none text-white">
                  Enter Session PIN
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter Session PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="h-14 w-full rounded-[10px] border border-[#00d8ff]/70 bg-[rgba(10,18,40,0.92)] px-4 text-[17px] font-medium tracking-[0.06em] text-white placeholder:text-[#93a0b5] focus:outline-none focus:shadow-[0_0_14px_rgba(0,216,255,0.35)]"
                  maxLength={6}
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-2 block text-[20px] font-semibold leading-none text-white">
                  Enter your Team Name
                </label>
                <input
                  type="text"
                  placeholder="Enter Team Name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value.replace(/\s{2,}/g, ' '))}
                  className="h-14 w-full rounded-[10px] border border-[#00d8ff]/70 bg-[rgba(10,18,40,0.92)] px-4 text-[17px] font-medium text-white placeholder:text-[#93a0b5] focus:outline-none focus:shadow-[0_0_14px_rgba(0,216,255,0.35)]"
                  maxLength={50}
                />
              </div>

              <Button
                onClick={handleJoin}
                disabled={joining || !pin || !teamName.trim()}
                className="h-14 w-full rounded-[10px] border border-[#ff4d4d] bg-gradient-to-b from-[#ff001f] to-[#7f0010] text-[20px] font-bold uppercase tracking-[0.04em] text-white shadow-[0_4px_16px_rgba(255,0,31,0.32)] hover:brightness-110 disabled:opacity-45"
              >
                {joining ? 'Joining...' : 'JOIN GAME'}
              </Button>

              <div className="pt-1 flex items-center justify-center gap-2">
                <div
                  className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-[#00ff6a] shadow-[0_0_6px_rgba(0,255,106,0.6)]' : 'bg-[#ff1744] shadow-[0_0_6px_rgba(255,23,68,0.6)]'}`}
                />
                <span className="text-xs text-white/50">
                  {isConnected ? 'Connected' : 'Connecting...'}
                </span>
              </div>
            </div>
          </motion.div>
        )}
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
