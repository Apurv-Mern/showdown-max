'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { usePlayerSession } from '../layout';
import { cn } from '@/lib/utils';

type GamePhase = 'round_intro' | 'waiting' | 'question' | 'wager_input' | 'answered' | 'reveal' | 'scoreboard' | 'eliminated' | 'break' | 'game_end';

interface QuestionData {
  questionIndex: number;
  totalQuestions: number;
  question: {
    id: number;
    text: string;
    options: { text: string }[];
    mediaUrl?: string;
    mediaType?: string;
  };
  timerDuration: number;
  roundType: string;
  pointsForQuestion?: number;
}

interface RevealData {
  correctOptionIndex: number;
  correctText: string;
  scores: Record<string, number>;
  eliminations: number[];
  allWrong: boolean;
  teams: { teamId: number; teamName: string; score: number; isEliminated?: boolean }[];
}

const OPTION_BG: Record<number, string> = {
  0: 'bg-[#00c853]',
  1: 'bg-[#1565c0]',
  2: 'bg-[#1565c0]',
  3: 'bg-[#c62828]',
};

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const pageTransition = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.35, ease: 'easeOut' },
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.08 } },
};

const staggerItem = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1 },
};

function MobileTimerRing({ remaining, total }: { remaining: number; total: number }) {
  const size = 80;
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? remaining / total : 0;
  const offset = circumference * (1 - progress);

  const getColor = () => {
    if (remaining <= 5) return '#ff1744';
    if (remaining <= 10) return '#ffc400';
    if (progress > 0.5) return '#00ff6a';
    return '#ffc400';
  };

  return (
    <div className="timer-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle className="timer-ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={6} />
        <circle
          className="timer-ring-progress"
          cx={size / 2} cy={size / 2} r={radius} strokeWidth={6}
          stroke={getColor()}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 6px ${getColor()})` }}
        />
      </svg>
      <span className={cn(
        'text-2xl font-black font-mono',
        remaining <= 5 ? 'text-neon-red text-glow-red' : 'text-neon-cyan text-glow-cyan',
      )}>
        {remaining}
      </span>
    </div>
  );
}

export default function GamePage() {
  const router = useRouter();
  const { socket } = useSocket();
  const { session, setSession, clearSession } = usePlayerSession();

  const [phase, setPhase] = useState<GamePhase>('waiting');
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [roundInfo, setRoundInfo] = useState<{ round: any; roundIndex: number; totalRounds: number } | null>(null);
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const [timerDuration, setTimerDuration] = useState(30);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [wagerAmount, setWagerAmount] = useState(0);
  const [wagerSubmitted, setWagerSubmitted] = useState(false);
  const [revealData, setRevealData] = useState<RevealData | null>(null);
  const [pointsGained, setPointsGained] = useState<number | null>(null);
  const [scoreboard, setScoreboard] = useState<{ teamId: number; teamName: string; score: number }[]>([]);
  const [isEliminated, setIsEliminated] = useState(false);
  const [endCountdown, setEndCountdown] = useState(0);

  useEffect(() => {
    if (!session.pin || !session.teamId) {
      router.replace('/play/join');
    }
  }, [session, router]);

  useEffect(() => {
    const savedRoundIntro = sessionStorage.getItem('roundIntro');
    if (savedRoundIntro) {
      try {
        const data = JSON.parse(savedRoundIntro);
        setRoundInfo(data);
        setPhase('round_intro');
      } catch { /* ignore */ }
      sessionStorage.removeItem('roundIntro');
    }
    const savedQuestion = sessionStorage.getItem('questionActive');
    if (savedQuestion) {
      try {
        const data = JSON.parse(savedQuestion);
        setQuestion(data);
        setTimerDuration(data.timerDuration);
        setTimerRemaining(data.timerDuration);
        setPhase('question');
      } catch { /* ignore */ }
      sessionStorage.removeItem('questionActive');
    }
  }, []);

  useEffect(() => {
    if (!socket || !session.pin || !session.teamName) return;

    socket.on('session_state', (data: any) => {
      if (data.gameState) {
        const gs = data.gameState;
        if (gs.state === 'BREAK') {
          setPhase('break');
        } else if (gs.state === 'FINAL_RESULTS') {
          setPhase('game_end');
        }
      }
    });

    socket.on('round_intro', (data) => {
      setRoundInfo(data);
      setPhase('round_intro');
      setIsEliminated(false);
      setSelectedOption(null);
      setRevealData(null);
      setWagerSubmitted(false);
    });

    socket.on('question_active', (data: QuestionData) => {
      setQuestion(data);
      setTimerDuration(data.timerDuration);
      setTimerRemaining(data.timerDuration);
      setSelectedOption(null);
      setRevealData(null);
      setPointsGained(null);
      setWagerSubmitted(false);
      setWagerAmount(0);

      if (isEliminated) {
        setPhase('eliminated');
      } else if (data.roundType === 'WAGER' || data.roundType === 'FINAL_WAGER') {
        setPhase('wager_input');
      } else {
        setPhase('question');
      }
    });

    socket.on('timer_update', (data: { remaining: number }) => setTimerRemaining(data.remaining));
    socket.on('timer_expired', () => setTimerRemaining(0));

    socket.on('answer_reveal', (data: RevealData) => {
      setRevealData(data);
      setPhase('reveal');
      const teamIdStr = String(session.teamId);
      if (data.scores[teamIdStr] !== undefined) setPointsGained(data.scores[teamIdStr]);
      const myTeam = data.teams.find((t) => t.teamId === session.teamId);
      if (myTeam) setSession({ score: myTeam.score });
      if (data.eliminations.includes(session.teamId!)) setIsEliminated(true);
    });

    socket.on('player_eliminated', (data: { teamId: number }) => {
      if (data.teamId === session.teamId) setIsEliminated(true);
    });

    socket.on('scoreboard', (data: { teams: any[] }) => { setScoreboard(data.teams); setPhase('scoreboard'); });
    socket.on('round_end', () => setPhase('scoreboard'));
    socket.on('break_start', () => setPhase('break'));
    socket.on('break_end', () => setPhase('waiting'));
    socket.on('mini_game_start', () => router.push('/play/mini-game'));
    socket.on('game_end', (data: { teams: any[] }) => {
      setScoreboard(data.teams);
      setPhase('game_end');
      setEndCountdown(15);
      const countdownInterval = setInterval(() => {
        setEndCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            clearSession();
            router.replace('/play/join');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    });

    return () => {
      ['session_state', 'round_intro', 'question_active', 'timer_update', 'timer_expired', 'answer_reveal',
        'player_eliminated', 'scoreboard', 'round_end', 'break_start', 'break_end',
        'mini_game_start', 'game_end',
      ].forEach((e) => socket.off(e));
    };
  }, [socket, session.pin, session.teamName, session.teamId, isEliminated, router, setSession]);

  const handleSelectOption = useCallback((index: number) => {
    if (selectedOption !== null || !socket || isEliminated) return;
    setSelectedOption(index);
    setPhase('answered');
    socket.emit('submit_answer', {
      selectedOptionIndex: index,
      wagerAmount: wagerSubmitted ? wagerAmount : undefined,
    });
  }, [selectedOption, socket, isEliminated, wagerAmount, wagerSubmitted]);

  const handleSubmitWager = () => {
    setWagerSubmitted(true);
    setPhase('question');
  };

  const myRank = scoreboard.findIndex((t) => t.teamId === session.teamId) + 1;

  return (
    <div className="flex-1 flex flex-col min-h-0 sci-fi-bg">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between bg-surface/80 shrink-0">
        <div className="text-sm flex items-center gap-2">
          <button
            onClick={() => setShowExitConfirm(true)}
            className="text-foreground/30 hover:text-neon-red transition-colors text-xs"
            title="Leave game"
          >
            ✕
          </button>
          <span className="text-foreground/40">Team: </span>
          <span className="font-semibold text-neon-cyan">{session.teamName}</span>
        </div>
        <div className="text-sm font-mono font-bold text-neon-cyan text-glow-cyan">{session.score} pts</div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        <AnimatePresence mode="wait">
          {/* ── ROUND INTRO ── */}
          {phase === 'round_intro' && roundInfo && (
            <motion.div key="round_intro" {...pageTransition} className="flex-1 flex items-center justify-center p-6 text-center">
              <div>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
                  className="text-foreground/40 text-sm mb-2">
                  Round {(roundInfo.roundIndex || 0) + 1} of {roundInfo.totalRounds}
                </motion.p>
                <motion.h1 initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                  className="text-3xl font-bold mb-3 text-glow-cyan">
                  {roundInfo.round?.name}
                </motion.h1>
                <motion.span initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                  className="inline-block bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 px-3 py-1 rounded-lg text-sm">
                  {roundInfo.round?.type?.replace(/_/g, ' ')}
                </motion.span>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ delay: 0.6 }}
                  className="text-foreground/30 text-sm mt-6">
                  Get ready...
                </motion.p>
              </div>
            </motion.div>
          )}

          {/* ── WAITING ── */}
          {phase === 'waiting' && (
            <motion.div key="waiting" {...pageTransition} className="flex-1 flex items-center justify-center p-6 text-center">
              <div>
                <div className="w-12 h-12 border-4 border-neon-cyan border-t-transparent rounded-full animate-spin mx-auto mb-6 shadow-[0_0_15px_rgba(0,229,255,0.4)]" />
                <h2 className="text-xl font-bold mb-2">Waiting...</h2>
                <p className="text-foreground/40 text-sm">Next question coming up</p>
              </div>
            </motion.div>
          )}

          {/* ── WAGER INPUT ── */}
          {phase === 'wager_input' && question && (
            <motion.div key="wager" {...pageTransition} className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-full max-w-sm">
                <motion.h2 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  className="text-xl font-bold mb-2 text-glow-cyan">
                  Place Your Wager
                </motion.h2>
                <p className="text-foreground/40 text-sm mb-6">
                  {question.roundType === 'FINAL_WAGER'
                    ? `Wager 0–100% of your ${session.score} points`
                    : 'Wager 0–50 points'}
                </p>
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.15 }}
                  className="neon-border rounded-xl p-6 mb-4 bg-surface/80">
                  <input
                    type="range" min={0}
                    max={question.roundType === 'FINAL_WAGER' ? 100 : 50}
                    value={wagerAmount}
                    onChange={(e) => setWagerAmount(Number(e.target.value))}
                    className="w-full accent-primary h-3 touch-manipulation"
                  />
                  <p className="text-4xl font-mono font-bold text-neon-cyan text-glow-cyan mt-4">
                    {question.roundType === 'FINAL_WAGER'
                      ? `${wagerAmount}% (${Math.round((session.score * wagerAmount) / 100)} pts)`
                      : `${wagerAmount} pts`}
                  </p>
                </motion.div>
                <button onClick={handleSubmitWager}
                  className="w-full py-4 text-lg font-bold rounded-xl bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 hover:bg-neon-cyan/30 transition-colors touch-manipulation">
                  Lock Wager
                </button>
              </div>
            </motion.div>
          )}

          {/* ── QUESTION / ANSWERED ── */}
          {(phase === 'question' || phase === 'answered') && question && (
            <motion.div key="question" {...pageTransition} className="flex-1 flex flex-col p-4">
              {/* Timer + question number */}
              <div className="flex items-center justify-between mb-3 shrink-0">
                <MobileTimerRing remaining={timerRemaining} total={timerDuration} />
                <div className="text-right">
                  <p className="text-foreground/40 text-xs">
                    Q{(question.questionIndex || 0) + 1} / {question.totalQuestions}
                  </p>
                  {question.pointsForQuestion && (
                    <p className="text-neon-cyan text-xs font-bold">{question.pointsForQuestion} pts</p>
                  )}
                </div>
              </div>

              {/* Question text */}
              <div className="neon-border rounded-xl px-4 py-3 mb-3 bg-surface/60 text-center shrink-0">
                <h2 className="text-lg font-bold leading-snug">{question.question.text}</h2>
              </div>

              {/* Options - hexagonal style */}
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="flex-1 grid grid-cols-1 gap-2.5"
              >
                {question.question.options.map((opt, i) => {
                  const isSelected = selectedOption === i;
                  const isLocked = selectedOption !== null;

                  return (
                    <motion.button
                      key={i}
                      variants={staggerItem}
                      whileTap={!isLocked && !isEliminated ? { scale: 0.96 } : undefined}
                      onClick={() => handleSelectOption(i)}
                      disabled={isLocked || isEliminated}
                      className={cn(
                        'hex-option py-4 px-6 text-left text-white font-bold text-base',
                        'transition-all touch-manipulation select-none min-h-14',
                        OPTION_BG[i] || 'bg-[#1565c0]',
                        isSelected && 'ring-2 ring-white/60 shadow-[0_0_20px_rgba(255,255,255,0.3)] scale-[1.02]',
                        isLocked && !isSelected && 'opacity-30',
                        isEliminated && 'opacity-20 cursor-not-allowed',
                      )}
                    >
                      <span className="font-mono mr-3 opacity-80">{OPTION_LETTERS[i]}.</span>
                      {opt.text}
                    </motion.button>
                  );
                })}
              </motion.div>

              {phase === 'answered' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="text-center mt-3 shrink-0">
                  <p className="text-foreground/40 text-sm">Answer locked! Waiting for reveal...</p>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ── REVEAL ── */}
          {phase === 'reveal' && revealData && question && (
            <motion.div key="reveal" {...pageTransition} className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-full max-w-sm">
                {pointsGained !== null && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                    className={cn(
                      'text-5xl font-bold mb-4',
                      pointsGained > 0 ? 'text-neon-green text-glow-green' :
                        pointsGained < 0 ? 'text-neon-red text-glow-red' : 'text-foreground/50',
                    )}
                  >
                    {pointsGained > 0 ? '+' : ''}{pointsGained}
                  </motion.div>
                )}

                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                  className={cn(
                    'text-xl font-bold mb-2',
                    selectedOption === revealData.correctOptionIndex ? 'text-neon-green text-glow-green' : 'text-neon-red text-glow-red',
                  )}>
                  {selectedOption === null ? 'No answer submitted'
                    : selectedOption === revealData.correctOptionIndex ? 'Correct!' : 'Incorrect'}
                </motion.p>

                <p className="text-foreground/50 text-sm mb-6">
                  Answer: <span className="text-foreground font-medium">{revealData.correctText}</span>
                </p>

                {revealData.allWrong && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-neon-gold/10 border border-neon-gold/30 text-neon-gold rounded-xl px-4 py-3 text-sm mb-4">
                    Everyone got it wrong — no eliminations!
                  </motion.div>
                )}

                {isEliminated && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                    className="bg-neon-red/10 border border-neon-red/30 text-neon-red rounded-xl px-4 py-3 text-sm mb-4">
                    You&apos;ve been knocked out of this round. You&apos;ll be back next round!
                  </motion.div>
                )}

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                  className="neon-border rounded-xl p-4 bg-surface/80">
                  <p className="text-foreground/40 text-xs mb-1">Your Score</p>
                  <p className="text-2xl font-mono font-bold text-neon-cyan text-glow-cyan">{session.score}</p>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* ── ELIMINATED ── */}
          {phase === 'eliminated' && (
            <motion.div key="eliminated" {...pageTransition} className="flex-1 flex items-center justify-center p-6 text-center">
              <div>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}
                  className="text-5xl mb-4">💀</motion.div>
                <h2 className="text-2xl font-bold text-neon-red text-glow-red mb-2">Knocked Out!</h2>
                <p className="text-foreground/50 text-sm max-w-xs">
                  You&apos;ve been eliminated for this round. You&apos;ll be back when the next round starts.
                </p>
                <div className="neon-border rounded-xl p-4 mt-6 bg-surface/80">
                  <p className="text-foreground/40 text-xs mb-1">Your Score</p>
                  <p className="text-2xl font-mono font-bold text-neon-cyan text-glow-cyan">{session.score}</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── SCOREBOARD ── */}
          {phase === 'scoreboard' && (
            <motion.div key="scoreboard" {...pageTransition} className="flex-1 flex flex-col p-4">
              <h2 className="text-xl font-bold text-center mb-4 text-glow-cyan">Scoreboard</h2>
              <motion.div variants={staggerContainer} initial="initial" animate="animate"
                className="flex-1 space-y-2 overflow-y-auto">
                {scoreboard.map((team, idx) => {
                  const isMe = team.teamId === session.teamId;
                  return (
                    <motion.div key={team.teamId} variants={staggerItem}
                      className={cn(
                        'flex items-center justify-between px-4 py-3 rounded-xl border',
                        isMe ? 'bg-neon-cyan/10 border-neon-cyan/30 shadow-[0_0_10px_rgba(0,229,255,0.15)]' : 'bg-surface/80 border-border/50',
                      )}>
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
                          idx === 0 ? 'bg-neon-gold/20 text-neon-gold' : 'bg-surface-light text-foreground/40',
                        )}>
                          {idx + 1}
                        </span>
                        <span className={cn('font-medium', isMe && 'text-neon-cyan')}>
                          {team.teamName} {isMe && '(You)'}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-neon-cyan">{team.score}</span>
                    </motion.div>
                  );
                })}
              </motion.div>
              {myRank > 0 && (
                <p className="text-center text-foreground/40 text-sm mt-4 shrink-0">
                  You are in <span className="font-bold text-neon-cyan">{myRank}{myRank === 1 ? 'st' : myRank === 2 ? 'nd' : myRank === 3 ? 'rd' : 'th'}</span> place
                </p>
              )}
            </motion.div>
          )}

          {/* ── BREAK ── */}
          {phase === 'break' && (
            <motion.div key="break" {...pageTransition} className="flex-1 flex items-center justify-center p-6 text-center">
              <div>
                <motion.div animate={{ rotate: [0, -10, 10, -5, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3 }}
                  className="text-5xl mb-4">☕</motion.div>
                <h2 className="text-2xl font-bold mb-2 text-glow-cyan">Break Time</h2>
                <p className="text-foreground/50 text-sm">Take a breather. The host will resume shortly.</p>
                <div className="neon-border rounded-xl p-4 mt-6 bg-surface/80">
                  <p className="text-foreground/40 text-xs mb-1">Your Score</p>
                  <p className="text-2xl font-mono font-bold text-neon-cyan text-glow-cyan">{session.score}</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── GAME END ── */}
          {phase === 'game_end' && (
            <motion.div key="game_end" {...pageTransition} className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-full max-w-sm">
                <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
                  className="text-5xl mb-4">🏆</motion.div>
                <motion.h2 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                  className="text-3xl font-bold mb-2 text-glow-cyan">Game Over!</motion.h2>
                {myRank === 1 && (
                  <motion.p initial={{ opacity: 0, scale: 1.5 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-neon-gold text-glow-gold text-lg font-bold mb-4">You Won! 🎉</motion.p>
                )}
                {myRank > 1 && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                    className="text-foreground/50 mb-4">
                    You finished in <span className="font-bold text-neon-cyan">{myRank}{myRank === 2 ? 'nd' : myRank === 3 ? 'rd' : 'th'}</span> place
                  </motion.p>
                )}
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                  className="neon-border rounded-xl p-5 mb-6 bg-surface/80">
                  <p className="text-foreground/40 text-xs mb-1">Final Score</p>
                  <p className="text-4xl font-mono font-bold text-neon-cyan text-glow-cyan">{session.score}</p>
                </motion.div>
                <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-2 mb-6">
                  {scoreboard.slice(0, 5).map((team, idx) => (
                    <motion.div key={team.teamId} variants={staggerItem}
                      className={cn(
                        'flex items-center justify-between px-4 py-2 rounded-lg',
                        team.teamId === session.teamId ? 'bg-neon-cyan/10 border border-neon-cyan/30' : 'bg-surface/80',
                      )}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground/40">{idx + 1}</span>
                        <span className="text-sm font-medium">{team.teamName}</span>
                      </div>
                      <span className="font-mono text-sm font-bold text-neon-cyan">{team.score}</span>
                    </motion.div>
                  ))}
                </motion.div>
                <button onClick={() => { clearSession(); router.push('/play/join'); }}
                  className="w-full py-3 rounded-xl bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 font-bold hover:bg-neon-cyan/30 transition-colors touch-manipulation">
                  Play Again
                </button>
                {endCountdown > 0 && (
                  <p className="text-foreground/30 text-xs mt-3">
                    Redirecting in {endCountdown}s...
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Exit confirmation */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="neon-border bg-surface rounded-2xl p-6 max-w-xs w-full text-center">
            <h3 className="text-lg font-bold mb-2">Leave Game?</h3>
            <p className="text-foreground/50 text-sm mb-6">
              You will be removed from the active game. You can rejoin with the same team name.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowExitConfirm(false)}
                className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-surface-light transition-colors">
                Stay
              </button>
              <button onClick={() => { socket?.emit('leave_session'); clearSession(); router.replace('/play/join'); }}
                className="flex-1 py-2.5 rounded-lg bg-neon-red/20 text-neon-red border border-neon-red/40 text-sm font-medium hover:bg-neon-red/30 transition-colors">
                Leave
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
