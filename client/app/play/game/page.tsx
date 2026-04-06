'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { useAudio } from '@/hooks/useAudio';
import { usePlayerSession } from '../layout';
import { cn } from '@/lib/utils';
import { PUBLIC_API_URL } from '@/lib/env';

const API_URL = PUBLIC_API_URL;

type GamePhase =
  | 'round_intro'
  | 'waiting'
  | 'question'
  | 'wager_input'
  | 'answered'
  | 'reveal'
  | 'scoreboard'
  | 'eliminated'
  | 'break'
  | 'game_end';

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
  lockedWagerAmount?: number | null;
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
  0: 'bg-[#11a7ff]', // A - blue
  1: 'bg-[#ff8a1f]', // B - orange
  2: 'bg-[#2bc62b]', // C - green
  3: 'bg-[#ffd319]', // D - yellow
  4: 'bg-[#8f2bff]', // E - purple
  5: 'bg-[#ff103b]', // F - red
};

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const resolveMediaUrl = (mediaUrl?: string) => {
  if (!mediaUrl) return '';
  const normalized = mediaUrl.replace(/\\/g, '/').trim();
  if (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:')
  ) {
    return normalized;
  }
  if (normalized.startsWith('/')) {
    return `${API_URL}${normalized}`;
  }
  return `${API_URL}/${normalized}`;
};

const isImageMedia = (mediaType?: string, mediaUrl?: string) => {
  const type = (mediaType || '').toLowerCase();
  if (type.includes('image')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(mediaUrl || '');
};

function QuestionImage({ mediaUrl }: { mediaUrl: string }) {
  const candidates = useMemo(() => {
    const normalized = (mediaUrl || '').replace(/\\/g, '/').trim();
    if (!normalized) return [];
    const resolved = resolveMediaUrl(normalized);
    const out = [resolved];
    if (
      !normalized.startsWith('http://') &&
      !normalized.startsWith('https://') &&
      !normalized.startsWith('data:') &&
      !normalized.startsWith('blob:')
    ) {
      out.push(normalized.startsWith('/') ? normalized : `/${normalized}`);
    }
    return Array.from(new Set(out));
  }, [mediaUrl]);
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [mediaUrl]);

  if (!candidates.length) return null;

  return (
    <img
      src={candidates[index]}
      alt="Question media"
      className="w-full rounded-xl border border-[#11a7ff] object-cover max-h-[190px]"
      onError={() => {
        setIndex((prev) => (prev + 1 < candidates.length ? prev + 1 : prev));
      }}
    />
  );
}

const pageTransition = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.35, ease: 'easeOut' as const },
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.08 } },
};

const staggerItem = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1 },
};

