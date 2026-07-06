'use client';

import { useEffect, useLayoutEffect, useRef, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useSocket } from '@/hooks/useSocket';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { BreakTimerDisplay } from '@/components/shared/BreakTimerDisplay';
import { QuestionTimerArch } from '@/components/shared/QuestionTimerArch';
import { BreakScreenHeading } from '@/components/shared/BreakScreenHeading';
import { GameshowEndScreen } from '@/components/shared/GameshowEndScreen';
import { resolveBreakUpNextLabel } from '@/lib/breakScreenCopy';
import { clientLogger } from '@/lib/clientLogger';
import { breakSecondsFromEndsAt, resolveBreakWallClock } from '@/lib/breakWallClock';
import { cn } from '@/lib/utils';
import { RoundIntroScoringLines } from '@/lib/roundIntroInstructions';
import { useAuth } from '@/lib/auth';
import { PUBLIC_API_URL } from '@/lib/env';
import {
  DEFAULT_KANGAROO_NAMES,
  defaultKangarooNames,
  resolveKangarooNames,
} from '@/lib/kangarooRaceDefaults';

const API_URL = PUBLIC_API_URL;

function formatRoundTypeLabel(type?: string): string {
  return (type || 'Round')
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

function normalizeRoundIntroTitle(name?: string, roundType?: string, roundIndex?: number): string {
  if ((roundType || '').toUpperCase() === 'FINAL_WAGER') return 'FINAL';
  const raw = (name || '').trim();
  const fallback =
    (roundType || '').toUpperCase() === 'ELIMINATION'
      ? 'Elimination Round'
      : formatRoundTypeLabel(roundType);
  if (!raw) return fallback || `Round ${(roundIndex || 0) + 1}`;

  const withoutPrefix = raw
    .replace(new RegExp(`^round\\s*${(roundIndex || 0) + 1}\\s*[-:–]*\\s*`, 'i'), '')
    .replace(/^round\s*\d+\s*[-:–]*\s*/i, '')
    .trim();

  if (!withoutPrefix) return fallback || `Round ${(roundIndex || 0) + 1}`;

  const normalizedRaw = withoutPrefix.replace(/\s+/g, ' ').toLowerCase();
  const normalizedFallback = fallback.replace(/\s+/g, ' ').toLowerCase();

  if (
    normalizedFallback &&
    (normalizedRaw.includes(normalizedFallback) || normalizedFallback.includes(normalizedRaw))
  ) {
    return fallback;
  }

  return withoutPrefix;
}

function getNextRoundIntroBlurb(nextType?: string): string {
  const t = (nextType || '').toUpperCase();
  switch (t) {
    case 'MUSIC':
      return "where you'll identify songs and artists.";
    case 'MULTIPLE_CHOICE':
    case 'FINAL_MULTIPLE_CHOICE':
      return 'answer each question by choosing the best option.';
    case 'ELIMINATION':
      return 'wrong answers can knock teams out until the next round.';
    case 'WAGER':
      return 'you will wager up to 50 points before each question.';
    case 'FINAL_WAGER':
      return 'you will wager a percentage of your score before each question.';
    case 'MAJORITY_RULES':
      return 'points go to the majority answer.';
    case 'AUDIO_VIDEO':
      return 'watch or listen on the venue screen and answer on your devices.';
    default:
      return 'when you start, the next set of questions will begin.';
  }
}

const KANGAROO_SLOTS = [1, 2, 3, 4, 5, 6] as const;

/** Matches player mini-game (left / middle / right). */
const CARD_SHUFFLE_SLOTS = [1, 2, 3] as const;
const CARD_POSITION_LABELS: Record<number, string> = { 1: 'Left', 2: 'Middle', 3: 'Right' };
const TEAM_NAME_MAX_LENGTH = 20;

/** Figma row groups for Leaderboard modal list */
const SCOREBOARD_MODAL_ROW_IDS = [
  '232:2873',
  '232:2879',
  '232:2885',
  '232:2891',
  '232:2897',
] as const;

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
  lobbyPhase?: 'registration' | 'code_of_conduct' | 'practice_question';
  /** Host overlay scoreboard while state may still be QUESTION / ROUND_END / etc. */
  scoreboardVisible?: boolean;
  currentRoundIndex: number;
  currentQuestionIndex: number;
  timerRemaining: number;
  timerRunning: boolean;
  responseCount: number;
  totalTeams: number;
  breakDuration?: number;
  breakRemaining?: number;
  /** Epoch ms when the break ends (server wall clock). */
  breakEndsAt?: number;
  /** Present on some payloads so clients can estimate server/client clock skew. */
  serverNow?: number;
  breakResumeState?: Partial<GameState> | null;
  rounds: { id: number; name: string; type: string; timerDuration: number; questions: unknown[] }[];
  teams: Record<string, Team>;
  activeTeamIds: number[];
  activeMiniGame?: string | null;
  miniGameConfig?: {
    kangarooNames?: string[];
  } | null;
  miniGameState?: {
    game?: string;
    ready?: boolean;
    gameStarted?: boolean;
    activeRound?: 1 | 2 | 3 | 4 | null;
    revealed?: boolean;
    correctPosition?: number | null;
    kangarooNames?: string[];
    finishOrder?: number[];
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
    category?: string | null;
  };
  timerDuration: number;
  timerRemaining?: number;
  timerRunning?: boolean;
  roundType: string;
  pointsForQuestion?: number;
}

interface RevealData {
  correctOptionIndex: number;
  correctText: string;
  scores: Record<string, number>;
  responseDetails?: {
    teamId: number;
    selectedOptionIndex: number | number[];
    responseTime?: number | null;
  }[];
  majorityOptionIndexes?: number[];
  voteCounts?: Record<string, number>;
  eliminations: number[];
  allWrong: boolean;
  teams: Team[];
}

function resolveHostRosterCount(
  activeTeamIds?: number[],
  teams?: Record<string | number, Team>,
  totalTeams?: number,
): number {
  const activeCount = Array.isArray(activeTeamIds) ? activeTeamIds.length : 0;
  const teamMapCount = teams ? Object.keys(teams).length : 0;
  return activeCount > 0 ? activeCount : teamMapCount || Math.max(0, Number(totalTeams || 0));
}

/** Fresh tallies when a question opens (or resumes) with no answers yet. */
function bootstrapLiveResponseStats(
  rosterCount: number,
  answered = 0,
): { correct: number; incorrect: number; noAnswer: number; total: number } {
  const roster = Math.max(0, rosterCount);
  const ans = Math.max(0, Math.min(roster, answered));
  return {
    correct: 0,
    incorrect: 0,
    noAnswer: Math.max(0, roster - ans),
    total: Math.max(1, roster),
  };
}

