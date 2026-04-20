'use client';

import { useEffect, useRef, useState, useCallback, useMemo, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { connectSocket } from '@/lib/socket';
import { useTimerSound } from '@/hooks/useTimerSound';
import { useAudio } from '@/hooks/useAudio';
import { clientLogger } from '@/lib/clientLogger';
import { cn } from '@/lib/utils';
import { QRCodeSVG } from 'qrcode.react';
import DynamicUnityGame from '@/components/mini-games/DynamicUnityGame';
import { PUBLIC_API_URL } from '@/lib/env';

const API_URL = PUBLIC_API_URL;
const VENUE_PIN_STORAGE_KEY = 'venue_display_pin';
const VENUE_STATE_STORAGE_KEY_PREFIX = 'venue_display_state';

const getVenueStateStorageKey = (pin: string) => `${VENUE_STATE_STORAGE_KEY_PREFIX}:${pin}`;

type VenuePhase =
  | 'welcome'
  | 'lobby'
  | 'round_intro'
  | 'question'
  | 'reveal'
  | 'scoreboard'
  | 'break'
  | 'wager_collection'
  | 'mini_game'
  | 'mini_game_result'
  | 'game_end';

interface Team {
  teamId: number;
  teamName: string;
  score: number;
  isEliminated?: boolean;
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
  responseDetails?: { teamId: number; selectedOptionIndex: number; responseTime?: number | null }[];
  majorityOptionIndexes?: number[];
  voteCounts?: Record<string, number>;
  eliminations: number[];
  allWrong: boolean;
  teams: Team[];
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const VENUE_OPTION_COLOR_CLASSES = [
  'border-0 bg-linear-to-b from-[#0190F5] to-[#015FB4]',
  'border-0 bg-linear-to-b from-[#FF6F00]  to-[#994200]',
  'border-0 bg-linear-to-b from-[#2DA600]  to-[#227E00]',
  'border-0 bg-linear-to-b from-[#F29B00]  to-[#B97700]',
  'border-0 bg-linear-to-b from-[#460073]  to-[#5C0098]',
  'border-0 bg-linear-to-b from-[#990003]  to-[#D20023]',
];

const resolveMediaUrl = (mediaUrl?: string) => {
  if (!mediaUrl) return '';
  const venueSafeUrl = mediaUrl.replace('/api/media/files/', '/api/public/media/files/');
  if (
    venueSafeUrl.startsWith('http://') ||
    venueSafeUrl.startsWith('https://') ||
    venueSafeUrl.startsWith('data:')
  ) {
    return venueSafeUrl;
  }
  if (venueSafeUrl.startsWith('/')) {
    return `${API_URL}${venueSafeUrl}`;
  }
  return `${API_URL}/${venueSafeUrl}`;
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
    return {
      positive: '+wagered percentage of score',
      negative: '-wagered percentage of score',
    };
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
    case 'FINAL_MULTIPLE_CHOICE':
      return 'Final Multiple Choice';
    default:
      return (roundType || 'Round').replace(/_/g, ' ');
  }
};

type MiniGameCommand = {
  id: number;
  game: 'card_shuffle' | 'kangaroo_race';
  command: 'start_game' | 'next_round' | 'reveal_cards' | 'reveal_winner';
  roundNumber?: 1 | 2 | 3 | 4;
  winningKangaroo?: number;
};

type MiniGameReveal = {
  game: 'card_shuffle';
  correctPosition: 1 | 2 | 3;
  roundNumber?: 1 | 2 | 3 | 4;
  cardPositions?: number[];
};

type VenueMiniGameType = 'Kangaroo_race' | 'card_shuffle';

const normalizeVenueMiniGameType = (game: unknown): VenueMiniGameType | null => {
  const g = game == null || game === '' ? '' : String(game).toLowerCase().replace(/-/g, '_');
  if (g === 'kangaroo_race') return 'Kangaroo_race';
  if (g === 'card_shuffle') return 'card_shuffle';
  return null;
};

/** Unity may send `payload` as a JSON string; slots may be 0–2 or 1–3. */
function parseUnityShuffleComplete(value: unknown): { cp: number; cards: number[] } | null {
  const unwrap = (v: unknown, depth = 0): Record<string, unknown> => {
    if (depth > 12) return {};
    if (v == null) return {};
    if (typeof v === 'string') {
      const t = v.trim();
      if (!t) return {};
      try {
        const p = JSON.parse(t);
        if (typeof p === 'string') return unwrap(p, depth + 1);
        return p && typeof p === 'object' ? (p as Record<string, unknown>) : {};
      } catch {
        return {};
      }
    }
    return typeof v === 'object' ? (v as Record<string, unknown>) : {};
  };

  const root = unwrap(value);
  const inner =
    typeof root.payload === 'string' ? unwrap(root.payload) : unwrap(root.payload ?? root);

  const raw =
    inner.correct_position ??
    inner.correctPosition ??
    root.correct_position ??
    root.correctPosition;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  const cp = t >= 1 && t <= 3 ? t : t >= 0 && t <= 2 ? t + 1 : NaN;
  if (!Number.isFinite(cp) || cp < 1 || cp > 3) return null;

  const arr = (inner.card_positions ?? inner.cardPositions ?? root.card_positions) as unknown;
  const cards = Array.isArray(arr)
    ? arr.map((x) => Number(x)).filter((x) => Number.isFinite(x))
    : [];
  return { cp, cards };
}

function parseKangarooRoundResult(value: unknown): { winner_index?: number } | null {
  const unwrap = (v: unknown, depth = 0): Record<string, unknown> => {
    if (depth > 12) return {};
    if (v == null) return {};
    if (typeof v === 'string') {
      const t = v.trim();
      if (!t) return {};
      try {
        const p = JSON.parse(t);
        if (typeof p === 'string') return unwrap(p, depth + 1);
        return p && typeof p === 'object' ? (p as Record<string, unknown>) : {};
      } catch {
        return {};
      }
    }
    return typeof v === 'object' ? (v as Record<string, unknown>) : {};
  };

  const root = unwrap(value);
  const inner =
    typeof root.payload === 'string' ? unwrap(root.payload) : unwrap(root.payload ?? root);
  const raw = inner.winner_index ?? inner.winnerIndex ?? root.winner_index ?? root.winnerIndex;

  const n = Number(raw);
  if (!Number.isFinite(n)) return {};
  const t = Math.trunc(n);
  const winner = t >= 1 && t <= 6 ? t : t >= 0 && t <= 5 ? t + 1 : NaN;
  if (!Number.isFinite(winner)) return {};
  return { winner_index: winner };
}

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

function VenueDisplayContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPin = (searchParams.get('pin') || '').replace(/\D/g, '').slice(0, 6);
  const shouldPlayIntro = searchParams.get('intro') === '1';

  const { socket, isConnected } = useSocket();

  const [sessionPin, setSessionPin] = useState(initialPin);
  const [isPinReady, setIsPinReady] = useState(false);
  const [phase, setPhase] = useState<VenuePhase>('welcome');
  const [qrCodeData, setQrCodeData] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [maxTeams, setMaxTeams] = useState(25);
  const [roundInfo, setRoundInfo] = useState<{
    round: any;
    roundIndex: number;
    totalRounds: number;
  } | null>(null);
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const [timerDuration, setTimerDuration] = useState(30);
  const [totalTeams, setTotalTeams] = useState(0);
  const [liveResponses, setLiveResponses] = useState({
    correct: 0,
    incorrect: 0,
    noAnswer: 0,
    total: 0,
  });
  const [revealData, setRevealData] = useState<RevealData | null>(null);
  const [scoreboard, setScoreboard] = useState<Team[]>([]);
  const [breakDuration, setBreakDuration] = useState(360);
  const [miniGameType, setMiniGameType] = useState<VenueMiniGameType | null>(null);
  const [miniGameCommand, setMiniGameCommand] = useState<MiniGameCommand | null>(null);
  const [miniGameReveal, setMiniGameReveal] = useState<MiniGameReveal | null>(null);
  const [miniGameResult, setMiniGameResult] = useState<{
    game: VenueMiniGameType;
    winningCard?: number;
    winningKangaroo?: number;
    holdScreen?: boolean;
    status?: string;
    message?: string;
  } | null>(null);
  const [showVenueSplash, setShowVenueSplash] = useState(shouldPlayIntro);
  /** Stay on the green welcome / video screen until the operator clicks Continue. */
  const [welcomeHold, setWelcomeHold] = useState(true);
  const [welcomeQrImageFailed, setWelcomeQrImageFailed] = useState(false);
  const [showIntroVideoFallback, setShowIntroVideoFallback] = useState(false);
  const [isVenueMp3Playing, setIsVenueMp3Playing] = useState(false);
  const [showBreakEndedNotice, setShowBreakEndedNotice] = useState(false);
  const questionMediaUrlRef = useRef<string | undefined>(undefined);
  const phaseRef = useRef<VenuePhase>('welcome');
  const showVenueSplashRef = useRef(showVenueSplash);
  const welcomeHoldRef = useRef(welcomeHold);
  const deferredVenuePhaseRef = useRef<VenuePhase | null>(null);
  const previousPhaseBeforeScoreboardRef = useRef<VenuePhase | null>(null);
  const questionRef = useRef<QuestionData | null>(null);
  const revealDataRef = useRef<RevealData | null>(null);
  /** Latest SHUFFLE_COMPLETE from Unity; used to re-emit canonical payload after host Reveal. */
  const lastCardShuffleUnityRef = useRef<{ cp: number; cards: number[] } | null>(null);
  const lastKangarooWinnerRef = useRef<number | null>(null);
  const cardShuffleRevealFlushTimeoutsRef = useRef<number[]>([]);
  const cardShuffleRevealFlushGenRef = useRef(0);

  const playerJoinUrl = useMemo(() => {
    const pin = encodeURIComponent(sessionPin);
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/play/join?pin=${pin}`;
    }
    // return `http://localhost:3000/play/join?pin=${pin}`;
    return `${PUBLIC_API_URL}/play/join?pin=${pin}`;
  }, [sessionPin]);

  const isMusicRound = question?.roundType === 'MUSIC';
  const { playTick, playBuzz } = useTimerSound({ enabled: true, muted: isMusicRound });
  const {
    play: playMp3,
    stop: stopMp3,
    setSource: setMp3Source,
  } = useAudio({ loop: false, volume: 0.8 });
  const prevTimerRef = useRef(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  showVenueSplashRef.current = showVenueSplash;
  welcomeHoldRef.current = welcomeHold;

  useEffect(() => {
    clientLogger.info('venue', 'Venue phase changed', {
      phase,
      sessionPin,
      questionId: question?.question?.id,
      totalTeams,
    });
  }, [phase, question?.question?.id, sessionPin, totalTeams]);

  useEffect(() => {
    questionRef.current = question;
  }, [question]);

  useEffect(() => {
    revealDataRef.current = revealData;
  }, [revealData]);

  useEffect(() => {
    if (/^\d{6}$/.test(initialPin)) {
      setSessionPin(initialPin);
      setIsPinReady(true);
      return;
    }
    if (typeof window === 'undefined') return;
    const savedPin = window.localStorage.getItem(VENUE_PIN_STORAGE_KEY) || '';
    if (/^\d{6}$/.test(savedPin)) {
      setSessionPin(savedPin);
    } else {
      router.replace('/venue');
    }
    setIsPinReady(true);
  }, [initialPin, router]);

  useEffect(() => {
    if (!isPinReady || !/^\d{6}$/.test(sessionPin) || typeof window === 'undefined') return;

    const cached = window.sessionStorage.getItem(getVenueStateStorageKey(sessionPin));
    if (!cached) return;

    try {
      const data = JSON.parse(cached);
      if (data?.qrCodeData) setQrCodeData(data.qrCodeData);
      if (Number.isFinite(Number(data.maxTeams)) && Number(data.maxTeams) > 0) {
        setMaxTeams(Number(data.maxTeams));
      }
      if (Array.isArray(data.teams)) {
        setTeams(data.teams);
        setTotalTeams(data.teams.length);
      }
      if (data.roundInfo) setRoundInfo(data.roundInfo);
      if (data.question) setQuestion(data.question);
      if (Number.isFinite(Number(data.timerDuration))) {
        setTimerDuration(Number(data.timerDuration));
      }
      if (Number.isFinite(Number(data.timerRemaining))) {
        setTimerRemaining(Number(data.timerRemaining));
      }
      if (data.revealData) setRevealData(data.revealData);
      if (Array.isArray(data.scoreboard)) setScoreboard(data.scoreboard);
      if (data.phase && data.phase !== 'welcome') {
        setWelcomeHold(false);
        setShowVenueSplash(false);
        setPhase(data.phase);
      }
    } catch {
      window.sessionStorage.removeItem(getVenueStateStorageKey(sessionPin));
    }
  }, [isPinReady, sessionPin]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (/^\d{6}$/.test(sessionPin)) {
      window.localStorage.setItem(VENUE_PIN_STORAGE_KEY, sessionPin);
    } else {
      window.localStorage.removeItem(VENUE_PIN_STORAGE_KEY);
    }
  }, [sessionPin]);

  useEffect(() => {
    setWelcomeQrImageFailed(false);
  }, [sessionPin, qrCodeData]);

  /** Admin deleted the session — must not depend on `useSocket()` first paint (socket can be null). */
  useEffect(() => {
    if (!isPinReady || !/^\d{6}$/.test(sessionPin)) return;
    const socket = connectSocket();
    const pinNorm = String(sessionPin);
    const onSessionDeleted = (data: { pin?: string }) => {
      if (!data?.pin || String(data.pin) !== pinNorm) return;
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(VENUE_PIN_STORAGE_KEY);
      }
      router.replace('/venue?login=1');
    };
    socket.on('session_deleted', onSessionDeleted);
    return () => {
      socket.off('session_deleted', onSessionDeleted);
    };
  }, [sessionPin, isPinReady, router]);

  /** If the session row is gone (e.g. admin delete) but the socket missed the event, bail out. */
  useEffect(() => {
    if (!isPinReady || !/^\d{6}$/.test(sessionPin)) return;
    const pinNorm = String(sessionPin);
    const check = async () => {
      try {
        const res = await fetch(`${PUBLIC_API_URL}/api/public/sessions/pin/${pinNorm}`, {
          method: 'GET',
          cache: 'no-store',
        });
        if (res.status === 404) {
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem(VENUE_PIN_STORAGE_KEY);
          }
          router.replace('/venue?login=1');
        }
      } catch {
        /* ignore */
      }
    };
    void check();
    const t = window.setInterval(() => void check(), 12000);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [sessionPin, isPinReady, router]);

  useEffect(() => {
    if (timerRemaining > 0 && timerRemaining !== prevTimerRef.current) {
      playTick(timerRemaining <= 5);
    }
    if (prevTimerRef.current > 0 && timerRemaining === 0) {
      playBuzz();
    }
    prevTimerRef.current = timerRemaining;
  }, [timerRemaining, playTick, playBuzz]);

  // Start the 5s logo splash only once the PIN gate has cleared; then the green
  // welcome screen stays until the operator clicks Continue.
  useEffect(() => {
    if (!showVenueSplash || !isPinReady || !/^\d{6}$/.test(sessionPin)) return;
    const timer = setTimeout(() => {
      setShowVenueSplash(false);
      router.replace(`/venue/display?pin=${sessionPin}`);
    }, 5000);
    return () => clearTimeout(timer);
  }, [router, sessionPin, showVenueSplash, isPinReady]);

  const handleWelcomeContinue = useCallback(() => {
    if (!welcomeHoldRef.current) return;
    welcomeHoldRef.current = false;
    setWelcomeHold(false);
    const next = deferredVenuePhaseRef.current;
    deferredVenuePhaseRef.current = null;
    setPhase(next ?? 'lobby');
  }, []);

  useEffect(() => {
    questionMediaUrlRef.current = question?.question?.mediaUrl;
    if (!question?.question?.mediaUrl) return;
    const mediaType = (question.question.mediaType || '').toLowerCase();
    if (mediaType === 'mp3') {
      setMp3Source(resolveMediaUrl(question.question.mediaUrl));
    }
    return () => {
      stopMp3();
      setIsVenueMp3Playing(false);
    };
  }, [question?.question?.mediaUrl, question?.question?.mediaType, setMp3Source, stopMp3]);

  const handleUnityPlayerAction = useCallback(
    (action: string, value: unknown) => {
      if (!socket) return;
      const a = String(action || '').toUpperCase();
      if (a === 'SHUFFLE_COMPLETE') {
        const parsed = parseUnityShuffleComplete(value);
        if (parsed) {
          lastCardShuffleUnityRef.current = parsed;
          clientLogger.info('venue', 'Card shuffle SHUFFLE_COMPLETE parsed from Unity', parsed);
        }
      }
      socket.emit('mini_game_action', { action, value, source: 'unity' });
    },
    [socket],
  );

  const handleUnityGameComplete = useCallback(
    (result: unknown) => {
      if (!socket) return;
      const payload =
        result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
      const resultType = String(payload.type || '').toUpperCase();
      if (resultType === 'SHUFFLE_COMPLETE') {
        const parsed = parseUnityShuffleComplete(payload.payload ?? payload);
        if (parsed) {
          lastCardShuffleUnityRef.current = parsed;
          clientLogger.info('venue', 'Card shuffle SHUFFLE_COMPLETE parsed (game result)', parsed);
        }
      }
      socket.emit('mini_game_action', {
        action: resultType || 'game_complete',
        value: result,
        source: 'unity',
        game: miniGameType || undefined,
      });
      if (resultType && resultType !== 'GAME_COMPLETE') {
        socket.emit('mini_game_action', {
          action: 'game_complete',
          value: result,
          source: 'unity',
          game: miniGameType || undefined,
        });
      }
    },
    [socket, miniGameType],
  );

  const handleUnityReady = useCallback(
    (gameType: 'Kangaroo_race' | 'card_shuffle') => {
      if (!socket || gameType !== 'card_shuffle') return;
      socket.emit('mini_game_ready', { game: 'card_shuffle', ready: true, source: 'venue' });
    },
    [socket],
  );

  /**
   * Unity's Card Shuffle game sends results via window.postMessage (WebBridge)
   * rather than the JSLib SendGameResult function. This effect listens to those
   * messages and forwards them to the server so correctPosition is stored before
   * the host taps "reveal".
   */
  useEffect(() => {
    if (!socket || !miniGameType || miniGameType !== 'card_shuffle') return;

    const onWebBridgeMessage = (event: MessageEvent) => {
      let data: Record<string, unknown> | null = null;
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (!data || typeof data !== 'object') return;

      const msgType = String(data.type || '').toUpperCase();
      if (
        msgType !== 'SHUFFLE_COMPLETE' &&
        msgType !== 'ROUND_COMPLETE' &&
        msgType !== 'MINIGAME_REVEAL'
      )
        return;

      console.log('[venue/WebBridge→server] forwarding', msgType, data);
      socket.emit('mini_game_action', {
        action: msgType,
        value: data,
        source: 'unity',
        game: 'card_shuffle',
      });
      // Also emit the generic game_complete path so existing server logic fires.
      if (msgType !== 'ROUND_COMPLETE') {
        socket.emit('mini_game_action', {
          action: 'game_complete',
          value: data,
          source: 'unity',
          game: 'card_shuffle',
        });
      }
    };

    window.addEventListener('message', onWebBridgeMessage);
    return () => window.removeEventListener('message', onWebBridgeMessage);
  }, [socket, miniGameType]);

  /**
   * Kangaroo race also sends finish events through window.postMessage (WebBridge).
   * Forward those events to the server so mobile players receive winner/loser.
   */
  useEffect(() => {
    if (!socket || !miniGameType || miniGameType !== 'Kangaroo_race') return;

    const forwardKangarooResult = (msgType: string, rawData: Record<string, unknown>) => {
      const parsed = parseKangarooRoundResult(rawData);
      const winner = Number(parsed?.winner_index);
      if (Number.isFinite(winner) && winner >= 1 && winner <= 6) {
        lastKangarooWinnerRef.current = winner;
      }

      const valuePayload = Number.isFinite(Number(lastKangarooWinnerRef.current))
        ? {
            ...rawData,
            winner_index: Number(lastKangarooWinnerRef.current),
          }
        : rawData;

      console.log('[venue/Kangaroo WebBridge→server] forwarding', msgType, valuePayload);
      socket.emit('mini_game_action', {
        action: msgType,
        value: valuePayload,
        source: 'unity',
        game: 'kangaroo_race',
      });

      // Keep compatibility with the generic completion path used elsewhere.
      if (msgType !== 'GAME_COMPLETE') {
        socket.emit('mini_game_action', {
          action: 'game_complete',
          value: valuePayload,
          source: 'unity',
          game: 'kangaroo_race',
        });
      }
    };

    const onKangarooWebBridgeMessage = (event: MessageEvent) => {
      let data: Record<string, unknown> | null = null;
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (!data || typeof data !== 'object') return;

      const msgType = String(data.type || '').toUpperCase();
      if (
        msgType !== 'ROUND_RESULT' &&
        msgType !== 'ROUND_COMPLETE' &&
        msgType !== 'GAME_COMPLETE' &&
        msgType !== 'MINIGAME_REVEAL'
      ) {
        return;
      }

      forwardKangarooResult(msgType, data);
    };

    const parseFromConsoleArgs = (
      args: unknown[],
    ): { type: string; payload: Record<string, unknown> } | null => {
      if (!Array.isArray(args) || args.length === 0) return null;
      const joined = args
        .map((v) => {
          if (typeof v === 'string') return v;
          try {
            return JSON.stringify(v);
          } catch {
            return String(v);
          }
        })
        .join(' ');

      if (!joined.includes('[WebBridge] Received:')) return null;
      const start = joined.indexOf('{');
      const end = joined.lastIndexOf('}');
      if (start < 0 || end <= start) return null;

      try {
        const parsed = JSON.parse(joined.slice(start, end + 1));
        const msgType = String(parsed?.type || '').toUpperCase();
        if (!msgType) return null;
        if (
          msgType !== 'ROUND_RESULT' &&
          msgType !== 'ROUND_COMPLETE' &&
          msgType !== 'GAME_COMPLETE' &&
          msgType !== 'MINIGAME_REVEAL'
        ) {
          return null;
        }
        return {
          type: msgType,
          payload: parsed,
        };
      } catch {
        return null;
      }
    };

    const originalLog = console.log;
    const originalWarn = console.warn;

    console.log = (...args: unknown[]) => {
      const parsed = parseFromConsoleArgs(args);
      if (parsed) {
        forwardKangarooResult(parsed.type, parsed.payload);
      }
      originalLog(...args);
    };

    console.warn = (...args: unknown[]) => {
      const parsed = parseFromConsoleArgs(args);
      if (parsed) {
        forwardKangarooResult(parsed.type, parsed.payload);
      }
      originalWarn(...args);
    };

    window.addEventListener('message', onKangarooWebBridgeMessage);
    return () => {
      window.removeEventListener('message', onKangarooWebBridgeMessage);
      console.log = originalLog;
      console.warn = originalWarn;
    };
  }, [socket, miniGameType]);

  useEffect(() => {
    if (!socket || !sessionPin || !isPinReady) return;

    let didReceiveSessionState = false;
    const invalidPinTimeout = setTimeout(() => {
      if (didReceiveSessionState) return;
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(VENUE_PIN_STORAGE_KEY);
      }
      router.replace('/venue?error=invalid-pin');
    }, 5000);

    const joinVenue = () => {
      socket.emit('venue_connect', { pin: sessionPin });
    };
    joinVenue();
    socket.on('connect', joinVenue);

    const applyVenuePhaseFromSession = (next: VenuePhase) => {
      if (next === 'welcome') {
        setPhase('welcome');
        return;
      }
      if (showVenueSplashRef.current || welcomeHoldRef.current) {
        deferredVenuePhaseRef.current = next;
        return;
      }
      setPhase(next);
    };

    const normalizeVenueMiniGameId = (game: unknown) =>
      game == null || game === '' ? '' : String(game).toLowerCase().replace(/-/g, '_');

    const normalizeRevealSlotOneToThree = (raw: unknown): 1 | 2 | 3 | null => {
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      const t = Math.trunc(n);
      if (t >= 1 && t <= 3) return t as 1 | 2 | 3;
      if (t >= 0 && t <= 2) return (t + 1) as 1 | 2 | 3;
      return null;
    };

    const onSessionState = (data: any) => {
      didReceiveSessionState = true;
      if (data.qrCodeData) setQrCodeData(data.qrCodeData);
      if (Number.isFinite(Number(data.maxTeams)) && Number(data.maxTeams) > 0) {
        setMaxTeams(Number(data.maxTeams));
      }
      if (data.teams) {
        const teamList =
          typeof data.teams === 'object' && !Array.isArray(data.teams)
            ? (Object.values(data.teams) as Team[])
            : (data.teams as Team[]);
        setTeams(teamList);
        setTotalTeams(teamList.length);
      }
      const stateToPhase: Record<string, VenuePhase> = {
        LOBBY: 'lobby',
        ROUND_INTRO: 'round_intro',
        WAGER_COLLECTION: 'wager_collection',
        QUESTION: 'question',
        SCOREBOARD: 'scoreboard',
        BREAK: 'break',
        MINI_GAME: 'mini_game',
        FINAL_RESULTS: 'game_end',
      };
      if (data.rounds && data.currentRoundIndex !== undefined) {
        const round = data.rounds[data.currentRoundIndex];
        if (round)
          setRoundInfo({
            round,
            roundIndex: data.currentRoundIndex,
            totalRounds: data.rounds.length,
          });
      }
      if (data.currentQuestion) {
        setQuestion(data.currentQuestion);
        setTimerDuration(data.currentQuestion.timerDuration || data.timerDuration || 30);
        setTimerRemaining(data.timerRemaining ?? data.currentQuestion.timerDuration ?? 0);
        const total = Number(data.totalTeams ?? 0);
        setLiveResponses({ correct: 0, incorrect: 0, noAnswer: 0, total });
      } else if (data.state !== 'QUESTION') {
        setQuestion(null);
      }

      // Determine the correct phase from the server state
      const normalizedActiveMiniGame = normalizeVenueMiniGameType(data.activeMiniGame);
      if (normalizedActiveMiniGame) {
        setMiniGameType(normalizedActiveMiniGame);
        if (normalizedActiveMiniGame !== 'card_shuffle') setMiniGameCommand(null);
        if (data.miniGameState?.game === 'card_shuffle' && data.miniGameState?.revealed) {
          setMiniGameReveal({
            game: 'card_shuffle',
            correctPosition: Number(data.miniGameState.correctPosition) as 1 | 2 | 3,
            roundNumber: data.miniGameState.activeRound || undefined,
            cardPositions: Array.isArray(data.miniGameState.cardPositions)
              ? data.miniGameState.cardPositions
              : [],
          });
        } else {
          setMiniGameReveal(null);
        }
        applyVenuePhaseFromSession('mini_game');
      } else if (data.state === 'QUESTION') {
        if (data.currentQuestion) {
          applyVenuePhaseFromSession('question');
        } else if (phaseRef.current === 'reveal' || phaseRef.current === 'question') {
          applyVenuePhaseFromSession(phaseRef.current);
        } else if (data.questionState === 'REVEALED') {
          // Server says answer was already revealed — stay on question phase
          // (reveal phase requires revealData from a separate answer_reveal event)
          applyVenuePhaseFromSession('question');
        } else {
          applyVenuePhaseFromSession('question');
        }
      } else if (data.state && stateToPhase[data.state]) {
        applyVenuePhaseFromSession(stateToPhase[data.state]);
      }

      if (typeof window !== 'undefined') {
        const sessionTeams = data.teams
          ? Array.isArray(data.teams)
            ? data.teams
            : Object.values(data.teams)
          : teams;
        window.sessionStorage.setItem(
          getVenueStateStorageKey(sessionPin),
          JSON.stringify({
            phase:
              data.state && stateToPhase[data.state] ? stateToPhase[data.state] : phaseRef.current,
            qrCodeData: data.qrCodeData || qrCodeData,
            teams: sessionTeams,
            maxTeams: Number.isFinite(Number(data.maxTeams)) ? Number(data.maxTeams) : maxTeams,
            totalTeams: Number.isFinite(Number(data.totalTeams))
              ? Number(data.totalTeams)
              : sessionTeams.length,
          }),
        );
      }
    };

    const onTeamJoined = (team: Team) => {
      setTeams((prev) => [...prev.filter((t) => t.teamId !== team.teamId), team]);
      setTotalTeams((prev) => prev + 1);
    };

    const onTeamRemoved = ({ teamId }: { teamId: number }) => {
      setTeams((prev) => prev.filter((t) => t.teamId !== teamId));
      setTotalTeams((prev) => Math.max(0, prev - 1));
      setLiveResponses((prev) => ({
        ...prev,
        total: Math.max(0, (prev.total || 0) - 1),
      }));
    };

    const onRoundIntro = (data: any) => {
      setRoundInfo(data);
      setPhase('round_intro');
      setIsVenueMp3Playing(false);
      stopMp3();
    };

    const onWagerCollectionStart = (data: any) => {
      if (data) setRoundInfo(data);
      setPhase('wager_collection');
    };

    const onQuestionActive = (data: QuestionData) => {
      setQuestion(data);
      setTimerDuration(data.timerDuration);
      setTimerRemaining(data.timerRemaining ?? data.timerDuration);
      setLiveResponses({
        correct: 0,
        incorrect: 0,
        noAnswer: 0,
        total: Math.max(totalTeams, 0),
      });
      setRevealData(null);
      setIsVenueMp3Playing(false);
      stopMp3();
      setPhase('question');
    };

    const onTimerUpdate = (data: { remaining: number }) => setTimerRemaining(data.remaining);
    const onTimerExpired = () => setTimerRemaining(0);

    const onResponseCount = (data: { count: number; total: number }) => {
      setTotalTeams(data.total);
    };

    const onLiveResponseUpdate = (data: {
      correct: number;
      incorrect: number;
      noAnswer: number;
      total: number;
    }) => {
      setLiveResponses({
        correct: Number(data?.correct || 0),
        incorrect: Number(data?.incorrect || 0),
        noAnswer: Number(data?.noAnswer || 0),
        total: Number(data?.total || 0),
      });
    };

    const onAnswerReveal = (data: RevealData) => {
      setRevealData(data);
      setScoreboard(data.teams.sort((a, b) => b.score - a.score));
      setPhase('reveal');
    };

    const onScoreboard = (data: { teams: Team[]; revealSnapshot?: RevealData | null }) => {
      if (phaseRef.current !== 'scoreboard') {
        previousPhaseBeforeScoreboardRef.current = phaseRef.current;
      }
      setScoreboard(data.teams.sort((a, b) => b.score - a.score));
      if (data.revealSnapshot) {
        setRevealData(data.revealSnapshot);
      }
      setPhase('scoreboard');
      setIsVenueMp3Playing(false);
      stopMp3();
    };

    const onScoreboardHidden = () => {
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
      setPhase('lobby');
    };

    const onRoundEnd = () => {
      setIsVenueMp3Playing(false);
      stopMp3();
    };

    const onBreakStart = (data: { duration: number }) => {
      setBreakDuration(data.duration);
      setPhase('break');
    };

    const onBreakEnd = () => {
      // Phase is restored by server via session_state.
      setShowBreakEndedNotice(true);
      setTimeout(() => setShowBreakEndedNotice(false), 2400);
    };

    const clearCardShuffleRevealFlushTimers = () => {
      for (const id of cardShuffleRevealFlushTimeoutsRef.current) {
        window.clearTimeout(id);
      }
      cardShuffleRevealFlushTimeoutsRef.current = [];
    };

    const emitCanonicalShuffleToServer = (
      expectedGen: number,
      emittedFlag: { current: boolean },
    ) => {
      if (cardShuffleRevealFlushGenRef.current !== expectedGen) return;
      if (emittedFlag.current) return;
      const b = lastCardShuffleUnityRef.current;
      if (!b || !socket?.connected) return;
      emittedFlag.current = true;
      socket.emit('mini_game_action', {
        source: 'unity',
        action: 'SHUFFLE_COMPLETE',
        value: {
          type: 'SHUFFLE_COMPLETE',
          payload: {
            correct_position: b.cp,
            card_positions: b.cards,
          },
        },
      });
      clientLogger.info('venue', 'Card shuffle canonical SHUFFLE_COMPLETE re-emitted for players', {
        correctPosition: b.cp,
        cardPositions: b.cards,
      });
    };

    const onMiniGameStart = (data: { game: string }) => {
      const normalizedGame = normalizeVenueMiniGameType(data.game);
      if (!normalizedGame) return;
      cardShuffleRevealFlushGenRef.current += 1;
      lastCardShuffleUnityRef.current = null;
      clearCardShuffleRevealFlushTimers();
      setMiniGameType(normalizedGame);
      setMiniGameCommand(null);
      setMiniGameReveal(null);
      setMiniGameResult(null);
      setPhase('mini_game');
    };

    const onMiniGameCommand = (data: {
      game?: string;
      command?: 'start_game' | 'next_round' | 'reveal_cards' | 'reveal_winner';
      roundNumber?: 1 | 2 | 3 | 4;
      winningKangaroo?: number;
    }) => {
      const gid = normalizeVenueMiniGameId(data?.game);
      if (!gid || !data.command) return;

      if (gid === 'kangaroo_race') {
        setMiniGameCommand({
          id: Date.now(),
          game: 'kangaroo_race',
          command: data.command,
          ...(Number.isFinite(Number(data.winningKangaroo))
            ? { winningKangaroo: Number(data.winningKangaroo) }
            : {}),
        });
        return;
      }

      if (gid !== 'card_shuffle') return;
      if (data.command === 'next_round' || data.command === 'start_game') {
        lastCardShuffleUnityRef.current = null;
        clearCardShuffleRevealFlushTimers();
        setMiniGameReveal(null);
      }
      if (data.command === 'reveal_cards') {
        lastCardShuffleUnityRef.current = null;
        clearCardShuffleRevealFlushTimers();
        const gen = ++cardShuffleRevealFlushGenRef.current;
        const emittedOnce = { current: false };
        /** Unity finishes after MINIGAME_REVEAL; canonical payload guarantees server → `mini_game_reveal` on mobile. */
        for (const ms of [200, 650, 1400, 2800]) {
          const tid = window.setTimeout(() => {
            emitCanonicalShuffleToServer(gen, emittedOnce);
          }, ms);
          cardShuffleRevealFlushTimeoutsRef.current.push(tid);
        }
      }
      setMiniGameCommand({
        id: Date.now(),
        game: 'card_shuffle',
        command: data.command,
        roundNumber: data.roundNumber,
      });
    };

    const onMiniGameReveal = (data: {
      game?: string;
      correctPosition?: number;
      correct_position?: number;
      roundNumber?: 1 | 2 | 3 | 4;
      cardPositions?: number[];
    }) => {
      const gid = normalizeVenueMiniGameId(data?.game);
      if (gid && gid !== 'card_shuffle') return;
      const raw = data.correctPosition ?? data.correct_position;
      const cp = normalizeRevealSlotOneToThree(raw);
      if (cp == null) return;
      setMiniGameReveal({
        game: 'card_shuffle',
        correctPosition: cp,
        roundNumber: data.roundNumber,
        cardPositions: Array.isArray(data.cardPositions) ? data.cardPositions : [],
      });
      setPhase('mini_game');
    };

    const onMusicControl = (data: { action: 'play' | 'pause' | 'stop'; mediaUrl?: string }) => {
      const action = data?.action;
      if (!action) return;

      if (action === 'play') {
        const mediaUrl = data?.mediaUrl || questionMediaUrlRef.current;
        if (mediaUrl) {
          setMp3Source(resolveMediaUrl(mediaUrl));
        }
        playMp3();
        setIsVenueMp3Playing(true);
        return;
      }

      stopMp3();
      setIsVenueMp3Playing(false);
    };

    const onMiniGameEnd = (data: {
      game: string;
      winningCard?: number;
      winningKangaroo?: number;
      holdScreen?: boolean;
      status?: string;
      message?: string;
    }) => {
      const normalizedGame = normalizeVenueMiniGameType(data.game);
      if (normalizedGame) {
        setMiniGameReveal(null);
        if (normalizedGame === 'card_shuffle') {
          setMiniGameCommand(null);
          if (data.holdScreen) {
            setMiniGameResult({
              game: 'card_shuffle',
              holdScreen: true,
              status: data.status,
              message: data.message,
            });
            setPhase('mini_game_result');
          }
        } else {
          setMiniGameResult({ ...data, game: normalizedGame });
          setPhase('mini_game_result');
        }
      }
    };

    const onGameEnd = (data?: { teams?: Team[] }) => {
      stopMp3();
      setIsVenueMp3Playing(false);
      if (data?.teams) {
        setScoreboard(data.teams.sort((a, b) => b.score - a.score));
      }
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(VENUE_PIN_STORAGE_KEY);
      }
      router.replace('/venue');
    };

    socket.on('session_state', onSessionState);
    socket.on('team_joined', onTeamJoined);
    socket.on('team_removed', onTeamRemoved);
    socket.on('round_intro', onRoundIntro);
    socket.on('wager_collection_start', onWagerCollectionStart);
    socket.on('question_active', onQuestionActive);
    socket.on('timer_update', onTimerUpdate);
    socket.on('timer_expired', onTimerExpired);
    socket.on('response_count', onResponseCount);
    socket.on('live_response_update', onLiveResponseUpdate);
    socket.on('answer_reveal', onAnswerReveal);
    socket.on('scoreboard', onScoreboard);
    socket.on('scoreboard_hidden', onScoreboardHidden);
    socket.on('round_end', onRoundEnd);
    socket.on('break_start', onBreakStart);
    socket.on('break_end', onBreakEnd);
    socket.on('mini_game_start', onMiniGameStart);
    socket.on('mini_game_command', onMiniGameCommand);
    socket.on('mini_game_reveal', onMiniGameReveal);
    socket.on('music_control', onMusicControl);
    socket.on('mini_game_end', onMiniGameEnd);
    socket.on('game_end', onGameEnd);

    return () => {
      clearCardShuffleRevealFlushTimers();
      clearTimeout(invalidPinTimeout);
      socket.off('connect', joinVenue);
      socket.off('session_state', onSessionState);
      socket.off('team_joined', onTeamJoined);
      socket.off('team_removed', onTeamRemoved);
      socket.off('round_intro', onRoundIntro);
      socket.off('wager_collection_start', onWagerCollectionStart);
      socket.off('question_active', onQuestionActive);
      socket.off('music_control', onMusicControl);
      socket.off('timer_update', onTimerUpdate);
      socket.off('timer_expired', onTimerExpired);
      socket.off('response_count', onResponseCount);
      socket.off('live_response_update', onLiveResponseUpdate);
      socket.off('answer_reveal', onAnswerReveal);
      socket.off('scoreboard', onScoreboard);
      socket.off('scoreboard_hidden', onScoreboardHidden);
      socket.off('round_end', onRoundEnd);
      socket.off('break_start', onBreakStart);
      socket.off('break_end', onBreakEnd);
      socket.off('mini_game_start', onMiniGameStart);
      socket.off('mini_game_command', onMiniGameCommand);
      socket.off('mini_game_reveal', onMiniGameReveal);
      socket.off('mini_game_end', onMiniGameEnd);
      socket.off('game_end', onGameEnd);
    };
  }, [socket, sessionPin, isPinReady, router, playMp3, setMp3Source, stopMp3]);

  const QROverlay = () => {
    if (
      showVenueSplash ||
      !qrCodeData ||
      phase === 'game_end' ||
      phase === 'lobby' ||
      phase === 'welcome'
    ) {
      return null;
    }
    return (
      <div className="absolute bottom-4 right-4 z-50 flex flex-col items-center gap-1">
        <div className="neon-border rounded-lg p-1 bg-surface/80 bg-white">
          {/* <QRCodeSVG value={playerJoinUrl} size={96} className="rounded" /> */}
        </div>
        {/* <span className="font-mono text-xs text-neon-cyan/60">{sessionPin}</span> */}
      </div>
    );
  };

  const ConnectionDot = () => (
    <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${isConnected ? 'bg-neon-green shadow-[0_0_8px_rgba(0,255,106,0.6)]' : 'bg-neon-red shadow-[0_0_8px_rgba(255,23,68,0.6)]'}`}
      />
    </div>
  );

  /** Roster from session_state + team_removed / team_joined — authoritative for “teams in session”. */
  const rosterTeamCount = Math.max(teams.length, totalTeams);
  /**
   * liveResponses.total can stay stale (e.g. disconnect during REVEAL — server may not re-emit
   * live_response_update). Never show a headcount above roster or below it when roster is 0.
   */
  const liveTotalTeams = Math.max(
    0,
    Math.min(
      typeof liveResponses.total === 'number' && liveResponses.total > 0
        ? liveResponses.total
        : Number.POSITIVE_INFINITY,
      rosterTeamCount,
    ),
  );
  const liveQuestionPoints = (() => {
    const roundType = (question?.roundType || '').toUpperCase();
    if (roundType === 'WAGER') return '0-50';
    if (roundType === 'FINAL_WAGER') return '0-100%';
    if (roundType === 'MAJORITY_RULES') return '50';
    if (roundType === 'ELIMINATION') return String(question?.pointsForQuestion ?? 10);
    return String(question?.pointsForQuestion ?? 10);
  })();

  if (!isPinReady || !sessionPin) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-neon-cyan border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(0,229,255,0.5)]" />
      </div>
    );
  }

  return (
    <div className="w-full h-full relative overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/venue-stage-bg.png')" }}
      />
      <div className="absolute inset-0 bg-[#030818]/70" />
      <div className="relative z-10 w-full h-full">
        <ConnectionDot />
        <QROverlay />
        {/* Logo splash must sit above all phases: session_state switches to lobby immediately
            and would otherwise unmount the welcome-only splash before 5s elapses. */}
        {showVenueSplash ? (
          <div
            className="absolute inset-0 z-[200] flex items-center justify-center overflow-hidden bg-[#050218] animate-fadeIn pointer-events-auto"
            aria-hidden
          >
            <img
              src="/venue-stage-bg.png"
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/10" />
            <img
              src="/platform.png"
              alt=""
              className="absolute left-1/2 -translate-x-1/2 bottom-[4%] w-[84%] max-w-[1150px] object-contain pointer-events-none"
            />
            <img
              src="/logo.png"
              alt="Max Showdown"
              className="absolute left-1/2 -translate-x-1/2 top-[16%] w-[58%] max-w-[760px] object-contain drop-shadow-[0_0_24px_rgba(0,229,255,0.35)] pointer-events-none"
            />
          </div>
        ) : null}
        {showBreakEndedNotice ? (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 rounded-2xl border border-[#2bdcff]/60 bg-[rgba(8,20,56,0.92)] px-8 py-4 shadow-[0_0_22px_rgba(43,220,255,0.35)]">
            <p className="text-3xl font-extrabold text-[#2be9ff] tracking-wide">Break Ended</p>
          </div>
        ) : null}

        {/* ── WELCOME ── */}
        {phase === 'welcome' && (
          <div className="w-full h-full relative overflow-hidden animate-fadeIn">
            <div
              className="w-full h-full relative bg-cover bg-center"
              style={{ backgroundImage: "url('/venue-stage-bg.png')" }}
            >
              <div className="absolute inset-0 bg-black/10" />

              <div className="absolute inset-0 flex flex-col items-center justify-center px-4 sm:px-6 md:px-8 pb-4 sm:pb-6 md:pb-8 gap-3 sm:gap-4 md:gap-6">
                <div className="w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-2xl aspect-video rounded-lg sm:rounded-xl border-2 sm:border-3 md:border-4 border-[#00d9ff] shadow-[0_0_30px_rgba(0,217,255,0.35)] overflow-hidden bg-[#39ff14] shrink-0">
                  {!showIntroVideoFallback ? (
                    <video
                      src="/venue-intro.mp4"
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="w-full h-full object-cover"
                      onError={() => setShowIntroVideoFallback(true)}
                    />
                  ) : null}
                </div>
              </div>
            </div>

            <div className="absolute left-1/2 -translate-x-1/2 bottom-3 sm:bottom-4 md:bottom-6 w-full max-w-sm sm:max-w-md md:max-w-2xl px-3 sm:px-4 md:px-6">
              <div className="neon-border-strong rounded-lg sm:rounded-xl md:rounded-2xl px-4 sm:px-6 py-3 sm:py-4 md:py-5 bg-surface/85 flex  items-center gap-3 sm:gap-4 md:gap-6">
                <div className="shrink-0 rounded-lg md:rounded-xl border border-neon-cyan/40 p-1.5 sm:p-2 shadow-[0_0_20px_rgba(0,229,255,0.15)]">
                  {qrCodeData &&
                  !welcomeQrImageFailed &&
                  (qrCodeData.startsWith('data:') || /^https?:\/\//i.test(qrCodeData)) ? (
                    // Server QR is white-on-transparent; must sit on a dark surface (not white).
                    <div className="flex h-20 sm:h-24 md:h-28 w-20 sm:w-24 md:w-28 items-center justify-center rounded-lg bg-[#060818]">
                      <img
                        src={qrCodeData}
                        alt="QR code to join this session"
                        className="max-h-[95%] max-w-[95%] object-contain"
                        onError={() => setWelcomeQrImageFailed(true)}
                      />
                    </div>
                  ) : (
                    <div className="flex h-20 sm:h-24 md:h-28 w-20 sm:w-24 md:w-28 items-center justify-center rounded-lg bg-white">
                      <QRCodeSVG value={playerJoinUrl} size={80} className="rounded" />
                    </div>
                  )}
                </div>
                <div className="text-center min-w-0">
                  <p className="text-neon-cyan font-bold text-xs sm:text-sm md:text-base lg:text-lg tracking-wide">
                    SCAN TO JOIN
                  </p>
                  <p className="text-foreground/50 text-[10px] sm:text-xs md:text-sm mt-0.5">
                    Session PIN
                  </p>
                  <p className="text-xl sm:text-3xl md:text-4xl lg:text-5xl font-mono font-black tracking-widest sm:tracking-[0.15em] md:tracking-[0.2em] text-neon-cyan text-glow-cyan mt-1 sm:mt-2">
                    {sessionPin}
                  </p>
                </div>
                {welcomeHold && !showVenueSplash ? (
                  <button
                    type="button"
                    onClick={handleWelcomeContinue}
                    className="rounded-lg sm:rounded-xl border-2 border-neon-cyan bg-neon-cyan/20 px-8 sm:px-12 md:px-14 py-3 sm:py-4 md:py-5 text-[10px] sm:text-xs md:text-sm font-black tracking-[0.15em] md:tracking-[0.2em] text-neon-cyan uppercase shadow-[0_0_28px_rgba(0,229,255,0.45)] transition hover:bg-neon-cyan/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-[#030818]"
                  >
                    Continue
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* ── LOBBY ── */}
        {phase === 'lobby' && (
          <div className="w-full h-full min-h-0 flex flex-col px-4 sm:px-5 md:px-6 lg:px-8 py-3 sm:py-4 md:py-5 animate-fadeIn">
            <div className="text-center mb-2 sm:mb-3 md:mb-4 shrink-0">
              <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-wide text-white text-glow-cyan">
                TEAM REGISTRATION
              </h2>
              <p className="text-sm sm:text-base md:text-lg lg:text-2xl text-neon-cyan font-semibold mt-1">
                {teams.length} of {maxTeams} Teams Joined
              </p>
            </div>

            {sessionPin ? (
              <div className="mx-auto mb-3 sm:mb-4 md:mb-5 shrink-0 rounded-xl border border-neon-cyan/45 bg-[#051230]/85 px-3 sm:px-4 py-2 sm:py-3 shadow-[0_0_20px_rgba(0,229,255,0.18)] flex items-center gap-2 sm:gap-3 max-w-full">
                <div className="w-16 h-16 sm:w-20 h-20 md:w-24 h-24 rounded bg-white p-1 flex items-center justify-center shrink-0">
                  <QRCodeSVG value={playerJoinUrl} size={60} />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-neon-cyan font-bold text-xs sm:text-sm">SCAN TO JOIN</p>
                  <p className="text-white/70 text-[10px] sm:text-xs mt-0.5">
                    Session PIN: {sessionPin}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 pb-2 [scrollbar-gutter:stable]">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-2.5 md:gap-3 content-start mt-3 sm:mt-4 md:mt-5">
                {Array.from({ length: maxTeams }).map((_, i) => {
                  const team = teams[i];
                  return (
                    <div key={i} className="relative">
                      <div className="absolute -top-1.5 sm:-top-2 right-0.5 z-10 w-4 h-4 sm:w-5 h-5 rounded-full bg-[#0c4ac4] border border-neon-cyan/40 text-[8px] sm:text-[10px] font-black text-white flex items-center justify-center shadow-[0_0_8px_rgba(0,229,255,0.25)]">
                        {i + 1}
                      </div>
                      <div
                        className={cn(
                          'h-12 sm:h-14 md:h-16 rounded-lg sm:rounded-xl border px-2 sm:px-3 flex items-center gap-1.5 sm:gap-2 transition-all duration-500 backdrop-blur-sm text-xs sm:text-sm md:text-base',
                          team
                            ? 'bg-gradient-to-r from-[#0f4bc2]/85 via-[#0a2a92]/80 to-[#9f0ed2]/80 border-neon-cyan/65 shadow-[0_0_14px_rgba(0,229,255,0.25)]'
                            : 'bg-[#130f2e]/55 border-white/25 border-dashed',
                        )}
                      >
                        {team ? (
                          <>
                            <div className="w-4 h-4 sm:w-5 h-5 rounded-full bg-[#00be57] flex items-center justify-center text-white text-[9px] sm:text-[11px] font-black flex-shrink-0">
                              {'\u2713'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-white truncate">{team.teamName}</p>
                              <p className="text-[9px] sm:text-[10px] text-[#66ffb2] font-semibold -mt-0.5">
                                Ready
                              </p>
                            </div>
                          </>
                        ) : (
                          <p className="w-full text-center text-white/70">Waiting...</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Round Intro */}
        {phase === 'round_intro' && roundInfo && (
          <div className="w-full h-full flex items-center justify-center animate-fadeIn px-6">
            <div className="relative w-full max-w-[1240px] h-[720px]">
              <img
                src="/Venue Round Intro.png"
                alt="Round intro background"
                className="absolute inset-0 w-full h-full object-contain drop-shadow-[0_0_26px_rgba(0,0,0,0.6)]"
              />

              <div className="absolute inset-0 pointer-events-none text-center">
                <div className="absolute left-1/2 top-[44%] w-[62%] -translate-x-1/2 -translate-y-1/2">
                  <h1 className="text-[60px]  leading-none font-black text-[#fff4c2] drop-shadow-[0_0_18px_rgba(255,225,120,0.65)]">
                    ROUND {(roundInfo.roundIndex || 0) + 1}
                  </h1>
                  <p className="mt-2 text-[30px] leading-[1.05] font-extrabold text-[#25eaff] drop-shadow-[0_0_16px_rgba(37,234,255,0.55)]">
                    {normalizeRoundIntroTitle(
                      roundInfo.round?.name,
                      roundInfo.round?.type,
                      roundInfo.roundIndex,
                    )}
                  </p>
                </div>

                <div className="absolute left-1/2 top-[83%] w-[74%] -translate-x-1/2 -translate-y-1/2">
                  <p className="text-[28px] font-black text-[#39ff14] leading-none mb-5 drop-shadow-[0_0_8px_rgba(57,255,20,0.45)]">
                    {getRoundScoringLines(roundInfo.round?.type).positive}
                  </p>
                  <p className="text-[28px] font-black text-[#ff3e3e] leading-none drop-shadow-[0_0_8px_rgba(255,62,62,0.45)]">
                    {getRoundScoringLines(roundInfo.round?.type).negative}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Wager Collection */}
        {phase === 'wager_collection' && (
          <div className="w-full h-full flex items-center justify-center animate-fadeIn px-6">
            <div className="flex flex-col items-center justify-center gap-8 text-center max-w-[900px]">
              <div className="inline-flex items-center gap-3 rounded-full border border-[#ffc400]/55 bg-[linear-gradient(180deg,rgba(60,30,100,0.95)_0%,rgba(20,10,50,0.95)_100%)] px-10 py-4 shadow-[0_0_28px_rgba(255,196,0,0.25)]">
                <span className="text-lg font-semibold uppercase tracking-[0.22em] text-[#ffc400]">
                  Round {(roundInfo?.roundIndex || 0) + 1} — Wager Round
                </span>
              </div>
              <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full border-2 border-[#ffc400]/50 bg-[rgba(255,196,0,0.08)] shadow-[0_0_36px_rgba(255,196,0,0.3)]">
                <svg
                  className="h-14 w-14 text-[#ffc400] animate-pulse"
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
              <h1 className="text-[52px] font-black leading-none text-white drop-shadow-[0_0_18px_rgba(255,196,0,0.4)]">
                Players Are Locking
                <br />
                Wager Points
              </h1>
              <p className="text-2xl font-medium text-[#ffc400]/75">
                Please place your wagers on your devices now...
              </p>
              <div className="flex items-center gap-3 mt-2">
                <div className="h-2.5 w-2.5 rounded-full bg-[#ffc400] animate-pulse" />
                <div
                  className="h-2.5 w-2.5 rounded-full bg-[#ffc400] animate-pulse"
                  style={{ animationDelay: '0.3s' }}
                />
                <div
                  className="h-2.5 w-2.5 rounded-full bg-[#ffc400] animate-pulse"
                  style={{ animationDelay: '0.6s' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Question Stats */}
        {phase === 'question' && !question && (
          <div className="w-full h-full flex flex-col items-center justify-center animate-fadeIn z-10 relative">
            <div className="text-3xl text-white font-bold animate-pulse text-glow-cyan neon-border-strong rounded-2xl px-12 py-8 bg-surface/85">
              Syncing Question Data with Host...
            </div>
          </div>
        )}

        {/* Question */}
        {phase === 'question' && question && (
          <div className="w-full h-full min-h-0 flex flex-col px-4 md:px-20 lg:px-40 py-3 md:py-4 lg:py-5 animate-fadeIn">
            {/* Response Stats */}
            <div className="mx-auto w-full shrink-0 rounded-2xl mb-3 ">
              <div className="rounded-xl mb-2 flex flex-col lg:flex-row items-start lg:items-center gap-3 lg:gap-4 justify-between px-3 md:px-4 py-2">
                <div className="flex items-center gap-2 md:gap-4 flex-1 border border-[#00C8FF] rounded-xl px-3 md:px-4 py-2 md:py-3 w-full lg:max-w-2xl">
                  <div className="relative w-8 md:w-10 lg:w-12 h-8 md:h-10 lg:h-12 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
                    <div className="absolute inset-0 bg-linear-to-br from-purple-500/20 to-transparent" />
                    <svg
                      viewBox="0 0 24 24"
                      className="w-5 md:w-6 lg:w-7 h-5 md:h-6 lg:h-7 text-[#20e7ff] relative z-10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M3 5h18M3 12h14M3 19h10" />
                    </svg>
                  </div>

                  {/* 2. The Progress Container (The black pill with blue border) */}
                  <div className="flex-1 min-w-0 rounded-xl px-2 md:px-4">
                    {[
                      {
                        key: 'correct',
                        color: 'from-[#00ff00] to-[#008000]', // Brighter green
                        track: 'bg-[#3d7a3d]/60',
                        value: liveResponses.correct,
                        icon:
                          (question?.roundType || '').toUpperCase() === 'MAJORITY_RULES'
                            ? '+'
                            : '✓',
                        iconBg: 'bg-green-500',
                      },
                      {
                        key: 'incorrect',
                        color: 'from-[#ff0000] to-[#800000]', // Brighter red
                        track: 'bg-[#7a3d3d]/60',
                        value: liveResponses.incorrect,
                        icon:
                          (question?.roundType || '').toUpperCase() === 'MAJORITY_RULES'
                            ? '-'
                            : '×',
                        iconBg: 'bg-red-500',
                      },
                      {
                        key: 'no_answer',
                        color: 'from-[#3b82f6] to-[#1e3a8a]', // Brighter blue
                        track: 'bg-[#3d507a]/60',
                        value: liveResponses.noAnswer,
                        icon: '?',
                        iconBg: 'bg-blue-500',
                      },
                    ].map((item) => {
                      const total = Math.max(1, liveResponses.total || totalTeams || 1);
                      const width = Math.max(
                        0,
                        Math.min(100, Math.round((item.value / total) * 100)),
                      );
                      return (
                        <div key={item.key} className="flex items-center gap-3">
                          <div
                            className={`${item.iconBg} h-4 w-4 rounded-full flex items-center justify-center text-[10px] text-white font-bold border border-white/20`}
                          >
                            {item.icon}
                          </div>
                          <div
                            className={`flex-1 h-4 rounded-full ${item.track} overflow-hidden border border-white/10`}
                          >
                            <div
                              className={`h-full rounded-full bg-linear-to-r ${item.color} shadow-[0_0_12px_rgba(255,255,255,0.4)]`}
                              style={{
                                width: `${width}%`,
                                minWidth: item.value > 0 ? '8px' : '0px', // ← key fix
                                transition: 'width 0.5s ease-out',
                              }}
                            />
                          </div>
                          <span className="w-6 text-right text-sm md:text-base lg:text-lg font-black text-[#47f3ff] italic">
                            {item.value}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-3 md:gap-4 lg:gap-5 shrink-0 pr-1">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full border border-[#1de8ff]/70 bg-[#11154f] flex items-center justify-center shadow-[0_0_12px_rgba(29,232,255,0.35)]">
                      <svg
                        viewBox="0 0 24 24"
                        className="w-5 h-5 text-[#1de8ff]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="3" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </div>
                    <span className="text-3xl md:text-4xl lg:text-5xl font-black text-white leading-none">
                      {liveTotalTeams}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full border border-[#1de8ff]/70 bg-[#11154f] flex items-center justify-center shadow-[0_0_12px_rgba(29,232,255,0.35)]">
                      <svg
                        viewBox="0 0 24 24"
                        className="w-5 h-5 text-[#19d9ff]"
                        fill="currentColor"
                      >
                        <path d="M19 4h-3V2H8v2H5a1 1 0 0 0-1 1v3a5 5 0 0 0 4 4.9V16H6v2h12v-2h-2v-3.1A5 5 0 0 0 20 8V5a1 1 0 0 0-1-1Zm-1 4a3 3 0 0 1-2 2.82V6h2v2ZM6 8V6h2v4.82A3 3 0 0 1 6 8Z" />
                      </svg>
                    </div>
                    <span className="text-3xl md:text-4xl lg:text-5xl font-black text-white leading-none">
                      {liveQuestionPoints}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── QUESTION ── */}
            <div className="w-full flex-1 min-h-0 flex flex-col animate-fadeIn">
              <div className="mx-auto w-full flex-1 min-h-0 rounded-2xl flex flex-col border">
                {/* Media Section */}
                <div className="relative rounded-t-2xl  overflow-hidden shrink-0">
                  <div className="absolute left-4 top-3 z-10 text-white/90 text-2xl font-semibold">
                    Question {(question.questionIndex || 0) + 1}/{question.totalQuestions}
                  </div>
                  {/* Media */}
                  <div className="h-[30vh] md:h-[34vh] lg:h-[38vh] max-h-[360px] min-h-[180px]">
                    {resolveMediaUrl(question.question.mediaUrl) &&
                    (question.question.mediaType || '').toLowerCase() === 'image' ? (
                      <img
                        src={resolveMediaUrl(question.question.mediaUrl)}
                        className="w-full h-full object-cover"
                        alt="media"
                      />
                    ) : (
                      <img
                        src="/withoutImagequestion.png"
                        className="w-full h-full object-cover"
                        alt="fallback"
                      />
                    )}
                  </div>

                  {/* Timer Arch - Pulled down to overlap the section below */}
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-px z-30 w-48 h-24 md:w-56 md:h-28 lg:w-64 lg:h-32 overflow-hidden">
                    <div className="absolute top-6 left-0 w-50 h-50 rounded-full p-2 bg-linear-to-r from-[#ff0000] via-[#ddff00] via-[#ffaa00] to-[#00ff00] shadow-[0_0_20px_rgba(0,0,0,0.6)]">
                      <div className="relative w-full h-full rounded-full bg-[#030818] border border-white/10 flex justify-center overflow-hidden">
                        <div
                          className="absolute inset-0 opacity-20 pointer-events-none"
                          style={{
                            backgroundImage:
                              'radial-gradient(circle, #ffffff 1px, transparent 1px)',
                            backgroundSize: '8px 8px',
                          }}
                        />
                        <span className="mt-4 md:mt-5 lg:mt-6 text-4xl md:text-5xl lg:text-6xl font-black text-white relative z-10 tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                          {timerRemaining}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Questions/Options Section */}
                <div className="relative rounded-2xl border-t-2 border-t-white/50 flex-1 bg-linear-to-b from-[#100048] to-[#000000] z-20 pt-8 md:pt-9 lg:pt-10 px-3 md:px-4 lg:px-5 pb-3 md:pb-4">
                  <div className="mb-2 md:mb-3 lg:mb-4">
                    <p className="text-lg md:text-xl lg:text-2xl font-bold text-white leading-tight">
                      Q{(question.questionIndex || 0) + 1}. {question.question.text}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 md:gap-3">
                    {question.question.options.map((opt, i) => (
                      <div
                        key={i}
                        className={cn(
                          'rounded-lg border px-3 md:px-4 py-2.5 md:py-3 text-white font-bold text-lg md:text-xl lg:text-2xl min-h-[56px] md:min-h-[64px] flex items-center shadow-[0_8px_18px_rgba(0,0,0,0.35)]',
                          VENUE_OPTION_COLOR_CLASSES[i % VENUE_OPTION_COLOR_CLASSES.length],
                        )}
                      >
                        <span className="font-black mr-3">{OPTION_LETTERS[i]}.</span>
                        <span className="truncate">{opt.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Processing Results */}
        {phase === 'reveal' && (!revealData || !question) && (
          <div className="w-full h-full flex flex-col items-center justify-center animate-fadeIn z-10 relative">
            <div className="text-lg sm:text-2xl md:text-3xl text-white font-bold animate-pulse text-glow-cyan neon-border-strong rounded-lg md:rounded-2xl px-6 md:px-12 py-4 md:py-8 bg-surface/85">
              Processing Results...
            </div>
          </div>
        )}

        {/* Reveal */}
        {phase === 'reveal' && revealData && question && (
          <div className="w-full h-full min-h-0 flex flex-col px-4 md:px-20 lg:px-40 py-3 md:py-4 lg:py-5 animate-fadeIn">
            {/* Response Stats */}
            <div className="mx-auto w-full shrink-0 rounded-2xl mb-3 ">
              <div className="rounded-xl mb-3 flex flex-col lg:flex-row items-start lg:items-center gap-3 lg:gap-4 justify-between px-3 md:px-4 py-2 md:py-3">
                <div className="flex items-center gap-2 md:gap-4 flex-1 border border-[#00C8FF] rounded-xl px-3 md:px-4 py-2 md:py-3 w-full lg:max-w-2xl">
                  <div className="relative w-8 md:w-10 lg:w-12 h-8 md:h-10 lg:h-12 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
                    <div className="absolute inset-0 bg-linear-to-br from-purple-500/20 to-transparent" />
                    <svg
                      viewBox="0 0 24 24"
                      className="w-5 md:w-6 lg:w-7 h-5 md:h-6 lg:h-7 text-[#20e7ff] relative z-10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M3 5h18M3 12h14M3 19h10" />
                    </svg>
                  </div>

                  {/* ── DISTRIBUTION BARS ── */}
                  <div className="flex-1 min-w-0 rounded-xl px-2 md:px-4">
                    {[
                      {
                        key: 'correct',
                        color: 'from-[#00ff00] to-[#008000]',
                        track: 'bg-[#3d7a3d]/60',
                        value: liveResponses.correct,
                        icon:
                          (question?.roundType || '').toUpperCase() === 'MAJORITY_RULES'
                            ? '+'
                            : '✓',
                        iconBg: 'bg-green-500',
                      },
                      {
                        key: 'incorrect',
                        color: 'from-[#ff0000] to-[#800000]',
                        track: 'bg-[#7a3d3d]/60',
                        value: liveResponses.incorrect,
                        icon:
                          (question?.roundType || '').toUpperCase() === 'MAJORITY_RULES'
                            ? '-'
                            : '×',
                        iconBg: 'bg-red-500',
                      },
                      {
                        key: 'no_answer',
                        color: 'from-[#3b82f6] to-[#1e3a8a]',
                        track: 'bg-[#3d507a]/60',
                        value: liveResponses.noAnswer,
                        icon: '?',
                        iconBg: 'bg-blue-500',
                      },
                    ].map((item) => {
                      const total = Math.max(1, liveResponses.total || totalTeams || 1);
                      const width = Math.max(
                        0,
                        Math.min(100, Math.round((item.value / total) * 100)),
                      );
                      return (
                        <div
                          key={item.key}
                          className="flex items-center gap-1 md:gap-2 lg:gap-3 mb-1 md:mb-2"
                        >
                          <div
                            className={`${item.iconBg} h-3 md:h-4 w-3 md:w-4 rounded-full flex items-center justify-center text-[8px] md:text-[10px] text-white font-bold border border-white/20`}
                          >
                            {item.icon}
                          </div>
                          <div
                            className={`flex-1 h-3 md:h-4 rounded-full ${item.track} overflow-hidden border border-white/10`}
                          >
                            <motion.div
                              className={`h-full rounded-full bg-linear-to-r ${item.color} shadow-[0_0_12px_rgba(255,255,255,0.4)]`}
                              initial={{ width: 0 }}
                              animate={{ width: `${width}%` }}
                              transition={{ duration: 0.5 }}
                              style={{ minWidth: item.value > 0 ? '8px' : '0px' }}
                            />
                          </div>
                          <span className="w-4 md:w-5 lg:w-6 text-right text-xs md:text-sm lg:text-lg font-black text-[#47f3ff] italic shrink-0">
                            {item.value}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2 md:gap-3 lg:gap-5 shrink-0 pr-1 flex-wrap justify-end">
                  <div className="flex items-center gap-1 md:gap-2 lg:gap-2">
                    <div className="w-7 md:w-8 lg:w-10 h-7 md:h-8 lg:h-10 rounded-full border border-[#1de8ff]/70 bg-[#11154f] flex items-center justify-center shadow-[0_0_12px_rgba(29,232,255,0.35)]">
                      <svg
                        viewBox="0 0 24 24"
                        className="w-3 md:w-4 lg:w-5 h-3 md:h-4 lg:h-5 text-[#1de8ff]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="3" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </div>
                    <span className="text-xl md:text-2xl lg:text-5xl font-black text-white leading-none">
                      {liveTotalTeams}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 md:gap-2 lg:gap-2">
                    <div className="w-7 md:w-8 lg:w-10 h-7 md:h-8 lg:h-10 rounded-full border border-[#1de8ff]/70 bg-[#11154f] flex items-center justify-center shadow-[0_0_12px_rgba(29,232,255,0.35)]">
                      <svg
                        viewBox="0 0 24 24"
                        className="w-3 md:w-4 lg:w-5 h-3 md:h-4 lg:h-5 text-[#19d9ff]"
                        fill="currentColor"
                      >
                        <path d="M19 4h-3V2H8v2H5a1 1 0 0 0-1 1v3a5 5 0 0 0 4 4.9V16H6v2h12v-2h-2v-3.1A5 5 0 0 0 20 8V5a1 1 0 0 0-1-1Zm-1 4a3 3 0 0 1-2 2.82V6h2v2ZM6 8V6h2v4.82A3 3 0 0 1 6 8Z" />
                      </svg>
                    </div>
                    <span className="text-xl md:text-2xl lg:text-5xl font-black text-white leading-none">
                      {liveQuestionPoints}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── QUESTION CARD ── */}
            <div className="w-full flex-1 min-h-0 flex flex-col animate-fadeIn">
              <div className="mx-auto w-full h-full flex-1 rounded-2xl flex flex-col border border-white/20">
                {/* Media Section */}
                <div className="relative rounded-t-2xl overflow-hidden shrink-0 h-40 sm:h-48 md:h-56 lg:h-72 xl:h-96">
                  <div className="absolute left-2 sm:left-3 md:left-4 top-1 sm:top-2 md:top-3 z-10 text-white text-xs sm:text-sm md:text-base lg:text-lg xl:text-2xl font-semibold drop-shadow-md">
                    Question {(question.questionIndex || 0) + 1}/{question.totalQuestions}
                  </div>
                  <div className="w-full h-full">
                    {resolveMediaUrl(question.question.mediaUrl) &&
                    (question.question.mediaType || '').toLowerCase() === 'image' ? (
                      <img
                        src={resolveMediaUrl(question.question.mediaUrl)}
                        className="w-full h-full object-cover"
                        alt="media"
                      />
                    ) : (
                      <img
                        src="/withoutImagequestion.png"
                        className="w-full h-full object-cover"
                        alt="fallback"
                      />
                    )}
                  </div>

                  {/* Timer Arch - Responsive sizing */}
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-px z-30 w-40 h-20 sm:w-48 h-24 md:w-56 h-28 lg:w-64 h-32 overflow-hidden">
                    <div className="absolute top-3 sm:top-4 md:top-5 lg:top-6 left-0 rounded-full p-1 sm:p-1.5 md:p-2 bg-linear-to-r from-green-500 to-green-700 shadow-[0_0_20px_rgba(34,197,94,0.6)]">
                      <div className="relative w-32 h-32 sm:w-40 h-40 md:w-48 h-48 lg:w-56 h-56 rounded-full bg-[#030818] border border-white/10 flex justify-center overflow-hidden">
                        <span className="mt-3 sm:mt-4 md:mt-6 lg:mt-8 text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white relative z-10 tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                          0
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Questions/Options Section */}
                <div className="relative rounded-2xl border-t-2 border-t-white/50 flex-1 bg-linear-to-b from-[#100048] to-[#000000] z-20 pt-4 sm:pt-6 md:pt-8 lg:pt-10 px-3 sm:px-4 md:px-5 pb-3 sm:pb-4 md:pb-5 overflow-y-auto">
                  <div className="mb-2 sm:mb-3 md:mb-4 lg:mb-5">
                    <p className="text-xs sm:text-sm md:text-base lg:text-xl xl:text-2xl font-bold text-white leading-tight">
                      Q{(question.questionIndex || 0) + 1}. {question.question.text}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-2 gap-1 sm:gap-2 md:gap-3">
                    {question.question.options.map((opt, i) => {
                      const isMajorityRulesRound =
                        (question.roundType || '').toUpperCase() === 'MAJORITY_RULES';
                      const majorityOptionIndexes = new Set(revealData.majorityOptionIndexes || []);
                      const isRevealedWinner = isMajorityRulesRound
                        ? majorityOptionIndexes.has(i)
                        : i === revealData.correctOptionIndex;
                      return (
                        <div
                          key={i}
                          className={cn(
                            'rounded-lg border px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 text-white font-bold text-xs sm:text-sm md:text-base lg:text-lg xl:text-2xl flex items-center transition-all duration-500 shadow-[0_8px_18px_rgba(0,0,0,0.35)] min-h-12 sm:min-h-14 md:min-h-16',
                            VENUE_OPTION_COLOR_CLASSES[i % VENUE_OPTION_COLOR_CLASSES.length],
                            isRevealedWinner
                              ? 'shadow-[0_0_8px_8px_rgba(57,255,74,0.9)] z-10 scale-[1.02]'
                              : 'opacity-30 brightness-50 contrast-75 scale-[0.98]',
                          )}
                        >
                          <span className="font-black mr-1 sm:mr-2 md:mr-3 shrink-0">
                            {OPTION_LETTERS[i]}.
                          </span>
                          <span className="truncate text-left flex-1">{opt.text}</span>
                          {isRevealedWinner && (
                            <div className="ml-auto w-6 h-6 sm:w-7 h-7 md:w-8 h-8 rounded-full bg-green-500 flex items-center justify-center border-2 border-white shadow-lg shrink-0">
                              <span className="text-white text-sm sm:text-base md:text-lg">✓</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scoreboard */}
        {phase === 'scoreboard' && (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 sm:p-4 md:p-6 animate-fadeIn">
            <div className="w-full max-w-xl sm:max-w-3xl md:max-w-4xl lg:max-w-5xl rounded-lg sm:rounded-xl md:rounded-2xl lg:rounded-3xl border border-[#9fbeff]/70 bg-[linear-gradient(180deg,rgba(24,9,76,0.95)_0%,rgba(12,6,48,0.95)_100%)] shadow-[0_0_24px_rgba(0,216,255,0.25)] px-4 sm:px-6 md:px-8 py-3 sm:py-4 md:py-6 overflow-y-auto max-h-full">
              <h3 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white text-center mb-2 sm:mb-3 md:mb-4">
                Scoreboard
              </h3>

              <div className="text-center mb-3 sm:mb-4 md:mb-5">
                {(question?.roundType || '').toUpperCase() === 'MAJORITY_RULES' ? (
                  <>
                    <p className="text-lg sm:text-2xl md:text-3xl lg:text-4xl font-extrabold text-white leading-none">
                      Majority Rules
                    </p>
                    <p className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-extrabold text-[#39ff4a] leading-none mt-1 sm:mt-2">
                      +50 most popular vote, -50 minority vote
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg sm:text-2xl md:text-3xl lg:text-4xl font-extrabold text-white leading-none">
                      The Correct Answer is :
                    </p>
                    <p className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-extrabold text-[#39ff4a] leading-none mt-1 sm:mt-2">
                      {(() => {
                        if (!revealData) return '-';
                        const idx = revealData.correctOptionIndex;
                        const letter =
                          idx >= 0 && idx < OPTION_LETTERS.length ? OPTION_LETTERS[idx] : null;
                        const text = (revealData.correctText || '').trim();
                        if (letter && text) return `${letter}. ${text}`;
                        if (text) return text;
                        if (letter) return `${letter}.`;
                        return '-';
                      })()}
                    </p>
                  </>
                )}
              </div>

              <div className="grid grid-cols-[64px_minmax(0,1fr)_82px] sm:grid-cols-[74px_minmax(0,1fr)_96px] md:grid-cols-[88px_minmax(0,1fr)_120px] items-center px-2 sm:px-4 md:px-5 mb-2 sm:mb-3 text-white text-xs sm:text-sm md:text-base lg:text-lg font-bold gap-2 sm:gap-3 md:gap-4">
                <div className="text-center">Rank</div>
                <div className="text-left">Team Name</div>
                <div className="text-right">Pts</div>
              </div>

              <div className="space-y-1 sm:space-y-2 md:space-y-3">
                {scoreboard.slice(0, 8).map((team, idx) => {
                  const response = revealData?.responseDetails?.find(
                    (r) => Number(r.teamId) === Number(team.teamId),
                  );
                  const selectedOptionIndex = response?.selectedOptionIndex ?? -1;
                  const selectedLabel =
                    selectedOptionIndex >= 0 && selectedOptionIndex < OPTION_LETTERS.length
                      ? OPTION_LETTERS[selectedOptionIndex]
                      : '-';
                  const totalScore = Number(team.score ?? 0);

                  return (
                    <div
                      key={team.teamId}
                      className="grid grid-cols-[64px_minmax(0,1fr)_82px] sm:grid-cols-[74px_minmax(0,1fr)_96px] md:grid-cols-[88px_minmax(0,1fr)_120px] items-center rounded-lg border border-[#2ec7ff]/50 bg-[linear-to-b_#2c00a8_0%,_#9a00b8_100%] px-2 sm:px-3 md:px-4 py-2 sm:py-2 md:py-3 text-white text-xs sm:text-sm md:text-base font-semibold gap-2 sm:gap-3 md:gap-4"
                    >
                      <div className="flex justify-center">
                        <span className="inline-flex h-6 sm:h-8 md:h-10 min-w-6 sm:min-w-8 md:min-w-10 items-center justify-center rounded bg-[#080327] px-1.5 sm:px-2 md:px-3 text-[12px] sm:text-[14px] md:text-[16px] lg:text-[18px] font-bold">
                          {idx + 1}
                        </span>
                      </div>
                      <div
                        className={cn(
                          'min-w-0 truncate',
                          team.isEliminated && 'line-through opacity-60',
                        )}
                      >
                        {team.teamName}
                      </div>
                      <div className="text-[#00f0ff] text-right">
                        {totalScore >= 0 ? '+' : ''}
                        {totalScore}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── BREAK ── */}
        {phase === 'break' && (
          <BreakView duration={breakDuration} pin={sessionPin} qrCodeData={qrCodeData} />
        )}

        {/* ── MINI GAME ── */}
        {phase === 'mini_game' && miniGameType && (
          <div className="flex flex-col animate-fadeIn">
            <div className="px-6 py-3 flex items-center justify-between border-b border-border/30">
              <h2 className="text-2xl font-black text-neon-cyan text-glow-cyan">
                {miniGameType === 'Kangaroo_race' ? '🏇 Kangaroo Race' : '🃏 Card Shuffle'}
              </h2>
              <p className="text-foreground/40 text-sm">Players pick on their devices</p>
            </div>
            <div className="flex-1 p-4">
              <DynamicUnityGame
                gameType={miniGameType as 'Kangaroo_race' | 'card_shuffle'}
                onPlayerAction={handleUnityPlayerAction}
                onGameComplete={handleUnityGameComplete}
                onReady={handleUnityReady}
                command={miniGameCommand}
                className="rounded-2xl overflow-hidden"
              />
            </div>
          </div>
        )}

        {/* ── MINI GAME RESULT ── */}
        {phase === 'mini_game_result' && miniGameResult && (
          <div className="w-full h-full flex flex-col items-center justify-center p-8 animate-fadeIn">
            {miniGameResult.game === 'card_shuffle' && miniGameResult.holdScreen ? (
              <div className="w-full max-w-[980px] rounded-[32px] border border-[#2ec7ff]/45 bg-[linear-gradient(180deg,rgba(38,14,95,0.95)_0%,rgba(15,11,55,0.96)_100%)] px-12 py-16 text-center shadow-[0_0_36px_rgba(0,229,255,0.16)]">
                <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full border-2 border-[#2ec7ff]/55 bg-[rgba(4,14,38,0.85)] shadow-[0_0_28px_rgba(0,229,255,0.2)]">
                  <span className="text-2xl font-black tracking-[0.18em] text-[#8fefff]">CS</span>
                </div>
                <h2 className="text-6xl font-black text-white drop-shadow-[0_0_16px_rgba(255,255,255,0.18)]">
                  Game Finished
                </h2>
                <p className="mt-5 text-2xl font-semibold text-[#8fefff]">
                  {miniGameResult.message || 'Wait for the host to start the game.'}
                </p>
              </div>
            ) : miniGameResult.game === 'card_shuffle' && miniGameResult.winningCard ? (
              <>
                <div className="text-7xl mb-6">🃏</div>
                <h2 className="text-5xl font-black mb-4 text-glow-cyan">Winning Card</h2>
                <div className="flex gap-8 mt-4">
                  {(
                    [
                      { id: 1, label: 'Left' },
                      { id: 2, label: 'Middle' },
                      { id: 3, label: 'Right' },
                    ] as const
                  ).map((pos) => {
                    const isWinner = pos.id === miniGameResult.winningCard;
                    return (
                      <div
                        key={pos.id}
                        className={cn(
                          'flex flex-col items-center gap-3 rounded-2xl border-4 px-10 py-8 transition-all duration-500',
                          isWinner
                            ? 'border-neon-gold bg-neon-gold/10 scale-110 shadow-[0_0_40px_rgba(255,215,0,0.4)]'
                            : 'border-white/10 bg-white/5 opacity-30 scale-90',
                        )}
                      >
                        <span className={cn('text-7xl', isWinner && 'animate-bounce')} aria-hidden>
                          🃏
                        </span>
                        <span
                          className={cn(
                            'text-2xl font-black',
                            isWinner ? 'text-neon-gold text-glow-gold' : 'text-white/40',
                          )}
                        >
                          {pos.label}
                        </span>
                        {isWinner && (
                          <span className="text-lg font-bold text-neon-green text-glow-green mt-1">
                            WINNER
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
            {miniGameResult.game === 'Kangaroo_race' && miniGameResult.winningKangaroo && (
              <>
                <div className="text-7xl mb-6">🦘</div>
                <h2 className="text-5xl font-black mb-4 text-glow-cyan">Winning Kangaroo</h2>
                <div className="flex gap-6 mt-4 flex-wrap justify-center">
                  {[1, 2, 3, 4, 5, 6].map((n) => {
                    const isWinner = n === miniGameResult.winningKangaroo;
                    return (
                      <div
                        key={n}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-2xl border-4 px-6 py-6 transition-all duration-500',
                          isWinner
                            ? 'border-neon-gold bg-neon-gold/10 scale-110 shadow-[0_0_40px_rgba(255,215,0,0.4)]'
                            : 'border-white/10 bg-white/5 opacity-30 scale-90',
                        )}
                      >
                        <span className={cn('text-5xl', isWinner && 'animate-bounce')}>🦘</span>
                        <span
                          className={cn(
                            'text-xl font-black',
                            isWinner ? 'text-neon-gold text-glow-gold' : 'text-white/40',
                          )}
                        >
                          #{n}
                        </span>
                        {isWinner && (
                          <span className="text-base font-bold text-neon-green text-glow-green">
                            WINNER
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
        {/* ── GAME END ── */}
        {phase === 'game_end' && (
          <div className="w-full h-full flex flex-col items-center justify-center p-8 animate-fadeIn">
            <div className="text-7xl mb-4">🏆</div>
            <h1 className="text-6xl font-black mb-2 text-glow-cyan">Thank You For Playing!</h1>
            {scoreboard.length > 0 && (
              <>
                <p className="text-3xl text-neon-gold text-glow-gold font-bold mt-4 mb-8">
                  Winner: {scoreboard[0]?.teamName}
                </p>
                <div className="flex items-end gap-4 mb-8">
                  {scoreboard.length > 1 && (
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground/60 mb-2">
                        {scoreboard[1]?.teamName}
                      </p>
                      <div className="w-32 h-24 neon-border bg-surface/80 rounded-t-xl flex items-center justify-center">
                        <span className="text-2xl font-mono font-bold">{scoreboard[1]?.score}</span>
                      </div>
                      <div className="bg-foreground/5 py-1 text-foreground/30 text-sm">2nd</div>
                    </div>
                  )}
                  <div className="text-center">
                    <p className="text-xl font-black text-neon-gold text-glow-gold mb-2">
                      {scoreboard[0]?.teamName}
                    </p>
                    <div className="w-36 h-36 bg-neon-gold/10 border-2 border-neon-gold/40 rounded-t-xl flex items-center justify-center shadow-[0_0_30px_rgba(255,215,0,0.2)]">
                      <span className="text-3xl font-mono font-black text-neon-gold">
                        {scoreboard[0]?.score}
                      </span>
                    </div>
                    <div className="bg-neon-gold/10 py-1 text-neon-gold text-sm font-bold">
                      1st 🏆
                    </div>
                  </div>
                  {scoreboard.length > 2 && (
                    <div className="text-center">
                      <p className="text-lg font-bold text-orange-400/60 mb-2">
                        {scoreboard[2]?.teamName}
                      </p>
                      <div className="w-32 h-16 neon-border bg-surface/80 rounded-t-xl flex items-center justify-center">
                        <span className="text-2xl font-mono font-bold">{scoreboard[2]?.score}</span>
                      </div>
                      <div className="bg-orange-500/5 py-1 text-orange-400/50 text-sm">3rd</div>
                    </div>
                  )}
                </div>
              </>
            )}
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.localStorage.removeItem(VENUE_PIN_STORAGE_KEY);
                  window.location.replace('/venue?login=1');
                } else {
                  router.replace('/venue?login=1');
                }
              }}
              className="mt-6 rounded-xl border border-[#2bdcff]/60 bg-[rgba(8,20,56,0.92)] px-8 py-3 text-xl font-bold text-[#2be9ff] shadow-[0_0_18px_rgba(43,220,255,0.35)] hover:bg-[rgba(8,20,56,1)]"
            >
              Leave Game
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BreakView({
  duration,
  pin,
  qrCodeData,
}: {
  duration: number;
  pin: string;
  qrCodeData: string;
}) {
  void pin;
  void qrCodeData;
  const [remaining, setRemaining] = useState(duration);

  useEffect(() => {
    setRemaining(duration);
    const interval = setInterval(() => {
      setRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [duration]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const total = Math.max(1, duration);
  /** Elapsed wedge grows clockwise from 12 o'clock; remaining arc keeps the spectrum. */
  const elapsedDeg = Math.max(0, Math.min(360, ((total - remaining) / total) * 360));
  const span = Math.max(0, 360 - elapsedDeg);
  const s1 = elapsedDeg + span * 0.22;
  const s2 = elapsedDeg + span * 0.44;
  const s3 = elapsedDeg + span * 0.66;
  const s4 = elapsedDeg + span * 0.88;
  const ringStyle = {
    background: `conic-gradient(
      #141a33 0deg,
      #141a33 ${elapsedDeg}deg,
      #ff2424 ${elapsedDeg}deg,
      #ff9b00 ${s1}deg,
      #fff100 ${s2}deg,
      #b7ff00 ${s3}deg,
      #78ff00 ${s4}deg,
      #78ff00 360deg
    )`,
  } as const;

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center text-center animate-fadeIn overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[280px] w-[280px] bg-[radial-gradient(circle_at_30%_20%,rgba(255,245,170,0.38),rgba(255,245,170,0.04)_38%,transparent_68%)] opacity-60" />
      <div className="pointer-events-none absolute right-0 top-0 h-[280px] w-[280px] bg-[radial-gradient(circle_at_70%_20%,rgba(255,245,170,0.38),rgba(255,245,170,0.04)_38%,transparent_68%)] opacity-60" />

      <h2 className="text-[66px] leading-none font-black text-white drop-shadow-[0_0_14px_rgba(255,255,255,0.35)]">
        TAKE A BREAK !!
      </h2>
      <p className="mt-2 text-[34px] font-semibold text-white/95">We'll be back shortly...</p>

      <div
        className="relative mt-8 h-[420px] w-[420px] rounded-full p-[10px] shadow-[0_0_30px_rgba(0,217,255,0.2)]"
        style={ringStyle}
      >
        <div className="relative h-full w-full rounded-full border border-white/15 bg-[linear-gradient(180deg,rgba(25,16,73,0.95)_0%,rgba(7,7,28,0.96)_100%)]">
          <div className="absolute inset-0 rounded-full opacity-25 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.25)_2px,transparent_2px)] [background-size:16px_16px]" />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-[106px] leading-none font-black text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.3)]">
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </p>
            <p className="mt-2 text-[34px] font-black tracking-[0.12em] text-[#1ee6ff] drop-shadow-[0_0_8px_rgba(30,230,255,0.55)]">
              TIME REMAINING
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
export default function VenueDisplayPage() {
  return (
    <Suspense fallback={<div className="w-full h-full flex items-center justify-center"> </div>}>
      <VenueDisplayContent />
    </Suspense>
  );
}
