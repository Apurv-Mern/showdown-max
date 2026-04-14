'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { useAudio } from '@/hooks/useAudio';
import { usePlayerSession } from '../playerSession';
import { LoadingDots } from '../LoadingDots';
import { clientLogger } from '@/lib/clientLogger';
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
  timerRemaining?: number;
  roundType: string;
  pointsForQuestion?: number;
  lockedWagerAmount?: number | null;
}

interface RevealData {
  correctOptionIndex: number;
  correctText: string;
  scores: Record<string, number>;
  responseDetails?: { teamId: number; selectedOptionIndex: number; responseTime?: number | null }[];
  eliminations: number[];
  allWrong: boolean;
  teams: { teamId: number; teamName: string; score: number; isEliminated?: boolean }[];
}

// const OPTION_BG: Record<number, string> = {
//   0: 'bg-[#11a7ff]', // A - blue
//   1: 'bg-[#ff8a1f]', // B - orange
//   2: 'bg-[#2bc62b]', // C - green
//   3: 'bg-[#ffd319]', // D - yellow
//   4: 'bg-[#8f2bff]', // E - purple
//   5: 'bg-[#ff103b]', // F - red
// };

const OPTION_BG: Record<number, string> = {
  0: 'bg-linear-to-b from-[#0190F5] to-[#015FB4]',
  1: 'bg-linear-to-b from-[#FF6F00] to-[#994200]',
  2: 'bg-linear-to-b from-[#2DA600] to-[#227E00]',
  3: 'bg-linear-to-b from-[#F29B00] to-[#B97700]',
  4: 'bg-linear-to-b from-[#460073] to-[#5C0098]',
  5: 'bg-linear-to-b from-[#990003] to-[#D20023]',
};

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const resolveMediaUrl = (mediaUrl?: string) => {
  if (!mediaUrl) return '';
  const normalized = mediaUrl
    .replace(/\\/g, '/')
    .replace('/api/media/files/', '/api/public/media/files/')
    .trim();
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
    const raw = (mediaUrl || '').replace(/\\/g, '/').trim();
    const normalized = raw.replace('/api/media/files/', '/api/public/media/files/');
    if (!normalized) return [];
    const resolved = resolveMediaUrl(normalized);
    const out = [resolved];
    const apiOrigin = (() => {
      try {
        return new URL(API_URL).origin;
      } catch {
        return '';
      }
    })();
    const apiOriginNoPort = apiOrigin.replace(/:\d+$/, '');

    if (
      !normalized.startsWith('http://') &&
      !normalized.startsWith('https://') &&
      !normalized.startsWith('data:') &&
      !normalized.startsWith('blob:')
    ) {
      const path = normalized.startsWith('/') ? normalized : `/${normalized}`;
      out.push(path);
      if (apiOrigin) out.push(`${apiOrigin}${path}`);
      if (apiOriginNoPort) out.push(`${apiOriginNoPort}${path}`);

      // Try both media routes because some environments expose only one of these.
      const legacyPath = path.replace('/api/public/media/files/', '/api/media/files/');
      const publicPath = path.replace('/api/media/files/', '/api/public/media/files/');
      if (legacyPath !== path) {
        out.push(legacyPath);
        if (apiOrigin) out.push(`${apiOrigin}${legacyPath}`);
        if (apiOriginNoPort) out.push(`${apiOriginNoPort}${legacyPath}`);
      }
      if (publicPath !== path) {
        out.push(publicPath);
        if (apiOrigin) out.push(`${apiOrigin}${publicPath}`);
        if (apiOriginNoPort) out.push(`${apiOriginNoPort}${publicPath}`);
      }
    }
    const filename = raw.split('/').pop()?.split('?')[0] || '';
    if (filename) {
      out.push(`${API_URL}/api/public/media/files/${filename}`);
      out.push(`${API_URL}/api/media/files/${filename}`);
      if (apiOrigin) out.push(`${apiOrigin}/api/public/media/files/${filename}`);
      if (apiOriginNoPort) out.push(`${apiOriginNoPort}/api/public/media/files/${filename}`);
    }

    return Array.from(new Set(out.map((u) => encodeURI(u))));
  }, [mediaUrl]);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [mediaUrl]);

  if (!candidates.length || failed) {
    return (
      <div className="w-full rounded-xl border border-[#11a7ff] max-h-[190px] min-h-[140px] bg-[#0b1338]/70 flex items-center justify-center text-white/70 text-sm">
        Image unavailable
      </div>
    );
  }

  return (
    <img
      src={candidates[index]}
      alt="Question media"
      className="w-full rounded-xl border border-[#11a7ff] object-cover max-h-[190px]"
      onError={() => {
        const next = index + 1;
        if (next < candidates.length) {
          setIndex(next);
          return;
        }
        setFailed(true);
        if (typeof window !== 'undefined') {
          console.warn('[mobile-question-image] failed all URL candidates', {
            mediaUrl,
            candidates,
          });
        }
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

const formatRoundTypeLabel = (roundType?: string) => {
  const type = (roundType || '').toUpperCase();
  switch (type) {
    case 'MULTIPLE_CHOICE':
      return 'Multiple Choice';
    case 'AUDIO_VIDEO':
      return 'Audio/Video';
    case 'MUSIC':
      return 'Music';
    case 'ELIMINATION':
      return 'Elimination';
    case 'WAGER':
      return 'Wager';
    case 'FINAL_WAGER':
      return 'Final Wager';
    case 'MAJORITY_RULES':
      return 'Majority Rules';
    default:
      return (roundType || 'Round').replace(/_/g, ' ');
  }
};

const normalizeRoundIntroTitle = (name?: string, roundType?: string, roundIndex?: number) => {
  const raw = (name || '').trim();
  const fallback = formatRoundTypeLabel(roundType);
  if (!raw) return fallback || `Round ${(roundIndex || 0) + 1}`;

  const withoutPrefix = raw
    .replace(new RegExp(`^round\\s*${(roundIndex || 0) + 1}\\s*[-:–]*\\s*`, 'i'), '')
    .replace(/^round\s*\d+\s*[-:–]*\s*/i, '')
    .trim();

  if (!withoutPrefix) return fallback || `Round ${(roundIndex || 0) + 1}`;

  const normalizedRaw = withoutPrefix.replace(/\s+/g, ' ').toLowerCase();
  const normalizedFallback = fallback.replace(/\s+/g, ' ').toLowerCase();

  if (normalizedFallback && normalizedRaw.includes(normalizedFallback)) {
    return fallback;
  }

  return withoutPrefix;
};

function HeaderCapsule({
  icon,
  value,
  className,
}: {
  icon: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex items-center min-w-27.5 h-11 rounded-full border border-[#ff2b68] bg-[linear-gradient(180deg,#FF0000_0%,#801669_100%)] pl-10 pr-4 shadow-[0_4px_10px_rgba(0,0,0,0.3)]',
        className,
      )}
    >
      <div className="absolute -left-3 top-4.5 -translate-y-1/2 w-14 h-14 flex items-center justify-center">
        <img src={icon} alt="icon" className="w-full h-full object-contain drop-shadow-md" />
      </div>
      <span className="w-full text-center font-black text-white text-xl leading-none">{value}</span>
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
  const [breakDuration, setBreakDuration] = useState(300);
  const [breakRemaining, setBreakRemaining] = useState(300);
  const [isPlayerMp3Playing, setIsPlayerMp3Playing] = useState(false);
  const [showBreakEndedNotice, setShowBreakEndedNotice] = useState(false);
  const questionMediaUrlRef = useRef<string | undefined>(undefined);
  const phaseRef = useRef<GamePhase>('waiting');
  const previousPhaseBeforeScoreboardRef = useRef<GamePhase | null>(null);
  const questionRef = useRef<QuestionData | null>(null);
  const revealDataRef = useRef<RevealData | null>(null);
  const {
    play: playMp3,
    stop: stopMp3,
    setSource: setMp3Source,
  } = useAudio({
    loop: false,
    volume: 0.75,
  });

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    clientLogger.info('play', 'Mobile game phase changed', {
      phase,
      sessionPin: session.pin,
      teamId: session.teamId,
      questionId: question?.question?.id,
    });
  }, [phase, question?.question?.id, session.pin, session.teamId]);

  useEffect(() => {
    questionRef.current = question;
  }, [question]);

  useEffect(() => {
    revealDataRef.current = revealData;
  }, [revealData]);

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
      setTimerRemaining(data.timerRemaining ?? data.timerDuration);
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
      const myResponse = data.responseDetails?.find((r) => r.teamId === session.teamId);
      if (myResponse && Number.isFinite(Number(myResponse.selectedOptionIndex))) {
        const selectedIdx = Number(myResponse.selectedOptionIndex);
        setSelectedOption(selectedIdx >= 0 ? selectedIdx : null);
      } else {
        setSelectedOption(null);
      }
      const teamIdStr = String(session.teamId);
      setPointsGained(data.scores[teamIdStr] ?? 0);
      const myTeam = data.teams.find((t) => t.teamId === session.teamId);
      if (myTeam) setSession({ score: myTeam.score });
      if (data.eliminations.includes(session.teamId!)) setIsEliminated(true);
    });

    socket.on('player_eliminated', (data: { teamId: number }) => {
      if (data.teamId === session.teamId) setIsEliminated(true);
    });

    socket.on('scoreboard', (data: { teams: any[] }) => {
      if (phaseRef.current !== 'scoreboard') {
        previousPhaseBeforeScoreboardRef.current = phaseRef.current;
      }
      setScoreboard(data.teams);
      setPhase('scoreboard');
      setIsPlayerMp3Playing(false);
      stopMp3();
    });
    socket.on('scoreboard_hidden', () => {
      const previous = previousPhaseBeforeScoreboardRef.current;
      if (previous && previous !== 'scoreboard') {
        setPhase(previous);
        return;
      }
      if (revealDataRef.current && questionRef.current) {
        setPhase('reveal');
        return;
      }
      if (questionRef.current) {
        setPhase('question');
        return;
      }
      setPhase('waiting');
    });
    socket.on('round_end', () => {
      setIsPlayerMp3Playing(false);
      stopMp3();
    });
    socket.on('break_start', (data: { duration?: number }) => {
      const duration = Number(data?.duration ?? 300);
      setBreakDuration(duration > 0 ? duration : 300);
      setBreakRemaining(duration > 0 ? duration : 300);
      setPhase('break');
    });
    socket.on('break_end', () => {
      // Phase is restored by server via session_state.
      setShowBreakEndedNotice(true);
      setTimeout(() => setShowBreakEndedNotice(false), 2200);
    });
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
    socket.on(
      'game_end',
      (data?: { teams?: { teamId: number; teamName: string; score: number }[] }) => {
        stopMp3();
        setIsPlayerMp3Playing(false);
        if (data?.teams) {
          setScoreboard(data.teams);
          const myTeam = data.teams.find((t) => t.teamId === session.teamId);
          if (myTeam) setSession({ score: myTeam.score });
        }
        setPhase('game_end');
      },
    );

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
        'scoreboard_hidden',
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
      if (
        selectedOption !== null ||
        !socket ||
        isEliminated ||
        timerRemaining <= 0 ||
        phaseRef.current !== 'question'
      )
        return;
      setSelectedOption(index);
      setPhase('answered');
      socket.emit('submit_answer', {
        selectedOptionIndex: index,
        wagerAmount: wagerSubmitted ? wagerAmount : undefined,
      });
    },
    [selectedOption, socket, isEliminated, timerRemaining, wagerAmount, wagerSubmitted],
  );

  const handleSubmitWager = () => {
    if (!socket) return;
    socket.emit('submit_wager', { amount: wagerAmount });
    setWagerSubmitted(true);
    setPhase('question');
  };

  const myRank = scoreboard.findIndex((t) => t.teamId === session.teamId) + 1;
  const breakProgress =
    breakDuration > 0 ? Math.max(0, Math.min(1, breakRemaining / breakDuration)) : 0;
  const breakRadius = 134;
  const breakCircumference = 2 * Math.PI * breakRadius;
  /** Elapsed = gap from 12 o'clock clockwise; remaining = colored arc after (matches host / design ref). */
  const breakElapsedLength = breakCircumference * (1 - breakProgress);
  const breakRemainingLength = breakCircumference * breakProgress;
  const breakMinutes = Math.floor(breakRemaining / 60);
  const breakSeconds = breakRemaining % 60;
  const optionCount = question?.question?.options?.length || 0;
  const optionHeightClass = optionCount <= 4 ? 'h-[116px]' : 'h-[116px]';
  const optionTextClass = optionCount <= 4 ? 'text-[22px]' : 'text-[22px]';
  const isAnswerSelectionLocked =
    selectedOption !== null || isEliminated || timerRemaining <= 0 || phase !== 'question';
  const showTimeExpiredState =
    timerRemaining <= 0 &&
    (phase === 'question' || phase === 'answered') &&
    selectedOption === null;

  return (
    <div className="flex-1 h-full min-h-0 w-full bg-[#050017]">
      <div
        className="relative flex flex-col min-h-0 h-full w-full overflow-hidden mobile-play-bg"
        style={{
          backgroundImage: "url('/Mobile_BG.png')",
          backgroundSize: '100% 100%',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {showBreakEndedNotice ? (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-[#2bdcff]/60 bg-[rgba(8,20,56,0.9)] px-4 py-2 shadow-[0_0_18px_rgba(43,220,255,0.32)]">
            <p className="text-sm font-extrabold tracking-wide text-[#2be9ff]">Break Ended</p>
          </div>
        ) : null}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <AnimatePresence mode="wait">
            {/* ── ROUND INTRO ── */}
            {phase === 'round_intro' && roundInfo && (
              <motion.div
                key="round_intro"
                {...pageTransition}
                className="flex-1 flex items-center justify-center p-4"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  className="relative w-full max-w-100"
                >
                  <img src="/Venue Round Intro.png" alt="Round intro" className="w-full h-auto" />

                  <div className="pointer-events-none absolute inset-0">
                    {/* Solid fill masks baked-in "ROUND N" text inside round intro.png so only live data shows */}
                    <div className="absolute left-1/2 top-[22%] h-[40%] w-[58%] -translate-x-1/2 rounded-full flex flex-col items-center justify-center text-center px-3">
                      <p className="relative z-10 text-[40px] font-extrabold leading-[0.95] bg-linear-to-b from-[#FFFFFF] to-[#FFC870] bg-clip-text text-transparent">
                        ROUND {(roundInfo.roundIndex || 0) + 1}
                      </p>
                      <p className="relative z-10 mt-1 max-w-[88%] text-[13px] font-bold leading-[1.1] text-[#00d8ff]">
                        {normalizeRoundIntroTitle(
                          roundInfo.round?.name,
                          roundInfo.round?.type,
                          roundInfo.roundIndex,
                        )}
                      </p>
                    </div>

                    <div className="absolute top-[74%] left-[10%] w-full">
                      <p className="text-[20px] font-bold text-[#00ff4a]">
                        <img
                          src="/plus10.png"
                          alt="Checkmark"
                          className="inline-block w-6  h-6 mr-2"
                        />
                        {getRoundScoringLines(roundInfo.round?.type).positive}
                      </p>
                      <p className="mt-1 text-[20px] font-bold text-[#ff0037]">
                        <img src="/minus2.png" alt="Cross" className="inline-block w-6 h-6 mr-2" />
                        {getRoundScoringLines(roundInfo.round?.type).negative}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}

            {/* ── WAITING ── */}
            {phase === 'waiting' && (
              <motion.div
                key="waiting"
                {...pageTransition}
                className="flex-1 relative overflow-hidden mobile-play-bg"
              >
                <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_22%_16%,rgba(145,105,255,0.36)_0_4px,transparent_4px)] [background-size:110px_110px]" />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[280px] h-42.5 opacity-55 bg-[radial-gradient(circle,rgba(0,229,255,0.26)_0_2px,transparent_2px)] [background-size:14px_14px]" />

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

                    <LoadingDots className="mt-3" gapClass="gap-2" />
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
              <motion.div
                key="question"
                {...pageTransition}
                className="flex-1 flex flex-col p-4 mt-4"
              >
                {/* Header: Timer, Q Index, Score */}
                <div className="flex items-center justify-between mb-5 px-1">
                  <HeaderCapsule
                    icon="/Clock.png"
                    value={timerRemaining.toString().padStart(2, '0')}
                  />
                  <div className="flex flex-col items-center">
                    <span className="text-white text-2xl font-black drop-shadow-lg">
                      {(question.questionIndex || 0) + 1}/{question.totalQuestions}
                    </span>
                  </div>
                  <HeaderCapsule icon="/trophy.png" value={session.score} />
                </div>

                <div className="mb-4 ">
                  <h2 className="text-[20px] font-black leading-snug text-white text-center drop-shadow-md">
                    {question.question.text}
                  </h2>
                </div>

                <div className="flex flex-col gap-4">
                  {isImageMedia(question.question.mediaType, question.question.mediaUrl) &&
                  question.question.mediaUrl ? (
                    <div className="shrink-0">
                      <div className="rounded-2xl border-2 border-[#11a7ff] overflow-hidden shadow-[0_0_20px_rgba(17,167,255,0.3)]">
                        <QuestionImage mediaUrl={question.question.mediaUrl} />
                      </div>
                    </div>
                  ) : (question.question.mediaType || '').toLowerCase() === 'mp4' &&
                    question.question.mediaUrl ? (
                    <div className="shrink-0">
                      <div className="rounded-2xl border-2 border-[#11a7ff] overflow-hidden shadow-[0_0_20px_rgba(17,167,255,0.3)]">
                        <video
                          src={resolveMediaUrl(question.question.mediaUrl)}
                          className="w-full object-cover max-h-55"
                          controls
                        />
                      </div>
                    </div>
                  ) : (question.question.mediaType || '').toLowerCase() === 'mp3' ||
                    question.roundType === 'MUSIC' ? (
                    <div className="shrink-0">
                      <div className="rounded-2xl border-2 border-[#11a7ff] overflow-hidden shadow-[0_0_20px_rgba(17,167,255,0.3)]">
                        <img
                          src="/musicbg.png"
                          alt="Music round placeholder"
                          className="w-full object-cover max-h-55"
                        />
                      </div>
                      <p className="mt-2 text-center text-white font-semibold">
                        {isPlayerMp3Playing
                          ? 'Audio is playing on Venue Screen'
                          : 'Waiting for host to play music'}
                      </p>
                    </div>
                  ) : null}

                  {/* Options - Single column vertical list */}
                  <motion.div
                    variants={staggerContainer}
                    initial="initial"
                    animate="animate"
                    className="flex flex-col gap-4 mt-4"
                  >
                    {question.question.options.map((opt, i) => {
                      const isSelected = selectedOption === i;
                      const isLocked = isAnswerSelectionLocked;

                      return (
                        <motion.button
                          key={i}
                          variants={staggerItem}
                          whileTap={!isLocked ? { scale: 0.98 } : undefined}
                          onClick={() => handleSelectOption(i)}
                          disabled={isLocked}
                          className={cn(
                            'w-full min-h-15 rounded-xl px-6 text-white font-bold shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.2)]',
                            'transition-all touch-manipulation select-none flex items-center justify-start',
                            OPTION_BG[i] || 'bg-[#1565c0]',
                            isSelected &&
                              'ring-4 ring-white shadow-[0_0_25px_rgba(255,255,255,0.5)]',
                            isLocked && !isSelected && 'opacity-60 grayscale-[0.3]',
                            isLocked && 'cursor-not-allowed',
                          )}
                        >
                          <span className="text-[20px] leading-tight font-black drop-shadow-md">
                            {OPTION_LETTERS[i]}. {opt.text}
                          </span>
                        </motion.button>
                      );
                    })}
                  </motion.div>
                </div>

                {showTimeExpiredState && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mt-6"
                  >
                    <p className="text-[#ff5252] text-[28px] font-black leading-none drop-shadow-[0_0_10px_rgba(255,82,82,0.6)]">
                      Time is over
                    </p>
                  </motion.div>
                )}

                {phase === 'answered' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mt-6"
                  >
                    <p className="text-white text-[28px] font-black leading-none drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]">
                      Answer Submitted !!
                    </p>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* ── REVEAL ── */}
            {phase === 'reveal' && revealData && question && (
              <motion.div
                key="reveal"
                {...pageTransition}
                className="flex-1 flex flex-col p-4 mt-4"
              >
                {/* Header: Timer, Q Index, Score */}
                <div className="flex items-center justify-between mb-5 px-1">
                  <HeaderCapsule icon="/Clock.png" value="00:00" />
                  <div className="flex flex-col items-center">
                    <span className="text-white text-2xl font-black drop-shadow-lg">
                      {(question.questionIndex || 0) + 1}/{question.totalQuestions}
                    </span>
                  </div>
                  <HeaderCapsule icon="/trophy.png" value={session.score} />
                </div>

                <div className="mb-4">
                  <h2 className="text-[20px] font-black leading-snug text-white text-center drop-shadow-md">
                    {question.question.text}
                  </h2>
                </div>

                <div className="flex flex-col gap-4">
                  {isImageMedia(question.question.mediaType, question.question.mediaUrl) &&
                  question.question.mediaUrl ? (
                    <div className="shrink-0">
                      <div className="rounded-2xl border-2 border-[#11a7ff] overflow-hidden shadow-[0_0_20px_rgba(17,167,255,0.3)]">
                        <QuestionImage mediaUrl={question.question.mediaUrl} />
                      </div>
                    </div>
                  ) : null}

                  {/* Options - Single column vertical list */}
                  <motion.div
                    variants={staggerContainer}
                    initial="initial"
                    animate="animate"
                    className="flex flex-col gap-4 mt-4"
                  >
                    {question.question.options.map((opt, i) => {
                      const isCorrectOption = i === revealData.correctOptionIndex;
                      const isSelectedOption = selectedOption === i;
                      const isSelectedWrong = isSelectedOption && !isCorrectOption;
                      // Dim all incorrect options; keep full style on correct + user's wrong pick (red).
                      // When the user never submitted, selectedOption is null — still dim wrong answers.
                      const shouldDim = !isCorrectOption && !isSelectedWrong;

                      return (
                        <motion.div
                          key={i}
                          variants={staggerItem}
                          className={cn(
                            'w-full min-h-15 rounded-xl px-6 text-white font-bold ',
                            'transition-all touch-manipulation select-none flex items-center justify-start',
                            OPTION_BG[i] || 'bg-[#1565c0]',
                            isCorrectOption &&
                              'shadow-[0_0_8px_8px_rgba(57,255,74,0.9),_0_0_0px_rgba(57,255,74,0.5)]',
                            isSelectedWrong &&
                              'shadow-[0_0_8px_8px_rgba(255,37,37,0.8),_0_0_0px_rgba(255,37,37,0.5)]',
                            shouldDim && 'opacity-30 brightness-50 contrast-75 scale-[0.98]',
                          )}
                        >
                          <span className="text-[20px] leading-tight font-black drop-shadow-md">
                            {OPTION_LETTERS[i]}. {opt.text}
                          </span>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mt-8 text-center"
                >
                  <p
                    className={cn(
                      'text-[20px] font-black leading-none',
                      selectedOption === null
                        ? 'text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]'
                        : selectedOption === revealData.correctOptionIndex
                          ? 'text-[#53ff57] drop-shadow-[0_0_15px_rgba(83,255,87,0.8)]'
                          : 'text-[#ff2525] drop-shadow-[0_0_15px_rgba(255,37,37,0.8)]',
                    )}
                  >
                    {selectedOption === null
                      ? 'No Answer Submitted !! (0)'
                      : selectedOption === revealData.correctOptionIndex
                        ? `That's Correct !! (+${Math.max(pointsGained ?? 0, 0)})`
                        : `Oops Wrong Answer !! (${pointsGained ?? 0})`}
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
              <motion.div
                key="scoreboard"
                {...pageTransition}
                className="flex-1 flex flex-col p-4 mt-4"
              >
                <div className="mb-4 text-center">
                  <h2 className="text-[52px] leading-none font-extrabold text-white tracking-wide drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                    🏅 LEADERBOARD 🏅
                  </h2>
                </div>
                <motion.div
                  variants={staggerContainer}
                  initial="initial"
                  animate="animate"
                  className="flex-1 space-y-3 overflow-y-auto pr-1"
                >
                  {scoreboard.map((team, idx) => {
                    const isMe = team.teamId === session.teamId;
                    return (
                      <motion.div
                        key={team.teamId}
                        variants={staggerItem}
                        className={cn(
                          'relative flex items-center justify-between rounded-2xl border px-3 py-4 shadow-[0_0_18px_rgba(0,229,255,0.3)]',
                          'border-[#12ddff]/70 bg-[linear-gradient(90deg,#2d12a0_0%,#9a0dbd_100%)]',
                          isMe && 'ring-2 ring-[#35f6ff] shadow-[0_0_22px_rgba(53,246,255,0.5)]',
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={cn(
                              'w-11 h-11 rounded-lg flex items-center justify-center text-2xl font-black border',
                              idx === 0 &&
                                'bg-[linear-gradient(180deg,#ffd35e_0%,#ff9f0a_100%)] text-white border-[#ffdf7f]',
                              idx === 1 &&
                                'bg-[linear-gradient(180deg,#b7c8e6_0%,#6f88b5_100%)] text-white border-[#d4e4ff]',
                              idx === 2 &&
                                'bg-[linear-gradient(180deg,#df8f49_0%,#a45a21_100%)] text-white border-[#f3b07a]',
                              idx > 2 && 'bg-[#100a3d] text-white border-[#281d72]',
                            )}
                          >
                            {idx + 1}
                          </span>
                          <span
                            className={cn(
                              'font-bold text-[36px] truncate text-white',
                              isMe && 'text-[#8af7ff]',
                            )}
                          >
                            {team.teamName}
                          </span>
                        </div>
                        <span
                          className={cn(
                            'font-extrabold text-[42px] leading-none text-white',
                            isMe && 'text-[#8af7ff]',
                          )}
                        >
                          {team.score >= 0 ? '+' : ''}
                          {team.score}
                        </span>
                      </motion.div>
                    );
                  })}
                </motion.div>
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
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-72.5 h-45 opacity-55 bg-[radial-gradient(circle,rgba(0,229,255,0.26)_0_2px,transparent_2px)] [background-size:14px_14px]" />

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
                      <g transform="rotate(-90 150 150)">
                        <circle
                          cx="150"
                          cy="150"
                          r={breakRadius}
                          stroke="url(#breakRingGradient)"
                          strokeWidth="10"
                          fill="none"
                          strokeLinecap="round"
                          strokeDasharray={`0 ${breakElapsedLength} ${breakRemainingLength} 0`}
                          strokeDashoffset={0}
                          style={{ filter: 'drop-shadow(0 0 10px rgba(0,229,255,0.35))' }}
                        />
                      </g>
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
                    Thank You For Playing!
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
                    Leave Game
                  </button>
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