function liveStatsFromRevealPayload(
  reveal: RevealData,
  roundType?: string,
): { correct: number; incorrect: number; noAnswer: number; total: number } {
  const rt = (roundType || '').toUpperCase();
  const isMajority = rt === 'MAJORITY_RULES';
  const correctIdx = Number(reveal.correctOptionIndex);
  const majorityWinners = new Set(
    (reveal.majorityOptionIndexes || []).map(Number).filter((n) => Number.isFinite(n)),
  );
  const details = reveal.responseDetails || [];
  let correct = 0;
  let incorrect = 0;
  let noAnswer = 0;

  const hasValidSelection = (idx: unknown): boolean => {
    if (idx === undefined || idx === null) return false;
    if (Array.isArray(idx)) return idx.length > 0;
    const n = Number(idx);
    return Number.isFinite(n) && n >= 0;
  };

  for (const r of details) {
    if (!hasValidSelection(r.selectedOptionIndex)) {
      noAnswer += 1;
      continue;
    }
    if (isMajority) {
      const sel = Array.isArray(r.selectedOptionIndex) ? NaN : Number(r.selectedOptionIndex);
      if (majorityWinners.has(sel)) correct += 1;
      else incorrect += 1;
    } else if (Array.isArray(r.selectedOptionIndex)) {
      const score =
        reveal.scores?.[String(r.teamId)] ??
        (reveal.scores as Record<number, number> | undefined)?.[r.teamId];
      if (Number(score) > 0) correct += 1;
      else incorrect += 1;
    } else if (Number(r.selectedOptionIndex) === correctIdx) {
      correct += 1;
    } else {
      incorrect += 1;
    }
  }

  if (details.length === 0 && reveal.teams?.length) {
    noAnswer = reveal.teams.length;
  }

  const total = Math.max(reveal.teams?.length ?? 0, details.length, correct + incorrect + noAnswer);
  return { correct, incorrect, noAnswer, total };
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

const isAudioMedia = (mediaType?: string, mediaUrl?: string) => {
  const type = (mediaType || '').toLowerCase();
  if (type === 'mp3' || type.includes('audio')) return true;
  return /\.mp3(?:$|\?)/i.test(mediaUrl || '');
};

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
        'flex h-27.75 w-38 flex-col items-center justify-center gap-2 rounded-xl border px-2 text-center text-sm font-medium text-white shadow-[inset_0_0_24px_rgba(0,217,255,0.06)] transition hover:border-[rgba(0,217,255,0.55)] disabled:cursor-not-allowed disabled:opacity-35',
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
  danger,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  emphasis?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Spacebar') e.preventDefault();
      }}
      className={cn(
        'inline-flex h-12.5 min-w-30 flex-1 max-w-52.5 items-center justify-center gap-2 rounded-lg border px-2 text-[10px] font-bold uppercase tracking-wide text-white shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale sm:min-w-35 sm:px-3 sm:text-xs',
        danger
          ? 'border-[#ff4d4d]/70 bg-[linear-gradient(180deg,#b91c1c_0%,#7f1d1d_100%)] shadow-[0_0_18px_rgba(239,68,68,0.22)]'
          : emphasis
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
  // Wager-lock progress counter (drives the WAGER_COLLECTION copy in the Live Responses panel).
  // Reset to 0 on every wager-collection screen via `wager_lock_update` from the server.
  const [wagerLockedCount, setWagerLockedCount] = useState(0);
  const [wagerLockedTotal, setWagerLockedTotal] = useState(0);

  const [addTeamName, setAddTeamName] = useState('');
  const [addTeamScore, setAddTeamScore] = useState('');
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [editScoreTeamId, setEditScoreTeamId] = useState<number | null>(null);
  const [editScoreValue, setEditScoreValue] = useState('');
  const [showRegisteredTeams, setShowRegisteredTeams] = useState(false);
  const [showRoundIntroductionModal, setShowRoundIntroductionModal] = useState(false);
  const [kangarooNames, setKangarooNames] = useState<string[]>(defaultKangarooNames());
  const [kangarooVenueReady, setKangarooVenueReady] = useState(false);
  const [kangarooVenueLoading, setKangarooVenueLoading] = useState(false);
  const [kangarooRaceStarted, setKangarooRaceStarted] = useState(false);
  const [kangarooRaceRevealed, setKangarooRaceRevealed] = useState(false);
  const [kangarooFinishOrder, setKangarooFinishOrder] = useState<number[]>([]);
  const [kangarooBetCounts, setKangarooBetCounts] = useState([0, 0, 0, 0, 0, 0]);
  const [cardPickCounts, setCardPickCounts] = useState([0, 0, 0]);
  const [cardShuffleVenueReady, setCardShuffleVenueReady] = useState(false);
  // Mirrors `kangarooVenueLoading` — true while we're waiting for the venue
  // to confirm Unity is ready after the host taps "Load Card Game on Venue".
  // Used to drive the load button's spinner / disabled state.
  const [cardShuffleVenueLoading, setCardShuffleVenueLoading] = useState(false);
  const [cardShuffleGameStarted, setCardShuffleGameStarted] = useState(false);
  /** True after host sends Unity start once; blocks double-clicks before React re-renders. */
  const [cardShuffleUnityStartSent, setCardShuffleUnityStartSent] = useState(false);
  const cardShuffleStartLockRef = useRef(false);
  const [cardShuffleActiveRound, setCardShuffleActiveRound] = useState<1 | 2 | 3 | 4 | null>(null);
  const [cardShuffleRevealPosition, setCardShuffleRevealPosition] = useState<number | null>(null);
  const [cardShuffleCardsRevealed, setCardShuffleCardsRevealed] = useState(false);
  const [activeMiniGameLocal, setActiveMiniGameLocal] = useState<string | null>(null);
  const [miniGameLoading, setMiniGameLoading] = useState(false);
  const [miniGameRevealing, setMiniGameRevealing] = useState(false);
  const [cardShuffleFinishedHold, setCardShuffleFinishedHold] = useState(false);
  const [finishedMiniGameType, setFinishedMiniGameType] = useState<
    'card_shuffle' | 'kangaroo_race' | null
  >(null);
  const [showScoreboardModal, setShowScoreboardModal] = useState(false);
  const [showEndGameModal, setShowEndGameModal] = useState(false);
  // When the host taps "Exit Game" on a mini-game, we open a confirmation
  // modal that lets them choose between resuming the trivia game where they
  // left off, or restarting the same mini-game from the start. We capture the
  // mini-game type at click time so the modal copy / restart action is
  // accurate even if `activeMiniGameLocal` is cleared mid-flow.
  const [pendingMiniGameExit, setPendingMiniGameExit] = useState<
    'card_shuffle' | 'kangaroo_race' | null
  >(null);
  const [teamPendingRemoval, setTeamPendingRemoval] = useState<Team | null>(null);
  const [isScoreboardVisible, setIsScoreboardVisible] = useState(false);
  // Set on `round_end`; drives the "Round X is Over" transition screen between the last
  // question's REVEAL and the SCOREBOARD. Cleared once we move past ROUND_END.
  const [roundEndInfo, setRoundEndInfo] = useState<{
    roundIndex: number;
    roundName: string;
    roundType: string;
    nextRound: { index: number; name: string; type: string } | null;
    isFinalRound: boolean;
  } | null>(null);
  const [mp3Playing, setMp3Playing] = useState(false);
  const [mp4Playing, setMp4Playing] = useState(false);
  const hostPreviewVideoRef = useRef<HTMLVideoElement | null>(null);
  /** Local break countdown (synced from break_start / session_state; wall-clock driven). */
  const [hostBreakDuration, setHostBreakDuration] = useState(360);
  const [hostBreakRemaining, setHostBreakRemaining] = useState(0);
  const hostBreakSkewMsRef = useRef(0);
  const hostBreakEndsAtRef = useRef<number | null>(null);
  /** Prevents double submit and grays out Start Game until the server leaves lobby. */
  const [startGameRequested, setStartGameRequested] = useState(false);

  const gameStateRef = useRef<GameState | null>(null);
  const previousStateBeforeScoreboardRef = useRef<{ state: string; questionState: string } | null>(
    null,
  );
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const timerRemainingRef = useRef(0);
  const timerPausedRef = useRef(false);
  useEffect(() => {
    timerRemainingRef.current = timerRemaining;
    timerPausedRef.current = timerPaused;
  }, [timerRemaining, timerPaused]);

  useEffect(() => {
    if ((gameState?.state || 'LOBBY') !== 'LOBBY') setStartGameRequested(false);
  }, [gameState?.state]);

  useEffect(() => {
    if (gameState?.state !== 'BREAK') return;
    const tick = () => {
      const gs = gameStateRef.current;
      const end = Number(gs?.breakEndsAt ?? hostBreakEndsAtRef.current ?? 0);
      if (Number.isFinite(end) && end > 0) {
        setHostBreakRemaining(breakSecondsFromEndsAt(end, hostBreakSkewMsRef.current));
      } else {
        setHostBreakRemaining((prev) => (prev > 0 ? prev - 1 : 0));
      }
    };
    tick();
    const t = setInterval(tick, 250);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [gameState?.state]);

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
  // Mute the question-timer tick/buzz while a mini-game is on the venue. The
  // server keeps the underlying question timer ticking (so the host can resume
  // mid-question once the mini-game ends), but the audible tick during a
  // Kangaroo Race / Card Shuffle is jarring and competes with the mini-game.
  const hasPlayableAudio = isAudioMedia(
    currentQuestion?.question?.mediaType,
    currentQuestion?.question?.mediaUrl,
  );

  useEffect(() => {
    if (!socket || !pin) return;

    const joinHost = () => {
      socket.emit('host_connect', { pin });
    };
    socket.on('connect', joinHost);

    const normalizeHostMiniGameId = (game: unknown) =>
      game == null || game === '' ? '' : String(game).toLowerCase().replace(/-/g, '_');

    const normalizeHostRevealSlot = (raw: unknown): number | null => {
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      const t = Math.trunc(n);
      if (t >= 1 && t <= 3) return t;
      if (t >= 0 && t <= 2) return t + 1;
      return null;
    };

    const onSessionState = (data: GameState) => {
      if (data?.state) {
        if (data.state !== 'BREAK') {
          hostBreakSkewMsRef.current = 0;
          hostBreakEndsAtRef.current = null;
        }
        if (data.state !== 'QUESTION' && data.state !== 'ROUND_INTRO') {
          setCardShuffleFinishedHold(false);
          setFinishedMiniGameType(null);
        }
        setGameState(data);
        if (data.state === 'BREAK') {
          const w = resolveBreakWallClock({
            breakEndsAt: data.breakEndsAt,
            breakRemaining: data.breakRemaining,
            breakDuration: data.breakDuration,
            serverNow: data.serverNow,
          });
          hostBreakSkewMsRef.current = w.skewMs;
          hostBreakEndsAtRef.current = w.endsAt;
          setHostBreakDuration(w.duration);
          setHostBreakRemaining(w.remaining);
        }
        setIsScoreboardVisible(data.state === 'SCOREBOARD' || Boolean(data.scoreboardVisible));
        // The round-over transition is only meaningful while the server keeps us in
        // ROUND_END; once we move on (scoreboard, next intro, break, etc.) drop the info.
        if (data.state !== 'ROUND_END') {
          setRoundEndInfo(null);
        }
        setTimerRemaining((prevRemaining) => {
          if (data.state === 'QUESTION' && data.questionState === 'REVEALED') {
            return 0;
          }
          const incoming = Number(data.timerRemaining ?? 0);
          if (
            data.state === 'QUESTION' &&
            data.questionState === 'ACTIVE' &&
            prevRemaining > 0 &&
            incoming > prevRemaining
          ) {
            return prevRemaining;
          }
          return incoming;
        });
        setTimerPaused((prevPaused) => {
          const qs = data.questionState || 'WAITING';
          if (data.state === 'QUESTION' && qs === 'ACTIVE' && timerRemainingRef.current > 0) {
            const round = data.rounds?.[data.currentRoundIndex ?? 0];
            const isMusic = String(round?.type || '').toUpperCase() === 'MUSIC';
            // Non-music timers auto-start; timer_update ticks are authoritative while counting.
            if (!isMusic) return prevPaused;
          }
          return data.timerRunning === false;
        });
        if (data.state === 'QUESTION') {
          const qs = data.questionState || 'WAITING';
          const trNum = qs === 'REVEALED' ? 0 : Number(data.timerRemaining ?? 0);
          const round = data.rounds?.[data.currentRoundIndex ?? 0];
          const isMusic = (round?.type || '') === 'MUSIC';
          const musicAwaiting =
            isMusic && qs === 'ACTIVE' && data.timerRunning === false && trNum > 0;
          const replayLocked =
            qs === 'REVEALED' || (qs === 'ACTIVE' && !musicAwaiting && trNum <= 0);
          if (replayLocked) {
            setMp4Playing(false);
            setMp3Playing(false);
            socket.emit('music_control', { pin, action: 'pause' });
          }
        }
        // Also keep the question payload during WAGER_COLLECTION so the wager-lock screen
        // can surface per-question metadata (e.g. category).
        setCurrentQuestion(
          data.state === 'QUESTION' || data.state === 'WAGER_COLLECTION'
            ? (data.currentQuestion ?? null)
            : null,
        );
        setLiveResponses((prev) => {
          const rosterCount = resolveHostRosterCount(
            data.activeTeamIds,
            data.teams as Record<string | number, Team> | undefined,
            data.totalTeams,
          );
          const answered = Math.max(0, Number(data.responseCount ?? 0));
          if (data.state === 'QUESTION' && data.questionState === 'ACTIVE') {
            if (answered === 0) {
              return bootstrapLiveResponseStats(rosterCount, 0);
            }
            // Keep tallies from live_response_update; session_state only syncs roster size.
            return { ...prev, total: Math.max(prev.total, rosterCount, 1) };
          }
          if (data.state === 'QUESTION' && data.questionState === 'REVEALED') {
            return { ...prev, total: Math.max(prev.total, rosterCount, 1) };
          }
          return {
            correct: 0,
            incorrect: 0,
            noAnswer: 0,
            total: rosterCount,
          };
        });
        if (data.questionState !== 'REVEALED') {
          setRevealData(null);
        }
      }
      if (data?.activeMiniGame) {
        setActiveMiniGameLocal(data.activeMiniGame);
        setMiniGameLoading(false);
        if (data.miniGameState?.game === 'card_shuffle') {
          setCardShuffleVenueReady(Boolean(data.miniGameState.ready));
          setCardShuffleVenueLoading(!Boolean(data.miniGameState.ready));
          setCardShuffleGameStarted(Boolean(data.miniGameState.gameStarted));
          setCardShuffleActiveRound(
            (data.miniGameState.activeRound as 1 | 2 | 3 | 4 | null | undefined) ?? null,
          );
          setCardShuffleRevealPosition(
            Number.isFinite(Number(data.miniGameState.correctPosition))
              ? Number(data.miniGameState.correctPosition)
              : null,
          );
          setCardShuffleCardsRevealed(Boolean(data.miniGameState.revealed));
          setCardPickCounts(
            [1, 2, 3].map((slot) => Number(data.miniGameState?.pickCounts?.[slot] || 0)),
          );
          if (data.miniGameState.revealed) {
            setMiniGameRevealing(false);
          }
        } else if (data.miniGameState?.game === 'kangaroo_race') {
          setKangarooRaceStarted(Boolean(data.miniGameState.gameStarted));
          setKangarooRaceRevealed(Boolean(data.miniGameState.revealed));
          setKangarooVenueReady(Boolean(data.miniGameState.ready));
          setKangarooVenueLoading(!Boolean(data.miniGameState.ready));
          setKangarooFinishOrder(
            Array.isArray(data.miniGameState.finishOrder)
              ? data.miniGameState.finishOrder
                  .map((value) => Number(value))
                  .filter((value) => Number.isFinite(value) && value >= 1 && value <= 6)
              : [],
          );
          const incomingNames = Array.isArray(data.miniGameState.kangarooNames)
            ? data.miniGameState.kangarooNames
            : Array.isArray(data.miniGameConfig?.kangarooNames)
              ? data.miniGameConfig.kangarooNames
              : null;
          if (incomingNames?.length === 6) {
            setKangarooNames(resolveKangarooNames(incomingNames));
          }
          setKangarooBetCounts(
            [1, 2, 3, 4, 5, 6].map((slot) => Number(data.miniGameState?.pickCounts?.[slot] || 0)),
          );
        }
      } else if (data?.activeMiniGame === null) {
        setActiveMiniGameLocal(null);
        setMiniGameLoading(false);
        setCardShuffleVenueReady(false);
        setCardShuffleVenueLoading(false);
        setCardShuffleGameStarted(false);
        setCardShuffleUnityStartSent(false);
        cardShuffleStartLockRef.current = false;
        setCardShuffleActiveRound(null);
        setCardShuffleRevealPosition(null);
        setCardShuffleCardsRevealed(false);
        setCardPickCounts([0, 0, 0]);
        setKangarooRaceStarted(false);
        setKangarooRaceRevealed(false);
        setKangarooVenueReady(false);
        setKangarooVenueLoading(false);
        setKangarooFinishOrder([]);
        setKangarooBetCounts([0, 0, 0, 0, 0, 0]);
        setKangarooNames(defaultKangarooNames());
        setMiniGameRevealing(false);
      }
    };

    const onQuestionActive = (data: QuestionData) => {
      setCardShuffleFinishedHold(false);
      setFinishedMiniGameType(null);
      setCurrentQuestion(data);
      setRevealData(null);
      setTimerDuration(data.timerDuration);
      const tr = data.timerRemaining;
      setTimerRemaining(
        typeof tr === 'number' && Number.isFinite(tr) ? tr : Number(data.timerDuration ?? 30),
      );
      setIsScoreboardVisible(false);
      {
        const g = gameStateRef.current;
        const roster = resolveHostRosterCount(g?.activeTeamIds, g?.teams, g?.totalTeams);
        setLiveResponses(bootstrapLiveResponseStats(roster, 0));
      }
      setMp3Playing(false);
      setMp4Playing(false);
      setTimerPaused(
        typeof data.timerRunning === 'boolean'
          ? !data.timerRunning
          : (data.roundType || '').toUpperCase() === 'MUSIC',
      );
      const incomingQuestionIndex = Number.isFinite(Number(data.questionIndex))
        ? Number(data.questionIndex)
        : null;
      setGameState((prev) => ({
        ...(prev || {}),
        state: 'QUESTION',
        questionState: 'ACTIVE',
        responseCount: 0,
        rounds: prev?.rounds || [],
        teams: prev?.teams || {},
        currentRoundIndex: prev?.currentRoundIndex ?? 0,
        currentQuestionIndex:
          incomingQuestionIndex !== null
            ? incomingQuestionIndex
            : (prev?.currentQuestionIndex ?? 0),
        timerRemaining: prev?.timerRemaining ?? 0,
        timerRunning: prev?.timerRunning ?? true,
        totalTeams: prev?.totalTeams ?? 0,
        activeTeamIds: prev?.activeTeamIds || [],
      }));
    };

    const onTimerUpdate = (data: { remaining: number; paused?: boolean; timerRunning?: boolean }) => {
      setTimerRemaining((prev) => {
        const incoming = data.remaining;
        if (Number.isFinite(incoming) && prev > 0 && incoming > prev) return prev;
        return incoming;
      });
      if (data.paused !== undefined) setTimerPaused(data.paused);
      else if (typeof data.timerRunning === 'boolean') setTimerPaused(!data.timerRunning);
    };

    const onTimerExpired = () => {
      setTimerRemaining(0);
      setMp4Playing(false);
      setMp3Playing(false);
      socket.emit('music_control', { pin, action: 'pause' });
    };

    const onAnswerReveal = (data: RevealData) => {
      setRevealData(data);
      setMp4Playing(false);
      setMp3Playing(false);
      socket.emit('music_control', { pin, action: 'pause' });
      const gs = gameStateRef.current;
      const roundType = gs?.rounds?.[gs.currentRoundIndex ?? 0]?.type;
      setLiveResponses(liveStatsFromRevealPayload(data, roundType));
      setGameState((prev) => {
        if (!prev) return prev;
        const nextTeams = { ...prev.teams };
        for (const t of data.teams || []) {
          const key = String(t.teamId);
          const existing = nextTeams[key];
          nextTeams[key] = existing
            ? {
                ...existing,
                score: t.score,
                isEliminated: t.isEliminated ?? existing.isEliminated,
              }
            : {
                teamId: t.teamId,
                teamName: t.teamName,
                score: t.score,
                isEliminated: t.isEliminated ?? false,
              };
        }
        return {
          ...prev,
          questionState: 'REVEALED',
          teams: nextTeams,
          totalTeams: Object.keys(nextTeams).length,
        };
      });
    };

    const onResponseCount = (data: { count: number; total: number }) => {
      setGameState((prev) =>
        prev ? { ...prev, responseCount: data.count, totalTeams: data.total } : prev,
      );
    };

    const onWagerLockUpdate = (data: { locked?: number; total?: number; questionId?: number }) => {
      const locked = Math.max(0, Number(data?.locked ?? 0));
      const total = Math.max(0, Number(data?.total ?? 0));
      setWagerLockedCount(locked);
      setWagerLockedTotal(total);
    };

    const onLiveResponseUpdate = (data: {
      correct?: number;
      incorrect?: number;
      noAnswer?: number;
      total?: number;
    }) => {
      setLiveResponses({
        correct: Number(data?.correct || 0),
        incorrect: Number(data?.incorrect || 0),
        noAnswer: Number(data?.noAnswer || 0),
        total: Number(data?.total || 0),
      });
    };

    const onRoundIntro = (data: { roundIndex?: number }) => {
      setCardShuffleFinishedHold(false);
      setFinishedMiniGameType(null);
      setCurrentQuestion(null);
      setRevealData(null);
      setIsScoreboardVisible(false);
      setLiveResponses({
        correct: 0,
        incorrect: 0,
        noAnswer: 0,
        total: (() => {
          const g = gameStateRef.current;
          const activeCount = Array.isArray(g?.activeTeamIds) ? g.activeTeamIds.length : 0;
          const teamMapCount = g?.teams ? Object.keys(g.teams).length : 0;
          return activeCount > 0 ? activeCount : teamMapCount || Number(g?.totalTeams || 0);
        })(),
      });
      setMp3Playing(false);
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
    };

    const onScoreboard = (payload?: { teams?: Team[]; source?: string }) => {
      setIsScoreboardVisible(true);
      setGameState((prev) => {
        if (!prev) return prev;
        const fromRoundEnd = payload?.source === 'round_end' || prev.state === 'SCOREBOARD';
        if (prev.state !== 'SCOREBOARD') {
          previousStateBeforeScoreboardRef.current = {
            state: prev.state,
            questionState: prev.questionState,
          };
        }
        const teamsPayload = payload?.teams;
        let next = prev;
        if (teamsPayload?.length) {
          const nextTeams = { ...prev.teams };
          for (const t of teamsPayload) {
            const key = String(t.teamId);
            const existing = nextTeams[key];
            nextTeams[key] = existing
              ? {
                  ...existing,
                  score: t.score,
                  isEliminated: t.isEliminated ?? existing.isEliminated,
                }
              : {
                  teamId: t.teamId,
                  teamName: t.teamName,
                  score: t.score,
                  isEliminated: t.isEliminated ?? false,
                };
          }
          next = {
            ...prev,
            teams: nextTeams,
            totalTeams: Object.keys(nextTeams).length,
          };
        }
        // Manual overlay during a live question must not flip the host UI to
        // the post-round "Start next round" screen — server state stays QUESTION.
        if (fromRoundEnd) {
          return { ...next, state: 'SCOREBOARD' };
        }
        return next;
      });
    };

    const onScoreboardHidden = () => {
      setIsScoreboardVisible(false);
      setGameState((prev) => {
        if (!prev) return prev;
        // Overlay hide only — server stays on SCOREBOARD after round-end flow.
        if (prev.state === 'SCOREBOARD') return prev;
        const restore = previousStateBeforeScoreboardRef.current;
        if (!restore) return prev;
        return { ...prev, state: restore.state, questionState: restore.questionState };
      });
    };

    const onRoundEnd = (payload?: {
      roundIndex?: number;
      roundName?: string;
      roundType?: string;
      nextRound?: { index?: number; name?: string; type?: string } | null;
      isFinalRound?: boolean;
    }) => {
      setIsScoreboardVisible(false);
      setCurrentQuestion(null);
      setRevealData(null);
      setMp3Playing(false);
      const nextRound = payload?.nextRound;
      setRoundEndInfo({
        roundIndex: Number(payload?.roundIndex ?? gameStateRef.current?.currentRoundIndex ?? 0),
        roundName: String(payload?.roundName || ''),
        roundType: String(payload?.roundType || ''),
        nextRound:
          nextRound && typeof nextRound === 'object'
            ? {
                index: Number(nextRound.index ?? 0),
                name: String(nextRound.name || ''),
                type: String(nextRound.type || ''),
              }
            : null,
        isFinalRound: Boolean(payload?.isFinalRound),
      });
      setGameState((prev) => (prev ? { ...prev, state: 'ROUND_END' } : prev));
    };

    const onGameShowEnd = () => {
      setIsScoreboardVisible(false);
      setCurrentQuestion(null);
      setRevealData(null);
      setMp3Playing(false);
      setRoundEndInfo(null);
      setGameState((prev) => (prev ? { ...prev, state: 'GAME_SHOW_END' } : prev));
    };

    const onBreakStart = (payload?: {
      duration?: number;
      breakDuration?: number;
      breakRemaining?: number;
      breakEndsAt?: number;
      serverNow?: number;
    }) => {
      setCardShuffleFinishedHold(false);
      setFinishedMiniGameType(null);
      setIsScoreboardVisible(false);
      const w = resolveBreakWallClock({
        breakEndsAt: payload?.breakEndsAt,
        breakRemaining: payload?.breakRemaining ?? payload?.duration,
        breakDuration:
          payload?.breakDuration ?? payload?.duration ?? gameStateRef.current?.breakDuration,
        serverNow: payload?.serverNow,
      });
      hostBreakSkewMsRef.current = w.skewMs;
      hostBreakEndsAtRef.current = w.endsAt;
      setHostBreakDuration(w.duration);
      setHostBreakRemaining(w.remaining);
      setGameState((prev) =>
        prev
          ? {
              ...prev,
              state: 'BREAK',
              breakDuration: w.duration,
              breakRemaining: w.remaining,
              breakEndsAt: w.endsAt ?? undefined,
            }
          : prev,
      );
    };

    const onBreakEnd = (data?: { restoredState?: string; questionState?: string }) => {
      if (data?.restoredState === 'QUESTION' && data?.questionState === 'ACTIVE') {
        const g = gameStateRef.current;
        const roster = resolveHostRosterCount(g?.activeTeamIds, g?.teams, g?.totalTeams);
        const answered = Math.max(0, Number(g?.responseCount ?? 0));
        setLiveResponses(bootstrapLiveResponseStats(roster, answered));
      }
    };

    const onGameEnd = (data?: { teams?: Team[] }) => {
      setCardShuffleFinishedHold(false);
      setFinishedMiniGameType(null);
      setCurrentQuestion(null);
      setRevealData(null);
      setIsScoreboardVisible(false);
      setMp3Playing(false);
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
    };

    const onSessionDeleted = (data?: { pin?: string; reason?: string }) => {
      const eventPin = data?.pin ? String(data.pin) : '';
      if (eventPin && pin && eventPin !== String(pin)) return;
      toast(data?.reason === 'session_completed' ? 'Session ended by admin.' : 'Session closed.');
      logout();
      router.replace('/host/login');
    };

    const onTeamJoined = (team: Team) => {
      setGameState((prev) => {
        if (!prev) return prev;
        const teams = { ...prev.teams, [team.teamId]: team };
        return {
          ...prev,
          teams,
          totalTeams: Object.keys(teams).length,
        };
      });
    };

    const onSocketError = (payload: { message?: string } | string) => {
      const message = typeof payload === 'string' ? payload : payload?.message;
      if (message) {
        toast.error(message);
        if ((gameStateRef.current?.state || 'LOBBY') === 'LOBBY') {
          setStartGameRequested(false);
        }
      }
    };

    const onTeamRemoved = ({
      teamId,
      reason,
    }: {
      teamId: number;
      reason?: string;
    }) => {
      const isHostRemoval = reason === 'host_removed' || reason === 'removed_by_host';
      setGameState((prev) => {
        if (!prev) return prev;
        if (isHostRemoval) {
          const teams = { ...prev.teams };
          delete teams[teamId];
          delete teams[String(teamId)];
          return { ...prev, teams, totalTeams: Object.keys(teams).length };
        }
        const teams = { ...prev.teams };
        const resolvedKey =
          teams[teamId] != null
            ? teamId
            : teams[String(teamId)] != null
              ? String(teamId)
              : null;
        if (resolvedKey == null) return prev;
        teams[resolvedKey] = { ...teams[resolvedKey], isConnected: false };
        return { ...prev, teams };
      });
    };

    const onTeamUpdated = ({ teamId, score }: { teamId: number; score: number }) => {
      setGameState((prev) => {
        if (!prev || !prev.teams[teamId]) return prev;
        return { ...prev, teams: { ...prev.teams, [teamId]: { ...prev.teams[teamId], score } } };
      });
    };

    const onMiniGameStart = (data: { game: string }) => {
      setCardShuffleFinishedHold(false);
      setFinishedMiniGameType(null);
      setActiveMiniGameLocal(data.game);
      setMiniGameLoading(false);
      setCardShuffleVenueReady(false);
      if (normalizeHostMiniGameId(data?.game) === 'card_shuffle') {
        setCardShuffleVenueLoading(true);
      }
      if (normalizeHostMiniGameId(data?.game) === 'kangaroo_race') {
        setKangarooRaceStarted(false);
        setKangarooRaceRevealed(false);
        setKangarooVenueReady(false);
        setKangarooVenueLoading(true);
        setKangarooFinishOrder([]);
        setKangarooBetCounts([0, 0, 0, 0, 0, 0]);
      }
    };

    const onMiniGameReady = (data: { game?: string; ready?: boolean }) => {
      const gid = normalizeHostMiniGameId(data?.game);
      if (gid === 'card_shuffle') {
        setCardShuffleVenueReady(data.ready !== false);
        setCardShuffleVenueLoading(data.ready === false);
      }
      if (gid === 'kangaroo_race') {
        setKangarooVenueReady(data.ready !== false);
        setKangarooVenueLoading(data.ready === false);
      }
    };

    const onMiniGameReveal = (data: {
      game?: string;
      correctPosition?: number;
      correct_position?: number;
      finishOrder?: number[];
      roundNumber?: 1 | 2 | 3 | 4;
    }) => {
      const gid = normalizeHostMiniGameId(data?.game);
      if (gid === 'kangaroo_race') {
        const finishOrder = Array.isArray(data.finishOrder)
          ? data.finishOrder
              .map((value) => Number(value))
              .filter((value) => Number.isFinite(value) && value >= 1 && value <= 6)
          : [];
        setKangarooFinishOrder(finishOrder);
        setKangarooRaceRevealed(true);
        return;
      }
      if (gid && gid !== 'card_shuffle') return;
      setMiniGameRevealing(false);
      const slot = normalizeHostRevealSlot(data.correctPosition ?? data.correct_position);
      setCardShuffleRevealPosition(slot);
      setCardShuffleCardsRevealed(true);
      if (data.roundNumber) {
        setCardShuffleActiveRound(data.roundNumber);
      }
    };

    const onMiniGameEnd = (data: {
      game?: string;
      winningCard?: number;
      holdScreen?: boolean;
      status?: string;
      message?: string;
    }) => {
      setMiniGameLoading(false);
      if (data?.game === 'card_shuffle' || !data?.game) {
        setCardShuffleVenueReady(false);
        setCardShuffleVenueLoading(false);
        setCardShuffleGameStarted(false);
        setCardShuffleUnityStartSent(false);
        cardShuffleStartLockRef.current = false;
        setCardShuffleActiveRound(null);
        setCardShuffleRevealPosition(null);
        setCardShuffleCardsRevealed(false);
        setCardPickCounts([0, 0, 0]);
        if (data?.holdScreen) {
          setCardShuffleFinishedHold(true);
          setFinishedMiniGameType('card_shuffle');
        } else {
          setCardShuffleFinishedHold(false);
          setFinishedMiniGameType(null);
        }
      } else if (normalizeHostMiniGameId(data?.game) === 'kangaroo_race') {
        setKangarooRaceStarted(false);
        setKangarooRaceRevealed(false);
        setKangarooVenueReady(false);
        setKangarooVenueLoading(false);
        setKangarooFinishOrder([]);
        setKangarooBetCounts([0, 0, 0, 0, 0, 0]);
        setKangarooNames(defaultKangarooNames());
        if (data?.holdScreen) {
          setCardShuffleFinishedHold(true);
          setFinishedMiniGameType('kangaroo_race');
        } else {
          setCardShuffleFinishedHold(false);
          setFinishedMiniGameType(null);
        }
      }
      setActiveMiniGameLocal(null);
      setMiniGameRevealing(false);
    };

    socket.on('session_state', onSessionState);
    socket.on('question_active', onQuestionActive);
    socket.on('timer_update', onTimerUpdate);
    socket.on('timer_expired', onTimerExpired);
    socket.on('answer_reveal', onAnswerReveal);
    socket.on('response_count', onResponseCount);
    socket.on('wager_lock_update', onWagerLockUpdate);
    socket.on('live_response_update', onLiveResponseUpdate);
    socket.on('live_responses_update', onLiveResponseUpdate);
    const onWagerCollectionStart = () => {
      setGameState((prev) =>
        prev ? { ...prev, state: 'WAGER_COLLECTION', questionState: 'WAITING' } : prev,
      );
      // New wager-collection screen — fresh counter (server will emit the initial 0/total
      // shortly after, but reset locally so the UI doesn't flash a stale count).
      setWagerLockedCount(0);
    };

    const onVenueLobbyPhase = (data: { phase?: GameState['lobbyPhase'] }) => {
      if (!data?.phase) return;
      setGameState((prev) => (prev ? { ...prev, lobbyPhase: data.phase } : prev));
    };

    socket.on('round_intro', onRoundIntro);
    socket.on('wager_collection_start', onWagerCollectionStart);
    socket.on('venue_lobby_phase', onVenueLobbyPhase);
    socket.on('scoreboard', onScoreboard);
    socket.on('scoreboard_hidden', onScoreboardHidden);
    socket.on('round_end', onRoundEnd);
    socket.on('game_show_end', onGameShowEnd);
    socket.on('break_start', onBreakStart);
    socket.on('break_end', onBreakEnd);
    socket.on('game_end', onGameEnd);
    socket.on('session_deleted', onSessionDeleted);
    socket.on('team_joined', onTeamJoined);
    socket.on('error', onSocketError);
    socket.on('team_removed', onTeamRemoved);
    socket.on('team_updated', onTeamUpdated);
    socket.on('mini_game_start', onMiniGameStart);
    socket.on('mini_game_ready', onMiniGameReady);
    socket.on('mini_game_reveal', onMiniGameReveal);
    socket.on('mini_game_end', onMiniGameEnd);

    const onMiniGameUpdate = (data: { action?: string; value?: number }) => {
      if (data.action !== 'select' || typeof data.value !== 'number') return;
      const ag = gameStateRef.current?.activeMiniGame;
      const isHorse = ag === 'kangaroo_race' || ag === 'kangaroo-race';
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

    const onMusicControl = (data: { action?: string; mediaUrl?: string | null }) => {
      const action = data?.action;
      // Drives the venue MP4 element and mirrors state into host tiles. MP3 is venue-only — the
      // host never plays audio locally; we only sync `mp3Playing` for the sidebar indicator.
      const currentMediaType = (
        gameStateRef.current?.currentQuestion?.question?.mediaType || ''
      ).toLowerCase();
      if (currentMediaType === 'mp4') {
        if (action === 'play') setMp4Playing(true);
        else if (action === 'pause' || action === 'stop') setMp4Playing(false);
        return;
      }
      if (action === 'play') {
        const gs = gameStateRef.current;
        if (gs?.state === 'QUESTION') {
          const qs = gs.questionState || 'WAITING';
          if (qs === 'REVEALED') return;
          if (qs === 'ACTIVE') {
            const tr = Number(timerRemainingRef.current ?? 0);
            const round = gs.rounds?.[gs.currentRoundIndex ?? 0];
            const isMusic = (round?.type || '') === 'MUSIC';
            const musicAwaitingHostTimer =
              isMusic && timerPausedRef.current && Number.isFinite(tr) && tr > 0;
            const allowPlay = musicAwaitingHostTimer || tr > 0;
            if (!allowPlay) return;
          }
        }
        setMp3Playing(true);
        return;
      }
      setMp3Playing(false);
    };
    socket.on('music_control', onMusicControl);

    joinHost();

    return () => {
      socket.off('connect', joinHost);
      socket.off('session_state', onSessionState);
      socket.off('question_active', onQuestionActive);
      socket.off('timer_update', onTimerUpdate);
      socket.off('timer_expired', onTimerExpired);
      socket.off('answer_reveal', onAnswerReveal);
      socket.off('response_count', onResponseCount);
      socket.off('wager_lock_update', onWagerLockUpdate);
      socket.off('live_response_update', onLiveResponseUpdate);
      socket.off('live_responses_update', onLiveResponseUpdate);
      socket.off('round_intro', onRoundIntro);
      socket.off('wager_collection_start', onWagerCollectionStart);
      socket.off('venue_lobby_phase', onVenueLobbyPhase);
      socket.off('scoreboard', onScoreboard);
      socket.off('scoreboard_hidden', onScoreboardHidden);
      socket.off('round_end', onRoundEnd);
      socket.off('game_show_end', onGameShowEnd);
      socket.off('break_start', onBreakStart);
      socket.off('break_end', onBreakEnd);
      socket.off('game_end', onGameEnd);
      socket.off('session_deleted', onSessionDeleted);
      socket.off('team_joined', onTeamJoined);
      socket.off('error', onSocketError);
      socket.off('team_removed', onTeamRemoved);
      socket.off('team_updated', onTeamUpdated);
      socket.off('mini_game_start', onMiniGameStart);
      socket.off('mini_game_ready', onMiniGameReady);
      socket.off('mini_game_reveal', onMiniGameReveal);
      socket.off('mini_game_end', onMiniGameEnd);
      socket.off('mini_game_update', onMiniGameUpdate);
      socket.off('music_control', onMusicControl);
    };
  }, [socket, pin, setMp3Playing]);

  const emit = useCallback(
    (event: string, data?: Record<string, unknown>) => {
      if (socket) socket.emit(event, { pin, ...data });
    },
    [socket, pin],
  );

  const handleStartGame = () => {
    setStartGameRequested(true);
    emit('start_game');
  };
  const handleAdvanceLobby = () => {
    emit('advance_lobby');
  };
  const handleNextQuestion = () => {
    if (activeMiniGameLocal || miniGameLoading || cardShuffleFinishedHold) return;
    const gs = gameStateRef.current;
    if (gs?.state === 'QUESTION') {
      const qs = gs.questionState || 'WAITING';
      if (qs === 'ACTIVE') return;
      if (qs !== 'REVEALED' && timerRemainingRef.current > 0) return;
    }
    emit('next_question');
  };
  const handleCollectWagers = () => emit('collect_wagers');
  const handleStartNextRoundAfterCardShuffle = () => {
    setCardShuffleFinishedHold(false);
    setFinishedMiniGameType(null);
    const gs = gameStateRef.current;
    if (gs?.state === 'LOBBY') {
      setStartGameRequested(true);
      emit('start_game');
      return;
    }
    const round = gs?.rounds?.[gs?.currentRoundIndex ?? 0];
    const isLastQuestion =
      Array.isArray(round?.questions) &&
      round.questions.length > 0 &&
      (gs?.currentQuestionIndex ?? 0) === round.questions.length - 1;
    if (
      gs?.state === 'SCOREBOARD' ||
      (gs?.state === 'QUESTION' && gs?.questionState === 'REVEALED' && isLastQuestion)
    ) {
      emit('advance_round');
      return;
    }
    if (gs?.state === 'ROUND_INTRO') {
      const isRoundEmpty = Array.isArray(round?.questions) && round.questions.length === 0;
      if (isRoundEmpty) {
        emit('advance_round');
        return;
      }
      if (round?.type === 'WAGER' || round?.type === 'FINAL_WAGER') {
        emit('collect_wagers');
        return;
      }
    }
    emit('next_question');
  };
  const handleRevealAnswer = () => emit('reveal_answer');
  const handleStartTimer = () => {
    const gs = gameStateRef.current;
    if (gs?.state !== 'QUESTION' || gs?.questionState !== 'ACTIVE') return;
    if (timerRemainingRef.current <= 0) return;
    if (!timerPausedRef.current) return;
    emit('start_timer');
  };
  const handleToggleTimer = () => {
    const gs = gameStateRef.current;
    if (gs?.state !== 'QUESTION' || gs?.questionState !== 'ACTIVE') return;
    if (timerRemainingRef.current <= 0) return;
    if (timerPausedRef.current) {
      emit('start_timer');
    } else {
      emit('pause_timer');
    }
  };
  const handleShowScoreboard = () => {
    const canToggleScoreboard = state === 'SCOREBOARD' || state === 'ROUND_END';
    if (!canToggleScoreboard) return;

    if (isScoreboardVisible) {
      emit('hide_scoreboard');
      setShowScoreboardModal(false);
    } else {
      emit('show_scoreboard');
      setShowScoreboardModal(true);
    }
  };
  const handleAdvanceRound = () => emit('advance_round');
  const handleStartBreak = () => {
    if (state === 'LOBBY' || state === 'FINAL_RESULTS' || state === 'BREAK') return;
    emit('start_break');
  };
  const handleEndBreak = () => emit('end_break');
  const handleEndGame = () => setShowEndGameModal(true);
  const confirmEndGame = () => {
    setShowEndGameModal(false);
    emit('end_game');
  };
  const handleLogout = () => {
    logout();
    router.replace('/host/login');
  };
  const normalizedKangarooNames = kangarooNames.map((name, idx) => {
    const normalized = String(name || '')
      .trim()
      .replace(/\s+/g, ' ');
    return normalized || DEFAULT_KANGAROO_NAMES[idx];
  });
  const isKangarooNamesValid =
    normalizedKangarooNames.length === 6 &&
    normalizedKangarooNames.every((name) => name.length > 0 && name.length <= 32);

  const updateKangarooName = (slotIndex: number, value: string) => {
    const cleaned = value.replace(/\s+/g, ' ').slice(0, 32);
    setKangarooNames((prev) => prev.map((name, idx) => (idx === slotIndex ? cleaned : name)));
  };
  const handleKangarooRaceStart = () => {
    if (activeMiniGameLocal !== 'kangaroo_race' || !kangarooVenueReady) return;
    setKangarooBetCounts([0, 0, 0, 0, 0, 0]);
    setKangarooRaceStarted(true);
    setKangarooRaceRevealed(false);
    setKangarooFinishOrder([]);

    emit('mini_game_command', {
      game: 'kangaroo_race',
      command: 'start_game',
      kangarooNames: normalizedKangarooNames,
    });
  };

  const handleKangarooRaceFinish = () => {
    emit('end_mini_game', {
      config: {
        holdScreen: true,
        status: 'finished',
        message: '',
      },
    });
  };

  const launchCardShuffleOnVenue = useCallback(() => {
    setCardPickCounts([0, 0, 0]);
    setCardShuffleVenueReady(false);
    setCardShuffleVenueLoading(true);
    setCardShuffleGameStarted(false);
    setCardShuffleUnityStartSent(false);
    cardShuffleStartLockRef.current = false;
    setCardShuffleActiveRound(null);
    setCardShuffleRevealPosition(null);
    setCardShuffleCardsRevealed(false);
    setMiniGameRevealing(false);
    setMiniGameLoading(true);
    emit('launch_mini_game', {
      game: 'card_shuffle',
      config: {},
    });
    setActiveMiniGameLocal('card_shuffle');
  }, [emit]);

  const launchKangarooRaceOnVenue = useCallback(() => {
    if (!isKangarooNamesValid) {
      toast.error('Please enter all 6 kangaroo names before loading the race.');
      return;
    }
    setKangarooRaceStarted(false);
    setKangarooRaceRevealed(false);
    setKangarooVenueReady(false);
    setKangarooVenueLoading(true);
    setKangarooFinishOrder([]);
    setKangarooBetCounts([0, 0, 0, 0, 0, 0]);
    setMiniGameLoading(true);
    emit('launch_mini_game', {
      game: 'kangaroo_race',
      config: { kangarooNames: normalizedKangarooNames },
    });
    setActiveMiniGameLocal('kangaroo_race');
  }, [emit, isKangarooNamesValid, normalizedKangarooNames]);

  const handleOpenKangarooRaceControls = useCallback(() => {
    if (activeMiniGameLocal !== 'kangaroo_race') {
      setActiveMiniGameLocal('kangaroo_race');
    }
  }, [activeMiniGameLocal]);

  const handleOpenCardShuffleControls = useCallback(() => {
    // Mirror the Kangaroo Race flow — tapping the tile only selects the
    // Card Shuffle controls panel locally on the host. The mini-game is
    // pushed to the venue (and the introduction screen shown) only when
    // the host explicitly taps "Load Card Game on Venue".
    if (activeMiniGameLocal !== 'card_shuffle') {
      setActiveMiniGameLocal('card_shuffle');
    }
  }, [activeMiniGameLocal]);

  const handleCardShuffleCommand = (
    command: 'start_game' | 'next_round' | 'reveal_cards',
    roundNumber?: 1 | 2 | 3 | 4,
  ) => {
    if (!cardShuffleVenueReady) return;
    if (command === 'next_round' && !cardShuffleGameStarted) return;
    if (command === 'reveal_cards' && (!cardShuffleGameStarted || cardShuffleCardsRevealed)) {
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
      setCardShuffleCardsRevealed(false);
      setCardShuffleActiveRound(roundNumber);
      setMiniGameRevealing(false);
    }
    if (command === 'reveal_cards') {
      setMiniGameRevealing(true);
    }
  };

  const handleCardShuffleStartGame = () => {
    if (!cardShuffleVenueReady) return;
    if (cardShuffleStartLockRef.current || cardShuffleGameStarted || cardShuffleUnityStartSent) {
      return;
    }
    cardShuffleStartLockRef.current = true;
    setCardShuffleUnityStartSent(true);
    setCardShuffleGameStarted(true);
    setCardShuffleActiveRound(1);
    setCardPickCounts([0, 0, 0]);
    setCardShuffleRevealPosition(null);
    setCardShuffleCardsRevealed(false);
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
    // Don't immediately tear the mini-game down — open a confirmation modal
    // so the host can pick between resuming trivia and restarting the
    // mini-game. Capture the active mini-game type for the modal copy.
    const activeKind: 'card_shuffle' | 'kangaroo_race' | null =
      activeMiniGameLocal === 'card_shuffle'
        ? 'card_shuffle'
        : activeMiniGameLocal === 'kangaroo_race'
          ? 'kangaroo_race'
          : null;
    if (!activeKind) return;
    setPendingMiniGameExit(activeKind);
  };

  /** Close the mini-game on the server; trivia state is preserved server-side
   *  so the host resumes wherever they left off. */
  const confirmExitResumeTrivia = useCallback(() => {
    setCardShuffleVenueReady(false);
    setCardShuffleVenueLoading(false);
    setCardShuffleGameStarted(false);
    setCardShuffleUnityStartSent(false);
    cardShuffleStartLockRef.current = false;
    setCardShuffleActiveRound(null);
    setCardShuffleRevealPosition(null);
    setCardShuffleCardsRevealed(false);
    setKangarooRaceStarted(false);
    setKangarooRaceRevealed(false);
    setKangarooVenueReady(false);
    setKangarooVenueLoading(false);
    setKangarooFinishOrder([]);
    setKangarooBetCounts([0, 0, 0, 0, 0, 0]);
    setMiniGameRevealing(false);
    emit('end_mini_game');
    setPendingMiniGameExit(null);
  }, [emit]);

  /** Reset the current mini-game in Redis and re-broadcast intro state **without**
   *  running `end_mini_game` (which flashes the quiz). Server handles via `restart_mini_game`. */
  const confirmExitRestartMiniGame = useCallback(() => {
    const kind = pendingMiniGameExit;
    if (!kind) return;
    if (kind === 'kangaroo_race' && !isKangarooNamesValid) {
      toast.error('Please enter all 6 kangaroo names before restarting the race.');
      return;
    }

    setPendingMiniGameExit(null);

    setKangarooRaceStarted(false);
    setKangarooRaceRevealed(false);
    setKangarooVenueReady(false);
    setKangarooFinishOrder([]);
    setKangarooBetCounts([0, 0, 0, 0, 0, 0]);
    setCardShuffleVenueReady(false);
    setCardShuffleGameStarted(false);
    setCardShuffleUnityStartSent(false);
    cardShuffleStartLockRef.current = false;
    setCardShuffleActiveRound(null);
    setCardShuffleRevealPosition(null);
    setCardShuffleCardsRevealed(false);
    setCardPickCounts([0, 0, 0]);
    setMiniGameRevealing(false);
    setActiveMiniGameLocal(kind);
    setMiniGameLoading(true);
    if (kind === 'card_shuffle') {
      setCardShuffleVenueLoading(true);
    } else {
      setKangarooVenueLoading(true);
    }

    emit('restart_mini_game');
  }, [emit, pendingMiniGameExit, isKangarooNamesValid]);

  const handleFinishCardShuffle = () => {
    emit('end_mini_game', {
      config: {
        holdScreen: true,
        status: 'finished',
        message: '',
      },
    });
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

  const closeScoreboardModal = useCallback(() => {
    setShowScoreboardModal(false);
    if (isScoreboardVisible) {
      emit('hide_scoreboard');
      setIsScoreboardVisible(false);
    }
  }, [emit, isScoreboardVisible]);

  const handleAddTeam = () => {
    const normalizedTeamName = addTeamName.trim().replace(/\s+/g, ' ');
    if (!normalizedTeamName) return;
    if (normalizedTeamName.length > TEAM_NAME_MAX_LENGTH) {
      toast.error(`Team name must be ${TEAM_NAME_MAX_LENGTH} characters or fewer.`);
      return;
    }
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
    emit('add_team', {
      teamName: normalizedTeamName,
      ...(score !== undefined ? { score } : {}),
    });
    closeAddTeamModal();
  };

  const handleEditScore = (teamId: number) => {
    const val = Number(editScoreValue);
    if (isNaN(val)) return;
    emit('edit_team_score', { teamId, score: val });
    setEditScoreTeamId(null);
    setEditScoreValue('');
  };

  const handleRemoveTeam = (team: Team) => {
    setTeamPendingRemoval(team);
  };

  const confirmRemoveTeam = () => {
    if (!teamPendingRemoval) return;
    emit('remove_team', { teamId: teamPendingRemoval.teamId });
    setTeamPendingRemoval(null);
  };

  const handleToggleMp3 = () => {
    const rawMediaUrl = currentQuestion?.question?.mediaUrl;
    if (!rawMediaUrl || !hasPlayableAudio) return;

    const s = gameState?.state || 'LOBBY';
    const qs = gameState?.questionState || 'WAITING';
    const isMusic = currentQuestion?.roundType === 'MUSIC';
    const musicAwaiting =
      Boolean(isMusic) && s === 'QUESTION' && qs === 'ACTIVE' && timerPaused && timerRemaining > 0;
    const replayLocked =
      s === 'QUESTION' &&
      (qs === 'REVEALED' || (qs === 'ACTIVE' && !musicAwaiting && timerRemaining <= 0));

    if (mp3Playing) {
      setMp3Playing(false);
      emit('music_control', { action: 'pause' });
    } else {
      if (replayLocked) return;
      setMp3Playing(true);
      emit('music_control', {
        action: 'play',
        mediaUrl: rawMediaUrl,
      });
    }
  };

  const handleSpaceKey = useCallback(() => {
    if (activeMiniGameLocal || miniGameLoading || cardShuffleFinishedHold) return;
    const gs = gameStateRef.current;
    const s = gs?.state || 'LOBBY';
    const round = gs?.rounds?.[gs?.currentRoundIndex ?? 0];
    const isRoundEmpty = Array.isArray(round?.questions) && round.questions.length === 0;
    // LOBBY: Space dismisses the venue's looping welcome video. The Start Game
    // button still controls the actual game-start; this just clears the welcome
    // hold on the venue so the operator can show the team-registration grid.
    if (s === 'LOBBY' && socket && pin) {
      socket.emit('dismiss_welcome', { pin });
      return;
    }
    if (s === 'ROUND_INTRO' && isRoundEmpty) {
      handleAdvanceRound();
      return;
    }
    if (s === 'ROUND_INTRO' && (round?.type === 'WAGER' || round?.type === 'FINAL_WAGER')) {
      handleCollectWagers();
      return;
    }
    if (s === 'ROUND_END') {
      handleNextQuestion();
      return;
    }
    if (s === 'GAME_SHOW_END') {
      handleNextQuestion();
      return;
    }
    if (s === 'SCOREBOARD') {
      handleAdvanceRound();
      return;
    }
    if (s === 'QUESTION') {
      const qs = gs?.questionState || 'WAITING';
      const idx = gs?.currentQuestionIndex ?? 0;
      const qLen = round?.questions?.length ?? 0;
      const isLast = qLen > 0 && idx === qLen - 1;
      if (qs === 'ACTIVE') {
        return;
      }
      if (qs !== 'REVEALED' && timerRemainingRef.current > 0) {
        return;
      }
      if (qs === 'REVEALED' && isLast) {
        handleAdvanceRound();
        return;
      }
      if (qs === 'REVEALED') {
        handleNextQuestion();
        return;
      }
    }
    handleNextQuestion();
  }, [
    activeMiniGameLocal,
    miniGameLoading,
    cardShuffleFinishedHold,
    handleAdvanceRound,
    handleCollectWagers,
    handleNextQuestion,
    socket,
    pin,
  ]);

  useKeyboardShortcuts({
    ' ': handleSpaceKey,
    t: handleStartTimer,
    p: handleToggleTimer,
    s: handleShowScoreboard,
    q: handleRevealAnswer,
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
    if (!teamPendingRemoval) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTeamPendingRemoval(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [teamPendingRemoval]);

  useEffect(() => {
    if (!showRoundIntroductionModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRoundIntroductionModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showRoundIntroductionModal, closeRoundIntroductionModal]);

  useEffect(() => {
    if (!showScoreboardModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeScoreboardModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showScoreboardModal, closeScoreboardModal]);

  const currentRound = gameState?.rounds?.[gameState.currentRoundIndex];
  const nextRound = gameState?.rounds?.[(gameState.currentRoundIndex ?? 0) + 1];
  const hostBreakUpNextLabel = resolveBreakUpNextLabel(
    gameState?.rounds,
    gameState?.currentRoundIndex,
  );
  const isMajorityRulesLiveRound =
    (currentQuestion?.roundType || currentRound?.type || '').toUpperCase() === 'MAJORITY_RULES';
  const isCurrentRoundWagerLockRound =
    currentRound?.type === 'WAGER' || currentRound?.type === 'FINAL_WAGER';
  const state = gameState?.state || 'LOBBY';
  const lobbyPhase = gameState?.lobbyPhase || 'registration';
  const isCurrentRoundEmpty =
    state === 'ROUND_INTRO' &&
    Array.isArray(currentRound?.questions) &&
    currentRound.questions.length === 0;
  const questionState = gameState?.questionState || 'WAITING';
  const totalRounds = gameState?.rounds?.length || gameStateRef.current?.rounds?.length || 0;
  const currentRoundIndex =
    gameStateRef.current?.currentRoundIndex ?? gameState?.currentRoundIndex ?? 0;
  const isLastRound = totalRounds > 0 && currentRoundIndex === totalRounds - 1;
  const teamList = gameState?.teams ? Object.values(gameState.teams) : [];
  const sortedTeams = [...teamList].sort((a, b) => b.score - a.score);
  /** Roster rows come from `teams`; never trust `totalTeams` alone (reconnect could inflate it). */
  const rosterTeamCount = Math.max(0, teamList.length);
  const activeTeamCountForLive =
    Array.isArray(gameState?.activeTeamIds) && gameState.activeTeamIds.length > 0
      ? gameState.activeTeamIds.length
      : rosterTeamCount;
  const liveResponseDenominator =
    state === 'QUESTION' && (questionState === 'ACTIVE' || questionState === 'REVEALED')
      ? Math.max(1, liveResponses.total || activeTeamCountForLive)
      : Math.max(1, rosterTeamCount);
  const respondedLineTotal =
    state === 'QUESTION' && questionState === 'ACTIVE'
      ? liveResponseDenominator
      : Math.max(1, rosterTeamCount);
  const responsePct =
    gameState && liveResponseDenominator > 0
      ? Math.min(100, ((gameState.responseCount || 0) / liveResponseDenominator) * 100)
      : 0;
  const isLastQuestionOfRound =
    state === 'QUESTION' &&
    Boolean(currentRound) &&
    Array.isArray(currentRound?.questions) &&
    currentRound.questions.length > 0 &&
    (gameState?.currentQuestionIndex ?? 0) === currentRound.questions.length - 1;
  const revealOnLastQuestionOfRound =
    state === 'QUESTION' && questionState === 'REVEALED' && isLastQuestionOfRound;
  const miniGameFinishShouldAdvanceRound = state === 'SCOREBOARD' || revealOnLastQuestionOfRound;
  const isPreFirstQuestionRoundIntro = (
    sessionState: string,
    questionIdx: number,
    qState: string,
  ) => sessionState === 'ROUND_INTRO' && qState === 'WAITING' && questionIdx === 0;
  const miniGameFinishTriviaNotStarted =
    state === 'LOBBY' ||
    isPreFirstQuestionRoundIntro(state, gameState?.currentQuestionIndex ?? 0, questionState) ||
    (state === 'BREAK' &&
      gameState?.breakResumeState &&
      isPreFirstQuestionRoundIntro(
        gameState.breakResumeState.state || 'ROUND_INTRO',
        gameState.breakResumeState.currentQuestionIndex ?? 0,
        gameState.breakResumeState.questionState || 'WAITING',
      ));
  const miniGameFinishActionLabel = miniGameFinishShouldAdvanceRound
    ? isLastRound
      ? 'Finish Game'
      : 'Start Next Round'
    : miniGameFinishTriviaNotStarted
      ? 'Start Next Round'
      : 'Next Question';
  const showNextQuestionAction =
    state === 'QUESTION' && questionState === 'REVEALED' && !isLastQuestionOfRound;
  // const showRevealAnswerAction = state === 'QUESTION' && questionState === 'ACTIVE';
  const showRevealAnswerAction = false;
  const timerPausedAwaitingResume =
    state === 'QUESTION' &&
    questionState === 'ACTIVE' &&
    timerPaused &&
    timerRemaining > 0;
  const timerCanPause =
    state === 'QUESTION' &&
    questionState === 'ACTIVE' &&
    !timerPaused &&
    timerRemaining > 0;
  const hostMediaReplayLocked =
    state === 'QUESTION' &&
    (questionState === 'REVEALED' ||
      (questionState === 'ACTIVE' && !timerPausedAwaitingResume && timerRemaining <= 0));
  const hostVideoPlaybackActive = mp4Playing && !hostMediaReplayLocked;
  // While any mini-game (Kangaroo Race or Card Shuffle) is on the venue —
  // loaded → running → revealed, until the host taps Finish Race / Finish Game —
  // every standard footer control should be disabled so the host can't advance
  // rounds, end break, toggle the leaderboard, etc. mid-game. Cleared
  // automatically once the mini-game finish action resets activeMiniGameLocal.
  const miniGameLive =
    activeMiniGameLocal === 'kangaroo_race' || activeMiniGameLocal === 'card_shuffle';

  useLayoutEffect(() => {
    if (!hostMediaReplayLocked) return;
    const v = hostPreviewVideoRef.current;
    if (v) {
      v.pause();
      try {
        v.currentTime = 0;
      } catch {
        /* ignore seek errors */
      }
    }
  }, [hostMediaReplayLocked]);

  // Drive the host's preview <video> imperatively from `hostVideoPlaybackActive`. The `autoPlay`
  // prop only fires on mount, so when start_timer (in a music round with MP4) flips mp4Playing
  // to true, we need to call play() ourselves. Same on Stop Timer / Pause MP4 → call pause().
  useEffect(() => {
    const v = hostPreviewVideoRef.current;
    if (!v) return;
    if (hostVideoPlaybackActive) {
      try {
        const p = v.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        /* autoplay restrictions; user can click the tile to retry */
      }
    } else {
      try {
        v.pause();
      } catch {
        /* ignore */
      }
    }
  }, [hostVideoPlaybackActive]);
  const isFinalRoundCompletionState =
    isLastRound &&
    (state === 'SCOREBOARD' ||
      (state === 'QUESTION' && questionState === 'REVEALED' && isLastQuestionOfRound));
  const canOpenScoreboard = state === 'SCOREBOARD' || state === 'ROUND_END';
  const canStartBreak = state !== 'LOBBY' && state !== 'FINAL_RESULTS';
  const canToggleBreak = state === 'BREAK' || canStartBreak;

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
      className={cn('font-sans flex min-h-screen flex-col bg-[#0b0f1a] text-white')}
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
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center text-base font-semibold uppercase tracking-[0.2em] lg:text-xl"
            data-node-id="232:4449"
          >
            {state === 'SCOREBOARD' ? null : activeMiniGameLocal === 'kangaroo_race' ? (
              <span className="text-[#00d9ff]">Kangaroo Race</span>
            ) : activeMiniGameLocal === 'card_shuffle' ? (
              <span className="text-[#00d9ff]">Card Shuffle</span>
            ) : currentRound ? (
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
            {/* <Link
              href={`/host/teams?pin=${encodeURIComponent(pin)}${sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : ''}`}
              className="text-[#00d9ff]/80 underline-offset-2 hover:text-[#00d9ff] hover:underline"
            >
              Teams
            </Link> */}
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
          className="w-full shrink-0 border-white/10 bg-[linear-gradient(180deg,rgba(20,26,42,0.6)_0%,#0b0f1a_100%)] px-4 py-6 lg:w-[min(100%,350px)] lg:border-r"
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
                  active={activeMiniGameLocal === 'kangaroo_race'}
                  icon={
                    <img
                      src="/KangarooPic.png"
                      alt=""
                      aria-hidden="true"
                      className="h-12 w-12 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]"
                    />
                  }
                  onClick={handleOpenKangarooRaceControls}
                />
                <HostSidebarTile
                  data-node-id="232:4588"
                  label="Card Shuffle"
                  active={!!activeMiniGameLocal && activeMiniGameLocal === 'card_shuffle'}
                  icon={
                    <img
                      src="/games/card-shuffle/queencard.png"
                      alt=""
                      aria-hidden="true"
                      className="h-12 w-12 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]"
                    />
                  }
                  onClick={handleOpenCardShuffleControls}
                />
              </div>
            </section>

            {/* <section data-name="Media Controls" data-node-id="232:4478">
              <HostPanelTitle data-node-id="232:4480">Media Controls</HostPanelTitle>
              <div className="grid grid-cols-2 gap-3">
                <HostSidebarTile
                  label="Venue MP3"
                  active={mp3Playing}
                  disabled={
                    !currentQuestion ||
                    !hasPlayableAudio ||
                    timerPausedAwaitingResume ||
                    hostMediaReplayLocked
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
                  active={hostVideoPlaybackActive}
                  disabled={
                    !currentQuestion?.question?.mediaUrl ||
                    (currentQuestion?.question?.mediaType || '').toLowerCase() !== 'mp4' ||
                    hostMediaReplayLocked
                  }
                  icon={
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                    </svg>
                  }
                  onClick={() => {
                    if (hostMediaReplayLocked && !mp4Playing) return;
                    setMp4Playing((p) => {
                      const next = !p;
                      // Mirror the MP3 control: tell the venue projector to start / stop the
                      // <video> element. Players still see a placeholder image regardless.
                      if (socket && pin) {
                        socket.emit('music_control', {
                          pin,
                          action: next ? 'play' : 'pause',
                          mediaUrl: currentQuestion?.question?.mediaUrl || null,
                        });
                      }
                      return next;
                    });
                  }}
                />
              </div>
            </section> */}
          </div>
        </aside>

        <main
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-4 py-4"
          data-name="Question Panel"
          data-node-id="232:4518"
        >
          {/* ── Mini-Game Active / Loading ── */}
          {cardShuffleFinishedHold ? (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border-2 border-[rgba(0,217,255,0.45)] bg-[linear-gradient(180deg,rgba(26,31,46,0.85)_0%,rgba(11,15,26,0.92)_100%)] p-6 shadow-[0_0_28px_rgba(0,217,255,0.12)] sm:p-6">
              <div className="w-full max-w-3xl rounded-[28px] border border-[#2ec7ff]/45 bg-[linear-gradient(180deg,rgba(38,14,95,0.95)_0%,rgba(15,11,55,0.96)_100%)] px-8 py-12 text-center shadow-[0_0_36px_rgba(0,229,255,0.16)]">
                <img
                  src="/logo.png"
                  alt="Max Showdown"
                  className="mx-auto mb-6 h-[min(30rem,36vh)] w-auto max-w-[min(92%,480px)] object-contain drop-shadow-[0_0_24px_rgba(0,229,255,0.28)]"
                />
                <p className="text-sm font-black uppercase tracking-[0.28em] text-[#2be9ff]">
                  {finishedMiniGameType === 'kangaroo_race' ? 'Kangaroo Race' : 'Card Shuffle'}
                </p>
                <h2 className="mt-4 text-5xl font-black text-white drop-shadow-[0_0_16px_rgba(255,255,255,0.18)] sm:text-6xl">
                  Game Over
                </h2>
                {state !== 'GAME_END' && (
                  <button
                    type="button"
                    onClick={handleStartNextRoundAfterCardShuffle}
                    className="mt-10 rounded-xl border border-[#22c55e]/65 bg-[linear-gradient(180deg,#16a34a_0%,#14532d_100%)] px-8 py-4 text-base font-extrabold uppercase tracking-[0.14em] text-white shadow-[0_0_18px_rgba(34,197,94,0.28)] transition hover:brightness-110 sm:text-lg"
                  >
                    {miniGameFinishActionLabel}
                  </button>
                )}
              </div>
            </div>
          ) : activeMiniGameLocal || miniGameLoading ? (
            <div className="flex min-h-0 flex-1 flex-col rounded-2xl border-2 border-[rgba(0,217,255,0.45)] bg-[linear-gradient(180deg,rgba(26,31,46,0.85)_0%,rgba(11,15,26,0.92)_100%)] p-4 shadow-[0_0_28px_rgba(0,217,255,0.12)] sm:p-6">
              <div className="mb-4 flex shrink-0 items-center justify-between">
                <h2 className="text-2xl font-semibold text-white sm:text-[30px]">
                  {activeMiniGameLocal === 'kangaroo_race'
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
                    {gameState?.activeMiniGame === 'kangaroo_race' ? (
                      '🦘'
                    ) : (
                      <img
                        src="/client/public/games/card-shuffle/queencard.png"
                        alt="Card"
                        className="w-15 h-15"
                      />
                    )}
                  </div>
                  <p className="text-lg font-semibold text-white/60">
                    Launching mini-game on venue...
                  </p>
                  <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-full animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full bg-[linear-gradient(90deg,transparent_0%,#00d9ff_50%,transparent_100%)] bg-[length:200%_100%]" />
                  </div>
                </div>
              ) : activeMiniGameLocal === 'card_shuffle' ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4">
                  <div className="text-6xl">
                    <img src="/games/card-shuffle/queencard.png" alt="Card" className="w-15 h-20" />
                  </div>
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
                              ? cardShuffleCardsRevealed
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

                    {/* Mirrors the Kangaroo Race "Load Race on Venue"
                        button — host first pushes the mini-game to the
                        venue display, then "Start Game" unlocks once
                        Unity confirms ready. */}
                    <button
                      type="button"
                      disabled={miniGameLoading || cardShuffleVenueLoading || cardShuffleVenueReady}
                      onClick={launchCardShuffleOnVenue}
                      className={cn(
                        'mb-3 h-12 w-full rounded-xl border px-5 text-sm font-black uppercase tracking-wide transition',
                        !miniGameLoading && !cardShuffleVenueLoading && !cardShuffleVenueReady
                          ? 'border-violet-400/60 bg-[linear-gradient(180deg,#7c3aed_0%,#4c1d95_100%)] text-white shadow-[0_0_18px_rgba(124,58,237,0.3)] hover:brightness-110'
                          : 'cursor-not-allowed border-white/10 bg-white/8 text-white/30 grayscale',
                      )}
                    >
                      {cardShuffleVenueLoading ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                          Loading on venue...
                        </span>
                      ) : cardShuffleVenueReady ? (
                        'Loaded on Venue'
                      ) : (
                        'Load Card Game on Venue'
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={
                        !cardShuffleVenueReady ||
                        cardShuffleGameStarted ||
                        cardShuffleUnityStartSent
                      }
                      onClick={handleCardShuffleStartGame}
                      className={cn(
                        'mb-3 h-14 w-full rounded-xl border px-5 text-lg font-black uppercase tracking-wide transition',
                        cardShuffleVenueReady &&
                          !cardShuffleGameStarted &&
                          !cardShuffleUnityStartSent
                          ? 'border-[#00d9ff]/70 bg-[linear-gradient(180deg,#00a9df_0%,#075a89_100%)] text-white shadow-[0_0_22px_rgba(0,217,255,0.28)] hover:brightness-110'
                          : 'cursor-not-allowed border-white/10 bg-white/8 text-white/30 grayscale',
                      )}
                    >
                      {cardShuffleGameStarted || cardShuffleUnityStartSent
                        ? 'Game started'
                        : 'Start Game'}
                    </button>

                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      {([1, 2, 3, 4] as const).map((roundNumber) => {
                        // Card Shuffle rounds are strictly sequential. Only
                        // ONE round button is interactive at a time:
                        //   • Before any round starts → Round 1 is the next.
                        //   • While a round is active (no reveal yet) → all
                        //     buttons are locked.
                        //   • Once the active round's card is revealed →
                        //     Round (active+1) becomes the next, until 4.
                        // Completed and not-yet-up rounds stay greyed out.
                        const isCompleted =
                          cardShuffleActiveRound != null && roundNumber < cardShuffleActiveRound;
                        const isActive = cardShuffleActiveRound === roundNumber;
                        const nextRoundNumber =
                          cardShuffleActiveRound == null
                            ? 1
                            : cardShuffleCardsRevealed
                              ? cardShuffleActiveRound + 1
                              : null;
                        const isNextUp = nextRoundNumber != null && roundNumber === nextRoundNumber;
                        const enabled =
                          cardShuffleVenueReady &&
                          cardShuffleGameStarted &&
                          isNextUp &&
                          !miniGameRevealing;
                        return (
                          <button
                            key={roundNumber}
                            type="button"
                            disabled={!enabled}
                            onClick={() => handleCardShuffleCommand('next_round', roundNumber)}
                            className={cn(
                              'h-12 rounded-lg border px-3 text-sm font-extrabold uppercase tracking-wide transition',
                              isActive && cardShuffleVenueReady && cardShuffleGameStarted
                                ? 'border-green-400/80 bg-[linear-gradient(180deg,#0f8f4d_0%,#064422_100%)] text-white shadow-[0_0_18px_rgba(34,197,94,0.38)]'
                                : enabled
                                  ? 'border-[#ffc400]/55 bg-[linear-gradient(180deg,#7a3cff_0%,#31116f_100%)] text-white shadow-[0_0_16px_rgba(122,60,255,0.24)] hover:brightness-110'
                                  : 'cursor-not-allowed border-white/10 bg-white/7 text-white/28 grayscale',
                            )}
                          >
                            Start Round {roundNumber}
                          </button>
                        );
                      })}
                    </div>

                    {cardShuffleActiveRound === 4 && cardShuffleCardsRevealed ? (
                      <button
                        type="button"
                        onClick={handleFinishCardShuffle}
                        className="mt-3 h-12 w-full rounded-lg border border-[#22c55e]/65 bg-[linear-gradient(180deg,#16a34a_0%,#14532d_100%)] px-4 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_0_18px_rgba(34,197,94,0.28)] transition hover:brightness-110"
                      >
                        Finish Game
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          !cardShuffleVenueReady ||
                          !cardShuffleGameStarted ||
                          miniGameRevealing ||
                          cardShuffleCardsRevealed
                        }
                        onClick={() =>
                          handleCardShuffleCommand(
                            'reveal_cards',
                            cardShuffleActiveRound ?? undefined,
                          )
                        }
                        className={cn(
                          'mt-3 h-12 w-full rounded-lg border px-4 text-sm font-extrabold uppercase tracking-wide transition',
                          cardShuffleVenueReady &&
                            cardShuffleGameStarted &&
                            !miniGameRevealing &&
                            !cardShuffleCardsRevealed
                            ? 'border-[#ff68ff]/65 bg-[linear-gradient(180deg,#b100d5_0%,#6b0a90_100%)] text-white shadow-[0_0_18px_rgba(255,67,255,0.26)] hover:brightness-110'
                            : 'cursor-not-allowed border-white/10 bg-white/7 text-white/28 grayscale',
                        )}
                      >
                        {miniGameRevealing ? 'Revealing...' : 'Reveal Cards'}
                      </button>
                    )}
                  </div>

                  <div className="mt-2 flex gap-4">
                    {CARD_SHUFFLE_SLOTS.map((n, i) => (
                      <div
                        key={n}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-xl border-2 px-6 py-4 transition-all',
                          cardShuffleCardsRevealed && cardShuffleRevealPosition === n
                            ? 'border-green-500/60 bg-green-500/10'
                            : 'border-white/10 bg-white/5',
                        )}
                      >
                        <span className="text-3xl">
                          <img
                            src={`/games/card-shuffle/queencard.png`}
                            alt={CARD_POSITION_LABELS[n]}
                            className="h-12 w-12 object-contain"
                          />
                        </span>
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
                  {cardShuffleCardsRevealed && cardShuffleRevealPosition ? (
                    <p className="text-xs text-white/50 mt-2">
                      Winning position:{' '}
                      <span className="text-green-400 font-semibold">
                        {CARD_POSITION_LABELS[cardShuffleRevealPosition]}
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : activeMiniGameLocal === 'kangaroo_race' ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4">
                  <div className="text-6xl">
                    <img
                      src="/KangarooPic.png"
                      alt=""
                      aria-hidden="true"
                      className="h-20 w-20 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]"
                    />
                  </div>
                  <p className="text-xl font-bold text-white">
                    Kangaroo Race is running on the big screen
                  </p>
                  <p className="text-sm text-white/50">Players are betting on their phones</p>

                  <div className="w-full max-w-3xl rounded-2xl border border-[#00d9ff]/25 bg-[#080d1c]/80 p-4 shadow-[0_0_24px_rgba(0,217,255,0.12)]">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#00d9ff]">
                          Kangaroo Race Controls
                        </p>
                        <p className="mt-1 text-sm text-white/50">
                          {kangarooRaceStarted
                            ? kangarooRaceRevealed
                              ? 'Winner revealed. Finish race or start again.'
                              : 'Race started. Unity decides random finishing order.'
                            : 'Set names, load race on venue, then start when venue is ready.'}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider',
                          kangarooRaceStarted
                            ? 'border-green-500/45 bg-green-500/15 text-green-300'
                            : 'border-white/15 bg-white/5 text-white/45',
                        )}
                      >
                        {kangarooRaceStarted ? 'Started' : 'Waiting'}
                      </span>
                    </div>

                    <div className="mb-3 rounded-xl border border-white/10 bg-black/20 p-3">
                      <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-white/60">
                        Kangaroo Names
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {KANGAROO_SLOTS.map((slot, idx) => (
                          <label
                            key={slot}
                            className="flex items-center gap-2 text-xs text-white/70"
                          >
                            <span className="w-6 text-center font-bold">#{slot}</span>
                            <input
                              value={kangarooNames[idx] ?? ''}
                              onChange={(event) => updateKangarooName(idx, event.target.value)}
                              className="h-9 w-full rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white outline-none focus:border-[#00d9ff]"
                              maxLength={32}
                              placeholder={`Kangaroo ${slot}`}
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={
                        miniGameLoading ||
                        kangarooVenueLoading ||
                        kangarooVenueReady ||
                        !isKangarooNamesValid
                      }
                      onClick={launchKangarooRaceOnVenue}
                      className={cn(
                        'mb-3 h-12 w-full rounded-xl border px-5 text-sm font-black uppercase tracking-wide transition',
                        !miniGameLoading &&
                          !kangarooVenueLoading &&
                          !kangarooVenueReady &&
                          isKangarooNamesValid
                          ? 'border-violet-400/60 bg-[linear-gradient(180deg,#7c3aed_0%,#4c1d95_100%)] text-white shadow-[0_0_18px_rgba(124,58,237,0.3)] hover:brightness-110'
                          : 'cursor-not-allowed border-white/10 bg-white/8 text-white/30 grayscale',
                      )}
                    >
                      {kangarooVenueLoading ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                          Loading on venue...
                        </span>
                      ) : (
                        'Load Race on Venue'
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={
                        activeMiniGameLocal !== 'kangaroo_race' ||
                        !kangarooVenueReady ||
                        kangarooRaceStarted ||
                        !isKangarooNamesValid
                      }
                      onClick={handleKangarooRaceStart}
                      className={cn(
                        'mb-3 h-14 w-full rounded-xl border px-5 text-lg font-black uppercase tracking-wide transition',
                        activeMiniGameLocal === 'kangaroo_race' &&
                          kangarooVenueReady &&
                          !kangarooRaceStarted &&
                          isKangarooNamesValid
                          ? 'border-[#00d9ff]/70 bg-[linear-gradient(180deg,#00a9df_0%,#075a89_100%)] text-white shadow-[0_0_22px_rgba(0,217,255,0.28)] hover:brightness-110'
                          : 'cursor-not-allowed border-white/10 bg-white/8 text-white/30 grayscale',
                      )}
                    >
                      Start Race
                    </button>

                    <div className="grid grid-cols-1 gap-3">
                      {/* <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
                        Venue status:{' '}
                        <span className={kangarooVenueReady ? 'text-green-300' : 'text-yellow-300'}>
                          {kangarooVenueReady ? 'Unity ready' : 'Waiting for Unity ready'}
                        </span>
                      </div> */}
                      <button
                        type="button"
                        onClick={handleKangarooRaceFinish}
                        // Disable while a race is mid-flight (started but not yet revealed)
                        // so the host can't tear the mini-game down before the kangaroos
                        // actually finish. Re-enabled once the venue has revealed the
                        // finish order.
                        disabled={
                          activeMiniGameLocal !== 'kangaroo_race' ||
                          (kangarooRaceStarted && !kangarooRaceRevealed)
                        }
                        className="h-12 rounded-lg border border-red-500/40 bg-[linear-gradient(180deg,#dc2626_0%,#7f1d1d_100%)] px-4 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_0_16px_rgba(220,38,38,0.24)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale"
                      >
                        Finish Race
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap justify-center gap-3">
                    {KANGAROO_SLOTS.map((n, i) => (
                      <div
                        key={n}
                        className={cn(
                          'flex flex-col items-center gap-1 rounded-xl border-2 px-4 py-3 transition-all',
                          kangarooFinishOrder[0] === n
                            ? 'border-green-500/60 bg-green-500/10'
                            : 'border-white/10 bg-white/5',
                        )}
                      >
                        <span className="text-2xl">
                          <img
                            src="/KangarooPic.png"
                            alt={normalizedKangarooNames[i] || `Kangaroo ${n}`}
                            className="h-10 w-10 object-contain"
                          />
                        </span>
                        <span className="text-xs font-bold text-white">
                          #{n} {normalizedKangarooNames[i]}
                        </span>
                        <span className="text-base font-mono font-bold text-[#00d9ff]">
                          {kangarooBetCounts[i] ?? 0}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-green-300">
                          {kangarooFinishOrder.length > 0
                            ? `P${kangarooFinishOrder.indexOf(n) + 1}`
                            : '—'}
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
          ) : state === 'QUESTION' && currentQuestion ? (
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
                        className="h-full w-full"
                        alt="Question media"
                      />
                    ) : currentQuestion.question.mediaUrl &&
                      (currentQuestion.question.mediaType || '').toLowerCase() === 'mp4' ? (
                      <video
                        ref={hostPreviewVideoRef}
                        src={resolveMediaUrl(currentQuestion.question.mediaUrl)}
                        className="h-full w-full bg-black object-contain"
                        controls={hostVideoPlaybackActive}
                        autoPlay={hostVideoPlaybackActive}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center px-6 py-8">
                        <p className="text-center text-xl font-black uppercase leading-tight text-white sm:text-2xl lg:text-3xl">
                          {currentQuestion.question.text}
                        </p>
                      </div>
                    )}
                  </div>

                  <QuestionTimerArch
                    remainingSeconds={timerRemaining}
                    totalSeconds={timerDuration}
                    size="host"
                  />
                </div>

                {/* Content Section */}
                <div className="relative z-20 flex-1 border-t-2 border-t-white/20 bg-[linear-gradient(180deg,#0a0f2b_0%,#04060e_100%)] px-6 pb-6 pt-14 shadow-inner">
                  {currentQuestion.question.mediaUrl &&
                  ['image', 'mp4'].includes(
                    (currentQuestion.question.mediaType || '').toLowerCase(),
                  ) ? (
                    <div className="mb-6 text-center">
                      <p className="text-2xl font-black leading-tight text-white sm:text-3xl">
                        Q{(currentQuestion.questionIndex || 0) + 1}. {currentQuestion.question.text}
                      </p>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-3 pb-2 pt-2">
                    {currentQuestion.question.options.map((opt, i) => {
                      const isMajorityRulesRound =
                        (currentQuestion.roundType || '').toUpperCase() === 'MAJORITY_RULES';
                      const majorityOptionIndexes = new Set(
                        revealData?.majorityOptionIndexes || [],
                      );
                      const isRevealedWinner = Boolean(
                        revealData &&
                        (isMajorityRulesRound
                          ? majorityOptionIndexes.has(i)
                          : i === revealData.correctOptionIndex),
                      );
                      return (
                        <div
                          key={i}
                          className={cn(
                            'flex min-h-[64px] items-start gap-2 rounded-xl border-2 px-4 py-3 text-lg font-black text-white transition-all shadow-[0_4px_12px_rgba(0,0,0,0.5)] sm:text-xl',
                            VENUE_OPTION_COLOR_CLASSES[i % VENUE_OPTION_COLOR_CLASSES.length],
                            isRevealedWinner
                              ? 'z-10 scale-[1.03] shadow-[0_0_12px_8px_rgba(57,255,74,0.8)]'
                              : revealData
                                ? 'scale-[0.98] brightness-50 contrast-75 opacity-30'
                                : '',
                          )}
                        >
                          <span className="shrink-0 font-black text-white/50">
                            {OPTION_LETTERS[i]}.
                          </span>
                          <span className="min-w-0 flex-1 break-words leading-tight">{opt.text}</span>
                          {isRevealedWinner && !isMajorityRulesRound && (
                            <div className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white bg-green-500 shadow-lg">
                              <span className="text-sm text-white">✓</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* {revealData?.allWrong && (
                    <div className="mt-4 animate-pulse rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2.5 text-center text-sm font-bold text-orange-400">
                      All teams answered incorrectly — no eliminations
                    </div>
                  )} */}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-[rgba(0,217,255,0.25)] bg-[#151b2e]/40 p-8">
              {state === 'ROUND_INTRO' || state === 'WAGER_COLLECTION' ? (
                <div className="w-full max-w-[1120px] animate-fadeIn">
                  {state === 'WAGER_COLLECTION' ? (
                    <div className="flex flex-col items-center justify-center gap-6 py-8 text-center">
                      <div className="inline-flex items-center gap-3 rounded-full border border-[#ffc400]/55 bg-[linear-gradient(180deg,rgba(60,30,100,0.95)_0%,rgba(20,10,50,0.95)_100%)] px-8 py-3 shadow-[0_0_22px_rgba(255,196,0,0.2)]">
                        <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[#ffc400]">
                          Wager Collection
                        </span>
                      </div>
                      {currentQuestion?.question?.category ? (
                        <div className="inline-flex items-center gap-2 rounded-full border border-[#00d9ff]/45 bg-[rgba(0,217,255,0.08)] px-5 py-1.5 shadow-[0_0_18px_rgba(0,217,255,0.18)]">
                          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9de9ff]/80">
                            Category
                          </span>
                          <span className="text-sm font-bold uppercase tracking-[0.16em] text-[#00d9ff]">
                            {currentQuestion.question.category}
                          </span>
                        </div>
                      ) : null}
                      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#ffc400]/50 bg-[rgba(255,196,0,0.1)] shadow-[0_0_24px_rgba(255,196,0,0.25)]">
                        <svg
                          className="h-10 w-10 text-[#ffc400] animate-pulse"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                          <path d="M12 18V6" />
                        </svg>
                      </div>
                      <h2 className="text-4xl font-black leading-tight text-white drop-shadow-[0_0_14px_rgba(255,196,0,0.35)] sm:text-5xl">
                        Collecting Wager Points
                      </h2>
                      <p className="max-w-md text-lg text-[#ffc400]/80">
                        Players are locking in their wager amounts on their devices.
                        <br />
                        Press{' '}
                        <span className="font-bold text-white">
                          &quot;Start Question&quot;
                        </span>{' '}
                        when ready to begin.
                      </p>
                    </div>
                  ) : (
                    <div className="relative mx-auto aspect-[860/680] w-full max-w-[860px]">
                      <img
                        src="/Venue Round Intro.png"
                        alt="Round intro background"
                        className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_0_26px_rgba(0,0,0,0.6)]"
                      />

                      <div className="absolute inset-0 pointer-events-none text-center">
                        <div className="absolute left-1/2 top-[40%] w-[70%] -translate-x-1/2 -translate-y-1/2 sm:w-[62%]">
                          <h2 className="text-4xl leading-[0.95] font-black text-[#fff4c2] sm:text-5xl md:text-6xl lg:text-[35px]">
                            ROUND {(gameState?.currentRoundIndex || 0) + 1}
                          </h2>
                          {(gameState?.currentRoundIndex ?? 0) !== 0 ? (
                            <p className="mt-1 text-4xl font-black uppercase leading-[0.95] text-[#fff4c2]   sm:text-5xl md:text-6xl lg:text-[35px]">
                              {normalizeRoundIntroTitle(
                                currentRound?.name,
                                currentRound?.type,
                                gameState?.currentRoundIndex,
                              )}
                            </p>
                          ) : null}
                        </div>

                        <div className="absolute inset-x-[6%] top-[69%] bottom-[6%] flex flex-col items-stretch justify-center overflow-hidden">
                          <RoundIntroScoringLines roundType={currentRound?.type} variant="host" />
                        </div>

                        {isCurrentRoundEmpty ? (
                          <div className="absolute left-1/2 top-[56%] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#ffd166]/60 bg-[rgba(40,28,8,0.9)] px-6 py-5 text-center shadow-[0_0_20px_rgba(255,209,102,0.3)]">
                            <p className="text-base font-extrabold uppercase tracking-[0.14em] text-[#ffd166]">
                              No Questions In This Round
                            </p>
                            <p className="mt-2 text-sm font-medium text-[#ffe6a8]/95">
                              Click Skip Empty Round to continue.
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
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
                  {/* <p className="mt-3 text-base text-white/60 sm:text-lg">
                    Players and venue screens can now view the final end-of-game message.
                  </p> */}

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
              ) : state === 'BREAK' ? (
                <div className="flex w-full max-w-[640px] flex-col items-center justify-center gap-2 py-4 animate-fadeIn">
                  <BreakScreenHeading size="host" />

                  <BreakTimerDisplay
                    remainingSeconds={hostBreakRemaining}
                    totalSeconds={hostBreakDuration}
                    size="host"
                    className="mt-4"
                  />
                </div>
              ) : state === 'ROUND_END' ? (
                <div className="flex w-full max-w-[720px] flex-col items-center justify-center gap-6 py-8 text-center animate-fadeIn">
                  <h2 className="text-4xl font-black uppercase leading-tight text-white drop-shadow-[0_0_14px_rgba(123,194,255,0.35)] sm:text-5xl">
                    END OF ROUND{' '}
                    {(roundEndInfo?.roundIndex ?? gameState?.currentRoundIndex ?? 0) + 1}
                  </h2>
                  <p className="max-w-md text-base text-[#9de9ff]/90 sm:text-lg">
                    That round is over.{' '}
                    {roundEndInfo?.isFinalRound || isLastRound
                      ? 'The gameshow closing screen is coming up next.'
                      : roundEndInfo?.nextRound
                        ? `Up next: ${formatRoundTypeLabel(roundEndInfo.nextRound.type)} Round.`
                        : nextRound
                          ? `Up next: ${formatRoundTypeLabel(nextRound.type)} Round.`
                          : 'Continue to view the scoreboard.'}
                  </p>
                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    className="mt-2 min-w-[260px] rounded-xl border border-[rgba(0,217,255,0.55)] bg-[linear-gradient(180deg,#3a4a68_0%,#1e2a42_100%)] px-10 py-4 text-base font-black uppercase tracking-[0.14em] text-white shadow-[0_0_24px_rgba(0,217,255,0.22)] transition hover:brightness-110"
                  >
                    Continue
                  </button>
                </div>
              ) : state === 'GAME_SHOW_END' ? (
                <div className="flex w-full max-w-[720px] flex-col items-center justify-center gap-6 py-4 animate-fadeIn">
                  <GameshowEndScreen size="host" className="py-0" />
                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    className="min-w-[260px] rounded-xl border border-[rgba(0,217,255,0.55)] bg-[linear-gradient(180deg,#3a4a68_0%,#1e2a42_100%)] px-10 py-4 text-base font-black uppercase tracking-[0.14em] text-white shadow-[0_0_24px_rgba(0,217,255,0.22)] transition hover:brightness-110"
                  >
                    Show Final Scoreboard
                  </button>
                </div>
              ) : state === 'SCOREBOARD' ? (
                <div className="flex w-full max-w-[720px] flex-col items-center justify-center gap-6 py-8 text-center animate-fadeIn">
                  <div className="inline-flex items-center gap-3 rounded-full border border-[#41d9ff]/45 bg-[linear-gradient(180deg,rgba(20,42,89,0.95)_0%,rgba(11,20,46,0.95)_100%)] px-8 py-3 shadow-[0_0_22px_rgba(0,217,255,0.2)]">
                    <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[#8cdfff]">
                      {isLastRound ? 'Quiz Complete' : 'Round Completed'}
                    </span>
                  </div>
                  <h2 className="text-4xl font-black leading-tight text-white drop-shadow-[0_0_14px_rgba(123,194,255,0.35)] sm:text-5xl">
                    {isLastRound
                      ? 'All Rounds Finished'
                      : nextRound
                        ? `NEXT: ${formatRoundTypeLabel(nextRound.type)} Round`
                        : currentRound
                          ? normalizeRoundIntroTitle(
                              currentRound.name,
                              currentRound.type,
                              gameState?.currentRoundIndex,
                            )
                          : 'This round is finished'}
                  </h2>
                  <p className="max-w-md text-base text-[#9de9ff]/90 sm:text-lg">
                    {isLastRound
                      ? 'All questions have been answered. View the final results.'
                      : nextRound && currentRound
                        ? `All questions for ${formatRoundTypeLabel(currentRound.type)} are done. Click below to begin the ${formatRoundTypeLabel(nextRound.type)} Round, ${getNextRoundIntroBlurb(nextRound.type)}`
                        : 'All questions in this round are done. When you are ready, go to the next round.'}
                  </p>
                  <button
                    type="button"
                    onClick={handleAdvanceRound}
                    className={cn(
                      'mt-2 min-w-[260px] rounded-xl border px-10 py-4 text-base font-black uppercase tracking-[0.14em] text-white transition hover:brightness-110',
                      isLastRound
                        ? 'border-[#ff4d4d]/70 bg-[linear-gradient(180deg,#b91c1c_0%,#7f1d1d_100%)] shadow-[0_0_24px_rgba(239,68,68,0.26)]'
                        : 'border-[rgba(0,217,255,0.55)] bg-[linear-gradient(180deg,#3a4a68_0%,#1e2a42_100%)] shadow-[0_0_24px_rgba(0,217,255,0.22)]',
                    )}
                  >
                    {isLastRound
                      ? 'Finish Game'
                      : nextRound
                        ? `START ${formatRoundTypeLabel(nextRound.type).toUpperCase()} ROUND`
                        : 'Start next round'}
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <p className="mb-2 text-2xl font-bold text-white/30">
                    {state === 'LOBBY'
                      ? lobbyPhase === 'registration'
                        ? 'Waiting for teams to join...'
                        : lobbyPhase === 'code_of_conduct'
                          ? 'Code of Conduct is on the venue screen'
                          : 'Ready to start'
                      : 'Waiting...'}
                  </p>
                  {state === 'LOBBY' ? (
                    <p className="text-sm text-white/40">
                      {teamList.length} team{teamList.length !== 1 ? 's' : ''} in lobby
                      {lobbyPhase !== 'registration' ? ' · Ready to start' : ''}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </main>

        <aside
          data-name="Right Panel"
          className="w-full shrink-0 border-white/10 bg-[linear-gradient(180deg,rgba(20,26,42,0.6)_0%,#0b0f1a_100%)] px-4 py-6 lg:w-[min(100%,350px)] lg:border-l"
        >
          <div className="space-y-10">
            <section data-name="Live Responses Panel" data-node-id="232:4549">
              <HostPanelTitle data-node-id="232:4556">
                {state === 'WAGER_COLLECTION' ? 'Wager Lock Progress' : 'Live Responses'}
              </HostPanelTitle>
              <div
                className="rounded-xl border border-[rgba(0,217,255,0.25)] bg-[#151b2e]/80 px-4 py-4"
                data-name="Response Progress Container"
              >
                {state === 'WAGER_COLLECTION' ? (
                  <p className="text-lg text-white" data-node-id="232:4555">
                    <span className="font-bold text-[#00d9ff]">{wagerLockedCount}</span>{' '}
                    <span className="font-medium">
                      of {wagerLockedTotal || respondedLineTotal} Teams wagered
                    </span>
                  </p>
                ) : (
                  <p className="mb-4 text-lg text-white" data-node-id="232:4555">
                    <span className="font-bold text-[#00d9ff]">
                      {gameState?.responseCount ?? 0}
                    </span>{' '}
                    <span className="font-medium">of {respondedLineTotal} Teams responded</span>
                  </p>
                )}

                {state !== 'WAGER_COLLECTION' && (
                  <div className="space-y-4">
                    {[
                      {
                        label: isMajorityRulesLiveRound ? 'Majority' : 'Correct',
                        value: liveResponses.correct,
                        color: 'from-[#00ff00] to-[#008000]',
                        track: 'bg-[#3d7a3d]/60',
                        icon: isMajorityRulesLiveRound ? '+' : '✓',
                        iconBg: 'bg-green-500',
                      },
                      {
                        label: isMajorityRulesLiveRound ? 'Minority' : 'Incorrect',
                        value: liveResponses.incorrect,
                        color: 'from-[#ff0000] to-[#800000]',
                        track: 'bg-[#7a3d3d]/60',
                        icon: isMajorityRulesLiveRound ? '-' : '×',
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
                      const total = liveResponseDenominator;
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
                              style={{
                                width: `${width}%`,
                                minWidth: item.value > 0 ? '6px' : '0px',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <section data-name="Leaderboard Panel" data-node-id="232:4557">
              <h2 className=" text-xl font-bold text-white sm:text-[25px]" data-node-id="232:4579">
                Leaderboard{' '}
              </h2>
              <span className="text-sm font-semibold text-[#00d9ff]" data-node-id="232:4458">
                {rosterTeamCount} {rosterTeamCount === 1 ? 'Team' : 'Teams'} Connected
              </span>

              <div
                className="max-h-[min(45vh,22rem)] overflow-y-auto overscroll-y-contain rounded-lg border border-white/20 [scrollbar-color:rgba(255,255,255,0.25)_transparent]"
                data-name="Leaderboard Container"
              >
                {sortedTeams.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-white/40">No teams yet</p>
                ) : (
                  sortedTeams.map((team, idx) => (
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
              disabled={
                miniGameLive ||
                (state === 'LOBBY' &&
                  ((lobbyPhase === 'code_of_conduct' &&
                    (startGameRequested || teamList.length === 0)) ||
                    (lobbyPhase === 'registration' && teamList.length === 0))) ||
                !(state === 'LOBBY' || state === 'ROUND_INTRO' || state === 'WAGER_COLLECTION') ||
                isCurrentRoundEmpty
              }
              onClick={() => {
                if (state === 'LOBBY') {
                  if (lobbyPhase === 'registration') {
                    handleAdvanceLobby();
                  } else {
                    handleStartGame();
                  }
                } else if (state === 'ROUND_INTRO' && isCurrentRoundWagerLockRound)
                  handleCollectWagers();
                else if (state === 'ROUND_INTRO') handleNextQuestion();
                else if (state === 'WAGER_COLLECTION') handleNextQuestion();
              }}
            >
              {state === 'LOBBY'
                ? lobbyPhase === 'registration'
                  ? 'Show Code of Conduct'
                  : 'Start Game'
                : state === 'ROUND_INTRO' && isCurrentRoundWagerLockRound
                  ? 'Lock Wager Points'
                  : state === 'WAGER_COLLECTION'
                    ? 'Start Question'
                    : 'Start Round'}
            </HostFooterBtn>
            <HostFooterBtn
              emphasis={showRevealAnswerAction || showNextQuestionAction}
              icon={
                <svg viewBox="0 0 24 24" fill="currentColor" className="text-[#00d9ff]">
                  {showNextQuestionAction || revealOnLastQuestionOfRound ? (
                    <path d="M6 18l8.5-6L6 6v12zm8-12v12h2V6h-2z" />
                  ) : (
                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                  )}
                </svg>
              }
              disabled={
                miniGameLive ||
                revealOnLastQuestionOfRound ||
                activeMiniGameLocal != null ||
                miniGameLoading ||
                cardShuffleFinishedHold ||
                !(showRevealAnswerAction || showNextQuestionAction)
              }
              onClick={handleNextQuestion}
              // onClick={showNextQuestionAction ? handleNextQuestion : handleRevealAnswer}
            >
              Next Question
              {/* {showRevealAnswerAction ? 'Reveal Answer' : 'Next Question'} */}
            </HostFooterBtn>
            {timerPausedAwaitingResume ? (
              <HostFooterBtn
                emphasis
                icon={
                  <svg viewBox="0 0 24 24" fill="currentColor" className="text-[#00d9ff]">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                }
                onClick={handleToggleTimer}
              >
                Resume Timer
              </HostFooterBtn>
            ) : null}
            {timerCanPause ? (
              <HostFooterBtn
                icon={
                  <svg viewBox="0 0 24 24" fill="currentColor" className="text-[#00d9ff]">
                    <path d="M6 6h12v12H6z" />
                  </svg>
                }
                onClick={handleToggleTimer}
              >
                Stop Timer
              </HostFooterBtn>
            ) : null}
            <HostFooterBtn
              icon={
                <svg viewBox="0 0 24 24" fill="currentColor" className="text-[#00d9ff]">
                  <path d="M4 19h16v2H4v-2zm2-4h12v2H6v-2zm4-4h4v2h-4v-2zm2-10.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5S11 6.83 11 6s.67-1.5 1.5-1.5z" />
                </svg>
              }
              disabled={miniGameLive || state === 'FINAL_RESULTS' || !canToggleBreak}
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
              // Leaderboard only between rounds (round-end / scoreboard), not mid-round.
              disabled={miniGameLive || state === 'FINAL_RESULTS' || !canOpenScoreboard}
              onClick={handleShowScoreboard}
            >
              {isScoreboardVisible ? 'Hide Leaderboard' : 'Show Leaderboard'}
            </HostFooterBtn>
            <HostFooterBtn
              emphasis={
                state === 'SCOREBOARD' ||
                (state === 'QUESTION' && questionState === 'REVEALED' && isLastQuestionOfRound)
              }
              danger={isFinalRoundCompletionState}
              icon={
                <svg viewBox="0 0 24 24" fill="currentColor" className="text-[#00d9ff]">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
              }
              disabled={
                miniGameLive ||
                state === 'GAME_SHOW_END' ||
                (!isCurrentRoundEmpty &&
                  state !== 'SCOREBOARD' &&
                  !(state === 'QUESTION' && questionState === 'REVEALED' && isLastQuestionOfRound))
              }
              onClick={handleAdvanceRound}
            >
              {isCurrentRoundEmpty
                ? 'Skip Empty Round'
                : isFinalRoundCompletionState
                  ? 'Finish Game'
                  : 'Next Round'}
            </HostFooterBtn>
          </div>
          <p className="mt-2 text-center text-[10px] text-white/30">
            Space=Next · T=Start Timer · P=Pause/Resume · S=Leaderboard — Music: T starts
            countdown + media; P pauses/resumes both
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
                          onClick={() => handleRemoveTeam(team)}
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
              {currentRound ? (
                <div className="flex items-center justify-center">
                  <div className="relative h-[640px] w-full max-w-[780px]">
                    <img
                      src="/Venue Round Intro.png"
                      alt="Round intro background"
                      className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_0_26px_rgba(0,0,0,0.6)]"
                    />

                    <div className="pointer-events-none absolute inset-0 text-center">
                      <div className="absolute left-1/2 top-[34%] w-[64%] -translate-x-1/2 -translate-y-1/2">
                        <h2 className="text-[55px] leading-none font-black text-[#fff4c2]  ">
                          ROUND {(gameState?.currentRoundIndex ?? 0) + 1}
                        </h2>
                        {(gameState?.currentRoundIndex ?? 0) !== 0 ? (
                          <p className="mt-2 text-[55px] font-black uppercase leading-none text-[#fff4c2]  ">
                            {normalizeRoundIntroTitle(
                              currentRound?.name,
                              currentRound?.type,
                              gameState?.currentRoundIndex,
                            )}
                          </p>
                        ) : null}
                      </div>

                      <div className="absolute inset-x-[6%] top-[69%] bottom-[6%] flex flex-col items-stretch justify-center overflow-hidden">
                        <RoundIntroScoringLines roundType={currentRound?.type} variant="host" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-xl border border-white/10 bg-[#151b2e] px-5 py-6 sm:px-8"
                  data-node-id="232:2650"
                >
                  <p className="text-center text-[15px] text-white/60">
                    No round data yet. Start the session from the lobby to load the quiz rounds.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showScoreboardModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4 backdrop-blur-[5px]"
          data-name="Host Control Leaderboard"
          data-node-id="232:2837"
          onClick={closeScoreboardModal}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="leaderboard-modal-title"
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
                id="leaderboard-modal-title"
                className="text-xl font-semibold text-white"
                data-node-id="232:2906"
              >
                Leaderboard
              </h2>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6" data-node-id="232:2872">
              {sortedTeams.length === 0 ? (
                <p className="py-10 text-center text-base text-white/40">
                  No teams on the leaderboard yet
                </p>
              ) : (
                <ul className="flex flex-col gap-0 overflow-hidden rounded-lg border border-white/10">
                  {sortedTeams.map((team, idx) => (
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
                    onChange={(e) => setAddTeamName(e.target.value.slice(0, TEAM_NAME_MAX_LENGTH))}
                    placeholder="Mention your team name"
                    data-node-id="232:1866"
                    autoFocus
                    maxLength={TEAM_NAME_MAX_LENGTH}
                    className="h-[57px] w-full rounded-lg border border-white/10 bg-[#050508] px-4 text-base text-white outline-none transition-[border-color,box-shadow] placeholder:text-[#a1a1a1] focus:border-[rgba(0,217,255,0.5)] focus:shadow-[0_0_0_2px_rgba(0,217,255,0.15)]"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTeam()}
                  />
                  <p className="mt-2 text-right text-xs text-white/60">
                    {addTeamName.trim().replace(/\s+/g, ' ').length}/{TEAM_NAME_MAX_LENGTH}
                  </p>
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
      {showEndGameModal && (
        <ModalOverlay onClose={() => setShowEndGameModal(false)} title="End Game?">
          <p className="mb-5 text-sm leading-relaxed text-white/70">
            This will end the game for all players and move the venue and mobile screens back to
            their login screens.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowEndGameModal(false)}
              className="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-white/80 hover:bg-surface-light"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmEndGame}
              className="flex-1 rounded-lg border border-red-500/40 bg-[linear-gradient(180deg,#dc2626_0%,#7f1d1d_100%)] py-2 text-sm font-bold text-white hover:brightness-110"
            >
              End Game
            </button>
          </div>
        </ModalOverlay>
      )}
      {teamPendingRemoval && (
        <ModalOverlay onClose={() => setTeamPendingRemoval(null)} title="Remove Team?">
          <p className="mb-5 text-sm leading-relaxed text-white/70">
            Remove <span className="font-semibold text-white">{teamPendingRemoval.teamName}</span>{' '}
            from the game?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTeamPendingRemoval(null)}
              className="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-white/80 hover:bg-surface-light"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmRemoveTeam}
              className="flex-1 rounded-lg border border-red-500/40 bg-[linear-gradient(180deg,#dc2626_0%,#7f1d1d_100%)] py-2 text-sm font-bold text-white hover:brightness-110"
            >
              Remove
            </button>
          </div>
        </ModalOverlay>
      )}
      {pendingMiniGameExit && (
        <ModalOverlay onClose={() => setPendingMiniGameExit(null)} title="Exit Mini-Game?">
          <p className="mb-5 text-sm leading-relaxed text-white/70">
            Do you want to <span className="font-semibold text-white">resume the trivia game</span>{' '}
            where you left off, or{' '}
            <span className="font-semibold text-white">restart this mini-game</span> from the
            beginning?
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={confirmExitResumeTrivia}
              className="rounded-lg border border-[#00d9ff]/55 bg-[linear-gradient(180deg,#00a9df_0%,#075a89_100%)] py-2 text-sm font-bold uppercase tracking-wide text-white shadow-[0_0_18px_rgba(0,217,255,0.25)] hover:brightness-110"
            >
              Resume Trivia
            </button>
            <button
              type="button"
              onClick={confirmExitRestartMiniGame}
              className="rounded-lg border border-violet-400/55 bg-[linear-gradient(180deg,#7c3aed_0%,#4c1d95_100%)] py-2 text-sm font-bold uppercase tracking-wide text-white shadow-[0_0_18px_rgba(124,58,237,0.25)] hover:brightness-110"
            >
              Restart {pendingMiniGameExit === 'card_shuffle' ? 'Card Shuffle' : 'Kangaroo Race'}
            </button>
            <button
              type="button"
              onClick={() => setPendingMiniGameExit(null)}
              className="rounded-lg border border-border py-2 text-sm font-medium text-white/80 hover:bg-surface-light"
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
