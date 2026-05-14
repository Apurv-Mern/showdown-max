'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { usePlayerSession } from '../playerSession';
import { LoadingDots } from '../LoadingDots';
import { clientLogger } from '@/lib/clientLogger';
import { breakSecondsFromEndsAt, resolveBreakWallClock } from '@/lib/breakWallClock';
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
    isOrdering?: boolean;
  };
  timerDuration: number;
  timerRemaining?: number;
  timerRunning?: boolean;
  timerEndsAt?: number | null;
  serverNow?: number;
  roundType: string;
  pointsForQuestion?: number;
  lockedWagerAmount?: number | null;
  /** Present on reconnect when this team already submitted for the active question. */
  mySubmittedOptionIndex?: number | null;
  /** Teams knocked out this elimination round (still in session, must not answer). */
  eliminatedTeamIds?: number[];
}

interface RevealData {
  correctOptionIndex: number;
  correctText: string;
  correctOrderArray?: number[];
  scores: Record<string, number>;
  responseDetails?: { teamId: number; selectedOptionIndex: number; responseTime?: number | null }[];
  /** Majority Rules: option index(es) that tied for the most votes (scoring winners). */
  majorityOptionIndexes?: number[];
  voteCounts?: Record<number, number>;
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

const WAGER_POINT_OPTIONS = [0, 10, 20, 30, 40, 50] as const;
// Final wager: fixed % steps on mobile; server clamps to SCORING.FINAL_WAGER (shared/constants/scoring.js).
const FINAL_WAGER_PERCENT_OPTIONS = [0, 10, 20, 30, 40, 50] as const;

function initialWagerAmountForRoundType(roundType?: string): number {
  return (roundType || '').toUpperCase() === 'FINAL_WAGER' ? FINAL_WAGER_PERCENT_OPTIONS[0] : 0;
}

const WAGER_DRAFT_STORAGE_PREFIX = 'mst:wagerDraft:';

function wagerDraftStorageKey(pin: string, teamId: number) {
  return `${WAGER_DRAFT_STORAGE_PREFIX}${pin}:${teamId}`;
}

function readWagerDraft(
  pin: string,
  teamId: number,
  roundId: number | string | undefined,
): { amount: number | null; pendingLock: boolean } {
  if (!pin || teamId == null || roundId == null) return { amount: null, pendingLock: false };
  try {
    const raw = sessionStorage.getItem(wagerDraftStorageKey(pin, teamId));
    if (!raw) return { amount: null, pendingLock: false };
    const o = JSON.parse(raw) as { roundId?: unknown; amount?: unknown; pendingLock?: unknown };
    if (String(o.roundId ?? '') !== String(roundId)) return { amount: null, pendingLock: false };
    const n = Number(o.amount);
    const amount = Number.isFinite(n) ? n : null;
    return { amount, pendingLock: Boolean(o.pendingLock) };
  } catch {
    return { amount: null, pendingLock: false };
  }
}

function writeWagerDraft(
  pin: string,
  teamId: number,
  roundId: number | string,
  amount: number,
  opts?: { pendingLock?: boolean },
) {
  try {
    sessionStorage.setItem(
      wagerDraftStorageKey(pin, teamId),
      JSON.stringify({ roundId, amount, pendingLock: Boolean(opts?.pendingLock) }),
    );
  } catch {
    /* quota / private mode */
  }
}

function clearWagerDraft(pin: string, teamId: number) {
  try {
    sessionStorage.removeItem(wagerDraftStorageKey(pin, teamId));
  } catch {
    /* ignore */
  }
}

function isValidWagerDraftAmount(roundType: string | undefined, amount: number): boolean {
  const rt = (roundType || '').toUpperCase();
  const inSharedGrid = (FINAL_WAGER_PERCENT_OPTIONS as readonly number[]).includes(amount);
  if (rt === 'FINAL_WAGER') {
    return FINAL_WAGER_PERCENT_OPTIONS.includes(
      amount as (typeof FINAL_WAGER_PERCENT_OPTIONS)[number],
    );
  }
  if (rt === 'WAGER') {
    return WAGER_POINT_OPTIONS.includes(amount as (typeof WAGER_POINT_OPTIONS)[number]);
  }
  // Payload sometimes omits round `type` on reconnect; both wager UIs use the same 0–50 steps.
  return inSharedGrid;
}

const ANSWER_DRAFT_PREFIX = 'mst:answerDraft:';

type AnswerDraftPayload = {
  selectedOptionIndex: number | number[];
  wagerAmount?: number;
};

function answerDraftStorageKey(pin: string, teamId: number, questionId: string) {
  return `${ANSWER_DRAFT_PREFIX}${pin}:${teamId}:${questionId}`;
}

function writeAnswerDraft(
  pin: string,
  teamId: number,
  questionId: string | number,
  payload: AnswerDraftPayload,
) {
  try {
    sessionStorage.setItem(
      answerDraftStorageKey(pin, teamId, String(questionId)),
      JSON.stringify(payload),
    );
  } catch {
    /* ignore */
  }
}

function readAnswerDraft(
  pin: string,
  teamId: number,
  questionId: string,
): AnswerDraftPayload | null {
  try {
    const raw = sessionStorage.getItem(answerDraftStorageKey(pin, teamId, questionId));
    if (!raw) return null;
    const o = JSON.parse(raw) as AnswerDraftPayload;
    if (Array.isArray(o?.selectedOptionIndex)) return o;
    const n = Number(o?.selectedOptionIndex);
    if (!Number.isFinite(n) || n < 0) return null;
    return o;
  } catch {
    return null;
  }
}

function clearAnswerDraft(pin: string, teamId: number, questionId: string) {
  try {
    sessionStorage.removeItem(answerDraftStorageKey(pin, teamId, questionId));
  } catch {
    /* ignore */
  }
}

function clearAnswerDraftsForTeam(pin: string, teamId: number) {
  try {
    const prefix = `${ANSWER_DRAFT_PREFIX}${pin}:${teamId}:`;
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(prefix)) sessionStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

/** Server `mySubmittedOptionIndex` or Redis-parsed value — never treat -1 as a selection. */
function parseSubmittedIdxFromMineRaw(mineRaw: unknown): number | number[] | null {
  if (mineRaw === undefined || mineRaw === null) return null;
  if (Array.isArray(mineRaw)) return mineRaw.length > 0 ? mineRaw : null;
  const n = Number(mineRaw);
  if (Number.isFinite(n) && n >= 0) return n;
  return null;
}

function hasSelectionIdx(idx: number | number[] | null | undefined): idx is number | number[] {
  if (idx === null || idx === undefined) return false;
  if (Array.isArray(idx)) return idx.length > 0;
  return Number.isFinite(Number(idx)) && Number(idx) >= 0;
}

/** Standard MC / music / final MC — must match shared/constants/scoring.js */
const REVEAL_FIXED_CORRECT_PTS = 10;
const REVEAL_FIXED_WRONG_PTS = -2;

function revealUsesServerPointsLabel(roundType: string | undefined): boolean {
  const rt = (roundType || '').toUpperCase();
  return rt === 'WAGER' || rt === 'FINAL_WAGER' || rt === 'ELIMINATION' || rt === 'MAJORITY_RULES';
}

/** +10 / −2 reveal copy (includes empty roundType when payload omits it). */
function revealUsesFixedTenTwoLabel(
  roundType: string | undefined,
  isMajorityRulesRound: boolean,
): boolean {
  if (isMajorityRulesRound) return false;
  if (revealUsesServerPointsLabel(roundType)) return false;
  const rt = (roundType || '').toUpperCase();
  return rt === 'MULTIPLE_CHOICE' || rt === 'MUSIC' || rt === 'FINAL_MULTIPLE_CHOICE' || rt === '';
}

/** Payloads / sessionStorage may mix numeric and string team ids — avoid `===` misses. */
function sameTeamId(a: unknown, b: unknown): boolean {
  const na = Number(a);
  const nb = Number(b);
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

function RevealOptionStatusIcon({ variant }: { variant: 'correct' | 'wrong' }) {
  if (variant === 'correct') {
    return (
      <span
        className="flex border h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#22c55e] shadow-[0_2px_8px_rgba(34,197,94,0.55)] sm:h-10 sm:w-10"
        aria-hidden
      >
        <svg
          className="h-5 w-5 text-white"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M6 12.5l3.5 3.5L18 7"
            stroke="currentColor"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="flex border h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ef4444] shadow-[0_2px_8px_rgba(239,68,68,0.55)] sm:h-10 sm:w-10"
      aria-hidden
    >
      <svg
        className="h-5 w-5 text-white"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M7 7l10 10M17 7L7 17"
          stroke="currentColor"
          strokeWidth="2.75"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

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

const QUESTION_NO_IMAGE_PLACEHOLDER = '/withoutImagequestion.png';

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
      <img
        src={QUESTION_NO_IMAGE_PLACEHOLDER}
        alt=""
        className="max-h-[min(42vh,220px)] w-full rounded-xl border border-[#11a7ff] object-cover md:max-h-[min(38vh,260px)]"
      />
    );
  }

  return (
    <img
      src={candidates[index]}
      alt="Question media"
      className="max-h-[min(42vh,220px)] w-full rounded-xl border border-[#11a7ff] object-cover md:max-h-[min(38vh,260px)]"
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

function QuestionMediaVisual({
  question,
  musicBanner,
}: {
  question: QuestionData;
  /** Music / MP3 questions: venue copy — `waiting` until host starts timer; `playing` after. */
  musicBanner: 'none' | 'waiting' | 'playing';
}) {
  const q = question.question;
  const roundType = question.roundType;

  if (isImageMedia(q.mediaType, q.mediaUrl) && q.mediaUrl) {
    return (
      <div className="shrink-0">
        <div className="rounded-2xl border-2 border-[#11a7ff] overflow-hidden shadow-[0_0_20px_rgba(17,167,255,0.3)]">
          <QuestionImage mediaUrl={q.mediaUrl} />
        </div>
      </div>
    );
  }
  if ((q.mediaType || '').toLowerCase() === 'mp4' && q.mediaUrl) {
    // Per design: MP4 plays on the venue projector only — players see a
    // video-themed thumbnail (`/videobg.png`) so the mobile UI clearly signals
    // "watch the venue" without us streaming the actual clip to 30+ phones.
    // MP3 questions keep using `/venuemusicbg.png` (handled below).
    const caption =
      musicBanner === 'playing'
        ? 'Video is playing on Venue Screen'
        : musicBanner === 'waiting'
          ? 'Waiting for host to start the video'
          : 'Video is playing on Venue Screen';
    return (
      <div className="shrink-0">
        <div className="rounded-2xl overflow-hidden">
          <img
            src="/videobg.png"
            alt={caption}
            className="max-h-[min(42vh,220px)] w-full object-cover md:max-h-[min(38vh,280px)]"
          />
        </div>
        <p className="mt-2 text-center text-sm font-semibold text-white sm:text-base">{caption}</p>
      </div>
    );
  }
  if ((q.mediaType || '').toLowerCase() === 'mp3' || roundType === 'MUSIC') {
    const caption =
      musicBanner === 'playing'
        ? 'Audio is playing on Venue Screen'
        : musicBanner === 'waiting'
          ? 'Waiting for host to play music'
          : null;
    return (
      <div className="shrink-0">
        <div className="rounded-2xl overflow-hidden">
          <img
            src="/venuemusicbg.png"
            alt={caption || 'Music round'}
            className="max-h-[min(42vh,220px)] w-full object-cover md:max-h-[min(38vh,280px)]"
          />
        </div>
        {caption ? (
          <p className="mt-2 text-center text-sm font-semibold text-white sm:text-base">
            {caption}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="shrink-0">
      <div className="rounded-2xl border-2 border-[#11a7ff] overflow-hidden shadow-[0_0_20px_rgba(17,167,255,0.3)]">
        <img
          src={QUESTION_NO_IMAGE_PLACEHOLDER}
          alt=""
          className="max-h-[min(42vh,220px)] w-full object-cover md:max-h-[min(38vh,260px)]"
        />
      </div>
    </div>
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
      positive: '+ Wagered points for a correct answer',
      negative: '- Wagered points for a wrong answer',
    };
  }
  if (type === 'MAJORITY_RULES') {
    return {
      positive: '+50 points if you side with the majority',
      negative: '-50 points if you side with the minority',
    };
  }
  if (type === 'ELIMINATION') {
    // Per project rule (max-showdown-trivia.mdc → Knockout): incremental 10–120 points across
    // 12 questions, wrong answer eliminates you until the round ends, all-wrong question
    // skips the knockout. The default `+10 / -2` line was misleading for this round.
    return {
      positive: '+10 to +120 points for correct answers',
      negative: 'Wrong answer → knocked out until end of round',
    };
  }
  if (type === 'FINAL_WAGER') {
    return {
      positive: '+ Wagered % of your score for a correct answer',
      negative: '- Wagered % of your score for a wrong answer',
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

const toTimerEndsAt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const getRemainingFromEndsAt = (timerEndsAt: number): number => {
  return Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
};

/** Prefer wall clock when valid; if `timerEndsAt` is stale but the server still reports time left, trust the server. */
function coercePlayerTimerFromServer(
  serverRemaining: unknown,
  endsAt: unknown,
): { remaining: number; endsAt: number | null } {
  const tr = Number(serverRemaining);
  const safeTr = Number.isFinite(tr) ? Math.max(0, Math.floor(tr)) : 0;
  const syncEndsAt = toTimerEndsAt(endsAt);
  if (syncEndsAt === null) {
    return { remaining: safeTr, endsAt: null };
  }
  const fromWall = getRemainingFromEndsAt(syncEndsAt);
  if (safeTr <= 0 && fromWall <= 0) {
    return { remaining: 0, endsAt: null };
  }
  if (safeTr > 0 && fromWall <= 0) {
    return { remaining: safeTr, endsAt: null };
  }
  if (safeTr <= 0 && fromWall > 0) {
    return { remaining: fromWall, endsAt: syncEndsAt };
  }
  return { remaining: fromWall, endsAt: syncEndsAt };
}

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
        'relative flex h-10 min-w-[6.5rem] items-center rounded-full border border-[#ff2b68] bg-[linear-gradient(180deg,#FF0000_0%,#801669_100%)] pl-9 pr-3 shadow-[0_4px_10px_rgba(0,0,0,0.3)] sm:h-11 sm:min-w-27.5 sm:pl-10 sm:pr-4',
        className,
      )}
    >
      <div className="absolute -left-2.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center sm:-left-3 sm:h-14 sm:w-14">
        <img src={icon} alt="" className="h-full w-full object-contain drop-shadow-md" />
      </div>
      <span className="w-full text-center text-base font-black leading-none text-white sm:text-lg md:text-xl">
        {value}
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
  const [timerEndsAt, setTimerEndsAt] = useState<number | null>(null);
  const [timerDuration, setTimerDuration] = useState(30);
  const [selectedOption, setSelectedOption] = useState<number | number[] | null>(null);
  const [orderingSelection, setOrderingSelection] = useState<number[]>([]);
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
  const [breakEndsAtMs, setBreakEndsAtMs] = useState<number | null>(null);
  const [breakSkewMs, setBreakSkewMs] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  /** MUSIC round: host has started the venue timer at least once this question (incl. after pause). */
  const [musicVenuePlaybackStarted, setMusicVenuePlaybackStarted] = useState(false);
  const [showBreakEndedNotice, setShowBreakEndedNotice] = useState(false);
  // Becomes true the first time we receive any state (session_state OR a sessionStorage replay
  // from the lobby/join page). Used to suppress the "Waiting for game to start" splash on a
  // bare refresh until the server has actually told us we're in LOBBY — otherwise the
  // 100–500 ms gap between mount and join_session reply renders a misleading "Waiting" UI.
  const [hasInitialState, setHasInitialState] = useState(false);
  /** Synced in socket handlers (same tick as session_state) so question_active cannot overwrite elimination. */
  const isEliminatedRef = useRef(false);
  const phaseRef = useRef<GamePhase>('waiting');
  const previousPhaseBeforeScoreboardRef = useRef<GamePhase | null>(null);
  const questionRef = useRef<QuestionData | null>(null);
  const revealDataRef = useRef<RevealData | null>(null);
  /** When `session_state` / `question_active` omits `mySubmittedOptionIndex` (room broadcasts), keep the last authoritative pick for this question id. */
  const answerRestoreRef = useRef<{
    qid: string | null;
    idx: number | number[] | null;
  }>({ qid: null, idx: null });
  const answerDraftResubmitGuardRef = useRef<Set<string>>(new Set());
  const wagerLockResubmitGuardRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (question?.question?.options) {
      if (question.question.isOrdering) {
        setOrderingSelection((prev) => {
          if (Array.isArray(selectedOption)) return selectedOption;
          if (prev.length !== question.question.options.length) {
            return question.question.options.map((_, i) => i);
          }
          return prev;
        });
      }
    }
  }, [question, selectedOption]);

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
        setHasInitialState(true);
      } catch {
        /* ignore */
      }
      sessionStorage.removeItem('roundIntro');
    }
    const savedQuestion = sessionStorage.getItem('questionActive');
    if (savedQuestion) {
      try {
        const data = JSON.parse(savedQuestion);
        setHasInitialState(true);
        const tid = session.teamId != null ? Number(session.teamId) : NaN;
        const inEliminatedList =
          Number.isFinite(tid) &&
          Array.isArray(data.eliminatedTeamIds) &&
          data.eliminatedTeamIds.map(Number).includes(tid);
        const knockedOut = Boolean(data.isEliminated) || inEliminatedList;
        setQuestion(data);
        setTimerDuration(Number(data.timerDuration ?? 30) || 30);
        const coerced = coercePlayerTimerFromServer(
          data.timerRemaining ?? data.timerDuration,
          data.timerEndsAt,
        );
        setTimerEndsAt(coerced.endsAt);
        setTimerRemaining(coerced.remaining);
        const running = Boolean(data.timerRunning);
        setTimerRunning(running);
        const td = Number(data.timerDuration ?? 30) || 30;
        const tr = coerced.remaining;
        const isMusicRound = (data.roundType || '').toUpperCase() === 'MUSIC';
        if (isMusicRound) {
          setMusicVenuePlaybackStarted(running || (tr > 0 && tr < td));
        } else {
          setMusicVenuePlaybackStarted(false);
        }
        if (knockedOut) {
          isEliminatedRef.current = true;
          setIsEliminated(true);
          setSelectedOption(null);
          setPhase('eliminated');
        } else {
          const mine = data.mySubmittedOptionIndex;
          let restored = parseSubmittedIdxFromMineRaw(mine);
          const qidStr =
            data.question?.id != null && session.pin && session.teamId != null
              ? String(data.question.id)
              : null;
          if (!hasSelectionIdx(restored) && qidStr && session.pin && session.teamId != null) {
            const draft = readAnswerDraft(session.pin, Number(session.teamId), qidStr);
            if (draft && hasSelectionIdx(draft.selectedOptionIndex)) {
              restored = draft.selectedOptionIndex;
            }
          }
          const isWagerRound = data.roundType === 'WAGER' || data.roundType === 'FINAL_WAGER';
          const hasLockedWager =
            data.lockedWagerAmount !== null && data.lockedWagerAmount !== undefined;
          if (isWagerRound) {
            if (hasLockedWager) {
              setWagerAmount(Number(data.lockedWagerAmount));
              setWagerSubmitted(true);
            } else {
              setWagerAmount(initialWagerAmountForRoundType(data.roundType));
              setWagerSubmitted(false);
            }
          }

          if (isWagerRound && !hasLockedWager) {
            setSelectedOption(null);
            setPhase('wager_input');
          } else if (hasSelectionIdx(restored)) {
            setSelectedOption(restored);
            setPhase('answered');
          } else {
            setSelectedOption(null);
            setPhase('question');
          }
        }
      } catch {
        /* ignore */
      }
      sessionStorage.removeItem('questionActive');
    }
  }, []);

  useEffect(() => {
    if (phase !== 'break') return;
    const tick = () => {
      if (breakEndsAtMs != null && Number.isFinite(breakEndsAtMs) && breakEndsAtMs > 0) {
        const next = breakSecondsFromEndsAt(breakEndsAtMs, breakSkewMs);
        setBreakRemaining(Math.min(breakDuration, Math.max(0, next)));
      } else {
        setBreakRemaining((prev) => {
          const capped = prev > breakDuration ? breakDuration : prev;
          return capped > 0 ? capped - 1 : 0;
        });
      }
    };
    tick();
    const t = setInterval(tick, 250);
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        tick();
        // Coming back from a backgrounded/throttled tab: ask the server for an authoritative
        // resync, otherwise a missed break_end leaves the break screen stuck.
        if (socket && session.pin && session.teamName) {
          socket.emit('join_session', { pin: session.pin, teamName: session.teamName });
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [phase, breakDuration, breakEndsAtMs, breakSkewMs, socket, session.pin, session.teamName]);

  useEffect(() => {
    if (!timerEndsAt || !timerRunning) return;

    const syncTimer = () => {
      setTimerRemaining(getRemainingFromEndsAt(timerEndsAt));
    };

    syncTimer();
    const interval = window.setInterval(syncTimer, 250);
    return () => window.clearInterval(interval);
  }, [timerEndsAt, timerRunning]);

  useEffect(() => {
    if (!socket || !session.pin || !session.teamName) return;

    const onSessionState = (data: any) => {
      // Server emits SESSION_STATE in two shapes:
      //   • on join_session reply, the gameState is wrapped under `data.gameState`
      //   • on every other update (break_end, scoreboard, etc.) it is the flat payload itself
      // Handling both keeps players in sync even when discrete events (break_end, etc.) are
      // dropped on flaky mobile networks or backgrounded tabs.
      if (data) {
        const gs = data.gameState ?? data;
        if (!gs || typeof gs !== 'object' || !('state' in gs)) return;
        setHasInitialState(true);
        if (gs.state !== 'BREAK') {
          setBreakEndsAtMs(null);
          setBreakSkewMs(0);
        }
        const teamsMap = gs.teams as
          | Record<number | string, { isEliminated?: boolean; score?: number }>
          | undefined;
        const stid = session.teamId;
        const myTeam = stid != null && teamsMap ? (teamsMap[stid] ?? teamsMap[String(stid)]) : null;
        const currentlyEliminated = Boolean(myTeam?.isEliminated);
        isEliminatedRef.current = currentlyEliminated;
        if (myTeam?.score !== undefined) {
          setSession({ score: myTeam.score });
        }
        setIsEliminated(currentlyEliminated);

        if (gs.activeMiniGame) {
          router.push(`/play/mini-game?game=${gs.activeMiniGame}`);
          return;
        }

        if (gs.scoreboardVisible && gs.teams) {
          const sorted = Object.values(gs.teams)
            .sort((a: any, b: any) => Number(b.score || 0) - Number(a.score || 0))
            .map((team: any) => ({
              teamId: Number(team.teamId),
              teamName: String(team.teamName || ''),
              score: Number(team.score || 0),
            }));
          setScoreboard(sorted);
          setPhase('scoreboard');
          setTimerRunning(false);
          return;
        }

        // Same as venue: `currentRound` may be absent on payload — derive from `rounds[index]`.
        if (gs.state === 'ROUND_INTRO') {
          const idx = Number(gs.currentRoundIndex ?? 0);
          const round =
            gs.currentRound ??
            (Array.isArray(gs.rounds) && idx >= 0 && idx < gs.rounds.length
              ? gs.rounds[idx]
              : null);
          if (round) {
            setRoundInfo({
              round,
              roundIndex: idx,
              totalRounds: gs.rounds?.length ?? gs.totalRounds ?? 0,
            });
            setPhase('round_intro');
            setTimerRunning(false);
          } else {
            if (phaseRef.current === 'break') setBreakRemaining(0);
            setPhase(currentlyEliminated ? 'eliminated' : 'waiting');
            setTimerRunning(false);
          }
          return;
        }

        if (gs.state === 'QUESTION') {
          if (!gs.currentQuestion) {
            // After break, server can emit QUESTION before currentQuestion is attached — leave break UI.
            setBreakRemaining(0);
            setTimerRunning(false);
            if (currentlyEliminated) {
              setPhase('eliminated');
            } else {
              setPhase('waiting');
            }
            return;
          }
          setQuestion(gs.currentQuestion);
          setTimerDuration(Number(gs.currentQuestion.timerDuration ?? 30) || 30);
          const coerced = coercePlayerTimerFromServer(
            gs.timerRemaining,
            gs.timerEndsAt ?? gs.currentQuestion.timerEndsAt,
          );
          setTimerEndsAt(coerced.endsAt);
          setTimerRemaining(coerced.remaining);
          const running = Boolean(gs.timerRunning);
          setTimerRunning(running);
          const td = Number(gs.currentQuestion.timerDuration ?? 30) || 30;
          const tr = coerced.remaining;
          const isMusicRound = (gs.currentQuestion.roundType || '').toUpperCase() === 'MUSIC';
          if (isMusicRound) {
            setMusicVenuePlaybackStarted(running || (tr > 0 && tr < td));
          } else {
            setMusicVenuePlaybackStarted(false);
          }
          // Only clear reveal state when the question is still ACTIVE (new question).
          // When REVEALED, the server follows up with `answer_reveal` carrying the full
          // reveal payload — preserve existing revealData/pointsGained so the correct/wrong
          // answer message stays visible across page refreshes without a flash.
          if (gs.questionState !== 'REVEALED') {
            setRevealData(null);
            setPointsGained(null);
          }

          const lockedWagerAmount = gs.currentQuestion.lockedWagerAmount;
          const hasLockedWager = lockedWagerAmount !== null && lockedWagerAmount !== undefined;
          if (
            gs.currentQuestion.roundType === 'WAGER' ||
            gs.currentQuestion.roundType === 'FINAL_WAGER'
          ) {
            if (hasLockedWager) {
              setWagerAmount(Number(lockedWagerAmount));
              setWagerSubmitted(true);
              if (session.pin && session.teamId != null) {
                clearWagerDraft(session.pin, Number(session.teamId));
              }
            } else {
              setWagerAmount(initialWagerAmountForRoundType(gs.currentQuestion.roundType));
              setWagerSubmitted(false);
            }
          } else {
            setWagerSubmitted(false);
            setWagerAmount(0);
          }

          const qid = gs.currentQuestion?.question?.id;
          const qidStr = qid != null ? String(qid) : null;
          const hasMineKey =
            gs != null &&
            typeof gs === 'object' &&
            Object.prototype.hasOwnProperty.call(gs, 'mySubmittedOptionIndex');

          let restoredIdx: number | number[] | null = null;
          if (hasMineKey) {
            restoredIdx = parseSubmittedIdxFromMineRaw(gs.mySubmittedOptionIndex);
            if (qidStr) {
              answerRestoreRef.current = { qid: qidStr, idx: restoredIdx };
            }
            if (qidStr && session.pin && session.teamId != null && hasSelectionIdx(restoredIdx)) {
              clearAnswerDraft(session.pin, Number(session.teamId), qidStr);
              answerDraftResubmitGuardRef.current.delete(qidStr);
            }
          } else if (qidStr && answerRestoreRef.current.qid === qidStr) {
            restoredIdx = answerRestoreRef.current.idx;
          }

          if (
            !hasSelectionIdx(restoredIdx) &&
            gs.questionState === 'ACTIVE' &&
            qidStr &&
            session.pin &&
            session.teamId != null
          ) {
            const draft = readAnswerDraft(session.pin, Number(session.teamId), qidStr);
            if (draft && hasSelectionIdx(draft.selectedOptionIndex)) {
              const d = draft.selectedOptionIndex;
              restoredIdx = d;
              answerRestoreRef.current = { qid: qidStr, idx: restoredIdx };
              const rt = (gs.currentQuestion.roundType || '').toUpperCase();
              const wa =
                rt === 'WAGER' || rt === 'FINAL_WAGER'
                  ? hasLockedWager
                    ? Number(lockedWagerAmount)
                    : draft.wagerAmount
                  : undefined;
              if (!answerDraftResubmitGuardRef.current.has(qidStr)) {
                answerDraftResubmitGuardRef.current.add(qidStr);
                window.requestAnimationFrame(() => {
                  socket.emit('submit_answer', {
                    selectedOptionIndex: d,
                    wagerAmount: wa,
                  });
                });
              }
            }
          }

          if (currentlyEliminated) {
            setSelectedOption(null);
            setPhase('eliminated');
          } else if (gs.questionState === 'ACTIVE') {
            const isWagerQuestion =
              gs.currentQuestion.roundType === 'WAGER' ||
              gs.currentQuestion.roundType === 'FINAL_WAGER';
            if (isWagerQuestion && !hasLockedWager) {
              setSelectedOption(null);
              setPhase('wager_input');
            } else if (hasSelectionIdx(restoredIdx)) {
              setSelectedOption(restoredIdx);
              setPhase('answered');
            } else {
              setSelectedOption(null);
              setPhase('question');
            }
          } else if (gs.questionState === 'REVEALED') {
            // Break end or page refresh can restore directly into a revealed question.
            // Restore the submitted selection if available; otherwise the reveal screen would
            // incorrectly fall back to the generic no-answer state after a refresh.
            setSelectedOption(hasSelectionIdx(restoredIdx) ? restoredIdx : null);
            setPhase(currentlyEliminated ? 'eliminated' : 'reveal');
          } else {
            setSelectedOption(null);
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
          setTimerRunning(false);
          return;
        }

        if (gs.state === 'WAGER_COLLECTION') {
          setQuestion(null);
          setTimerEndsAt(null);
          setTimerRemaining(0);
          setTimerRunning(false);
          setMusicVenuePlaybackStarted(false);
          setSelectedOption(null);
          answerRestoreRef.current = { qid: null, idx: null };
          setRevealData(null);
          setPointsGained(null);
          const wagerRoundIdx = Number(gs.currentRoundIndex ?? 0);
          const roundMeta =
            gs.currentRound ??
            (Array.isArray(gs.rounds) && wagerRoundIdx >= 0 && wagerRoundIdx < gs.rounds.length
              ? gs.rounds[wagerRoundIdx]
              : null);
          const wagerRoundType = roundMeta?.type ?? gs.rounds?.[wagerRoundIdx]?.type;
          const roundId = roundMeta?.id;
          const fromRoundWagers =
            session.teamId != null &&
            roundId != null &&
            gs.roundWagers?.[String(roundId)]?.[String(session.teamId)];
          const lockedRaw =
            gs.lockedWagerAmount !== undefined && gs.lockedWagerAmount !== null
              ? gs.lockedWagerAmount
              : fromRoundWagers;
          const hasLockedWager =
            lockedRaw !== null && lockedRaw !== undefined && Number.isFinite(Number(lockedRaw));
          if (hasLockedWager) {
            setWagerAmount(Number(lockedRaw));
            setWagerSubmitted(true);
            if (session.pin && session.teamId != null) {
              clearWagerDraft(session.pin, Number(session.teamId));
            }
          } else {
            setWagerSubmitted(false);
            let nextAmount = initialWagerAmountForRoundType(wagerRoundType);
            let wagerDraftMeta: { amount: number | null; pendingLock: boolean } = {
              amount: null,
              pendingLock: false,
            };
            if (session.pin && session.teamId != null && roundId != null) {
              wagerDraftMeta = readWagerDraft(session.pin, Number(session.teamId), roundId);
              const d = wagerDraftMeta.amount;
              if (d != null && isValidWagerDraftAmount(wagerRoundType, d)) {
                nextAmount = d;
              }
            }
            setWagerAmount(nextAmount);
            const dAmt = wagerDraftMeta.amount;
            if (
              wagerDraftMeta.pendingLock &&
              dAmt != null &&
              isValidWagerDraftAmount(wagerRoundType, dAmt) &&
              socket &&
              roundId != null
            ) {
              const rk = String(roundId);
              if (!wagerLockResubmitGuardRef.current.has(rk)) {
                wagerLockResubmitGuardRef.current.add(rk);
                setWagerSubmitted(true);
                window.requestAnimationFrame(() => {
                  socket.emit('submit_wager', { amount: dAmt });
                });
              }
            }
          }
          // Room `session_state` often omits top-level `currentRound` (only `rounds` + index).
          // Without `roundInfo.round.id` the draft effect never runs, so a refresh loses the grid selection.
          if (roundMeta?.type) {
            setRoundInfo({
              round: roundMeta,
              roundIndex: wagerRoundIdx,
              totalRounds: Number(gs.totalRounds ?? gs.rounds?.length ?? 0),
            });
          }

          if (currentlyEliminated) {
            setPhase('eliminated');
          } else {
            setPhase('wager_input');
          }
          return;
        }

        if (gs.state === 'BREAK') {
          const w = resolveBreakWallClock({
            breakEndsAt: gs.breakEndsAt,
            breakRemaining: gs.breakRemaining,
            breakDuration: gs.breakDuration,
            serverNow: gs.serverNow,
          });
          setBreakDuration(w.duration);
          setBreakSkewMs(w.skewMs);
          setBreakEndsAtMs(w.endsAt);
          setBreakRemaining(w.remaining);
          setTimerRunning(false);
          setPhase('break');
        } else if (gs.state === 'FINAL_RESULTS') {
          setTimerRunning(false);
          setPhase('game_end');
        } else if (gs.state === 'LOBBY') {
          setTimerRunning(false);
          setPhase('waiting');
        } else if (phaseRef.current === 'break' && gs.state !== 'BREAK') {
          // Host ended break but no branch above matched — stop break countdown UI.
          setBreakRemaining(0);
          setTimerRunning(false);
          setPhase(currentlyEliminated ? 'eliminated' : 'waiting');
        }
      }
    };

    const onRoundIntro = (data: any) => {
      setHasInitialState(true);
      setRoundInfo(data);
      setPhase('round_intro');
      isEliminatedRef.current = false;
      setIsEliminated(false);
      setQuestion(null);
      setTimerEndsAt(null);
      setTimerRemaining(0);
      setSelectedOption(null);
      setRevealData(null);
      setWagerSubmitted(false);
      setWagerAmount(0);
      setTimerRunning(false);
      setMusicVenuePlaybackStarted(false);
      answerRestoreRef.current = { qid: null, idx: null };
      answerDraftResubmitGuardRef.current.clear();
      wagerLockResubmitGuardRef.current.clear();
      if (session.pin && session.teamId != null) {
        clearWagerDraft(session.pin, Number(session.teamId));
        clearAnswerDraftsForTeam(session.pin, Number(session.teamId));
      }
    };

    const onWagerCollectionStart = (data: any) => {
      if (data) setRoundInfo(data);
      setQuestion(null);
      setTimerEndsAt(null);
      setTimerRemaining(0);
      setSelectedOption(null);
      setRevealData(null);
      answerRestoreRef.current = { qid: null, idx: null };
      answerDraftResubmitGuardRef.current.clear();
      // Do not reset wagerAmount / wagerSubmitted here: `session_state` (emitted right after this on
      // the server) carries Redis `roundWagers` + join replays `lockedWagerAmount`. Socket.io
      // connection recovery can deliver this event *after* a refresh `session_state`, which
      // would wipe a legitimately locked wager if we zeroed state here.
      setPhase('wager_input');
      setTimerRunning(false);
      setMusicVenuePlaybackStarted(false);
    };

    const onQuestionActive = (data: QuestionData) => {
      setHasInitialState(true);
      const teamId = session.teamId != null ? Number(session.teamId) : NaN;
      const onEliminatedList =
        Number.isFinite(teamId) &&
        Array.isArray(data.eliminatedTeamIds) &&
        data.eliminatedTeamIds.map(Number).includes(teamId);
      if (onEliminatedList) {
        isEliminatedRef.current = true;
        setIsEliminated(true);
      }
      const dead = isEliminatedRef.current;

      const prevQid = questionRef.current?.question?.id;
      const nextQid = data.question?.id;
      const sameQuestion =
        prevQid != null && nextQid != null && Number(prevQid) === Number(nextQid);

      if (!sameQuestion) {
        setRevealData(null);
        setPointsGained(null);
      }

      setQuestion(data);
      setTimerDuration(data.timerDuration);
      const coerced = coercePlayerTimerFromServer(
        data.timerRemaining ?? data.timerDuration,
        data.timerEndsAt,
      );
      setTimerEndsAt(coerced.endsAt);
      setTimerRemaining(coerced.remaining);
      const running = Boolean(data.timerRunning);
      setTimerRunning(running);
      const td = Number(data.timerDuration ?? 30) || 30;
      const tr = coerced.remaining;
      const isMusicRound = (data.roundType || '').toUpperCase() === 'MUSIC';
      if (isMusicRound) {
        setMusicVenuePlaybackStarted(running || (tr > 0 && tr < td));
      } else {
        setMusicVenuePlaybackStarted(false);
      }

      const nextQidStr = nextQid != null ? String(nextQid) : null;
      const hasMineKey =
        data != null &&
        typeof data === 'object' &&
        Object.prototype.hasOwnProperty.call(data, 'mySubmittedOptionIndex');

      let restored: number | number[] | null = null;
      if (hasMineKey) {
        restored = parseSubmittedIdxFromMineRaw(data.mySubmittedOptionIndex);
        if (nextQidStr) {
          answerRestoreRef.current = { qid: nextQidStr, idx: restored };
        }
      } else if (nextQidStr && answerRestoreRef.current.qid === nextQidStr) {
        restored = answerRestoreRef.current.idx;
      }

      setSelectedOption(dead ? null : restored);

      if (dead) {
        setPhase('eliminated');
        return;
      }
      setPhase(hasSelectionIdx(restored) ? 'answered' : 'question');
    };

    const onTimerUpdate = (data: {
      remaining: number;
      timerEndsAt?: number | null;
      timerRunning?: boolean;
      paused?: boolean;
    }) => {
      if (typeof data.timerRunning === 'boolean') {
        setTimerRunning(data.timerRunning);
        if (data.timerRunning && (questionRef.current?.roundType || '').toUpperCase() === 'MUSIC') {
          setMusicVenuePlaybackStarted(true);
        }
      } else if (data.paused === true) {
        setTimerRunning(false);
      } else if (data.paused === false) {
        setTimerRunning(true);
        if ((questionRef.current?.roundType || '').toUpperCase() === 'MUSIC') {
          setMusicVenuePlaybackStarted(true);
        }
      }
      const coerced = coercePlayerTimerFromServer(data.remaining, data.timerEndsAt);
      setTimerEndsAt(coerced.endsAt);
      setTimerRemaining(coerced.remaining);
      if (coerced.remaining <= 0) setTimerRunning(false);
    };
    const onTimerExpired = () => {
      setTimerEndsAt(null);
      setTimerRemaining(0);
      setTimerRunning(false);
    };

    const onAnswerReveal = (data: RevealData) => {
      setHasInitialState(true);
      setRevealData(data);
      setTimerRunning(false);
      // If the player is already eliminated coming into this reveal (e.g. they got knocked out
      // on an earlier elimination question and are just resyncing on a refresh), keep them on
      // the "eliminated" UI instead of flashing the live reveal screen. The
      // `data.eliminations` array only carries this question's knockouts, so by itself it
      // can't tell us about prior rounds.
      const myTeam = data.teams.find((t) => sameTeamId(t.teamId, session.teamId));
      const persistEliminated = isEliminatedRef.current || Boolean(myTeam?.isEliminated);
      setPhase(persistEliminated ? 'eliminated' : 'reveal');
      const myResponse = data.responseDetails?.find((r) => sameTeamId(r.teamId, session.teamId));
      let finalSel: number | number[] | null = null;
      if (myResponse && Array.isArray(myResponse.selectedOptionIndex)) {
        finalSel =
          myResponse.selectedOptionIndex.length > 0 ? myResponse.selectedOptionIndex : null;
      } else if (myResponse && Number.isFinite(Number(myResponse.selectedOptionIndex))) {
        const selectedIdx = Number(myResponse.selectedOptionIndex);
        finalSel = selectedIdx >= 0 ? selectedIdx : null;
      }
      setSelectedOption(finalSel);

      const qidReveal = questionRef.current?.question?.id;
      if (qidReveal != null && session.pin && session.teamId != null) {
        const qs = String(qidReveal);
        if (hasSelectionIdx(finalSel)) {
          answerRestoreRef.current = { qid: qs, idx: finalSel };
        }
        clearAnswerDraft(session.pin, Number(session.teamId), qs);
      }
      const sid = session.teamId != null ? Number(session.teamId) : NaN;
      const teamIdStr = Number.isFinite(sid) ? String(sid) : '';

      let myScore = 0;
      if (teamIdStr && data.scores) {
        if (data.scores[teamIdStr] !== undefined) {
          myScore = data.scores[teamIdStr];
        } else if (Number.isFinite(sid) && data.scores[sid] !== undefined) {
          myScore = data.scores[sid];
        }
      }
      setPointsGained(myScore);
      if (myTeam) setSession({ score: myTeam.score });
      // Per the all-teams-wrong rule (`server/.../knockoutEngine.js`), nobody is knocked out
      // when every active team got the question wrong — the server already keeps them in
      // `activeTeamIds` and now also skips the PLAYER_ELIMINATED emit, but the eliminations
      // array on `answer_reveal` still carries the wrong-team list for telemetry. Honour
      // `allWrong` here so the last surviving player isn't bounced into the eliminated UI
      // when they answer alone and miss.
      if (!data.allWrong && data.eliminations?.some((id) => sameTeamId(id, session.teamId))) {
        isEliminatedRef.current = true;
        setIsEliminated(true);
        setPhase('eliminated');
      } else if (persistEliminated) {
        isEliminatedRef.current = true;
        setIsEliminated(true);
      }
    };

    const onPlayerEliminated = (data: { teamId: number }) => {
      if (sameTeamId(data.teamId, session.teamId)) {
        isEliminatedRef.current = true;
        setIsEliminated(true);
        setPhase('eliminated');
      }
    };

    const onScoreboard = (data: { teams: any[] }) => {
      setHasInitialState(true);
      if (phaseRef.current !== 'scoreboard') {
        previousPhaseBeforeScoreboardRef.current = phaseRef.current;
      }
      setScoreboard(data.teams);
      setPhase('scoreboard');
      setTimerRunning(false);
    };

    const onTeamUpdated = (data: { teamId: number; score: number }) => {
      if (!data || !Number.isFinite(Number(data.teamId))) return;
      const teamId = Number(data.teamId);
      const score = Number(data.score || 0);

      if (session.teamId && Number(session.teamId) === teamId) {
        setSession({ score });
      }

      setScoreboard((prev) =>
        prev.map((team) => (Number(team.teamId) === teamId ? { ...team, score } : team)),
      );
    };

    const onScoreboardHidden = () => {
      if (isEliminatedRef.current) {
        setPhase('eliminated');
        return;
      }
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
    };

    const onRoundEnd = () => {
      setTimerRunning(false);
    };

    const onBreakStart = (data: {
      duration?: number;
      breakDuration?: number;
      breakRemaining?: number;
      breakEndsAt?: number;
      serverNow?: number;
    }) => {
      setHasInitialState(true);
      const w = resolveBreakWallClock({
        breakEndsAt: data?.breakEndsAt,
        breakRemaining: data?.breakRemaining ?? data?.duration,
        breakDuration: data?.breakDuration ?? data?.duration,
        serverNow: data?.serverNow,
      });
      setBreakDuration(w.duration);
      setBreakSkewMs(w.skewMs);
      setBreakEndsAtMs(w.endsAt);
      setBreakRemaining(w.remaining);
      setTimerRunning(false);
      setPhase('break');
    };

    const onBreakEnd = () => {
      // Don't reload (unreliable when tab is throttled/backgrounded — break_end can be missed
      // entirely). Clear break locals; the follow-up `session_state` flips us out of break phase
      // even if this event is dropped.
      setBreakRemaining(0);
      setBreakEndsAtMs(null);
      setBreakSkewMs(0);
      setShowBreakEndedNotice(true);
      window.setTimeout(() => setShowBreakEndedNotice(false), 2000);
      if (phaseRef.current === 'break') {
        setTimerRunning(false);
        if (isEliminatedRef.current) {
          setPhase('eliminated');
        } else if (revealDataRef.current && questionRef.current) {
          setPhase('reveal');
        } else if (questionRef.current) {
          setPhase('question');
        } else {
          setPhase('waiting');
        }
      }
    };

    const onMiniGameStart = (data: { game: string }) => {
      router.push(`/play/mini-game?game=${data.game}`);
    };

    const onGameEnd = (data?: {
      teams?: { teamId: number; teamName: string; score: number }[];
    }) => {
      setTimerRunning(false);
      if (session.pin && session.teamId != null) {
        clearWagerDraft(session.pin, Number(session.teamId));
        clearAnswerDraftsForTeam(session.pin, Number(session.teamId));
      }
      answerDraftResubmitGuardRef.current.clear();
      if (data?.teams) {
        setScoreboard(data.teams);
        const myTeam = data.teams.find((t) => sameTeamId(t.teamId, session.teamId));
        if (myTeam) setSession({ score: myTeam.score });
      }
      clearSession();
      router.replace('/play/join');
    };

    // Re-emit join_session on socket (re)connect so server replays a fresh session_state — this
    // is the safety net for long disconnects (mobile screen lock, tab throttling) where transient
    // events like break_end / question_active were missed during the gap.
    const rejoinSession = () => {
      if (session.pin && session.teamName) {
        socket.emit('join_session', { pin: session.pin, teamName: session.teamName });
      }
    };
    socket.on('connect', rejoinSession);

    socket.on('session_state', onSessionState);
    socket.on('round_intro', onRoundIntro);
    socket.on('wager_collection_start', onWagerCollectionStart);
    socket.on('question_active', onQuestionActive);
    socket.on('timer_update', onTimerUpdate);
    socket.on('timer_expired', onTimerExpired);
    socket.on('answer_reveal', onAnswerReveal);
    socket.on('player_eliminated', onPlayerEliminated);
    socket.on('scoreboard', onScoreboard);
    socket.on('team_updated', onTeamUpdated);
    socket.on('scoreboard_hidden', onScoreboardHidden);
    socket.on('round_end', onRoundEnd);
    socket.on('break_start', onBreakStart);
    socket.on('break_end', onBreakEnd);
    socket.on('mini_game_start', onMiniGameStart);
    socket.on('game_end', onGameEnd);

    return () => {
      socket.off('connect', rejoinSession);
      socket.off('session_state', onSessionState);
      socket.off('round_intro', onRoundIntro);
      socket.off('wager_collection_start', onWagerCollectionStart);
      socket.off('question_active', onQuestionActive);
      socket.off('timer_update', onTimerUpdate);
      socket.off('timer_expired', onTimerExpired);
      socket.off('answer_reveal', onAnswerReveal);
      socket.off('player_eliminated', onPlayerEliminated);
      socket.off('scoreboard', onScoreboard);
      socket.off('team_updated', onTeamUpdated);
      socket.off('scoreboard_hidden', onScoreboardHidden);
      socket.off('round_end', onRoundEnd);
      socket.off('break_start', onBreakStart);
      socket.off('break_end', onBreakEnd);
      socket.off('mini_game_start', onMiniGameStart);
      socket.off('game_end', onGameEnd);
    };
  }, [socket, session.pin, session.teamName, session.teamId, router, setSession, clearSession]);

  // Declared after the listener effect so `session_state` from this emit is never missed.
  // Join → /play/game reuses an already-connected socket, so `connect` does not fire again.
  useEffect(() => {
    if (!socket || !session.pin || !session.teamName) return;
    socket.emit('join_session', { pin: session.pin, teamName: session.teamName });
  }, [socket, session.pin, session.teamName]);

  const handleSelectOption = useCallback(
    (index: number) => {
      if (selectedOption !== null || !socket || isEliminatedRef.current || timerRemaining <= 0)
        return;
      setSelectedOption(index);
      setPhase('answered');
      const rt = (question?.roundType || '').toUpperCase();
      const isWagerQuestion = rt === 'WAGER' || rt === 'FINAL_WAGER';
      if (session.pin && session.teamId != null && question?.question?.id != null) {
        const qis = String(question.question.id);
        writeAnswerDraft(session.pin, Number(session.teamId), qis, {
          selectedOptionIndex: index,
          wagerAmount: isWagerQuestion ? wagerAmount : undefined,
        });
        answerRestoreRef.current = { qid: qis, idx: index };
      }
      socket.emit('submit_answer', {
        selectedOptionIndex: index,
        // Always send the amount the player sees for wager rounds so the server can persist it
        // if submit_answer is processed before submit_wager finishes writing Redis (race → +0).
        wagerAmount: isWagerQuestion ? wagerAmount : wagerSubmitted ? wagerAmount : undefined,
      });
    },
    [
      selectedOption,
      socket,
      timerRemaining,
      wagerAmount,
      wagerSubmitted,
      question?.roundType,
      question?.question?.id,
      session.pin,
      session.teamId,
    ],
  );

  const handleLockOrdering = useCallback(() => {
    if (selectedOption !== null || !socket || isEliminatedRef.current || timerRemaining <= 0)
      return;
    setSelectedOption(orderingSelection);
    setPhase('answered');
    const rt = (question?.roundType || '').toUpperCase();
    const isWagerQuestion = rt === 'WAGER' || rt === 'FINAL_WAGER';
    if (session.pin && session.teamId != null && question?.question?.id != null) {
      const qis = String(question.question.id);
      writeAnswerDraft(session.pin, Number(session.teamId), qis, {
        selectedOptionIndex: orderingSelection,
        wagerAmount: isWagerQuestion ? wagerAmount : undefined,
      });
      answerRestoreRef.current = { qid: qis, idx: orderingSelection };
    }
    socket.emit('submit_answer', {
      selectedOptionIndex: orderingSelection,
      wagerAmount: isWagerQuestion ? wagerAmount : wagerSubmitted ? wagerAmount : undefined,
    });
  }, [
    selectedOption,
    socket,
    timerRemaining,
    wagerAmount,
    wagerSubmitted,
    orderingSelection,
    question?.roundType,
    question?.question?.id,
    session.pin,
    session.teamId,
  ]);

  const handleSubmitWager = () => {
    if (!socket) return;
    const pin = session.pin;
    const tid = session.teamId;
    const rid = roundInfo?.round?.id;
    const rt = roundInfo?.round?.type;
    // Keep a sessionStorage draft until `session_state` shows the server-side lock. Clearing
    // here used to wipe the only copy of the chosen amount on refresh if `submit_wager` was
    // slow, failed, or the tab reloaded before Redis was read back on rejoin.
    if (pin && tid != null && rid != null && isValidWagerDraftAmount(rt, wagerAmount)) {
      writeWagerDraft(pin, Number(tid), rid, wagerAmount, { pendingLock: true });
    }
    socket.emit('submit_wager', { amount: wagerAmount });
    setWagerSubmitted(true);
    // Only advance to question phase if the question is already active.
    // During WAGER_COLLECTION, stay on wager_input — the question_active event
    // will move the player to question phase when the host starts the round.
    if (question) {
      setPhase('question');
    }
  };

  useEffect(() => {
    if (phase !== 'wager_input' || wagerSubmitted) return;
    const pin = session.pin;
    const tid = session.teamId;
    const rid = roundInfo?.round?.id;
    const rt = roundInfo?.round?.type;
    if (!pin || tid == null || rid == null) return;
    if (!isValidWagerDraftAmount(rt, wagerAmount)) return;
    writeWagerDraft(pin, Number(tid), rid, wagerAmount, { pendingLock: false });
  }, [
    phase,
    wagerSubmitted,
    session.pin,
    session.teamId,
    roundInfo?.round?.id,
    roundInfo?.round?.type,
    wagerAmount,
  ]);

  const isFinalWagerRound =
    (question?.roundType || roundInfo?.round?.type || '').toUpperCase() === 'FINAL_WAGER';
  const lockedWagerLabel = isFinalWagerRound ? `${wagerAmount}%` : `${wagerAmount} pts`;
  const wagerChoiceValues = isFinalWagerRound ? FINAL_WAGER_PERCENT_OPTIONS : WAGER_POINT_OPTIONS;

  useEffect(() => {
    if (phase !== 'wager_input' || wagerSubmitted) return;
    const rt = (roundInfo?.round?.type || '').toUpperCase();
    if (rt === 'FINAL_WAGER') {
      if (
        !FINAL_WAGER_PERCENT_OPTIONS.includes(
          wagerAmount as (typeof FINAL_WAGER_PERCENT_OPTIONS)[number],
        )
      ) {
        setWagerAmount(FINAL_WAGER_PERCENT_OPTIONS[0]);
      }
      return;
    }
    if (rt === 'WAGER') {
      if (!WAGER_POINT_OPTIONS.includes(wagerAmount as (typeof WAGER_POINT_OPTIONS)[number])) {
        setWagerAmount(0);
      }
    }
  }, [phase, wagerSubmitted, roundInfo?.round?.type, wagerAmount]);

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
  const isMusicQuestion = (question?.roundType || '').toUpperCase() === 'MUSIC';
  const isAnswerSelectionLocked =
    selectedOption !== null ||
    isEliminatedRef.current ||
    isEliminated ||
    timerRemaining <= 0 ||
    phase !== 'question' ||
    // Music rounds pause the timer until the host hits Start Timer / plays the audio. Players
    // must not be able to lock in an answer before that countdown begins, otherwise they could
    // pre-pick before hearing the song clip.
    (isMusicQuestion && !timerRunning);
  const showTimeExpiredState =
    timerRemaining <= 0 &&
    (phase === 'question' || phase === 'answered') &&
    selectedOption === null;

  const questionMusicBanner: 'none' | 'waiting' | 'playing' = (() => {
    if (!question || (question.roundType || '').toUpperCase() !== 'MUSIC') return 'none';
    if (phase !== 'question' && phase !== 'answered') return 'none';
    // Once the answer is on its way / revealed, never show "Waiting for host to play music" —
    // even if the player UI hasn't transitioned to the reveal phase yet (race between
    // answer_reveal arrival and phase state update).
    if (revealData) return 'none';
    if (timerRunning) return 'playing';
    if (musicVenuePlaybackStarted && timerRemaining > 0) return 'playing';
    if (timerRemaining > 0) return 'waiting';
    return 'none';
  })();

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
                className="flex flex-1 items-center justify-center p-3 sm:p-4 md:p-6"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  className="relative w-full max-w-[min(26rem,92vw)] md:max-w-[34rem] lg:max-w-[38rem]"
                >
                  <img src="/Venue Round Intro.png" alt="Round intro" className="w-full h-auto" />

                  <div className="pointer-events-none absolute inset-0">
                    {/* Solid fill masks baked-in "ROUND N" text inside round intro.png so only live data shows */}
                    <div className="absolute left-1/2 top-[22%] flex h-[40%] w-[58%] -translate-x-1/2 flex-col items-center justify-center rounded-full px-2 text-center sm:px-3">
                      <p className="relative z-10 bg-linear-to-b from-[#FFFFFF] to-[#FFC870] bg-clip-text text-[clamp(1.65rem,5.2vw,2.65rem)] font-extrabold leading-[0.95] text-transparent md:text-[clamp(2rem,4vw,2.85rem)]">
                        ROUND {(roundInfo.roundIndex || 0) + 1}
                      </p>
                      <p className="relative z-10 mt-1 max-w-[92%] text-[clamp(0.95rem,3.2vw,1.35rem)] font-bold leading-[1.15] text-[#00d8ff] sm:max-w-[90%] sm:text-lg md:text-xl">
                        {normalizeRoundIntroTitle(
                          roundInfo.round?.name,
                          roundInfo.round?.type,
                          roundInfo.roundIndex,
                        )}
                      </p>
                    </div>

                    <div className="absolute left-1/2 top-[76%] flex w-[calc(100%-1.25rem)] max-w-xl -translate-x-1/2 flex-col items-center gap-2 px-2 sm:top-[76%] sm:w-[min(92%,36rem)] sm:gap-2.5 sm:px-3 md:max-w-2xl md:px-4">
                      <div className="flex w-full justify-center">
                        <div className="inline-flex max-w-full min-w-0 items-center gap-1.5 sm:gap-2">
                          <img
                            src="/plus10.png"
                            alt=""
                            className="h-6 w-6 shrink-0 sm:h-7 sm:w-7 md:h-8 md:w-8"
                          />
                          <span className="min-w-0 max-w-[min(100%,22rem)] text-left text-pretty text-[clamp(0.8rem,2.8vw+0.4rem,1.35rem)] font-bold leading-snug text-[#55f30c] wrap-anywhere sm:max-w-[min(100%,26rem)] sm:text-[clamp(0.85rem,1.9vw+0.35rem,1.5rem)] md:text-lg md:leading-tight lg:text-xl">
                            {getRoundScoringLines(roundInfo.round?.type).positive}
                          </span>
                        </div>
                      </div>
                      <div className="flex w-full justify-center">
                        <div className="inline-flex max-w-full min-w-0 items-center gap-1.5 sm:gap-2">
                          <img
                            src="/minus2.png"
                            alt=""
                            className="h-6 w-6 shrink-0 sm:h-7 sm:w-7 md:h-8 md:w-8"
                          />
                          <span className="min-w-0 max-w-[min(100%,22rem)] text-left text-pretty text-[clamp(0.8rem,2.8vw+0.4rem,1.35rem)] font-bold leading-snug text-[#ff0037] wrap-anywhere sm:max-w-[min(100%,26rem)] sm:text-[clamp(0.85rem,1.9vw+0.35rem,1.5rem)] md:text-lg md:leading-tight lg:text-xl">
                            {getRoundScoringLines(roundInfo.round?.type).negative}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}

            {/* ── WAITING ── */}
            {phase === 'waiting' && hasInitialState && (
              <motion.div
                key="waiting"
                {...pageTransition}
                className="flex-1 relative overflow-hidden mobile-play-bg"
              >
                <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_22%_16%,rgba(145,105,255,0.36)_0_4px,transparent_4px)] [background-size:110px_110px]" />
                <div className="absolute bottom-0 left-1/2 h-42.5 w-[min(92vw,280px)] -translate-x-1/2 opacity-55 bg-[radial-gradient(circle,rgba(0,229,255,0.26)_0_2px,transparent_2px)] [background-size:14px_14px] md:w-[min(92vw,360px)]" />

                <div className="relative z-10 flex h-full items-center justify-center p-3 sm:p-4 md:p-6">
                  <div className="w-full max-w-sm border-2 border-[#00d8ff] bg-[linear-gradient(180deg,rgba(45,13,121,0.72)_0%,rgba(15,8,66,0.82)_100%)] px-5 py-7 text-center shadow-[0_0_26px_rgba(0,216,255,0.24)] sm:max-w-md sm:px-6 sm:py-8 md:max-w-lg">
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#00d8ff] bg-[rgba(5,14,34,0.75)] shadow-[0_0_18px_rgba(0,216,255,0.35)] sm:mb-6 sm:h-20 sm:w-20 md:h-[5.25rem] md:w-[5.25rem]">
                      <svg
                        className="h-10 w-10 sm:h-11 sm:w-11 md:h-12 md:w-12"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
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

                    <h2 className="text-[clamp(2rem,7vw,3.4rem)] font-extrabold leading-[0.95] text-white sm:text-[clamp(2.25rem,5.5vw,3.5rem)] md:text-6xl">
                      Waiting for game
                      <br />
                      to start
                    </h2>
                    <p className="mt-3 text-base leading-tight text-white/70 sm:text-lg md:text-xl">
                      The host will start the game shortly
                    </p>

                    <button
                      onClick={() => setShowExitConfirm(true)}
                      className="mt-5 text-base font-medium text-[#ff4f61] sm:text-lg"
                    >
                      Leave Game
                    </button>

                    <LoadingDots className="mt-3" gapClass="gap-2" />
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── CONNECTING ── While we wait for the first session_state after a refresh,
                show a neutral reconnecting splash instead of the LOBBY-flavoured "Waiting for
                game to start" text — that copy is reserved for the legitimate pre-game state. */}
            {phase === 'waiting' && !hasInitialState && (
              <motion.div
                key="connecting"
                {...pageTransition}
                className="flex-1 relative overflow-hidden mobile-play-bg"
              >
                <div className="relative z-10 flex h-full items-center justify-center p-4">
                  <div className="flex flex-col items-center gap-4 text-white/80">
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-[#00d8ff]" />
                    <p className="text-sm font-medium tracking-wide sm:text-base">Reconnecting…</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── WAGER INPUT ── */}
            {phase === 'wager_input' && (
              <motion.div
                key="wager"
                {...pageTransition}
                className="flex flex-1 flex-col items-center justify-center p-4 text-center sm:p-6 md:p-8"
              >
                <div className="w-full max-w-sm md:max-w-md">
                  <motion.h2
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xl font-bold mb-4 text-glow-cyan"
                  >
                    Place Your Wager
                  </motion.h2>
                  {/* Current Score Display */}
                  {/* <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="neon-border rounded-xl p-4 mb-6 bg-surface/80"
                  >
                    <p className="text-foreground/50 text-xs mb-1">Current Score</p>
                    <p className="text-3xl font-mono font-bold text-neon-cyan text-glow-cyan">
                      {session.score} pts
                    </p>
                  </motion.div> */}
                  {isFinalWagerRound ? (
                    <p className="text-foreground/40 text-sm mb-6">
                      Wager 0%–50% of your current score on the final question.
                    </p>
                  ) : (
                    <div className="mb-6 space-y-2 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-left text-sm leading-snug text-white/75 sm:text-center">
                      <p>
                        Choose a fixed wager: 0, 10, 20, 30, 40, or 50 points before the question is
                        revealed.
                      </p>
                      <p>
                        <span className="font-semibold text-neon-green/90">Correct</span> = gain
                        wagered amount.{' '}
                        <span className="font-semibold text-red-400/90">Incorrect</span> = lose
                        wagered amount.
                      </p>
                    </div>
                  )}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15 }}
                    className="neon-border rounded-xl p-4 mb-4 bg-surface/80 sm:p-6"
                  >
                    <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                      {wagerChoiceValues.map((val) => (
                        <button
                          key={val}
                          type="button"
                          disabled={wagerSubmitted}
                          onClick={() => setWagerAmount(val)}
                          className={cn(
                            'rounded-xl border-2 py-3.5 text-base font-black transition touch-manipulation sm:py-4 sm:text-lg',
                            wagerAmount === val
                              ? 'border-[#00d8ff] bg-[#00d8ff]/20 text-white shadow-[0_0_14px_rgba(0,216,255,0.35)]'
                              : 'border-white/20 bg-black/35 text-white/90 active:brightness-110',
                            wagerSubmitted && 'cursor-not-allowed',
                            wagerSubmitted && wagerAmount !== val && 'opacity-35',
                          )}
                        >
                          {isFinalWagerRound ? `${val}%` : val}
                        </button>
                      ))}
                    </div>
                    <p className="text-3xl font-mono font-bold text-neon-cyan text-glow-cyan mt-4 sm:text-4xl">
                      {isFinalWagerRound ? `${wagerAmount}%` : `${wagerAmount} pts`}
                    </p>
                  </motion.div>
                  <button
                    onClick={handleSubmitWager}
                    disabled={wagerSubmitted}
                    className={cn(
                      'w-full py-4 text-lg font-bold rounded-xl border transition-colors touch-manipulation',
                      wagerSubmitted
                        ? 'bg-green-500/20 text-green-400 border-green-500/50 cursor-not-allowed'
                        : 'bg-neon-cyan/20 text-neon-cyan border-neon-cyan/50 hover:bg-neon-cyan/30',
                    )}
                  >
                    {wagerSubmitted ? '✓ Wager Locked' : 'Lock Wager'}
                  </button>
                  {wagerSubmitted && (
                    <div className="mt-4 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm">
                      <p className="font-semibold text-green-300">
                        Wager locked in: {lockedWagerLabel}
                      </p>
                      <p className="mt-1 text-white/60">Waiting for host to start the round...</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── QUESTION / ANSWERED ── */}
            {(phase === 'question' || phase === 'answered') && question && (
              <motion.div
                key="question"
                {...pageTransition}
                className="mt-2 flex flex-1 flex-col px-3 pb-4 pt-2 sm:mt-4 sm:px-4 sm:pb-6 md:px-6"
              >
                {/* Header: Timer, Q Index, Score */}
                <div className="mb-4 flex items-center justify-between gap-2 px-0.5 sm:mb-5 sm:px-1">
                  <HeaderCapsule
                    icon="/Clock.png"
                    value={timerRemaining.toString().padStart(2, '0')}
                  />
                  <div className="flex flex-col items-center">
                    <span className="text-xl font-black text-white drop-shadow-lg sm:text-2xl md:text-3xl">
                      {(question.questionIndex || 0) + 1}/{question.totalQuestions}
                    </span>
                  </div>
                  <HeaderCapsule icon="/trophy.png" value={session.score} />
                </div>

                <div className="mb-3 sm:mb-4">
                  <h2 className="text-center text-[clamp(1rem,3.8vw,1.35rem)] font-black leading-snug text-white drop-shadow-md sm:text-lg md:text-xl">
                    {question.question.text}
                  </h2>
                </div>

                <div className="flex flex-col gap-3 sm:gap-4">
                  <QuestionMediaVisual question={question} musicBanner={questionMusicBanner} />

                  {/* Options - Single column vertical list */}
                  <motion.div
                    variants={staggerContainer}
                    initial="initial"
                    animate="animate"
                    className="mt-3 flex flex-col gap-3 sm:mt-4 sm:gap-4"
                  >
                    {(() => {
                      if (question.question.isOrdering) {
                        return (
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-center gap-2 mb-1 text-[#00e5ff] font-bold text-sm sm:text-base drop-shadow-[0_0_5px_rgba(0,229,255,0.5)]">
                              <span>↕</span>
                              <span>Drag tiles or use arrows to reorder</span>
                            </div>
                            {orderingSelection.map((optIdx, index) => {
                              const opt = question.question.options[optIdx];
                              if (!opt) return null;
                              const isLocked = isAnswerSelectionLocked;
                              return (
                                <div
                                  key={optIdx}
                                  className={cn(
                                    'flex min-h-14 w-full items-center justify-between rounded-xl px-4 py-3 text-white font-bold shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.2)] sm:min-h-16 sm:px-6 sm:py-4 md:min-h-[4.75rem]',
                                    OPTION_BG[optIdx] || 'bg-[#1565c0]',
                                    isLocked && 'opacity-60 grayscale-[0.3] cursor-not-allowed',
                                  )}
                                >
                                  <span className="text-left text-base font-black leading-tight drop-shadow-md sm:text-lg md:text-xl flex items-center gap-2">
                                    <span className="w-7 h-7 flex items-center justify-center bg-black/40 rounded-full text-sm shrink-0 shadow-inner">
                                      {index + 1}
                                    </span>
                                    {opt.text}
                                  </span>
                                  {!isLocked && (
                                    <div className="flex flex-col gap-1">
                                      <button
                                        className="bg-black/30 hover:bg-black/50 active:bg-white/20 rounded px-3 py-1.5 text-xs transition"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (index === 0) return;
                                          const newArr = [...orderingSelection];
                                          [newArr[index - 1], newArr[index]] = [
                                            newArr[index],
                                            newArr[index - 1],
                                          ];
                                          setOrderingSelection(newArr);
                                        }}
                                      >
                                        ▲
                                      </button>
                                      <button
                                        className="bg-black/30 hover:bg-black/50 active:bg-white/20 rounded px-3 py-1.5 text-xs transition"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (index === orderingSelection.length - 1) return;
                                          const newArr = [...orderingSelection];
                                          [newArr[index + 1], newArr[index]] = [
                                            newArr[index],
                                            newArr[index + 1],
                                          ];
                                          setOrderingSelection(newArr);
                                        }}
                                      >
                                        ▼
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {!isAnswerSelectionLocked && (
                              <button
                                onClick={handleLockOrdering}
                                className="mt-2 w-full py-3.5 rounded-xl bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/50 font-bold text-lg hover:bg-[#00e5ff]/30 transition-colors"
                              >
                                Lock Answer
                              </button>
                            )}
                          </div>
                        );
                      }

                      return question.question.options.map((opt, i) => {
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
                              'flex min-h-14 w-full items-center justify-start rounded-xl px-4 py-3 text-white font-bold shadow-[0_4px_10px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.2)] sm:min-h-16 sm:px-6 sm:py-4 md:min-h-[4.75rem]',
                              'touch-manipulation select-none transition-all',
                              OPTION_BG[i] || 'bg-[#1565c0]',
                              isSelected &&
                                'ring-4 ring-white shadow-[0_0_25px_rgba(255,255,255,0.5)]',
                              isLocked && !isSelected && 'opacity-60 grayscale-[0.3]',
                              isLocked && 'cursor-not-allowed',
                            )}
                          >
                            <span className="text-left text-base font-black leading-tight drop-shadow-md sm:text-lg md:text-xl">
                              {OPTION_LETTERS[i]}. {opt.text}
                            </span>
                          </motion.button>
                        );
                      });
                    })()}
                  </motion.div>
                </div>

                {showTimeExpiredState && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mt-6"
                  >
                    <p className="text-2xl font-black leading-none text-[#ff5252] drop-shadow-[0_0_10px_rgba(255,82,82,0.6)] sm:text-3xl md:text-4xl">
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
                    <p className="text-2xl font-black leading-none text-[#00D9FF] drop-shadow-[0_0_10px_rgba(255,255,255,0.4)] sm:text-3xl md:text-4xl">
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
                className="mt-2 flex flex-1 flex-col px-3 pb-4 pt-2 sm:mt-4 sm:px-4 sm:pb-6 md:px-6"
              >
                {/* Header: Timer, Q Index, Score */}
                <div className="mb-4 flex items-center justify-between gap-2 px-0.5 sm:mb-5 sm:px-1">
                  <HeaderCapsule icon="/Clock.png" value="00:00" />
                  <div className="flex flex-col items-center">
                    <span className="text-xl font-black text-white drop-shadow-lg sm:text-2xl md:text-3xl">
                      {(question.questionIndex || 0) + 1}/{question.totalQuestions}
                    </span>
                  </div>
                  <HeaderCapsule icon="/trophy.png" value={session.score} />
                </div>

                <div className="mb-3 sm:mb-4">
                  <h2 className="text-center text-[clamp(1rem,3.8vw,1.35rem)] font-black leading-snug text-white drop-shadow-md sm:text-lg md:text-xl">
                    {question.question.text}
                  </h2>
                </div>

                <div className="flex flex-col gap-3 sm:gap-4">
                  <QuestionMediaVisual question={question} musicBanner={questionMusicBanner} />

                  {/* Options - Single column vertical list */}
                  <motion.div
                    variants={staggerContainer}
                    initial="initial"
                    animate="animate"
                    className="mt-3 flex flex-col gap-3 sm:mt-4 sm:gap-4"
                  >
                    {(() => {
                      if (question.question.isOrdering) {
                        return (
                          <div className="flex flex-col gap-3">
                            <div className="mb-2 text-center">
                              <span className="inline-block px-4 py-2 rounded-lg bg-black/40 border border-green-500/50 text-green-400 font-bold text-sm sm:text-base md:text-lg uppercase tracking-wider shadow-inner">
                                Correct Order:{' '}
                                {(revealData.correctOrderArray || [])
                                  .map((idx: number) => question.question.options[idx]?.text)
                                  .join(' → ')}
                              </span>
                            </div>
                            {(() => {
                              const userArr =
                                Array.isArray(selectedOption) &&
                                selectedOption.length === question.question.options.length
                                  ? selectedOption
                                  : question.question.options.map((_, i) => i);
                              const correctArr =
                                revealData.correctOrderArray ||
                                question.question.options.map((_, i) => i);

                              return userArr.map((optIdx: number, userPos: number) => {
                                const opt = question.question.options[optIdx];
                                const expectedPos = correctArr.indexOf(optIdx);
                                const isCorrectPos = userPos === expectedPos;
                                return (
                                  <motion.div
                                    key={optIdx}
                                    variants={staggerItem}
                                    className={cn(
                                      'flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-white/20 px-4 py-3 text-white font-bold sm:min-h-16 sm:px-6 sm:py-4 md:min-h-[4.75rem]',
                                      'touch-manipulation select-none transition-all',
                                      OPTION_BG[optIdx] || 'bg-[#1565c0]',
                                    )}
                                  >
                                    <span className="min-w-0 flex-1 text-left text-base font-black leading-tight drop-shadow-md flex items-center gap-2 sm:text-lg md:text-xl">
                                      <span className="w-7 h-7 flex items-center justify-center bg-black/40 rounded-full text-sm shrink-0 shadow-inner">
                                        {userPos + 1}
                                      </span>
                                      {opt.text}
                                    </span>
                                    <span
                                      className={cn(
                                        'text-xs font-bold px-2 py-1.5 rounded-md bg-black/40 shadow-inner whitespace-nowrap',
                                        isCorrectPos ? 'text-[#39ff14]' : 'text-[#ff2525]',
                                      )}
                                    >
                                      Correct Pos: {expectedPos >= 0 ? expectedPos + 1 : '-'}
                                    </span>
                                  </motion.div>
                                );
                              });
                            })()}
                          </div>
                        );
                      }

                      return question.question.options.map((opt, i) => {
                        const isMajorityRulesRound =
                          (question.roundType || '').toUpperCase() === 'MAJORITY_RULES';
                        const majorityWinners = new Set(
                          (revealData.majorityOptionIndexes || [])
                            .map(Number)
                            .filter(Number.isFinite),
                        );
                        const isVoteWinner = majorityWinners.has(i);
                        const correctIdxNum = Number(revealData.correctOptionIndex);
                        const isCorrectOption =
                          Number.isFinite(correctIdxNum) &&
                          correctIdxNum >= 0 &&
                          i === correctIdxNum;
                        const selNum = Number(selectedOption);
                        const isSelectedOption =
                          selectedOption !== null &&
                          selectedOption !== undefined &&
                          Number.isFinite(selNum) &&
                          selNum === i;
                        const isSelectedWrong = isSelectedOption && !isCorrectOption;

                        // Majority Rules: "correct" is decided by votes, not the question's factual key.
                        const shouldDim = isMajorityRulesRound
                          ? !isVoteWinner && !isSelectedOption
                          : !isCorrectOption && !isSelectedWrong;

                        const userMajorityWin =
                          isMajorityRulesRound &&
                          isSelectedOption &&
                          selectedOption !== null &&
                          (pointsGained ?? 0) > 0;
                        const userMajorityLose =
                          isMajorityRulesRound &&
                          isSelectedOption &&
                          selectedOption !== null &&
                          (pointsGained ?? 0) <= 0;

                        const showCorrectTick = isMajorityRulesRound
                          ? isVoteWinner
                          : isCorrectOption;
                        const showWrongCross = isMajorityRulesRound
                          ? userMajorityLose && isSelectedOption
                          : isSelectedWrong;

                        return (
                          <motion.div
                            key={i}
                            variants={staggerItem}
                            className={cn(
                              'flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-white/20 px-4 py-3 text-white font-bold sm:min-h-16 sm:px-6 sm:py-4 md:min-h-[4.75rem]',
                              'touch-manipulation select-none transition-all',
                              OPTION_BG[i] || 'bg-[#1565c0]',
                              isMajorityRulesRound &&
                                isSelectedOption &&
                                'ring-2 ring-[#00e5ff] shadow-[0_0_8px_8px_rgba(0,229,255,0.65)]',
                              // Reveal-phase highlight rings: bright green halo for the
                              // correct option, bright red halo for the player's
                              // wrong pick. Mirrors the Figma reveal screen so the
                              // outcome is unmistakable on a phone.
                              showCorrectTick &&
                                'ring-2 ring-[#39ff14] shadow-[0_0_18px_4px_rgba(57,255,20,0.7)]',
                              showWrongCross &&
                                'ring-2 ring-[#ff2525] shadow-[0_0_18px_4px_rgba(255,37,37,0.7)]',
                              shouldDim && 'opacity-30 brightness-50 contrast-75 scale-[0.98]',
                            )}
                          >
                            <span className="min-w-0 flex-1 text-left text-base font-black leading-tight drop-shadow-md sm:text-lg md:text-xl">
                              {OPTION_LETTERS[i]}. {opt.text}
                            </span>
                            {showCorrectTick && <RevealOptionStatusIcon variant="correct" />}
                            {showWrongCross && <RevealOptionStatusIcon variant="wrong" />}
                          </motion.div>
                        );
                      });
                    })()}
                  </motion.div>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mt-8 text-center"
                >
                  {(() => {
                    const isMajorityRulesRound =
                      (question.roundType || '').toUpperCase() === 'MAJORITY_RULES';
                    const isOrdering = question.question.isOrdering;
                    const usesServerPtsLabel = revealUsesServerPointsLabel(question.roundType);
                    const usesFixedTenTwo = revealUsesFixedTenTwoLabel(
                      question.roundType,
                      isMajorityRulesRound,
                    );
                    const myRevealResponse = revealData.responseDetails?.find((r) =>
                      sameTeamId(r.teamId, session.teamId),
                    );
                    const hasRevealResponseForTeam = Boolean(myRevealResponse);
                    const submittedViaRevealDetails = Boolean(
                      myRevealResponse &&
                      (Array.isArray(myRevealResponse.selectedOptionIndex)
                        ? myRevealResponse.selectedOptionIndex.length > 0
                        : Number.isFinite(Number(myRevealResponse.selectedOptionIndex)) &&
                          Number(myRevealResponse.selectedOptionIndex) >= 0),
                    );
                    // Fallback for rare resync races where responseDetails can miss this team's row
                    // but local selected option is already restored and rendered.
                    const submittedViaLocalSelection =
                      !hasRevealResponseForTeam &&
                      (Array.isArray(selectedOption)
                        ? selectedOption.length > 0
                        : Number.isFinite(Number(selectedOption)) && Number(selectedOption) >= 0);
                    const didSubmitOnReveal =
                      submittedViaRevealDetails || submittedViaLocalSelection;
                    const selectedFromReveal = Array.isArray(myRevealResponse?.selectedOptionIndex)
                      ? null
                      : Number.isFinite(Number(myRevealResponse?.selectedOptionIndex))
                        ? Number(myRevealResponse?.selectedOptionIndex)
                        : null;
                    // Prefer what the player currently sees selected on UI; if absent, fall back
                    // to reveal payload details.
                    const selectedFromUi = Number.isFinite(Number(selectedOption))
                      ? Number(selectedOption)
                      : null;
                    // Authoritative submitted index lives on the server payload — local `selectedOption`
                    // can be stale after refresh/resync while scores/responseDetails are correct.
                    const resolvedSelectedOption =
                      selectedFromReveal !== null && selectedFromReveal !== undefined
                        ? selectedFromReveal
                        : selectedFromUi;
                    const correctIdxReveal = Number(revealData.correctOptionIndex);
                    const answeredCorrectly =
                      resolvedSelectedOption !== null &&
                      Number.isFinite(resolvedSelectedOption) &&
                      Number.isFinite(correctIdxReveal) &&
                      correctIdxReveal >= 0
                        ? Number(resolvedSelectedOption) === correctIdxReveal
                        : Number(pointsGained ?? 0) > 0;
                    const correctPointsDisplay = usesServerPtsLabel
                      ? Math.max(Number(pointsGained ?? 0), 0)
                      : usesFixedTenTwo && answeredCorrectly
                        ? REVEAL_FIXED_CORRECT_PTS
                        : Math.max(Number(pointsGained ?? 0), 0);
                    const incorrectPointsDisplay = usesServerPtsLabel
                      ? Number(pointsGained ?? 0)
                      : usesFixedTenTwo
                        ? REVEAL_FIXED_WRONG_PTS
                        : Number(pointsGained ?? 0);
                    if (isOrdering) {
                      const ordSel = Array.isArray(selectedOption)
                        ? selectedOption
                        : Array.isArray(myRevealResponse?.selectedOptionIndex)
                          ? myRevealResponse.selectedOptionIndex
                          : null;
                      const expected = revealData.correctOrderArray;
                      const isCorrect =
                        Array.isArray(expected) &&
                        Array.isArray(ordSel) &&
                        ordSel.length === expected.length &&
                        ordSel.every((v, i) => Number(v) === Number(expected[i]))
                          ? true
                          : (pointsGained ?? 0) > 0;
                      return (
                        <p
                          className={cn(
                            'text-lg font-black leading-none sm:text-xl md:text-2xl',
                            !didSubmitOnReveal
                              ? 'text-[#00D9FF] drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]'
                              : isCorrect
                                ? 'text-[#53ff57] drop-shadow-[0_0_15px_rgba(83,255,87,0.8)]'
                                : 'text-[#ff2525] drop-shadow-[0_0_15px_rgba(255,37,37,0.8)]',
                          )}
                        >
                          {!didSubmitOnReveal
                            ? 'No Answer Submitted !! (0)'
                            : isCorrect
                              ? `That's Correct !! (+${
                                  usesServerPtsLabel
                                    ? Math.max(pointsGained ?? 0, 0)
                                    : usesFixedTenTwo
                                      ? REVEAL_FIXED_CORRECT_PTS
                                      : Math.max(pointsGained ?? 0, 0)
                                })`
                              : `Oops Wrong Answer !! (${
                                  usesServerPtsLabel
                                    ? (pointsGained ?? 0)
                                    : usesFixedTenTwo
                                      ? REVEAL_FIXED_WRONG_PTS
                                      : (pointsGained ?? 0)
                                })`}
                        </p>
                      );
                    }

                    if (!isMajorityRulesRound) {
                      return (
                        <p
                          className={cn(
                            'text-lg font-black leading-none sm:text-xl md:text-2xl',
                            !didSubmitOnReveal
                              ? 'text-[#00D9FF] drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]'
                              : answeredCorrectly
                                ? 'text-[#53ff57] drop-shadow-[0_0_15px_rgba(83,255,87,0.8)]'
                                : 'text-[#ff2525] drop-shadow-[0_0_15px_rgba(255,37,37,0.8)]',
                          )}
                        >
                          {!didSubmitOnReveal
                            ? 'No Answer Submitted !! (0)'
                            : answeredCorrectly
                              ? `That's Correct !! (+${correctPointsDisplay})`
                              : `Oops Wrong Answer !! (${incorrectPointsDisplay})`}
                        </p>
                      );
                    }

                    return (
                      <p
                        className={cn(
                          'text-lg font-black leading-none sm:text-xl md:text-2xl',
                          !didSubmitOnReveal
                            ? 'text-[#00D9FF] drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]'
                            : (pointsGained ?? 0) > 0
                              ? 'text-[#53ff57] drop-shadow-[0_0_15px_rgba(83,255,87,0.8)]'
                              : 'text-[#ff2525] drop-shadow-[0_0_15px_rgba(255,37,37,0.8)]',
                        )}
                      >
                        {!didSubmitOnReveal
                          ? 'No Vote Submitted !! (0)'
                          : (pointsGained ?? 0) > 0
                            ? `Majority Vote !! (+${Math.max(pointsGained ?? 0, 0)})`
                            : `Minority Vote !! (${pointsGained ?? -50})`}
                      </p>
                    );
                  })()}
                </motion.div>
              </motion.div>
            )}

            {/* ELIMINATED */}
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
                    You are knocked out for this round. You can play in the next round.
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

            {/* ── Leaderboard ── */}
            {phase === 'scoreboard' && (
              <motion.div
                key="scoreboard"
                {...pageTransition}
                className="mt-2 flex flex-1 flex-col px-3 pb-4 pt-2 sm:mt-4 sm:px-4 md:px-6"
              >
                <div className="mb-3 text-center sm:mb-4 flex items-center justify-center gap-10">
                  <img
                    src="/LeaderboardIcon.png"
                    alt="Leaderboard"
                    className="w-15image.png h-15"
                  />{' '}
                  <h2 className="text-[clamp(1.75rem,6vw,3.25rem)] font-extrabold leading-none tracking-wide text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                    Leaderboard
                  </h2>
                  <img src="/LeaderboardIcon.png" alt="Leaderboard" className="w-15 h-15" />{' '}
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
                          'relative flex items-center justify-between rounded-2xl border px-2 py-3 shadow-[0_0_18px_rgba(0,229,255,0.3)] sm:px-3 sm:py-4',
                          'border-[#12ddff]/70 bg-[linear-gradient(90deg,#2d12a0_0%,#9a0dbd_100%)]',
                          isMe && 'ring-2 ring-[#35f6ff] shadow-[0_0_22px_rgba(53,246,255,0.5)]',
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                          <span
                            className={cn(
                              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-lg font-black sm:h-11 sm:w-11 sm:text-2xl',
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
                              'truncate text-xl font-bold text-white sm:text-2xl md:text-3xl',
                              isMe && 'text-[#8af7ff]',
                            )}
                          >
                            {team.teamName}
                          </span>
                        </div>
                        <span
                          className={cn(
                            'shrink-0 pl-2 text-2xl font-extrabold leading-none text-white sm:text-3xl md:text-4xl',
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

                <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-4 text-center sm:px-6">
                  <h2 className="text-[clamp(2rem,7vw,3.4rem)] font-extrabold leading-none text-white sm:text-[clamp(2.25rem,5vw,3.5rem)]">
                    TAKE A BREAK !!
                  </h2>
                  <p className="mt-2 text-lg font-semibold text-white sm:mt-3 sm:text-2xl md:text-3xl">
                    {"We'll be back shortly..."}
                  </p>

                  <div className="relative mx-auto mt-6 aspect-square w-[min(88vw,320px)] max-w-[360px] sm:mt-8 sm:w-[min(82vw,340px)] md:mt-10 md:max-w-[400px]">
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

                    <div className="absolute inset-[8%] flex flex-col items-center justify-center rounded-full border border-[#00d8ff]/25 bg-[radial-gradient(circle_at_50%_35%,rgba(44,23,101,0.92)_0%,rgba(10,7,40,0.96)_100%)] sm:inset-[9%]">
                      <p className="font-mono text-[clamp(2.5rem,11vw,4.5rem)] font-black leading-none text-white">
                        {String(breakMinutes)}:{String(breakSeconds).padStart(2, '0')}
                      </p>
                      <p className="mt-1 text-sm font-extrabold tracking-[0.06em] text-[#00e8ff] sm:mt-2 sm:text-base md:text-lg lg:text-xl">
                        TIME REMAINING
                      </p>
                    </div>
                  </div>

                  <img
                    src="/logo.png"
                    alt="Max Showdown Trivia"
                    className="relative z-10 mt-8 h-auto  max-w-[360px] object-contain drop-shadow-[0_6px_24px_rgba(0,0,0,0.4)] sm:mt-10 sm:w-[min(48vw,240px)]"
                  />
                </div>
              </motion.div>
            )}

            {/* ── GAME END ── */}
            {phase === 'game_end' && (
              <motion.div
                key="game_end"
                {...pageTransition}
                className="flex flex-1 flex-col items-center justify-center p-4 text-center sm:p-6 md:p-8"
              >
                <div className="w-full max-w-sm md:max-w-md">
                  <motion.div
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
                    className="mb-4 text-5xl sm:text-6xl"
                  >
                    🏆
                  </motion.div>
                  <motion.h2
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="mb-2 text-2xl font-bold text-glow-cyan sm:text-3xl md:text-4xl"
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
                    className="space-y-2 mb-6 overflow-y-auto max-h-[40vh] pr-1"
                  >
                    {scoreboard.map((team, idx) => (
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
              className="neon-border bg-surface w-full max-w-xs rounded-2xl p-5 text-center sm:max-w-sm sm:p-6"
            >
              <h3 className="mb-2 text-lg font-bold sm:text-xl">Leave Game?</h3>
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