const getRoundScoringLines = (roundType?: string) => {
  const type = (roundType || '').toUpperCase();
  if (type === 'WAGER') {
    return {
      positive: '+0 to +50 points for correct answers',
      negative: '-0 to -50 points for incorrect answers',
    };
  }
  if (type === 'MAJORITY_RULES') {
    return {
      positive: '+50 points for majority answers',
      negative: '-50 points for minority answers',
    };
  }
  if (type === 'FINAL_WAGER') {
    return { positive: '+wagered percentage of score', negative: '-wagered percentage of score' };
  }
  return {
    positive: '+10 points for correct answers',
    negative: '-2 points for incorrect answers',
  };
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
        <circle
          className="timer-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={6}
        />
        <circle
          className="timer-ring-progress"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={6}
          stroke={getColor()}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 6px ${getColor()})` }}
        />
      </svg>
      <span
        className={cn(
          'text-2xl font-black font-mono',
          remaining <= 5 ? 'text-neon-red text-glow-red' : 'text-neon-cyan text-glow-cyan',
        )}
      >
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
  const [roundInfo, setRoundInfo] = useState<{
    round: any;
    roundIndex: number;
    totalRounds: number;
  } | null>(null);
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const [timerDuration, setTimerDuration] = useState(30);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [wagerAmount, setWagerAmount] = useState(0);
  const [wagerSubmitted, setWagerSubmitted] = useState(false);
  const [revealData, setRevealData] = useState<RevealData | null>(null);
  const [pointsGained, setPointsGained] = useState<number | null>(null);
  const [scoreboard, setScoreboard] = useState<
    { teamId: number; teamName: string; score: number }[]
  >([]);
  const [isEliminated, setIsEliminated] = useState(false);
  const [endCountdown, setEndCountdown] = useState(0);
  const [breakDuration, setBreakDuration] = useState(300);
  const [breakRemaining, setBreakRemaining] = useState(300);
  const [isPlayerMp3Playing, setIsPlayerMp3Playing] = useState(false);
  const questionMediaUrlRef = useRef<string | undefined>(undefined);
  const {
    play: playMp3,
    stop: stopMp3,
    setSource: setMp3Source,
  } = useAudio({
    loop: false,
    volume: 0.75,
  });

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
      } catch {
        /* ignore */
      }
      sessionStorage.removeItem('roundIntro');
    }
    const savedQuestion = sessionStorage.getItem('questionActive');
    if (savedQuestion) {
      try {
        const data = JSON.parse(savedQuestion);
        setQuestion(data);
        setTimerDuration(data.timerDuration || 30);
        setTimerRemaining(data.timerRemaining ?? data.timerDuration ?? 0);
        setPhase('question');
      } catch {
        /* ignore */
      }
      sessionStorage.removeItem('questionActive');
    }
  }, []);

  useEffect(() => {
    questionMediaUrlRef.current = question?.question?.mediaUrl;
    if (!question?.question?.mediaUrl) return;
    const mediaType = (question.question.mediaType || '').toLowerCase();
    if (mediaType === 'mp3') {
      setMp3Source(resolveMediaUrl(question.question.mediaUrl));
    }
  }, [question?.question?.mediaUrl, question?.question?.mediaType, setMp3Source]);

  useEffect(() => {
    if (phase !== 'break') return;
    setBreakRemaining((prev) => (prev > breakDuration ? breakDuration : prev));
    const t = setInterval(() => {
      setBreakRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [phase, breakDuration]);

  useEffect(() => {
    if (!socket || !session.pin || !session.teamName) return;

    socket.on('session_state', (data: any) => {
      if (data.gameState) {
        const gs = data.gameState;
        const myTeam = session.teamId ? gs.teams?.[session.teamId] : null;
        const currentlyEliminated = Boolean(myTeam?.isEliminated);
        if (myTeam?.score !== undefined) {
          setSession({ score: myTeam.score });
        }
        setIsEliminated(currentlyEliminated);

        if (gs.activeMiniGame) {
          router.push(`/play/mini-game?game=${gs.activeMiniGame}`);
          return;
        }

        if (gs.state === 'ROUND_INTRO' && gs.currentRound) {
          setRoundInfo({
            round: gs.currentRound,
            roundIndex: gs.currentRoundIndex || 0,
            totalRounds: gs.totalRounds || 0,
          });
          setPhase('round_intro');
          return;
        }

        if (gs.state === 'QUESTION' && gs.currentQuestion) {
          setQuestion(gs.currentQuestion);
          setTimerDuration(gs.currentQuestion.timerDuration || 30);
          setTimerRemaining(gs.timerRemaining ?? gs.currentQuestion.timerDuration ?? 0);
          setSelectedOption(null);
          setRevealData(null);
          setPointsGained(null);

          const lockedWagerAmount = gs.currentQuestion.lockedWagerAmount;
          const hasLockedWager = lockedWagerAmount !== null && lockedWagerAmount !== undefined;
          if (gs.currentQuestion.roundType === 'WAGER') {
            if (hasLockedWager) {
              setWagerAmount(Number(lockedWagerAmount));
              setWagerSubmitted(true);
            }
          } else {
            setWagerSubmitted(false);
            setWagerAmount(0);
          }

          if (currentlyEliminated) {
            setPhase('eliminated');
          } else if (gs.questionState === 'ACTIVE') {
            if (gs.currentQuestion.roundType === 'WAGER') {
              setPhase(hasLockedWager || wagerSubmitted ? 'question' : 'wager_input');
            } else if (gs.currentQuestion.roundType === 'FINAL_WAGER') {
              setPhase('wager_input');
            } else {
              setPhase('question');
            }
          } else {
            setPhase('waiting');
          }
          return;
        }

        if (gs.state === 'SCOREBOARD' && gs.teams) {
          const sorted = Object.values(gs.teams)
            .sort((a: any, b: any) => Number(b.score || 0) - Number(a.score || 0))
            .map((team: any) => ({
              teamId: Number(team.teamId),
              teamName: String(team.teamName || ''),
              score: Number(team.score || 0),
            }));
          setScoreboard(sorted);
          setPhase('scoreboard');
          return;
        }

        if (gs.state === 'BREAK') {
          const duration = Number(gs.breakRemaining ?? gs.breakDuration ?? 300);
          setBreakDuration(duration > 0 ? duration : 300);
          setBreakRemaining(duration > 0 ? duration : 300);
          setPhase('break');
        } else if (gs.state === 'FINAL_RESULTS') {
          setPhase('game_end');
        } else if (gs.state === 'LOBBY') {
          setPhase('waiting');
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
      setWagerAmount(0);
      setIsPlayerMp3Playing(false);
      stopMp3();
    });

    socket.on('question_active', (data: QuestionData) => {
      setQuestion(data);
      setTimerDuration(data.timerDuration);
      setTimerRemaining(data.timerDuration);
      setSelectedOption(null);
      setRevealData(null);
      setPointsGained(null);

      if (isEliminated) {
        setPhase('eliminated');
      } else if (data.roundType === 'WAGER') {
        const hasLockedWager =
          data.lockedWagerAmount !== null && data.lockedWagerAmount !== undefined;
        if (hasLockedWager) {
          setWagerAmount(Number(data.lockedWagerAmount));
          setWagerSubmitted(true);
          setPhase('question');
        } else if (wagerSubmitted) {
          setPhase('question');
        } else {
          setPhase('wager_input');
        }
      } else if (data.roundType === 'FINAL_WAGER') {
        setWagerSubmitted(false);
        setWagerAmount(0);
        setPhase('wager_input');
      } else {
        setWagerSubmitted(false);
        setWagerAmount(0);
        setPhase('question');
      }
      setIsPlayerMp3Playing(false);
      stopMp3();
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

    socket.on('scoreboard', (data: { teams: any[] }) => {
      setScoreboard(data.teams);
      setPhase('scoreboard');
      setIsPlayerMp3Playing(false);
      stopMp3();
    });
    socket.on('round_end', () => {
      setPhase('scoreboard');
      setIsPlayerMp3Playing(false);
      stopMp3();
    });
    socket.on('break_start', (data: { duration?: number }) => {
      const duration = Number(data?.duration ?? 300);
      setBreakDuration(duration > 0 ? duration : 300);
      setBreakRemaining(duration > 0 ? duration : 300);
      setPhase('break');
    });
    socket.on('break_end', () => setPhase('waiting'));
    socket.on('mini_game_start', (data: { game: string }) => {
      router.push(`/play/mini-game?game=${data.game}`);
    });
    socket.on('music_control', (data: { action: 'play' | 'pause' | 'stop'; mediaUrl?: string }) => {
      const action = data?.action;
      if (!action) return;

      if (action === 'play') {
        const mediaUrl = data?.mediaUrl || questionMediaUrlRef.current;
        if (mediaUrl) {
          setMp3Source(resolveMediaUrl(mediaUrl));
        }
        playMp3();
        setIsPlayerMp3Playing(true);
        return;
      }

      stopMp3();
      setIsPlayerMp3Playing(false);
    });
    socket.on('game_end', () => {
      stopMp3();
      setIsPlayerMp3Playing(false);
      clearSession();
      router.replace('/play/join');
    });

    return () => {
      [
        'session_state',
        'round_intro',
        'question_active',
        'timer_update',
        'timer_expired',
        'answer_reveal',
        'player_eliminated',
        'scoreboard',
        'round_end',
        'break_start',
        'break_end',
        'mini_game_start',
        'music_control',
        'game_end',
      ].forEach((e) => socket.off(e));
    };
  }, [
    socket,
    session.pin,
    session.teamName,
    session.teamId,
    isEliminated,
    wagerSubmitted,
    playMp3,
    setMp3Source,
    stopMp3,
    router,
    setSession,
    clearSession,
  ]);

  const handleSelectOption = useCallback(
    (index: number) => {
      if (selectedOption !== null || !socket || isEliminated) return;
      setSelectedOption(index);
      setPhase('answered');
      socket.emit('submit_answer', {
        selectedOptionIndex: index,
        wagerAmount: wagerSubmitted ? wagerAmount : undefined,
      });
    },
    [selectedOption, socket, isEliminated, wagerAmount, wagerSubmitted],
  );

  const handleSubmitWager = () => {
    if (!socket) return;
    socket.emit('submit_wager', { amount: wagerAmount });
    setWagerSubmitted(true);
    setPhase('question');
  };

  const myRank = scoreboard.findIndex((t) => t.teamId === session.teamId) + 1;
  const showCompactHeader = !['waiting', 'break'].includes(phase);
  const breakProgress =
    breakDuration > 0 ? Math.max(0, Math.min(1, breakRemaining / breakDuration)) : 0;
  const breakRadius = 134;
  const breakCircumference = 2 * Math.PI * breakRadius;
  const breakOffset = breakCircumference * (1 - breakProgress);
  const breakMinutes = Math.floor(breakRemaining / 60);
  const breakSeconds = breakRemaining % 60;

  return (
    <div className="flex-1 h-full min-h-0 flex justify-center bg-[#050017]">
      <div
        className="relative flex flex-col min-h-0 h-full w-full max-w-[390px] overflow-hidden border-2 border-[#06c6ff] mobile-play-bg"
        style={{
          backgroundImage: "url('/Mobile_BG.png')",
          backgroundSize: '100% 100%',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Header */}
        {showCompactHeader && (
          <div className="absolute left-0 right-0 top-0 z-20 px-4 py-2.5 border-b border-border/50 flex items-center justify-between bg-surface/80/90 backdrop-blur-sm">
            <div className="text-sm flex items-center gap-2">
              <button
                onClick={() => setShowExitConfirm(true)}
                className="text-foreground/30 hover:text-neon-red transition-colors text-xs"
                title="Leave game"
              >
                x
              </button>
              <span className="text-foreground/40">Team: </span>
              <span className="font-semibold text-neon-cyan">{session.teamName}</span>
            </div>
            <div className="text-sm font-mono font-bold text-neon-cyan text-glow-cyan">
              {session.score} pts
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <AnimatePresence mode="wait">
            {/* ── ROUND INTRO ── */}
            {phase === 'round_intro' && roundInfo && (
              <motion.div
                key="round_intro"
                {...pageTransition}
                className="flex-1 flex items-center justify-center p-4"
              >
                <div className="w-full max-w-[390px] rounded-xl border-2 border-[#06c6ff] bg-[rgba(8,8,30,0.55)] p-3 text-center shadow-[0_0_20px_rgba(0,216,255,0.25)]">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15 }}
                    className="relative mx-auto h-[270px] w-[270px]"
                  >
                    <div className="absolute inset-0 rounded-full border-[7px] border-[#ffd44d] shadow-[0_0_18px_rgba(255,196,0,0.45),inset_0_0_16px_rgba(255,163,0,0.4)]" />
                    {Array.from({ length: 10 }).map((_, i) => (
                      <span
                        key={i}
                        className="absolute left-1/2 top-1/2 h-4 w-4 rounded-full bg-[#ffe887] shadow-[0_0_10px_rgba(255,220,90,0.9)]"
                        style={{
                          transform: `translate(-50%,-50%) rotate(${i * 36}deg) translateY(-126px)`,
                        }}
                      />
                    ))}
                    <div className="absolute inset-[18px] rounded-full border border-[#ffb300] bg-[radial-gradient(circle_at_50%_35%,#7434e3_0%,#3b118f_56%,#22044e_100%)]">
                      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(145,105,255,0.23)_0_2px,transparent_2px)] [background-size:12px_12px] opacity-55" />
                      <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
                        <p className="text-[44px] font-extrabold uppercase leading-none tracking-[0.02em] text-white">
                          ROUND {(roundInfo.roundIndex || 0) + 1}
                        </p>
                        <p className="mt-2 text-[28px] font-bold leading-[1.05] text-[#00d8ff]">
                          {roundInfo.round?.name ||
                            roundInfo.round?.type?.replace(/_/g, ' ') ||
                            'Trivia Round'}
                        </p>
                      </div>
                    </div>
                    <div className="absolute bottom-[8px] left-1/2 flex -translate-x-1/2 items-center gap-4">
                      <span className="text-[34px] text-[#ffca2c] drop-shadow-[0_0_8px_rgba(255,200,30,0.8)]">
                        ★
                      </span>
                      <span className="text-[52px] text-[#ffca2c] drop-shadow-[0_0_10px_rgba(255,200,30,0.9)]">
                        ★
                      </span>
                      <span className="text-[34px] text-[#ffca2c] drop-shadow-[0_0_8px_rgba(255,200,30,0.8)]">
                        ★
                      </span>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 }}
                    className="mx-auto mt-2 max-w-[360px] rounded-xl border-2 border-[#00cfff] bg-[linear-gradient(180deg,#201066_0%,#31107f_55%,#240a64_100%)] px-4 py-3 text-left shadow-[0_0_14px_rgba(0,216,255,0.32),inset_0_0_14px_rgba(0,216,255,0.16)]"
                  >
                    <p className="text-[27px] font-bold text-[#00ff4a]">
                      ⚡ {getRoundScoringLines(roundInfo.round?.type).positive}
                    </p>
                    <p className="mt-2 text-[27px] font-bold text-[#ff0037]">
                      ⚡ {getRoundScoringLines(roundInfo.round?.type).negative}
                    </p>
                  </motion.div>
                </div>
              </motion.div>
            )}

            {/* ── WAITING ── */}
            {/* Waiting */}
            {phase === 'waiting' && (
              <motion.div
                key="waiting"
                {...pageTransition}
                className="flex-1 relative overflow-hidden mobile-play-bg"
              >
                <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_22%_16%,rgba(145,105,255,0.36)_0_4px,transparent_4px)] [background-size:110px_110px]" />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[280px] h-[170px] opacity-55 bg-[radial-gradient(circle,rgba(0,229,255,0.26)_0_2px,transparent_2px)] [background-size:14px_14px]" />

                <div className="relative z-10 h-full flex items-center justify-center p-4">
                  <div className="w-full max-w-[420px] border-2 border-[#00d8ff] bg-[linear-gradient(180deg,rgba(45,13,121,0.72)_0%,rgba(15,8,66,0.82)_100%)] px-6 py-8 text-center shadow-[0_0_26px_rgba(0,216,255,0.24)]">
                    <div className="mx-auto mb-6 flex h-[84px] w-[84px] items-center justify-center rounded-full border-2 border-[#00d8ff] bg-[rgba(5,14,34,0.75)] shadow-[0_0_18px_rgba(0,216,255,0.35)]">
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"
                          stroke="#00d8ff"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <circle cx="9.5" cy="7" r="3" stroke="#00d8ff" strokeWidth="2" />
                        <path
                          d="M22 21v-2a4 4 0 0 0-3-3.87"
                          stroke="#00d8ff"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M16 3.13a4 4 0 0 1 0 7.75"
                          stroke="#00d8ff"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>

                    <h2 className="text-[54px] leading-[0.95] font-extrabold text-white">
                      Waiting for game
                      <br />
                      to start
                    </h2>
                    <p className="mt-3 text-[22px] leading-tight text-white/70">
                      The host will start the game shortly
                    </p>

                    <button
                      onClick={() => setShowExitConfirm(true)}
                      className="mt-5 text-[#ff4f61] text-[19px] font-medium"
                    >
                      Leave Game
                    </button>

                    <div className="mt-3 flex items-center justify-center gap-2">
                      <span className="h-3.5 w-3.5 rounded-full bg-[#00d8ff] shadow-[0_0_9px_rgba(0,216,255,0.6)]" />
                      <span className="h-3.5 w-3.5 rounded-full bg-[#00d8ff]/65 shadow-[0_0_8px_rgba(0,216,255,0.45)]" />
                      <span className="h-3.5 w-3.5 rounded-full bg-[#00d8ff]/30" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
            {/* ── WAGER INPUT ── */}
            {phase === 'wager_input' && question && (
              <motion.div
                key="wager"
                {...pageTransition}
                className="flex-1 flex flex-col items-center justify-center p-6 text-center"
              >
                <div className="w-full max-w-sm">
                  <motion.h2
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xl font-bold mb-2 text-glow-cyan"
                  >
                    Place Your Wager
                  </motion.h2>
                  <p className="text-foreground/40 text-sm mb-6">
                    {question.roundType === 'FINAL_WAGER'
                      ? `Wager 0–100% of your ${session.score} points`
                      : 'Wager 0–50 points'}
                  </p>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15 }}
                    className="neon-border rounded-xl p-6 mb-4 bg-surface/80"
                  >
                    <input
                      type="range"
                      min={0}
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
                  <button
                    onClick={handleSubmitWager}
                    className="w-full py-4 text-lg font-bold rounded-xl bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 hover:bg-neon-cyan/30 transition-colors touch-manipulation"
                  >
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
                    {question.roundType === 'WAGER' && wagerSubmitted && (
                      <p className="text-amber-300 text-xs font-bold">
                        Wager Locked: {wagerAmount} pts
                      </p>
                    )}
                    {question.pointsForQuestion && (
                      <p className="text-neon-cyan text-xs font-bold">
                        {question.pointsForQuestion} pts
                      </p>
                    )}
                  </div>
                </div>

                {isImageMedia(question.question.mediaType, question.question.mediaUrl) &&
                question.question.mediaUrl ? (
                  <div className="mb-3 shrink-0">
                    <QuestionImage mediaUrl={question.question.mediaUrl} />
                    <div className="mt-3 neon-border rounded-xl px-4 py-3 bg-surface/60 text-center">
                      <h2 className="text-lg font-bold leading-snug">{question.question.text}</h2>
                    </div>
                  </div>
                ) : (question.question.mediaType || '').toLowerCase() === 'mp4' &&
                  question.question.mediaUrl ? (
                  <div className="mb-3 shrink-0">
                    <video
                      src={resolveMediaUrl(question.question.mediaUrl)}
                      className="w-full rounded-xl border border-[#11a7ff] object-cover max-h-[190px]"
                      controls
                    />
                    <div className="mt-3 neon-border rounded-xl px-4 py-3 bg-surface/60 text-center">
                      <h2 className="text-lg font-bold leading-snug">{question.question.text}</h2>
                    </div>
                  </div>
                ) : (question.question.mediaType || '').toLowerCase() === 'mp3' ||
                  question.roundType === 'MUSIC' ? (
                  <div className="mb-3 shrink-0">
                    <img
                      src="/musicbg.png"
                      alt="Music round placeholder"
                      className="w-full rounded-xl border border-[#11a7ff] object-cover max-h-[190px]"
                    />
                    <p className="mt-2 text-center text-white font-semibold">
                      {isPlayerMp3Playing
                        ? 'Audio is playing on Venue Screen'
                        : 'Waiting for host to play music'}
                    </p>
                    <div className="mt-3 neon-border rounded-xl px-4 py-3 bg-surface/60 text-center">
                      <h2 className="text-lg font-bold leading-snug">{question.question.text}</h2>
                    </div>
                  </div>
                ) : (
                  <div className="mb-3 shrink-0">
                    <h2 className="text-[30px] leading-[1.08] font-extrabold text-white tracking-[-0.01em]">
                      {question.question.text}
                    </h2>
                  </div>
                )}

                {/* Options - hexagonal style */}
                <motion.div
                  variants={staggerContainer}
                  initial="initial"
                  animate="animate"
                  className="flex-1 grid grid-cols-2 gap-3"
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
                          'rounded-lg py-4 px-4 text-center text-white font-bold text-base shadow-[inset_0_0_10px_rgba(255,255,255,0.15)]',
                          'transition-all touch-manipulation select-none min-h-14',
                          OPTION_BG[i] || 'bg-[#1565c0]',
                          isSelected &&
                            'ring-2 ring-white/60 shadow-[0_0_20px_rgba(255,255,255,0.3)] scale-[1.02]',
                          isLocked && !isSelected && 'opacity-30',
                          isEliminated && 'opacity-20 cursor-not-allowed',
                        )}
                      >
                        <span className="font-mono opacity-90">
                          {OPTION_LETTERS[i]}. {opt.text}
                        </span>
                      </motion.button>
                    );
                  })}
                </motion.div>

                {phase === 'answered' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mt-3 shrink-0"
                  >
                    <p className="text-white text-[28px] font-extrabold leading-none drop-shadow-[0_0_8px_rgba(255,255,255,0.35)]">
                      Answer Submitted !!
                    </p>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* ── REVEAL ── */}
            {phase === 'reveal' && revealData && question && (
              <motion.div key="reveal" {...pageTransition} className="flex-1 flex flex-col p-4">
                <div className="flex items-center justify-between mb-3 shrink-0 gap-2">
                  <div className="min-w-[120px] rounded-full border border-[#ff2b68] bg-[linear-gradient(180deg,#f22d63_0%,#b20b68_100%)] px-3 py-1.5 shadow-[0_0_12px_rgba(255,25,93,0.35)]">
                    <p className="text-center font-extrabold text-white text-xl leading-none">00</p>
                  </div>
                  <div className="min-w-[120px] rounded-full border border-[#ff2b68] bg-[linear-gradient(180deg,#f22d63_0%,#b20b68_100%)] px-3 py-1.5 shadow-[0_0_12px_rgba(255,25,93,0.35)]">
                    <p className="text-center font-extrabold text-white text-xl leading-none">
                      {session.score}
                    </p>
                  </div>
                </div>

                <div className="text-white/95 font-semibold text-base mb-2 shrink-0">
                  Question {(question.questionIndex || 0) + 1}/{question.totalQuestions}
                </div>

                {isImageMedia(question.question.mediaType, question.question.mediaUrl) &&
                  question.question.mediaUrl && (
                    <div className="mb-3 shrink-0">
                      <QuestionImage mediaUrl={question.question.mediaUrl} />
                    </div>
                  )}
                {((question.question.mediaType || '').toLowerCase() === 'mp3' ||
                  question.roundType === 'MUSIC') && (
                  <div className="mb-3 shrink-0">
                    <img
                      src="/musicbg.png"
                      alt="Music round placeholder"
                      className="w-full rounded-xl border border-[#11a7ff] object-cover max-h-[190px]"
                    />
                  </div>
                )}

                <div className="neon-border rounded-xl px-4 py-3 mb-3 bg-surface/60 text-center shrink-0">
                  <h2 className="text-lg font-bold leading-snug">{question.question.text}</h2>
                </div>

                <motion.div
                  variants={staggerContainer}
                  initial="initial"
                  animate="animate"
                  className="flex-1 grid grid-cols-2 gap-3"
                >
                  {question.question.options.map((opt, i) => {
                    const isCorrectOption = i === revealData.correctOptionIndex;
                    const isSelectedOption = selectedOption === i;
                    const isSelectedWrong = isSelectedOption && !isCorrectOption;
                    const shouldDim =
                      selectedOption !== null && !isCorrectOption && !isSelectedWrong;

                    return (
                      <motion.div
                        key={i}
                        variants={staggerItem}
                        className={cn(
                          'rounded-lg py-4 px-4 text-center text-white font-bold text-base shadow-[inset_0_0_10px_rgba(255,255,255,0.15)]',
                          'transition-all select-none min-h-14',
                          OPTION_BG[i] || 'bg-[#1565c0]',
                          isCorrectOption &&
                            'ring-2 ring-[#00ff50] shadow-[0_0_16px_rgba(0,255,92,0.7)]',
                          isSelectedWrong &&
                            'ring-2 ring-[#ff2b2b] shadow-[0_0_16px_rgba(255,27,27,0.7)]',
                          shouldDim && 'opacity-35',
                        )}
                      >
                        <span className="font-mono opacity-95">
                          {OPTION_LETTERS[i]}. {opt.text}
                        </span>
                      </motion.div>
                    );
                  })}
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mt-4 mb-1 text-center shrink-0"
                >
                  <p
                    className={cn(
                      'text-[28px] font-extrabold leading-none',
                      selectedOption !== null && selectedOption === revealData.correctOptionIndex
                        ? 'text-[#53ff57] drop-shadow-[0_0_8px_rgba(67,255,89,0.7)]'
                        : 'text-[#ff2525] drop-shadow-[0_0_8px_rgba(255,45,45,0.7)]',
                    )}
                  >
                    {selectedOption !== null && selectedOption === revealData.correctOptionIndex
                      ? `That's Correct !! (+${Math.max(pointsGained ?? 0, 0)})`
                      : `Oops Wrong Answer !! (${pointsGained ?? -2})`}
                  </p>
                </motion.div>
              </motion.div>
            )}

            {/* â”€â”€ ELIMINATED â”€â”€ */}
            {phase === 'eliminated' && (
              <motion.div
                key="eliminated"
                {...pageTransition}
                className="flex-1 flex items-center justify-center p-6 text-center"
              >
                <div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200 }}
                    className="text-5xl mb-4"
                  >
                    💀
                  </motion.div>
                  <h2 className="text-2xl font-bold text-neon-red text-glow-red mb-2">
                    Knocked Out!
                  </h2>
                  <p className="text-foreground/50 text-sm max-w-xs">
                    You&apos;ve been eliminated for this round. You&apos;ll be back when the next
                    round starts.
                  </p>
                  <div className="neon-border rounded-xl p-4 mt-6 bg-surface/80">
                    <p className="text-foreground/40 text-xs mb-1">Your Score</p>
                    <p className="text-2xl font-mono font-bold text-neon-cyan text-glow-cyan">
                      {session.score}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── SCOREBOARD ── */}
            {phase === 'scoreboard' && (
              <motion.div key="scoreboard" {...pageTransition} className="flex-1 flex flex-col p-4">
                <h2 className="text-xl font-bold text-center mb-4 text-glow-cyan">Scoreboard</h2>
                <motion.div
                  variants={staggerContainer}
                  initial="initial"
                  animate="animate"
                  className="flex-1 space-y-2 overflow-y-auto"
                >
                  {scoreboard.map((team, idx) => {
                    const isMe = team.teamId === session.teamId;
                    return (
                      <motion.div
                        key={team.teamId}
                        variants={staggerItem}
                        className={cn(
                          'flex items-center justify-between px-4 py-3 rounded-xl border',
                          isMe
                            ? 'bg-neon-cyan/10 border-neon-cyan/30 shadow-[0_0_10px_rgba(0,229,255,0.15)]'
                            : 'bg-surface/80 border-border/50',
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
                              idx === 0
                                ? 'bg-neon-gold/20 text-neon-gold'
                                : 'bg-surface-light text-foreground/40',
                            )}
                          >
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
                    You are in{' '}
                    <span className="font-bold text-neon-cyan">
                      {myRank}
                      {myRank === 1 ? 'st' : myRank === 2 ? 'nd' : myRank === 3 ? 'rd' : 'th'}
                    </span>{' '}
                    place
                  </p>
                )}
              </motion.div>
            )}
            {/* Break */}
            {phase === 'break' && (
              <motion.div
                key="break"
                {...pageTransition}
                className="flex-1 relative overflow-hidden mobile-play-bg"
              >
                <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_22%_16%,rgba(145,105,255,0.36)_0_4px,transparent_4px)] [background-size:110px_110px]" />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[290px] h-[180px] opacity-55 bg-[radial-gradient(circle,rgba(0,229,255,0.26)_0_2px,transparent_2px)] [background-size:14px_14px]" />

                <div className="relative z-10 h-full w-full flex flex-col items-center justify-center px-5 text-center">
                  <h2 className="text-[54px] leading-none font-extrabold text-white">
                    TAKE A BREAK !!
                  </h2>
                  <p className="mt-3 text-[33px] font-semibold text-white">
                    We'll be back shortly...
                  </p>

                  <div className="relative mt-10 h-[320px] w-[320px]">
                    <svg className="absolute inset-0" viewBox="0 0 300 300">
                      <defs>
                        <linearGradient id="breakRingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#ff0f0f" />
                          <stop offset="46%" stopColor="#ffffff" />
                          <stop offset="100%" stopColor="#83ff00" />
                        </linearGradient>
                      </defs>
                      <circle
                        cx="150"
                        cy="150"
                        r={breakRadius}
                        stroke="rgba(255,255,255,0.22)"
                        strokeWidth="10"
                        fill="none"
                      />
                      <circle
                        cx="150"
                        cy="150"
                        r={breakRadius}
                        stroke="url(#breakRingGradient)"
                        strokeWidth="10"
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray={breakCircumference}
                        strokeDashoffset={breakOffset}
                        transform="rotate(-90 150 150)"
                        style={{ filter: 'drop-shadow(0 0 10px rgba(0,229,255,0.35))' }}
                      />
                    </svg>

                    <div className="absolute inset-[28px] rounded-full bg-[radial-gradient(circle_at_50%_35%,rgba(44,23,101,0.92)_0%,rgba(10,7,40,0.96)_100%)] border border-[#00d8ff]/25 flex flex-col items-center justify-center">
                      <p className="text-[74px] leading-none font-black text-white font-mono">
                        {String(breakMinutes)}:{String(breakSeconds).padStart(2, '0')}
                      </p>
                      <p className="mt-2 text-[34px] font-extrabold tracking-[0.06em] text-[#00e8ff]">
                        TIME REMAINING
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── GAME END ── */}
            {phase === 'game_end' && (
              <motion.div
                key="game_end"
                {...pageTransition}
                className="flex-1 flex flex-col items-center justify-center p-6 text-center"
              >
                <div className="w-full max-w-sm">
                  <motion.div
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
                    className="text-5xl mb-4"
                  >
                    🏆
                  </motion.div>
                  <motion.h2
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-3xl font-bold mb-2 text-glow-cyan"
                  >
                    Game Over!
                  </motion.h2>
                  {myRank === 1 && (
                    <motion.p
                      initial={{ opacity: 0, scale: 1.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5 }}
                      className="text-neon-gold text-glow-gold text-lg font-bold mb-4"
                    >
                      You Won! 🎉
                    </motion.p>
                  )}
                  {myRank > 1 && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      className="text-foreground/50 mb-4"
                    >
                      You finished in{' '}
                      <span className="font-bold text-neon-cyan">
                        {myRank}
                        {myRank === 2 ? 'nd' : myRank === 3 ? 'rd' : 'th'}
                      </span>{' '}
                      place
                    </motion.p>
                  )}
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="neon-border rounded-xl p-5 mb-6 bg-surface/80"
                  >
                    <p className="text-foreground/40 text-xs mb-1">Final Score</p>
                    <p className="text-4xl font-mono font-bold text-neon-cyan text-glow-cyan">
                      {session.score}
                    </p>
                  </motion.div>
                  <motion.div
                    variants={staggerContainer}
                    initial="initial"
                    animate="animate"
                    className="space-y-2 mb-6"
                  >
                    {scoreboard.slice(0, 5).map((team, idx) => (
                      <motion.div
                        key={team.teamId}
                        variants={staggerItem}
                        className={cn(
                          'flex items-center justify-between px-4 py-2 rounded-lg',
                          team.teamId === session.teamId
                            ? 'bg-neon-cyan/10 border border-neon-cyan/30'
                            : 'bg-surface/80',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-foreground/40">{idx + 1}</span>
                          <span className="text-sm font-medium">{team.teamName}</span>
                        </div>
                        <span className="font-mono text-sm font-bold text-neon-cyan">
                          {team.score}
                        </span>
                      </motion.div>
                    ))}
                  </motion.div>
                  <button
                    onClick={() => {
                      clearSession();
                      router.push('/play/join');
                    }}
                    className="w-full py-3 rounded-xl bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 font-bold hover:bg-neon-cyan/30 transition-colors touch-manipulation"
                  >
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
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="neon-border bg-surface rounded-2xl p-6 max-w-xs w-full text-center"
            >
              <h3 className="text-lg font-bold mb-2">Leave Game?</h3>
              <p className="text-foreground/50 text-sm mb-6">
                You will be removed from the active game. You can rejoin with the same team name.
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
    </div>
  );
}
