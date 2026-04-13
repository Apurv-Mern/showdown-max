'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Montserrat } from 'next/font/google';
import toast from 'react-hot-toast';
import { useSocket } from '@/hooks/useSocket';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useTimerSound } from '@/hooks/useTimerSound';
import { useAudio } from '@/hooks/useAudio';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { clientLogger } from '@/lib/clientLogger';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { PUBLIC_API_URL } from '@/lib/env';

const API_URL = PUBLIC_API_URL;

function formatRoundTypeLabel(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

function getRoundScoringLines(roundType?: string) {
  const type = (roundType || '').toUpperCase();
  if (type === 'WAGER') {
    return { positive: 'Gain wagered points', negative: 'Lose wagered points' };
  }
  if (type === 'FINAL_WAGER') {
    return { positive: 'Gain wagered % of score', negative: 'Lose wagered % of score' };
  }
  if (type === 'MAJORITY_RULES') {
    return { positive: '+50 majority vote', negative: '-50 minority vote' };
  }
  return { positive: '+10 correct answers', negative: '-2 incorrect answers' };
}

const KANGAROO_SLOTS = [1, 2, 3, 4, 5, 6] as const;

/** Matches player mini-game (left / middle / right). */
const CARD_SHUFFLE_SLOTS = [1, 2, 3] as const;
const CARD_POSITION_LABELS: Record<number, string> = { 1: 'Left', 2: 'Middle', 3: 'Right' };

/** Figma row groups for Score Board modal list */
const SCOREBOARD_MODAL_ROW_IDS = [
  '232:2873',
  '232:2879',
  '232:2885',
  '232:2891',
  '232:2897',
] as const;

const montserrat = Montserrat({
  weight: ['400', '500', '600', '700', '800'],
  subsets: ['latin'],
  display: 'swap',
});

interface Team {
  teamId: number;
  teamName: string;
  score: number;
  isEliminated?: boolean;
  isConnected?: boolean;
}

interface GameState {
  state: string;
  questionState: string;
  currentRoundIndex: number;
  currentQuestionIndex: number;
  timerRemaining: number;
  timerRunning: boolean;
  responseCount: number;
  totalTeams: number;
  rounds: { id: number; name: string; type: string; timerDuration: number; questions: unknown[] }[];
  teams: Record<string, Team>;
  activeTeamIds: number[];
  activeMiniGame?: string | null;
  miniGameState?: {
    game?: string;
    ready?: boolean;
    gameStarted?: boolean;
    activeRound?: 1 | 2 | 3 | 4 | null;
    revealed?: boolean;
    correctPosition?: number | null;
    pickCounts?: Record<string, number>;
  } | null;
  currentQuestion?: QuestionData | null;
}

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
}

interface RevealData {
  correctOptionIndex: number;
  correctText: string;
  scores: Record<string, number>;
  eliminations: number[];
  allWrong: boolean;
  teams: Team[];
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const VENUE_OPTION_COLOR_CLASSES = [
  'border-[#00ffff] bg-[linear-gradient(180deg,#008cff_0%,#003366_100%)]', // Blue
  'border-[#ff8c00] bg-[linear-gradient(180deg,#ff4500_0%,#8b2500_100%)]', // Orange
  'border-[#32cd32] bg-[linear-gradient(180deg,#008000_0%,#003300_100%)]', // Green
  'border-[#ffd700] bg-[linear-gradient(180deg,#daa520_0%,#664d00_100%)]', // Gold
  'border-[#9400d3] bg-[linear-gradient(180deg,#4b0082_0%,#24003d_100%)]', // Purple
  'border-[#ff1493] bg-[linear-gradient(180deg,#c71585_0%,#5c0a3d_100%)]', // Pink
];

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
  if (normalized.startsWith('/')) return `${API_URL}${normalized}`;
  return `${API_URL}/${normalized}`;
};

const isImageMedia = (mediaType?: string, mediaUrl?: string) => {
  const type = (mediaType || '').toLowerCase();
  if (type.includes('image')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(mediaUrl || '');
};

function formatSecondsMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function HostTimerRing({
  remaining,
  total,
  size = 100,
  className,
  hideCenter,
}: {
  remaining: number;
  total: number;
  size?: number;
  className?: string;
  /** Ring only; use with overlaid time label (e.g. mm:ss). */
  hideCenter?: boolean;
}) {
  const stroke = Math.max(6, Math.round(size / 14));
  const radius = (size - stroke * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? remaining / total : 0;
  const offset = circumference * (1 - progress);

  const getColor = () => {
    if (remaining <= 5) return '#ff1744';
    if (remaining <= 10) return '#ffc400';
    if (progress > 0.5) return '#00ff6a';
    return '#ffc400';
  };

  const color = getColor();
  const digitClass = size >= 110 ? 'text-[clamp(2rem,5vw,3.25rem)]' : 'text-3xl';

  return (
    <div className={cn('timer-ring', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          className="timer-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
        />
        <circle
          className="timer-ring-progress"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      {!hideCenter ? (
        <span
          className={cn(
            'font-black font-mono leading-none',
            digitClass,
            remaining <= 5
              ? 'text-neon-red text-glow-red'
              : 'text-white [text-shadow:0_4px_2px_rgba(0,0,0,0.4)]',
          )}
        >
          {remaining}
        </span>
      ) : null}
    </div>
  );
}

function HostPanelTitle({
  children,
  'data-node-id': dataNodeId,
}: {
  children: React.ReactNode;
  'data-node-id'?: string;
}) {
  return (
    <h2
      data-node-id={dataNodeId}
      className="mb-4 text-xl font-bold uppercase leading-tight tracking-wide text-white sm:text-[25px]"
    >
      {children}
    </h2>
  );
}

function HostSidebarTile({
  label,
  onClick,
  disabled,
  active,
  icon,
  'data-node-id': dataNodeId,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  icon: React.ReactNode;
  'data-node-id'?: string;
}) {
  return (
    <button
      type="button"
      data-node-id={dataNodeId}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-27.75 w-38.75 flex-col items-center justify-center gap-2 rounded-xl border px-2 text-center text-sm font-medium text-white shadow-[inset_0_0_24px_rgba(0,217,255,0.06)] transition hover:border-[rgba(0,217,255,0.55)] disabled:cursor-not-allowed disabled:opacity-35',
        'bg-[linear-gradient(180deg,rgba(30,36,58,0.95)_0%,rgba(15,20,32,0.98)_100%)]',
        active
          ? 'border-[rgba(0,217,255,0.55)] shadow-[0_0_16px_rgba(0,217,255,0.15)]'
          : 'border-[rgba(0,217,255,0.3)]',
      )}
    >
      <span className="flex size-[50px] items-center justify-center text-[#00d9ff] [&>svg]:h-10 [&>svg]:w-10">
        {icon}
      </span>
      <span className="leading-tight">{label}</span>
    </button>
  );
}

function HostFooterBtn({
  icon,
  children,
  onClick,
  disabled,
  emphasis,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-12.5 min-w-30 flex-1 max-w-52.5 items-center justify-center gap-2 rounded-lg border px-2 text-[10px] font-bold uppercase tracking-wide text-white shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition hover:brightness-110 disabled:opacity-30 sm:min-w-35 sm:px-3 sm:text-xs',
        emphasis
          ? 'border-[rgba(0,217,255,0.45)] bg-[linear-gradient(180deg,#3a4a68_0%,#1e2a42_100%)] shadow-[0_0_18px_rgba(0,217,255,0.18)]'
          : 'border-white/15 bg-[linear-gradient(180deg,#2e354c_0%,#1a2030_100%)]',
      )}
    >
      <span className="flex size-5.5 shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full">
        {icon}
      </span>
      {children}
    </button>
  );
}

function HostDashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { assignedSession, logout } = useAuth();
  const pin = assignedSession?.pin || searchParams.get('pin') || '';
  const sessionId = assignedSession?.id
    ? String(assignedSession.id)
    : searchParams.get('sessionId') || '';

  const { socket, isConnected } = useSocket();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null);
  const [revealData, setRevealData] = useState<RevealData | null>(null);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const [timerDuration, setTimerDuration] = useState(30);
  const [timerPaused, setTimerPaused] = useState(false);
  const [liveResponses, setLiveResponses] = useState({
    correct: 0,
    incorrect: 0,
    noAnswer: 0,
    total: 0,
  });

  const [addTeamName, setAddTeamName] = useState('');
  const [addTeamScore, setAddTeamScore] = useState('');
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [editScoreTeamId, setEditScoreTeamId] = useState<number | null>(null);
  const [editScoreValue, setEditScoreValue] = useState('');
  const [showRegisteredTeams, setShowRegisteredTeams] = useState(false);
  const [showRoundIntroductionModal, setShowRoundIntroductionModal] = useState(false);
  const [showKangarooRaceModal, setShowKangarooRaceModal] = useState(false);
  const [winningKangaroo, setWinningKangaroo] = useState(3);
  const [kangarooBetCounts, setKangarooBetCounts] = useState([0, 0, 0, 0, 0, 0]);
  const [cardPickCounts, setCardPickCounts] = useState([0, 0, 0]);
  const [cardShuffleVenueReady, setCardShuffleVenueReady] = useState(false);
  const [cardShuffleGameStarted, setCardShuffleGameStarted] = useState(false);
  const [cardShuffleActiveRound, setCardShuffleActiveRound] = useState<1 | 2 | 3 | 4 | null>(null);
  const [cardShuffleRevealPosition, setCardShuffleRevealPosition] = useState<number | null>(null);
  const [activeMiniGameLocal, setActiveMiniGameLocal] = useState<string | null>(null);
  const [miniGameLoading, setMiniGameLoading] = useState(false);
  const [miniGameRevealing, setMiniGameRevealing] = useState(false);
  const [showScoreboardModal, setShowScoreboardModal] = useState(false);
  const [isScoreboardVisible, setIsScoreboardVisible] = useState(false);
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [mp3Playing, setMp3Playing] = useState(false);
  const [mp4Playing, setMp4Playing] = useState(false);

  const gameStateRef = useRef<GameState | null>(null);
  const previousStateBeforeScoreboardRef = useRef<{ state: string; questionState: string } | null>(
    null,
  );
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    clientLogger.info('host', 'Host dashboard state updated', {
      pin,
      gameState: gameState?.state,
      questionState: gameState?.questionState,
      roundIndex: gameState?.currentRoundIndex,
      questionIndex: gameState?.currentQuestionIndex,
      questionId: currentQuestion?.question?.id,
      scoreboardVisible: isScoreboardVisible,
    });
  }, [
    pin,
    gameState?.state,
    gameState?.questionState,
    gameState?.currentRoundIndex,
    gameState?.currentQuestionIndex,
    currentQuestion?.question?.id,
    isScoreboardVisible,
  ]);

  const isMusicRound = currentQuestion?.roundType === 'MUSIC';
  const { playTick, playBuzz } = useTimerSound({ enabled: true, muted: isMusicRound });
  const {
    play: playMp3,
    stop: stopMp3,
    setSource: setMp3Source,
  } = useAudio({ loop: false, volume: 0.7 });
  const prevTimerRef = useRef(0);

  useEffect(() => {
    if (timerRemaining > 0 && timerRemaining !== prevTimerRef.current && !timerPaused) {
      playTick(timerRemaining <= 5);
    }
    if (prevTimerRef.current > 0 && timerRemaining === 0) playBuzz();
    prevTimerRef.current = timerRemaining;
  }, [timerRemaining, timerPaused, playTick, playBuzz]);

  useEffect(() => {
    if (!currentQuestion?.question?.mediaUrl) return;
    const mediaType = (currentQuestion.question.mediaType || '').toLowerCase();
    if (mediaType === 'mp3') {
      setMp3Source(resolveMediaUrl(currentQuestion.question.mediaUrl));
    }
  }, [currentQuestion?.question?.mediaUrl, currentQuestion?.question?.mediaType, setMp3Source]);

  useEffect(() => {
    if (!socket || !pin) return;

    const joinHost = () => {
      socket.emit('host_connect', { pin });
    };
    joinHost();
    socket.on('connect', joinHost);

    socket.on('session_state', (data: GameState) => {
      if (data?.state) {
        setGameState(data);
        setIsScoreboardVisible(data.state === 'SCOREBOARD');
        setTimerRemaining(data.timerRemaining || 0);
        setTimerPaused(data.timerRunning === false);
        setCurrentQuestion(data.currentQuestion || null);
        if (data.questionState !== 'REVEALED') {
          setRevealData(null);
        }
      }
      if (data?.activeMiniGame) {
        setActiveMiniGameLocal(data.activeMiniGame);
        setMiniGameLoading(false);
        if (data.miniGameState?.game === 'card_shuffle') {
          setCardShuffleVenueReady(Boolean(data.miniGameState.ready));
          setCardShuffleGameStarted(Boolean(data.miniGameState.gameStarted));
          setCardShuffleActiveRound(
            (data.miniGameState.activeRound as 1 | 2 | 3 | 4 | null | undefined) ?? null,
          );
          setCardShuffleRevealPosition(
            Number.isFinite(Number(data.miniGameState.correctPosition))
              ? Number(data.miniGameState.correctPosition)
              : null,
          );
          setCardPickCounts(
            [1, 2, 3].map((slot) => Number(data.miniGameState?.pickCounts?.[slot] || 0)),
          );
          if (data.miniGameState.revealed) {
            setMiniGameRevealing(false);
          }
        }
      } else if (data?.activeMiniGame === null) {
        setActiveMiniGameLocal(null);
        setMiniGameLoading(false);
        setCardShuffleVenueReady(false);
        setCardShuffleGameStarted(false);
        setCardShuffleActiveRound(null);
        setCardShuffleRevealPosition(null);
        setCardPickCounts([0, 0, 0]);
        setMiniGameRevealing(false);
      }
    });

    socket.on('question_active', (data: QuestionData) => {
      setCurrentQuestion(data);
      setRevealData(null);
      setTimerDuration(data.timerDuration);
      setTimerRemaining(data.timerRemaining ?? data.timerDuration);
      setIsScoreboardVisible(false);
      setMp3Playing(false);
      stopMp3();
      setGameState((prev) =>
        prev ? { ...prev, state: 'QUESTION', questionState: 'ACTIVE' } : prev,
      );
    });

    socket.on('timer_update', (data: { remaining: number; paused?: boolean }) => {
      setTimerRemaining(data.remaining);
      if (data.paused !== undefined) setTimerPaused(data.paused);
    });

    socket.on('timer_expired', () => setTimerRemaining(0));

    socket.on('answer_reveal', (data: RevealData) => {
      setRevealData(data);
      setGameState((prev) => (prev ? { ...prev, questionState: 'REVEALED' } : prev));
    });

    socket.on('response_count', (data: { count: number; total: number }) => {
      setGameState((prev) =>
        prev ? { ...prev, responseCount: data.count, totalTeams: data.total } : prev,
      );
    });

    socket.on('live_responses_update', (data) => {
      setLiveResponses(data);
    });

    socket.on('round_intro', (data: { roundIndex?: number }) => {
      setCurrentQuestion(null);
      setRevealData(null);
      setIsScoreboardVisible(false);
      setMp3Playing(false);
      stopMp3();
      setGameState((prev) =>
        prev
          ? {
              ...prev,
              state: 'ROUND_INTRO',
              questionState: 'WAITING',
              currentRoundIndex: data.roundIndex ?? prev.currentRoundIndex,
              currentQuestionIndex: 0,
              responseCount: 0,
            }
          : prev,
      );
    });

    socket.on('scoreboard', () => {
      setIsScoreboardVisible(true);
      setGameState((prev) => {
        if (!prev) return prev;
        if (prev.state !== 'SCOREBOARD') {
          previousStateBeforeScoreboardRef.current = {
            state: prev.state,
            questionState: prev.questionState,
          };
        }
        return { ...prev, state: 'SCOREBOARD' };
      });
    });

    socket.on('scoreboard_hidden', () => {
      setIsScoreboardVisible(false);
      setGameState((prev) => {
        if (!prev) return prev;
        const restore = previousStateBeforeScoreboardRef.current;
        if (!restore) return prev;
        return { ...prev, state: restore.state, questionState: restore.questionState };
      });
    });

    socket.on('round_end', () => {
      setIsScoreboardVisible(false);
      setCurrentQuestion(null);
      setRevealData(null);
      setMp3Playing(false);
      stopMp3();
      setGameState((prev) => (prev ? { ...prev, state: 'SCOREBOARD' } : prev));
    });

    socket.on('break_start', () => {
      setIsScoreboardVisible(false);
      setGameState((prev) => (prev ? { ...prev, state: 'BREAK' } : prev));
    });
    socket.on('break_end', () => {
      // Exact phase/state is restored by server via session_state.
    });

    socket.on('game_end', (data?: { teams?: Team[] }) => {
      setCurrentQuestion(null);
      setRevealData(null);
      setIsScoreboardVisible(false);
      setMp3Playing(false);
      stopMp3();
      setGameState((prev) => {
        const nextTeams = data?.teams?.length
          ? Object.fromEntries(data.teams.map((team) => [team.teamId, team]))
          : prev?.teams || {};

        return prev
          ? {
              ...prev,
              state: 'FINAL_RESULTS',
              questionState: 'WAITING',
              teams: nextTeams,
              totalTeams: Object.keys(nextTeams).length,
            }
          : {
              state: 'FINAL_RESULTS',
              questionState: 'WAITING',
              currentRoundIndex: 0,
              currentQuestionIndex: 0,
              timerRemaining: 0,
              timerRunning: false,
              responseCount: 0,
              totalTeams: Object.keys(nextTeams).length,
              rounds: [],
              teams: nextTeams,
              activeTeamIds: [],
              activeMiniGame: null,
              currentQuestion: null,
            };
      });
    });

    socket.on('team_joined', (team: Team) => {
      setGameState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          teams: { ...prev.teams, [team.teamId]: team },
          totalTeams: Object.keys(prev.teams).length + 1,
        };
      });
    });

    socket.on('team_removed', ({ teamId }: { teamId: number }) => {
      setGameState((prev) => {
        if (!prev) return prev;
        const teams = { ...prev.teams };
        delete teams[teamId];
        return { ...prev, teams, totalTeams: Object.keys(teams).length };
      });
    });

    socket.on('team_updated', ({ teamId, score }: { teamId: number; score: number }) => {
      setGameState((prev) => {
        if (!prev || !prev.teams[teamId]) return prev;
        return { ...prev, teams: { ...prev.teams, [teamId]: { ...prev.teams[teamId], score } } };
      });
    });

    socket.on('mini_game_start', (data: { game: string }) => {
      setActiveMiniGameLocal(data.game);
      setMiniGameLoading(false);
      setCardShuffleVenueReady(false);
    });

    socket.on('mini_game_ready', (data: { game?: string; ready?: boolean }) => {
      if (data?.game !== 'card_shuffle') return;
      setCardShuffleVenueReady(data.ready !== false);
    });

    socket.on(
      'mini_game_reveal',
      (data: { game?: string; correctPosition?: number; roundNumber?: 1 | 2 | 3 | 4 }) => {
        if (data?.game !== 'card_shuffle') return;
        setMiniGameRevealing(false);
        setCardShuffleRevealPosition(
          Number.isFinite(Number(data.correctPosition)) ? Number(data.correctPosition) : null,
        );
        if (data.roundNumber) {
          setCardShuffleActiveRound(data.roundNumber);
        }
      },
    );

    socket.on(
      'mini_game_end',
      (data: { game?: string; winningCard?: number; winningKangaroo?: number }) => {
        setMiniGameLoading(false);
        if (data?.game === 'card_shuffle' || !data?.game) {
          setCardShuffleVenueReady(false);
          setCardShuffleGameStarted(false);
          setCardShuffleActiveRound(null);
          setCardShuffleRevealPosition(null);
          setCardPickCounts([0, 0, 0]);
        }
        if (data?.game) {
          setMiniGameRevealing(true);
          setTimeout(() => {
            setActiveMiniGameLocal(null);
            setMiniGameRevealing(false);
          }, 5000);
        } else {
          setActiveMiniGameLocal(null);
          setMiniGameRevealing(false);
        }
      },
    );

    const onMiniGameUpdate = (data: { action?: string; value?: number }) => {
      if (data.action !== 'select' || typeof data.value !== 'number') return;
      const ag = gameStateRef.current?.activeMiniGame;
      const isHorse = ag === 'horse_race' || ag === 'horse-race';
      const isCards = ag === 'card_shuffle';
      if (isHorse) {
        const idx = data.value - 1;
        if (idx < 0 || idx > 5) return;
        setKangarooBetCounts((prev) => {
          const next = [...prev];
          next[idx] += 1;
          return next;
        });
        return;
      }
      if (isCards) {
        const idx = data.value - 1;
        if (idx < 0 || idx > 2) return;
        setCardPickCounts((prev) => {
          const next = [...prev];
          next[idx] += 1;
          return next;
        });
      }
    };
    socket.on('mini_game_update', onMiniGameUpdate);

    return () => {
      socket.off('connect', joinHost);
      socket.off('mini_game_update', onMiniGameUpdate);
      [
        'session_state',
        'question_active',
        'timer_update',
        'timer_expired',
        'answer_reveal',
        'response_count',
        'round_intro',
        'scoreboard',
        'scoreboard_hidden',
        'round_end',
        'break_start',
        'break_end',
        'game_end',
        'team_joined',
        'team_removed',
        'team_updated',
        'mini_game_start',
        'mini_game_ready',
        'mini_game_reveal',
        'mini_game_end',
      ].forEach((e) => socket.off(e));
    };
  }, [socket, pin, stopMp3]);

  const emit = useCallback(
    (event: string, data?: Record<string, unknown>) => {
      if (socket) socket.emit(event, { pin, ...data });
    },
    [socket, pin],
  );

  const handleStartGame = () => emit('start_game');
  const handleNextQuestion = () => emit('next_question');
  const handleRevealAnswer = () => emit('reveal_answer');
  const handleStartTimer = () => {
    emit('start_timer');
    setShowTimerModal(true);
  };
  const handlePauseTimer = () => emit('pause_timer');
  const handleShowScoreboard = () => {
    if (isScoreboardVisible) {
      emit('hide_scoreboard');
      setShowScoreboardModal(false);
    } else {
      emit('show_scoreboard');
      setShowScoreboardModal(true);
    }
  };
  const handleAdvanceRound = () => emit('advance_round');
  const handleStartBreak = () => emit('start_break');
  const handleEndBreak = () => emit('end_break');
  const handleEndGame = () => {
    if (confirm('End the game? This shows final results to all players.')) emit('end_game');
  };
  const handleLogout = () => {
    logout();
    router.replace('/host/login');
  };
  const handleKangarooRaceSave = () => {
    setKangarooBetCounts([0, 0, 0, 0, 0, 0]);
    setMiniGameLoading(true);
    emit('launch_mini_game', {
      game: 'horse_race',
      config: { winningKangaroo },
    });
    setShowKangarooRaceModal(false);
  };

  const launchCardShuffleOnVenue = useCallback(() => {
    setCardPickCounts([0, 0, 0]);
    setCardShuffleVenueReady(false);
    setCardShuffleGameStarted(false);
    setCardShuffleActiveRound(null);
    setCardShuffleRevealPosition(null);
    setMiniGameRevealing(false);
    setMiniGameLoading(true);
    emit('launch_mini_game', {
      game: 'card_shuffle',
      config: {},
    });
    setActiveMiniGameLocal('card_shuffle');
  }, [emit]);

  const handleOpenCardShuffleControls = () => {
    if (activeMiniGameLocal !== 'card_shuffle' && !miniGameLoading) {
      launchCardShuffleOnVenue();
    }
  };

  const handleCardShuffleCommand = (
    command: 'start_game' | 'next_round' | 'reveal_cards',
    roundNumber?: 1 | 2 | 3 | 4,
  ) => {
    if (!cardShuffleVenueReady) return;
    if (command === 'next_round' && !cardShuffleGameStarted) return;
    if (
      command === 'reveal_cards' &&
      (!cardShuffleGameStarted || cardShuffleRevealPosition !== null)
    ) {
      return;
    }
    emit('mini_game_command', {
      game: 'card_shuffle',
      command,
      ...(roundNumber ? { roundNumber } : {}),
    });
    if (command === 'next_round' && roundNumber) {
      setCardPickCounts([0, 0, 0]);
      setCardShuffleRevealPosition(null);
      setCardShuffleActiveRound(roundNumber);
      setMiniGameRevealing(false);
    }
    if (command === 'reveal_cards') {
      setMiniGameRevealing(true);
    }
  };

  const handleCardShuffleStartGame = () => {
    if (!cardShuffleVenueReady) return;
    setCardShuffleGameStarted(true);
    setCardShuffleActiveRound(1);
    setCardPickCounts([0, 0, 0]);
    setCardShuffleRevealPosition(null);
    setMiniGameRevealing(false);
    emit('mini_game_command', {
      game: 'card_shuffle',
      command: 'start_game',
    });
    window.setTimeout(() => {
      emit('mini_game_command', {
        game: 'card_shuffle',
        command: 'next_round',
        roundNumber: 1,
      });
    }, 350);
  };

  const handleExitMiniGame = () => {
    setCardShuffleVenueReady(false);
    setCardShuffleGameStarted(false);
    setCardShuffleActiveRound(null);
    setCardShuffleRevealPosition(null);
    emit(
      'end_mini_game',
      activeMiniGameLocal === 'horse_race' ? { config: { winningKangaroo } } : undefined,
    );
  };

  const closeAddTeamModal = useCallback(() => {
    setShowAddTeam(false);
    setAddTeamName('');
    setAddTeamScore('');
  }, []);

  const closeRegisteredTeamsModal = useCallback(() => {
    setShowRegisteredTeams(false);
  }, []);

  const closeRoundIntroductionModal = useCallback(() => {
    setShowRoundIntroductionModal(false);
  }, []);

  const closeKangarooRaceModal = useCallback(() => {
    setShowKangarooRaceModal(false);
  }, []);

  const closeScoreboardModal = useCallback(() => {
    setShowScoreboardModal(false);
    if (isScoreboardVisible) {
      emit('hide_scoreboard');
      setIsScoreboardVisible(false);
    }
  }, [emit, isScoreboardVisible]);

  const closeTimerModal = useCallback(() => {
    setShowTimerModal(false);
  }, []);

  const handleAddTeam = () => {
    if (!addTeamName.trim()) return;
    const raw = addTeamScore.trim();
    let score: number | undefined;
    if (raw !== '') {
      const n = Number(raw);
      if (Number.isNaN(n)) {
        toast.error('Please enter a valid number for score, or leave it empty.');
        return;
      }
      score = n;
    }
    emit('add_team', { teamName: addTeamName.trim(), ...(score !== undefined ? { score } : {}) });
    closeAddTeamModal();
  };

  const handleEditScore = (teamId: number) => {
    const val = Number(editScoreValue);
    if (isNaN(val)) return;
    emit('edit_team_score', { teamId, score: val });
    setEditScoreTeamId(null);
    setEditScoreValue('');
  };

  const handleRemoveTeam = (teamId: number) => {
    if (!confirm('Remove this team from the game?')) return;
    emit('remove_team', { teamId });
  };

  const handleToggleMp3 = () => {
    if (mp3Playing) {
      stopMp3();
      setMp3Playing(false);
      emit('music_control', { action: 'pause' });
    } else {
      playMp3();
      setMp3Playing(true);
      emit('music_control', {
        action: 'play',
        mediaUrl: currentQuestion?.question?.mediaUrl || '',
      });
    }
  };

  useKeyboardShortcuts({
    ' ': handleNextQuestion,
    t: handleStartTimer,
    p: handlePauseTimer,
    s: handleShowScoreboard,
    r: handleRevealAnswer,
  });

  useEffect(() => {
    if (!showAddTeam) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAddTeamModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAddTeam, closeAddTeamModal]);

  useEffect(() => {
    if (!showRegisteredTeams) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRegisteredTeamsModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showRegisteredTeams, closeRegisteredTeamsModal]);

  useEffect(() => {
    if (!showRoundIntroductionModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRoundIntroductionModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showRoundIntroductionModal, closeRoundIntroductionModal]);

  useEffect(() => {
    if (!showKangarooRaceModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeKangarooRaceModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showKangarooRaceModal, closeKangarooRaceModal]);

  useEffect(() => {
    if (!showScoreboardModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeScoreboardModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showScoreboardModal, closeScoreboardModal]);

  useEffect(() => {
    if (!showTimerModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTimerModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showTimerModal, closeTimerModal]);

  const currentRound = gameState?.rounds?.[gameState.currentRoundIndex];
  const state = gameState?.state || 'LOBBY';
  const questionState = gameState?.questionState || 'WAITING';
  const teamList = gameState?.teams ? Object.values(gameState.teams) : [];
  const sortedTeams = [...teamList].sort((a, b) => b.score - a.score);
  const responsePct =
    gameState && gameState.totalTeams > 0
      ? Math.min(100, ((gameState.responseCount || 0) / gameState.totalTeams) * 100)
      : 0;

  if (!pin) {
    return (
      <div className="text-center py-16">
        <p className="text-foreground/50">No session PIN provided. Go to Sessions to select one.</p>
      </div>
    );
  }

  return (
    <div
      data-name="Host Control Dashboard"
      data-node-id="232:4445"
      className={cn(montserrat.className, 'flex min-h-screen flex-col bg-[#0b0f1a] text-white')}
    >
      <header
        data-name="Header"
        data-node-id="232:4447"
        className="relative z-20 flex h-20 shrink-0 items-center border-b border-white/20 bg-[linear-gradient(180deg,rgba(26,34,52,0.95)_0%,#0b0f1a_100%)] px-4 lg:px-8"
      >
        <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2 lg:gap-3" data-node-id="232:4448">
            <span className="text-[22px] font-bold lg:text-[28px]">
              MAX <span className="text-[#00d9ff]">SHOWDOWN</span>
            </span>
            <span className="text-lg font-normal text-white/80">Host Control</span>
          </div>
          <div
            className="flex flex-1 justify-center text-center text-base font-semibold uppercase tracking-[0.2em] lg:text-xl xl:absolute xl:left-1/2 xl:-translate-x-1/2"
            data-node-id="232:4449"
          >
            {currentRound ? (
              <>
                <span className="text-white">
                  Round {(gameState?.currentRoundIndex ?? 0) + 1}-{' '}
                </span>
                <span className="text-[#00d9ff]">{currentRound.type.replace(/_/g, ' ')}</span>
              </>
            ) : (
              <span className="text-white/60">Lobby</span>
            )}
          </div>
          <div
            className="flex flex-wrap items-center justify-end gap-3 text-sm lg:gap-4 lg:text-base"
            data-node-id="232:4450"
          >
            {/* <Link
                href="/host/sessions"
                className="text-[#00d9ff]/80 underline-offset-2 hover:text-[#00d9ff] hover:underline"
              >
                Sessions
              </Link> */}
            <Link
              href={`/host/teams?pin=${encodeURIComponent(pin)}${sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : ''}`}
              className="text-[#00d9ff]/80 underline-offset-2 hover:text-[#00d9ff] hover:underline"
            >
              Teams
            </Link>
            {state !== 'FINAL_RESULTS' ? (
              <button
                type="button"
                onClick={handleEndGame}
                className="text-xs uppercase tracking-wide text-red-400/90 hover:text-red-300"
              >
                End game
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs uppercase tracking-wide text-white/70 hover:text-[#00d9ff]"
            >
              Logout
            </button>
            <span className="whitespace-nowrap text-white" data-node-id="232:4452">
              Session Pin : <span className="font-mono font-bold text-[#00d9ff]">{pin}</span>
            </span>
            <div
              className="flex items-center gap-2 rounded-full bg-[rgba(0,255,9,0.2)] px-3.5 py-1.5"
              data-node-id="232:4453"
            >
              <span
                className="size-[7px] shrink-0 rounded-[3px] bg-[#00d9ff]"
                data-node-id="232:4455"
              />
              <span className="text-sm font-semibold text-[#00d9ff]" data-node-id="232:4456">
                {isConnected ? 'Live' : 'Offline'}
              </span>
            </div>
            <span className="font-semibold text-[#00d9ff]" data-node-id="232:4458">
              {gameState?.totalTeams ?? 0} Teams Connected
            </span>
          </div>
        </div>
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col lg:flex-row"
        data-name="Main Container"
        data-node-id="232:4459"
      >
        <aside
          data-name="Venue Display"
          className="w-full shrink-0 border-white/10 bg-[linear-gradient(180deg,rgba(20,26,42,0.6)_0%,#0b0f1a_100%)] px-4 py-6 lg:w-[min(100%,395px)] lg:border-r"
        >
          <div className="space-y-10">
            <section data-name="Team Management Panel" data-node-id="232:4462">
              <HostPanelTitle data-node-id="232:4463">Team Management</HostPanelTitle>
              <div
                className="grid grid-cols-2 gap-3"
                data-name="Team Management Item"
                data-node-id="232:4464"
              >
                <HostSidebarTile
                  data-node-id="232:4465"
                  label="Add Team"
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v8M8 12h8" />
                    </svg>
                  }
                  onClick={() => setShowAddTeam(true)}
                />
                <HostSidebarTile
                  data-node-id="232:4472"
                  label="Registered Teams"
                  icon={
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                    </svg>
                  }
                  onClick={() => setShowRegisteredTeams(true)}
                />
              </div>
            </section>

            {/* <section data-name="Venue Display Panel" data-node-id="232:4498">
              <HostPanelTitle data-node-id="232:4499">Venue Display</HostPanelTitle>
              <div
                className="grid grid-cols-2 gap-3"
                data-name="Venue Display Item"
                data-node-id="232:4500"
              >
                <HostSidebarTile
                  data-node-id="232:4501"
                  label="Welcome Screen"
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="5" width="20" height="12" rx="2" />
                      <path d="M8 21h8M12 17v4" />
                    </svg>
                  }
                  onClick={() => setShowRoundIntroductionModal(true)}
                />
                <HostSidebarTile
                  data-node-id="232:4513"
                  label="Round Intro"
                  icon={
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  }
                  onClick={() => emit('advance_round')}
                />
              </div>
            </section> */}
            <section data-name="Main Right Panel" data-node-id="232:4580">
              <HostPanelTitle data-node-id="232:4581">Game Controls</HostPanelTitle>
              <div
                className="grid grid-cols-2 gap-3"
                data-name="Control Panel"
                data-node-id="232:4582"
              >
                <HostSidebarTile
                  data-node-id="232:4583"
                  label="Kangaroo Race"
                  active={showKangarooRaceModal}
                  icon={<span className="text-4xl leading-none">🦘</span>}
                  onClick={() => setShowKangarooRaceModal(true)}
                />
                <HostSidebarTile
                  data-node-id="232:4588"
                  label="Card Shuffle"
                  active={!!activeMiniGameLocal && activeMiniGameLocal === 'card_shuffle'}
                  icon={
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M4 4h16v4H4V4zm0 6h10v10H4V10zm12 0h4v4h-4v-4zm0 6h4v4h-4v-4z" />
                    </svg>
                  }
                  onClick={handleOpenCardShuffleControls}
                />
              </div>
            </section>

            <section data-name="Media Controls" data-node-id="232:4478">
              <HostPanelTitle data-node-id="232:4480">Media Controls</HostPanelTitle>
              <div className="grid grid-cols-2 gap-3">
                <HostSidebarTile
                  label="Play/Pause MP3"
                  active={mp3Playing}
                  disabled={
                    !currentQuestion?.question?.mediaUrl ||
                    (currentQuestion?.question?.mediaType || '').toLowerCase() !== 'mp3'
                  }
                  icon={
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                    </svg>
                  }
                  onClick={handleToggleMp3}
                />
                <HostSidebarTile
                  label="Play/Pause MP4"
                  active={mp4Playing}
                  disabled={
                    !currentQuestion?.question?.mediaUrl ||
                    (currentQuestion?.question?.mediaType || '').toLowerCase() !== 'mp4'
                  }
                  icon={
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                    </svg>
                  }
                  onClick={() => setMp4Playing((p) => !p)}
                />
              </div>
            </section>
          </div>
        </aside>

        <main
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-4 py-4"
          data-name="Question Panel"
          data-node-id="232:4518"
        >
          {/* ── Mini-Game Active / Loading ── */}
          {activeMiniGameLocal || miniGameLoading ? (
            <div className="flex min-h-0 flex-1 flex-col rounded-2xl border-2 border-[rgba(0,217,255,0.45)] bg-[linear-gradient(180deg,rgba(26,31,46,0.85)_0%,rgba(11,15,26,0.92)_100%)] p-4 shadow-[0_0_28px_rgba(0,217,255,0.12)] sm:p-6">
              <div className="mb-4 flex shrink-0 items-center justify-between">
                <h2 className="text-2xl font-semibold text-white sm:text-[30px]">
                  {activeMiniGameLocal === 'horse_race'
                    ? 'Kangaroo Race'
                    : activeMiniGameLocal === 'card_shuffle'
                      ? 'Card Shuffle'
                      : 'Mini-Game'}
                </h2>
                <div className="flex items-center gap-3">
                  {miniGameRevealing ? (
                    <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-400 animate-pulse">
                      Revealing Winner on Venue
                    </span>
                  ) : activeMiniGameLocal ? (
                    <>
                      <span className="rounded-full bg-green-500/20 border border-green-500/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-green-400">
                        Live on Venue
                      </span>
                      <button
                        type="button"
                        onClick={handleExitMiniGame}
                        className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-[linear-gradient(180deg,#dc2626_0%,#7f1d1d_100%)] px-4 py-2 text-sm font-bold uppercase tracking-wide text-white shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition hover:brightness-110"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
                          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                        Exit Game
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {miniGameLoading && !activeMiniGameLocal ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4">
                  <div className="text-5xl animate-pulse">
                    {gameState?.activeMiniGame === 'horse_race' ? '🦘' : '🃏'}
                  </div>
                  <p className="text-lg font-semibold text-white/60">
                    Launching mini-game on venue...
                  </p>
                  <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-full animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full bg-[linear-gradient(90deg,transparent_0%,#00d9ff_50%,transparent_100%)] bg-[length:200%_100%]" />
                  </div>
                </div>
              ) : activeMiniGameLocal === 'card_shuffle' ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-6">
                  <div className="text-6xl">🃏</div>
                  <p className="text-xl font-bold text-white">
                    Card Shuffle is running on the big screen
                  </p>
                  <p className="text-sm text-white/50">
                    Players are choosing Left, Middle, or Right on their phones
                  </p>

                  <div className="w-full max-w-3xl rounded-2xl border border-[#00d9ff]/25 bg-[#080d1c]/80 p-4 shadow-[0_0_24px_rgba(0,217,255,0.12)]">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#00d9ff]">
                          Card Shuffle Controls
                        </p>
                        <p className="mt-1 text-sm text-white/50">
                          {cardShuffleVenueReady
                            ? cardShuffleGameStarted
                              ? cardShuffleRevealPosition
                                ? `Round ${cardShuffleActiveRound || 1} revealed on venue.`
                                : miniGameRevealing
                                  ? `Revealing round ${cardShuffleActiveRound || 1}...`
                                  : `Round ${cardShuffleActiveRound || 1} is active.`
                              : 'Venue is ready. Click Start Game to unlock rounds.'
                            : 'Loading on venue. Controls will unlock automatically.'}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider',
                          cardShuffleVenueReady
                            ? 'border-green-500/45 bg-green-500/15 text-green-300'
                            : 'border-white/15 bg-white/5 text-white/45',
                        )}
                      >
                        {cardShuffleVenueReady ? 'Ready' : 'Waiting'}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={!cardShuffleVenueReady}
                      onClick={handleCardShuffleStartGame}
                      className={cn(
                        'mb-3 h-14 w-full rounded-xl border px-5 text-lg font-black uppercase tracking-wide transition',
                        cardShuffleVenueReady
                          ? 'border-[#00d9ff]/70 bg-[linear-gradient(180deg,#00a9df_0%,#075a89_100%)] text-white shadow-[0_0_22px_rgba(0,217,255,0.28)] hover:brightness-110'
                          : 'cursor-not-allowed border-white/10 bg-white/8 text-white/30 grayscale',
                      )}
                    >
                      Start Game
                    </button>

                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      {([1, 2, 3, 4] as const).map((roundNumber) => (
                        <button
                          key={roundNumber}
                          type="button"
                          disabled={!cardShuffleVenueReady || !cardShuffleGameStarted}
                          onClick={() => handleCardShuffleCommand('next_round', roundNumber)}
                          className={cn(
                            'h-12 rounded-lg border px-3 text-sm font-extrabold uppercase tracking-wide transition',
                            cardShuffleVenueReady &&
                              cardShuffleGameStarted &&
                              cardShuffleActiveRound === roundNumber
                              ? 'border-green-400/80 bg-[linear-gradient(180deg,#0f8f4d_0%,#064422_100%)] text-white shadow-[0_0_18px_rgba(34,197,94,0.38)] hover:brightness-110'
                              : cardShuffleVenueReady && cardShuffleGameStarted
                                ? 'border-[#ffc400]/55 bg-[linear-gradient(180deg,#7a3cff_0%,#31116f_100%)] text-white shadow-[0_0_16px_rgba(122,60,255,0.24)] hover:brightness-110'
                                : 'cursor-not-allowed border-white/10 bg-white/7 text-white/28 grayscale',
                          )}
                        >
                          Start Round {roundNumber}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      disabled={
                        !cardShuffleVenueReady ||
                        !cardShuffleGameStarted ||
                        miniGameRevealing ||
                        cardShuffleRevealPosition !== null
                      }
                      onClick={() => handleCardShuffleCommand('reveal_cards')}
                      className={cn(
                        'mt-3 h-12 w-full rounded-lg border px-4 text-sm font-extrabold uppercase tracking-wide transition',
                        cardShuffleVenueReady &&
                          cardShuffleGameStarted &&
                          !miniGameRevealing &&
                          cardShuffleRevealPosition === null
                          ? 'border-[#ff68ff]/65 bg-[linear-gradient(180deg,#b100d5_0%,#6b0a90_100%)] text-white shadow-[0_0_18px_rgba(255,67,255,0.26)] hover:brightness-110'
                          : 'cursor-not-allowed border-white/10 bg-white/7 text-white/28 grayscale',
                      )}
                    >
                      {miniGameRevealing ? 'Revealing...' : 'Reveal Cards'}
                    </button>
                  </div>

                  <div className="mt-2 flex gap-4">
                    {CARD_SHUFFLE_SLOTS.map((n, i) => (
                      <div
                        key={n}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-xl border-2 px-6 py-4 transition-all',
                          cardShuffleRevealPosition === n
                            ? 'border-green-500/60 bg-green-500/10'
                            : 'border-white/10 bg-white/5',
                        )}
                      >
                        <span className="text-3xl">🃏</span>
                        <span className="text-sm font-bold text-white">
                          {CARD_POSITION_LABELS[n]}
                        </span>
                        <span className="text-lg font-mono font-bold text-[#00d9ff]">
                          {cardPickCounts[i] ?? 0}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-white/40">
                          picks
                        </span>
                      </div>
                    ))}
                  </div>
                  {cardShuffleRevealPosition ? (
                    <p className="text-xs text-white/50 mt-2">
                      Winning position:{' '}
                      <span className="text-green-400 font-semibold">
                        {CARD_POSITION_LABELS[cardShuffleRevealPosition]}
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : activeMiniGameLocal === 'horse_race' ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-6">
                  <div className="text-6xl">🦘</div>
                  <p className="text-xl font-bold text-white">
                    Kangaroo Race is running on the big screen
                  </p>
                  <p className="text-sm text-white/50">Players are betting on their phones</p>
                  <div className="mt-2 flex flex-wrap justify-center gap-3">
                    {KANGAROO_SLOTS.map((n, i) => (
                      <div
                        key={n}
                        className={cn(
                          'flex flex-col items-center gap-1 rounded-xl border-2 px-4 py-3 transition-all',
                          winningKangaroo === n
                            ? 'border-green-500/60 bg-green-500/10'
                            : 'border-white/10 bg-white/5',
                        )}
                      >
                        <span className="text-2xl">🦘</span>
                        <span className="text-xs font-bold text-white">#{n}</span>
                        <span className="text-base font-mono font-bold text-[#00d9ff]">
                          {kangarooBetCounts[i] ?? 0}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-white/40">
                          bets
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : currentQuestion ? (
            <div className="flex min-h-0 flex-1 flex-col animate-fadeIn">
              <div className="mx-auto flex h-full w-full flex-col overflow-hidden rounded-2xl border border-white/10 shadow-[0_0_28px_rgba(0,0,0,0.5)]">
                {/* Media Section */}
                <div className="relative shrink-0 bg-black/40">
                  <div className="absolute left-4 top-3 z-10 text-xl font-bold text-white/90 drop-shadow-md">
                    Question {(currentQuestion.questionIndex || 0) + 1}/
                    {currentQuestion.totalQuestions}
                  </div>
                  {currentQuestion.pointsForQuestion ? (
                    <div className="absolute right-4 top-3 z-10 text-lg font-black italic text-[#00d9ff]">
                      {currentQuestion.pointsForQuestion} PTS
                    </div>
                  ) : null}

                  {/* Media Content */}
                  <div className="h-64 w-full sm:h-80 lg:h-96">
                    {currentQuestion.question.mediaUrl &&
                    isImageMedia(
                      currentQuestion.question.mediaType,
                      currentQuestion.question.mediaUrl,
                    ) ? (
                      <img
                        src={resolveMediaUrl(currentQuestion.question.mediaUrl)}
                        className="h-full w-full object-cover"
                        alt="Question media"
                      />
                    ) : currentQuestion.question.mediaUrl &&
                      (currentQuestion.question.mediaType || '').toLowerCase() === 'mp4' ? (
                      <video
                        src={resolveMediaUrl(currentQuestion.question.mediaUrl)}
                        className="h-full w-full bg-black object-contain"
                        controls={mp4Playing}
                        autoPlay={mp4Playing}
                      />
                    ) : (
                      <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
                        <img
                          src="/withoutImagequestion.png"
                          className="h-full w-full object-cover opacity-60"
                          alt="placeholder"
                        />
                        {(currentQuestion.question.mediaType || '').toLowerCase() === 'mp3' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-blue-900/20">
                            <span className="text-lg font-bold text-white">Audio Question</span>
                          </div>
                        )}
                        {!currentQuestion.question.mediaUrl && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[120px] font-black text-white/5 opacity-40">
                              ?
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Circular Timer Overlay */}
                  <div className="pointer-events-none absolute bottom-0 left-1/2 z-30 h-24 w-48 -translate-x-1/2 overflow-hidden">
                    <div className="absolute left-0 top-0 h-48 w-48 rounded-full p-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.6)] bg-linear-to-r from-[#ff0000] via-[#ddff00] via-[#ffaa00] to-[#00ff00]">
                      <div className="relative flex h-full w-full overflow-hidden rounded-full border border-white/10 bg-[#030818] justify-center pt-6">
                        <span className="relative z-10 text-5xl font-black tracking-tighter text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]">
                          {timerRemaining}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Content Section */}
                <div className="relative z-20 flex-1 border-t-2 border-t-white/20 bg-[linear-gradient(180deg,#0a0f2b_0%,#04060e_100%)] px-6 pb-6 pt-14 shadow-inner">
                  <div className="mb-6 text-center">
                    <p className="text-xl font-black leading-tight text-white sm:text-2xl">
                      Q{(currentQuestion.questionIndex || 0) + 1}. {currentQuestion.question.text}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pb-2 pt-2">
                    {currentQuestion.question.options.map((opt, i) => {
                      const isCorrect = revealData && i === revealData.correctOptionIndex;
                      return (
                        <div
                          key={i}
                          className={cn(
                            'flex h-[57px] items-center rounded-xl border-2 px-4 py-4 text-base font-black text-white transition-all shadow-[0_4px_12px_rgba(0,0,0,0.5)]',
                            VENUE_OPTION_COLOR_CLASSES[i % VENUE_OPTION_COLOR_CLASSES.length],
                            isCorrect
                              ? 'z-10 scale-[1.03] shadow-[0_0_12px_8px_rgba(57,255,74,0.8)]'
                              : revealData
                                ? 'scale-[0.98] brightness-50 contrast-75 opacity-30'
                                : '',
                          )}
                        >
                          <span className="mr-3 font-black text-white/50">
                            {OPTION_LETTERS[i]}.
                          </span>
                          <span className="flex-1 truncate">{opt.text}</span>
                          {isCorrect && (
                            <div className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white bg-green-500 shadow-lg">
                              <span className="text-sm text-white">✓</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {revealData?.allWrong && (
                    <div className="mt-4 animate-pulse rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2.5 text-center text-sm font-bold text-orange-400">
                      All teams answered incorrectly — no eliminations
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-[rgba(0,217,255,0.25)] bg-[#151b2e]/40 p-8">
              {state === 'ROUND_INTRO' ? (
                <div className="w-full max-w-[980px] animate-fadeIn text-center">
                  <div className="mx-auto mb-7 inline-flex items-center gap-3 rounded-full border border-[#41d9ff]/45 bg-[linear-gradient(180deg,rgba(20,42,89,0.95)_0%,rgba(11,20,46,0.95)_100%)] px-8 py-3 shadow-[0_0_22px_rgba(0,217,255,0.2)]">
                    <span className="text-base font-semibold uppercase tracking-[0.2em] text-[#8cdfff]">
                      Round {(gameState?.currentRoundIndex || 0) + 1}
                    </span>
                    <span className="h-2 w-2 rounded-full bg-[#00ffcc]" />
                    <span className="text-base font-semibold uppercase tracking-[0.18em] text-[#8cdfff]">
                      {formatRoundTypeLabel(currentRound?.type || 'MULTIPLE_CHOICE')}
                    </span>
                  </div>

                  <h2 className="text-6xl font-black leading-none text-white drop-shadow-[0_0_14px_rgba(123,194,255,0.45)]">
                    {currentRound?.name || 'Get Ready'}
                  </h2>
                  <p className="mt-3 text-[26px] font-semibold text-[#9de9ff]">
                    Next question set is about to start
                  </p>

                  <div className="mx-auto mt-10 w-full max-w-[820px] rounded-3xl p-[3px] bg-gradient-to-r from-[#2cd7ff] via-[#1588ff] to-[#2cd7ff] shadow-[0_0_26px_rgba(44,215,255,0.35)]">
                    <div className="rounded-[22px] bg-gradient-to-r from-[#1e0a88]/95 to-[#5a14a8]/95 px-10 py-8 text-left">
                      <p className="text-[46px] font-black text-[#39ff14] leading-none mb-4">
                        {getRoundScoringLines(currentRound?.type).positive}
                      </p>
                      <p className="text-[46px] font-black text-[#ff2d2d] leading-none">
                        {getRoundScoringLines(currentRound?.type).negative}
                      </p>
                    </div>
                  </div>
                </div>
              ) : state === 'FINAL_RESULTS' ? (
                <div className="w-full max-w-[900px] text-center">
                  <div className="mx-auto mb-6 inline-flex items-center gap-3 rounded-full border border-[#41d9ff]/45 bg-[linear-gradient(180deg,rgba(20,42,89,0.95)_0%,rgba(11,20,46,0.95)_100%)] px-8 py-3 shadow-[0_0_22px_rgba(0,217,255,0.2)]">
                    <span className="text-base font-semibold uppercase tracking-[0.2em] text-[#8cdfff]">
                      Game Complete
                    </span>
                  </div>

                  <h2 className="text-5xl font-black leading-none text-white drop-shadow-[0_0_14px_rgba(123,194,255,0.45)] sm:text-6xl">
                    Thank You For Playing
                  </h2>
                  <p className="mt-4 text-xl font-medium text-[#9de9ff] sm:text-2xl">
                    The game has ended successfully.
                  </p>
                  <p className="mt-3 text-base text-white/60 sm:text-lg">
                    Players and venue screens can now view the final end-of-game message.
                  </p>

                  <div className="mx-auto mt-10 flex max-w-[460px] flex-wrap justify-center gap-4">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="min-w-[180px] rounded-xl border border-[rgba(0,217,255,0.45)] bg-[linear-gradient(180deg,#3a4a68_0%,#1e2a42_100%)] px-8 py-4 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-[0_0_18px_rgba(0,217,255,0.18)] transition hover:brightness-110"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <p className="mb-2 text-2xl font-bold text-white/30">
                    {state === 'LOBBY'
                      ? 'Waiting for teams to join...'
                      : state === 'SCOREBOARD'
                        ? 'Showing Scoreboard'
                        : state === 'BREAK'
                          ? 'Break Time'
                          : 'Waiting...'}
                  </p>
                  {state === 'LOBBY' ? (
                    <p className="text-sm text-white/40">
                      {teamList.length} team{teamList.length !== 1 ? 's' : ''} in lobby
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </main>

        <aside
          data-name="Right Panel"
          className="w-full shrink-0 border-white/10 bg-[linear-gradient(180deg,rgba(20,26,42,0.6)_0%,#0b0f1a_100%)] px-4 py-6 lg:w-[min(100%,395px)] lg:border-l"
        >
          <div className="space-y-10">
            <section data-name="Live Responses Panel" data-node-id="232:4549">
              <HostPanelTitle data-node-id="232:4556">Live Responses</HostPanelTitle>
              <div
                className="rounded-xl border border-[rgba(0,217,255,0.25)] bg-[#151b2e]/80 px-4 py-4"
                data-name="Response Progress Container"
              >
                <p className="mb-4 text-lg text-white" data-node-id="232:4555">
                  <span className="font-bold text-[#00d9ff]">{gameState?.responseCount ?? 0}</span>{' '}
                  <span className="font-medium">
                    of {gameState?.totalTeams ?? 0} Teams responded
                  </span>
                </p>

                <div className="space-y-4">
                  {[
                    {
                      label: 'Correct',
                      value: liveResponses.correct,
                      color: 'from-[#00ff00] to-[#008000]',
                      track: 'bg-[#3d7a3d]/60',
                      icon: '✓',
                      iconBg: 'bg-green-500',
                    },
                    {
                      label: 'Incorrect',
                      value: liveResponses.incorrect,
                      color: 'from-[#ff0000] to-[#800000]',
                      track: 'bg-[#7a3d3d]/60',
                      icon: '×',
                      iconBg: 'bg-red-500',
                    },
                    {
                      label: 'No Answer',
                      value: liveResponses.noAnswer,
                      color: 'from-[#3b82f6] to-[#1e3a8a]',
                      track: 'bg-[#3d507a]/60',
                      icon: '?',
                      iconBg: 'bg-blue-500',
                    },
                  ].map((item) => {
                    const total = Math.max(1, gameState?.totalTeams || 1);
                    const width = Math.max(
                      0,
                      Math.min(100, Math.round((item.value / total) * 100)),
                    );
                    return (
                      <div key={item.label} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-white/70">
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                item.iconBg,
                                'flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white border border-white/20',
                              )}
                            >
                              {item.icon}
                            </div>
                            <span>{item.label}</span>
                          </div>
                          <span className="text-[#00d9ff] italic text-sm">{item.value}</span>
                        </div>
                        <div
                          className={cn(
                            'h-2.5 rounded-full overflow-hidden border border-white/10',
                            item.track,
                          )}
                        >
                          <div
                            className={cn(
                              'h-full rounded-full bg-linear-to-r shadow-[0_0_12px_rgba(255,255,255,0.2)] transition-all duration-500',
                              item.color,
                            )}
                            style={{ width: `${width}%`, minWidth: item.value > 0 ? '6px' : '0px' }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section data-name="Leaderboard Panel" data-node-id="232:4557">
              <h2
                className="mb-4 text-xl font-bold text-white sm:text-[25px]"
                data-node-id="232:4579"
              >
                Leaderboard
              </h2>
              <div
                className="overflow-hidden rounded-lg border border-white/20"
                data-name="Leaderboard Container"
              >
                {sortedTeams.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-white/40">No teams yet</p>
                ) : (
                  sortedTeams.slice(0, 5).map((team, idx) => (
                    <div
                      key={team.teamId}
                      className="flex items-center gap-3 border-b border-white/20 bg-[#1a1f2e] px-4 py-3 last:border-b-0"
                      data-name="Rank Background"
                    >
                      <div className="flex size-[34px] shrink-0 items-center justify-center rounded bg-[#0b0f1a] text-lg font-semibold text-white">
                        {idx + 1}
                      </div>
                      <div className="min-w-0 flex-1 text-base text-white">
                        <span className="font-medium">{team.teamName}</span>
                        <span className="font-bold"> : {team.score} Points</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </aside>
      </div>

      {state !== 'FINAL_RESULTS' ? (
        <footer
          data-name="Button Container"
          data-node-id="232:4596"
          className="shrink-0 border-t border-white/20 bg-[linear-gradient(180deg,#1e2538_0%,#0b0f1a_100%)] px-3 py-4"
        >
          <div className="mx-auto flex w-full max-w-[1920px] flex-wrap items-stretch justify-center gap-2">
            <HostFooterBtn
              icon={
                <svg viewBox="0 0 24 24" fill="currentColor" className="text-[#00d9ff]">
                  <path d="M6 11h2v2H6v-2zm4 0h2v2h-2v-2zm8-6V5H4v14h14v-6h2V5zm0 8h-2v2h2v-2z" />
                </svg>
              }
              disabled={!(state === 'LOBBY' || state === 'ROUND_INTRO')}
              onClick={() => {
                if (state === 'LOBBY') handleStartGame();
                else if (state === 'ROUND_INTRO') handleNextQuestion();
              }}
            >
              {state === 'LOBBY' ? 'Start Game' : 'Start Round'}
            </HostFooterBtn>
            <HostFooterBtn
              emphasis={state === 'QUESTION' && questionState === 'REVEALED'}
              icon={
                <svg viewBox="0 0 24 24" fill="currentColor" className="text-[#00d9ff]">
                  <path d="M6 18l8.5-6L6 6v12zm8-12v12h2V6h-2z" />
                </svg>
              }
              disabled={!(state === 'QUESTION' && questionState === 'REVEALED')}
              onClick={handleNextQuestion}
            >
              Next Question
            </HostFooterBtn>
            <HostFooterBtn
              emphasis={showTimerModal}
              icon={
                <svg viewBox="0 0 24 24" fill="currentColor" className="text-[#00d9ff]">
                  {state === 'QUESTION' && questionState === 'ACTIVE' && !timerPaused ? (
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  ) : (
                    <path d="M8 5v14l11-7L8 5z" />
                  )}
                </svg>
              }
              disabled={
                !(
                  state === 'QUESTION' &&
                  (questionState === 'WAITING' || questionState === 'ACTIVE')
                )
              }
              onClick={() => {
                setShowTimerModal(true);
                if (state === 'QUESTION' && questionState === 'ACTIVE' && !timerPaused) {
                  handlePauseTimer();
                  return;
                }
                handleStartTimer();
              }}
            >
              {state === 'QUESTION' && questionState === 'ACTIVE' && !timerPaused
                ? 'Pause Timer'
                : 'Start Timer'}
            </HostFooterBtn>
            <HostFooterBtn
              icon={
                <svg viewBox="0 0 24 24" fill="currentColor" className="text-[#00d9ff]">
                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                </svg>
              }
              disabled={!(state === 'QUESTION' && questionState === 'ACTIVE')}
              onClick={handleRevealAnswer}
            >
              Reveal Answer
            </HostFooterBtn>
            <HostFooterBtn
              icon={
                <svg viewBox="0 0 24 24" fill="currentColor" className="text-[#00d9ff]">
                  <path d="M4 19h16v2H4v-2zm2-4h12v2H6v-2zm4-4h4v2h-4v-2zm2-10.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5S11 6.83 11 6s.67-1.5 1.5-1.5z" />
                </svg>
              }
              disabled={state === 'LOBBY' || state === 'FINAL_RESULTS'}
              onClick={() => (state === 'BREAK' ? handleEndBreak() : handleStartBreak())}
            >
              {state === 'BREAK' ? 'End Break' : 'Start Break'}
            </HostFooterBtn>
            <HostFooterBtn
              emphasis={isScoreboardVisible}
              icon={
                <svg viewBox="0 0 24 24" fill="currentColor" className="text-[#00d9ff]">
                  <path d="M5 3h4v2H5V3zm0 6h4v2H5V9zm0 6h4v2H5v-2zm6-12h10v2H11V3zm0 6h10v2H11V9zm0 6h10v2H11v-2z" />
                </svg>
              }
              onClick={handleShowScoreboard}
            >
              {isScoreboardVisible ? 'Hide Scoreboard' : 'Show Scoreboard'}
            </HostFooterBtn>
            <HostFooterBtn
              icon={
                <svg viewBox="0 0 24 24" fill="currentColor" className="text-[#00d9ff]">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
              }
              disabled={state !== 'SCOREBOARD'}
              onClick={handleAdvanceRound}
            >
              Next Round
            </HostFooterBtn>
          </div>
          <p className="mt-2 text-center text-[10px] text-white/30">
            Space=Next · T=Timer · P=Pause · R=Reveal · S=Scoreboard
          </p>
        </footer>
      ) : null}

      {/* ═══════ MODALS ═══════ */}
      {showRegisteredTeams ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4 backdrop-blur-[5px]"
          data-name="Host Control Register Teams"
          data-node-id="232:2057"
          onClick={closeRegisteredTeamsModal}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="registered-teams-title"
            className="relative z-10 flex max-h-[min(90vh,520px)] w-full max-w-3xl flex-col rounded-2xl border-2 border-[rgba(0,217,255,0.55)] bg-[rgba(26,31,46,0.98)] shadow-[0_0_30px_rgba(0,217,255,0.18)]"
            data-node-id="232:2090"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              data-name="maki:cross"
              data-node-id="232:2091"
              onClick={closeRegisteredTeamsModal}
              className="absolute right-4 top-4 z-10 flex size-7 items-center justify-center rounded-md text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
              aria-label="Close"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            <div className="px-6 pb-4 pt-8 pr-14">
              <h2
                id="registered-teams-title"
                className="text-xl font-semibold text-white"
                data-node-id="232:2094"
              >
                Registered Teams
              </h2>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6" data-node-id="232:2093">
              {sortedTeams.length === 0 ? (
                <p className="py-10 text-center text-base text-white/40">No teams registered</p>
              ) : (
                <ul className="flex flex-col gap-0 rounded-lg border border-white/10 overflow-hidden">
                  {sortedTeams.map((team, idx) => (
                    <li
                      key={team.teamId}
                      className={cn(
                        'flex h-[57px] items-center gap-4 border-b border-white/10 bg-[#151b2e] px-4 last:border-b-0',
                        team.isEliminated && 'opacity-50',
                      )}
                      data-node-id={idx === 0 ? '232:2095' : undefined}
                    >
                      <div
                        className="flex size-[34px] shrink-0 items-center justify-center rounded bg-[#2e354c] text-lg font-semibold text-white"
                        data-name="Container"
                        data-node-id="232:2102"
                      >
                        {idx + 1}
                      </div>
                      <span
                        className="min-w-0 flex-1 truncate text-xl font-medium text-white"
                        data-node-id="232:2104"
                      >
                        {team.teamName}
                      </span>
                      <span
                        className="shrink-0 text-xl font-bold text-[#00d9ff]"
                        data-node-id="232:2105"
                      >
                        {team.score} Points
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          data-name="boxicons:edit-filled"
                          data-node-id="232:2097"
                          onClick={() => {
                            closeRegisteredTeamsModal();
                            setEditScoreTeamId(team.teamId);
                            setEditScoreValue(String(team.score));
                          }}
                          className="flex size-[30px] items-center justify-center rounded border border-[#00d9ff]/50 bg-[#00d9ff]/10 text-[#00d9ff] transition-colors hover:bg-[#00d9ff]/20"
                          aria-label={`Edit score for ${team.teamName}`}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden
                          >
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          data-name="weui:delete-filled"
                          data-node-id="232:2100"
                          onClick={() => handleRemoveTeam(team.teamId)}
                          className="flex size-[30px] items-center justify-center rounded border border-red-500/40 bg-red-500/10 text-red-500 transition-colors hover:bg-red-500/20"
                          aria-label={`Remove ${team.teamName}`}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden
                          >
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showRoundIntroductionModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4 backdrop-blur-[5px]"
          data-name="Host Control Round Intro"
          data-node-id="232:2610"
          onClick={closeRoundIntroductionModal}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="round-intro-title"
            className="relative z-10 flex max-h-[min(90vh,470px)] w-full max-w-[1008px] flex-col rounded-2xl border-2 border-[rgba(0,217,255,0.55)] bg-[rgba(26,31,46,0.98)] shadow-[0_0_30px_rgba(0,217,255,0.18)]"
            data-node-id="232:2644"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              data-name="maki:cross"
              data-node-id="232:2645"
              onClick={closeRoundIntroductionModal}
              className="absolute right-4 top-4 z-10 flex size-7 items-center justify-center rounded-md text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
              aria-label="Close"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            <div className="px-6 pb-3 pt-8 pr-14">
              <h2
                id="round-intro-title"
                className="text-xl font-semibold text-white"
                data-node-id="232:2648"
              >
                Round Introduction
              </h2>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6" data-node-id="232:2649">
              <div
                className="rounded-xl border border-white/10 bg-[#151b2e] px-5 py-6 sm:px-8"
                data-node-id="232:2650"
              >
                {currentRound ? (
                  <>
                    <p className="mb-4 text-center text-xl text-white" data-node-id="232:2651">
                      <span className="font-medium">
                        Round {(gameState?.currentRoundIndex ?? 0) + 1} -
                      </span>
                      <span className="font-semibold text-[#00d9ff]">
                        {' '}
                        {formatRoundTypeLabel(currentRound.type)}
                      </span>
                    </p>
                    <p
                      className="text-[15px] font-medium leading-relaxed text-white"
                      data-node-id="232:2652"
                    >
                      {currentRound.name}. This is what players see on the venue screen during round
                      intro—title, type badge, and progress. Use{' '}
                      <span className="text-[#00d9ff]/90">Round Intro</span> to push the live
                      display, or <span className="text-[#00d9ff]/90">Start Round</span> when you
                      are ready to begin questions.
                    </p>
                  </>
                ) : (
                  <p className="text-center text-[15px] text-white/60">
                    No round data yet. Start the session from the lobby to load the quiz rounds.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showKangarooRaceModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4 backdrop-blur-[5px]"
          data-name="Host Control Kangaroo Race"
          data-node-id="232:3091"
          onClick={closeKangarooRaceModal}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="kangaroo-race-title"
            className="relative z-10 flex max-h-[min(92vh,820px)] w-full max-w-[1008px] flex-col rounded-2xl border-2 border-[rgba(0,217,255,0.55)] bg-[rgba(26,31,46,0.98)] shadow-[0_0_30px_rgba(0,217,255,0.18)]"
            data-node-id="232:3096"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              data-name="maki:cross"
              data-node-id="232:3105"
              onClick={closeKangarooRaceModal}
              className="absolute right-4 top-4 z-10 flex size-7 items-center justify-center rounded-md text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
              aria-label="Close"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            <div className="flex items-center gap-2 px-6 pb-2 pt-8 pr-14" data-node-id="232:3160">
              <h2
                id="kangaroo-race-title"
                className="text-[25px] font-semibold text-white"
                data-node-id="232:3161"
              >
                Kangaroo Race
              </h2>
              <span className="text-2xl leading-none" data-node-id="232:3162" aria-hidden>
                🦘
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
              <p className="mb-3 text-xl font-semibold text-white" data-node-id="232:3146">
                Select Winning Kangaroo
              </p>
              <div className="mb-8 grid grid-cols-3 gap-3 sm:gap-4" data-node-id="232:3147">
                {KANGAROO_SLOTS.map((n) => {
                  const selected = winningKangaroo === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      data-node-id={n === 1 ? '232:3148' : n === 3 ? '232:3152' : undefined}
                      onClick={() => setWinningKangaroo(n)}
                      className={cn(
                        'flex h-[100px] items-center justify-center rounded-xl border-2 text-5xl font-semibold transition-colors sm:h-[120px] sm:text-7xl',
                        selected
                          ? 'border-white/50 bg-[#008122] text-white shadow-[0_3px_3px_rgba(0,0,0,0.3)]'
                          : 'border-[rgba(0,217,255,0.35)] bg-[#151b2e] text-[#00d9ff] hover:border-[#00d9ff]/60',
                      )}
                      aria-pressed={selected}
                      aria-label={`Select kangaroo ${n} as winner`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>

              <p className="mb-3 text-xl font-semibold text-white" data-node-id="232:3144">
                User Inputs
              </p>
              <div
                className="mb-8 overflow-hidden rounded-lg border border-white/10"
                data-node-id="232:3107"
              >
                {KANGAROO_SLOTS.map((n, i) => {
                  const count = kangarooBetCounts[i] ?? 0;
                  const isWinRow = winningKangaroo === n;
                  const rightLabel =
                    count === 0 ? 'Not Selected' : count === 1 ? '1 Team' : `${count} Teams`;
                  return (
                    <div
                      key={n}
                      className={cn(
                        'flex h-[57px] items-center gap-4 border-b border-white/10 px-4 last:border-b-0',
                        isWinRow ? 'bg-[#0d2818]' : 'bg-[#151b2e]',
                      )}
                      data-node-id={
                        n === 1
                          ? '232:3108'
                          : n === 2
                            ? '232:3116'
                            : n === 3
                              ? '232:3123'
                              : undefined
                      }
                    >
                      <span className="text-xl font-medium text-white">Kangaroo</span>
                      <div
                        className={cn(
                          'flex size-[34px] shrink-0 items-center justify-center rounded text-lg font-semibold text-white',
                          isWinRow
                            ? 'border border-white/50 bg-[#008122] shadow-[0_3px_3px_rgba(0,0,0,0.3)]'
                            : 'bg-[#2e354c]',
                        )}
                        data-name="Container"
                      >
                        {n}
                      </div>
                      <span className="ml-auto text-xl font-bold text-[#00d9ff]">{rightLabel}</span>
                    </div>
                  );
                })}
              </div>

              <div
                className="flex flex-wrap justify-center gap-4 sm:justify-start"
                data-node-id="232:3097"
              >
                <button
                  type="button"
                  data-node-id="232:3099"
                  onClick={closeKangarooRaceModal}
                  className="h-[50px] min-w-[140px] rounded-lg border border-white/15 bg-[linear-gradient(180deg,#2e354c_0%,#1a2030_100%)] px-8 text-base font-medium uppercase tracking-wide text-white/80 shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition hover:brightness-110"
                >
                  <span data-node-id="232:3101">CANCLE</span>
                </button>
                <button
                  type="button"
                  data-node-id="232:3103"
                  onClick={handleKangarooRaceSave}
                  className="h-[50px] min-w-[140px] rounded-lg border border-red-500/40 bg-[linear-gradient(180deg,#dc2626_0%,#7f1d1d_100%)] px-8 text-base font-bold uppercase tracking-wide text-white shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition hover:brightness-110"
                >
                  <span data-node-id="232:3104">Save</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showScoreboardModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4 backdrop-blur-[5px]"
          data-name="Host Control Score Board"
          data-node-id="232:2837"
          onClick={closeScoreboardModal}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="scoreboard-modal-title"
            className="relative z-10 flex max-h-[min(92vh,520px)] w-full max-w-[1008px] flex-col rounded-2xl border-2 border-[rgba(0,217,255,0.55)] bg-[rgba(26,31,46,0.98)] shadow-[0_0_30px_rgba(0,217,255,0.18)]"
            data-node-id="232:2871"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              data-name="maki:cross"
              data-node-id="232:2903"
              onClick={closeScoreboardModal}
              className="absolute right-4 top-4 z-10 flex size-7 items-center justify-center rounded-md text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
              aria-label="Close"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            <div className="px-6 pb-4 pt-8 pr-14">
              <h2
                id="scoreboard-modal-title"
                className="text-xl font-semibold text-white"
                data-node-id="232:2906"
              >
                Score Board
              </h2>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6" data-node-id="232:2872">
              {sortedTeams.length === 0 ? (
                <p className="py-10 text-center text-base text-white/40">
                  No teams on the scoreboard yet
                </p>
              ) : (
                <ul className="flex flex-col gap-0 overflow-hidden rounded-lg border border-white/10">
                  {sortedTeams.slice(0, 5).map((team, idx) => (
                    <li
                      key={team.teamId}
                      className={cn(
                        'flex h-[57px] items-center gap-4 border-b border-white/10 bg-[#151b2e] px-4 last:border-b-0',
                        team.isEliminated && 'opacity-50',
                      )}
                      data-node-id={SCOREBOARD_MODAL_ROW_IDS[idx]}
                    >
                      <div
                        className="flex size-[34px] shrink-0 items-center justify-center rounded bg-[#2e354c] text-lg font-semibold text-white"
                        data-name="Container"
                      >
                        {idx + 1}
                      </div>
                      <span className="min-w-0 flex-1 truncate text-xl font-medium text-white">
                        {team.teamName}
                      </span>
                      <span className="shrink-0 text-xl font-bold text-[#00d9ff]">
                        {team.score} Points
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showTimerModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4 backdrop-blur-[5px]"
          data-name="Host Control Sttart Break"
          data-node-id="232:3650"
          onClick={closeTimerModal}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="host-timer-modal-title"
            className="relative z-10 w-full max-w-[min(100vw-2rem,520px)] rounded-2xl border-2 border-[rgba(0,217,255,0.55)] bg-[rgba(26,31,46,0.98)] shadow-[0_0_30px_rgba(0,217,255,0.18)]"
            data-node-id="232:3779"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center gap-3 border-b border-white/10 px-5 py-4"
              data-node-id="232:3760"
            >
              <button
                type="button"
                data-name="icon-park-solid:back"
                data-node-id="232:3777"
                onClick={closeTimerModal}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                aria-label="Close"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <h2
                id="host-timer-modal-title"
                className="text-[25px] font-semibold text-white"
                data-node-id="232:3776"
              >
                Break Time
              </h2>
            </div>

            <div className="flex flex-col items-center px-6 py-10" data-node-id="232:3780">
              <div
                className="relative mx-auto flex w-full max-w-[350px] flex-col items-center justify-center"
                data-node-id="232:3785"
              >
                <div
                  className="pointer-events-none absolute inset-[8%] rounded-full bg-[radial-gradient(circle,rgba(0,217,255,0.07)_1px,transparent_1px)] bg-size-[14px_14px] opacity-80"
                  data-node-id="232:3782"
                />
                <div className="relative mx-auto h-[300px] w-[300px]">
                  <HostTimerRing
                    remaining={timerRemaining}
                    total={Math.max(1, timerDuration)}
                    size={300}
                    hideCenter
                    className="drop-shadow-[0_0_24px_rgba(0,217,255,0.12)]"
                  />
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 sm:gap-5">
                    <p
                      className={cn(
                        'text-center text-[clamp(2.5rem,11vw,5.25rem)] font-extrabold leading-[0.95] tabular-nums text-white [text-shadow:0_4px_12px_rgba(0,0,0,0.45)]',
                        timerRemaining <= 5 && 'text-red-400',
                      )}
                      data-node-id="232:3787"
                    >
                      {formatSecondsMmSs(timerRemaining)}
                    </p>
                    {timerPaused ? (
                      <span className="text-xs font-bold uppercase tracking-widest text-amber-400 sm:text-sm">
                        Paused
                      </span>
                    ) : null}
                    <p
                      className="text-center text-lg font-medium uppercase tracking-[1px] text-white sm:text-xl"
                      data-node-id="232:3789"
                    >
                      REMAINING
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showAddTeam ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4 backdrop-blur-[5px]"
          data-name="Host Control Add Taem"
          data-node-id="232:1817"
          onClick={closeAddTeamModal}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-team-dialog-title"
            className="relative z-10 w-full max-w-xl rounded-2xl border-2 border-[rgba(0,217,255,0.55)] bg-[rgba(26,31,46,0.98)] px-6 pb-6 pt-8 shadow-[0_0_30px_rgba(0,217,255,0.18)]"
            data-node-id="232:1850"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              data-name="maki:cross"
              data-node-id="232:1851"
              onClick={closeAddTeamModal}
              className="absolute right-4 top-4 flex size-7 items-center justify-center rounded-md text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
              aria-label="Close"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            <div className="pr-8" data-node-id="232:1862">
              <div data-node-id="232:1863">
                <label
                  id="add-team-dialog-title"
                  htmlFor="add-team-name"
                  className="mb-2 block text-xl font-semibold text-white"
                  data-node-id="232:1864"
                >
                  Add Team&apos;s Name
                </label>
                <div className="relative" data-node-id="232:1865">
                  <input
                    id="add-team-name"
                    type="text"
                    value={addTeamName}
                    onChange={(e) => setAddTeamName(e.target.value)}
                    placeholder="Mention your team name"
                    data-node-id="232:1866"
                    autoFocus
                    className="h-[57px] w-full rounded-lg border border-white/10 bg-[#050508] px-4 text-base text-white outline-none transition-[border-color,box-shadow] placeholder:text-[#a1a1a1] focus:border-[rgba(0,217,255,0.5)] focus:shadow-[0_0_0_2px_rgba(0,217,255,0.15)]"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTeam()}
                  />
                </div>
              </div>

              <div className="mt-6" data-node-id="232:1868">
                <label
                  htmlFor="add-team-score"
                  className="mb-2 block text-xl font-semibold text-white"
                  data-node-id="232:1869"
                >
                  Add Team&apos;s Score{' '}
                  <span className="font-semibold text-white/70">(Optional)</span>
                </label>
                <div className="relative" data-node-id="232:1870">
                  <input
                    id="add-team-score"
                    type="number"
                    value={addTeamScore}
                    onChange={(e) => setAddTeamScore(e.target.value)}
                    placeholder="Starting score"
                    data-node-id="232:1871"
                    className="h-[57px] w-full rounded-lg border border-white/10 bg-[#050508] px-4 text-base text-white outline-none transition-[border-color,box-shadow] placeholder:text-[#a1a1a1] focus:border-[rgba(0,217,255,0.5)] focus:shadow-[0_0_0_2px_rgba(0,217,255,0.15)]"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTeam()}
                  />
                </div>
              </div>
            </div>

            <div
              className="mt-8 flex flex-wrap justify-center gap-4 sm:justify-start"
              data-node-id="232:1854"
            >
              <button
                type="button"
                data-node-id="232:1856"
                onClick={closeAddTeamModal}
                className="h-[50px] min-w-[140px] rounded-lg border border-white/15 bg-[linear-gradient(180deg,#2e354c_0%,#1a2030_100%)] px-8 text-base font-medium uppercase tracking-wide text-white/80 shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition hover:brightness-110"
              >
                <span data-node-id="232:1858">Cancel</span>
              </button>
              <button
                type="button"
                data-node-id="232:1860"
                onClick={handleAddTeam}
                className="h-[50px] min-w-[140px] rounded-lg border border-red-500/40 bg-[linear-gradient(180deg,#dc2626_0%,#7f1d1d_100%)] px-8 text-base font-bold uppercase tracking-wide text-white shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition hover:brightness-110"
              >
                <span data-node-id="232:1861">Save</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editScoreTeamId !== null && (
        <ModalOverlay onClose={() => setEditScoreTeamId(null)} title="Edit Team Score">
          <p className="mb-2 text-sm text-foreground/50">
            {sortedTeams.find((t) => t.teamId === editScoreTeamId)?.teamName}
          </p>
          <input
            type="number"
            value={editScoreValue}
            onChange={(e) => setEditScoreValue(e.target.value)}
            className="mb-3 w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-neon-cyan/50"
            autoFocus
            onKeyDown={(e) =>
              e.key === 'Enter' && editScoreTeamId !== null && handleEditScore(editScoreTeamId)
            }
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => editScoreTeamId !== null && handleEditScore(editScoreTeamId)}
              className="flex-1 rounded-lg border border-neon-cyan/40 bg-neon-cyan/20 py-2 text-sm font-medium text-neon-cyan hover:bg-neon-cyan/30"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditScoreTeamId(null)}
              className="flex-1 rounded-lg border border-border py-2 text-sm font-medium hover:bg-surface-light"
            >
              Cancel
            </button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

function ModalOverlay({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="neon-border bg-surface rounded-2xl p-5 w-80 max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-3 text-neon-cyan">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export default function HostDashboardPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <HostDashboardContent />
    </Suspense>
  );
}
