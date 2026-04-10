'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { useTimerSound } from '@/hooks/useTimerSound';
import { useAudio } from '@/hooks/useAudio';
import { clientLogger } from '@/lib/clientLogger';
import { cn } from '@/lib/utils';
import { QRCodeSVG } from 'qrcode.react';
import DynamicUnityGame from '@/components/mini-games/DynamicUnityGame';
import { PUBLIC_API_URL } from '@/lib/env';

const API_URL = PUBLIC_API_URL;
const VENUE_PIN_STORAGE_KEY = 'venue_display_pin';

type VenuePhase =
  | 'welcome'
  | 'lobby'
  | 'round_intro'
  | 'question'
  | 'reveal'
  | 'scoreboard'
  | 'break'
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
  eliminations: number[];
  allWrong: boolean;
  teams: Team[];
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const VENUE_OPTION_COLOR_CLASSES = [
  'border-[#2ad4ff] bg-linear-to-l from-[#32b7ff] via-[#3AC9FF] to-[#1f7ce8]',
  'border-[#ff9d2e] bg-linear-to-l from-[#E86130] via-[#EB8800] to-[#EB8800]',
  'border-[#43ef35] bg-linear-to-l from-[#227E00] via-[#2FB000] to-[#227E00]',
  'border-[#ffe24a] bg-linear-to-l from-[#CA9C00] via-[#FFD900] to-[#CA9C00]',
  'border-[#ad49ff] bg-linear-to-l from-[#460073] via-[#5C0098] to-[#460073]',
  'border-[#ff3d56] bg-linear-to-l from-[#990003] via-[#D20023] to-[#990003]',
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
    return { positive: '0 to 50 points (wager gain)', negative: '0 to 50 points (wager loss)' };
  }
  if (type === 'MAJORITY_RULES') {
    return { positive: '50 points for majority vote', negative: '50 points for minority vote' };
  }
  if (type === 'FINAL_WAGER') {
    return {
      positive: 'Gain wagered percentage of total score',
      negative: 'Lose wagered percentage of total score',
    };
  }
  return { positive: '10 points for correct answers', negative: '2 points for incorrect answers' };
};

type MiniGameCommand = {
  id: number;
  game: 'card_shuffle';
  command: 'start_game' | 'next_round';
  roundNumber?: 1 | 2 | 3 | 4;
};

const normalizeRoundTitle = (name?: string) => {
  if (!name) return '';
  return name.replace(/^round\s*\d+\s*-\s*/i, '').trim();
};

function VenueDisplayContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPin = (searchParams.get('pin') || '').replace(/\D/g, '').slice(0, 6);

  const { socket, isConnected } = useSocket();

  const [sessionPin, setSessionPin] = useState(initialPin);
  const [isPinReady, setIsPinReady] = useState(false);
  const [phase, setPhase] = useState<VenuePhase>('welcome');
  const [qrCodeData, setQrCodeData] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>([]);
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
  const [miniGameType, setMiniGameType] = useState<string | null>(null);
  const [miniGameCommand, setMiniGameCommand] = useState<MiniGameCommand | null>(null);
  const [miniGameResult, setMiniGameResult] = useState<{
    game: string;
    winningCard?: number;
    winningKangaroo?: number;
  } | null>(null);
  const [showVenueSplash, setShowVenueSplash] = useState(true);
  const [showIntroVideoFallback, setShowIntroVideoFallback] = useState(false);
  const [isVenueMp3Playing, setIsVenueMp3Playing] = useState(false);
  const [showBreakEndedNotice, setShowBreakEndedNotice] = useState(false);
  const questionMediaUrlRef = useRef<string | undefined>(undefined);
  const phaseRef = useRef<VenuePhase>('welcome');
  const previousPhaseBeforeScoreboardRef = useRef<VenuePhase | null>(null);
  const questionRef = useRef<QuestionData | null>(null);
  const revealDataRef = useRef<RevealData | null>(null);

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
    if (typeof window === 'undefined') return;
    if (/^\d{6}$/.test(sessionPin)) {
      window.localStorage.setItem(VENUE_PIN_STORAGE_KEY, sessionPin);
    } else {
      window.localStorage.removeItem(VENUE_PIN_STORAGE_KEY);
    }
  }, [sessionPin]);

  useEffect(() => {
    if (timerRemaining > 0 && timerRemaining !== prevTimerRef.current) {
      playTick(timerRemaining <= 5);
    }
    if (prevTimerRef.current > 0 && timerRemaining === 0) {
      playBuzz();
    }
    prevTimerRef.current = timerRemaining;
  }, [timerRemaining, playTick, playBuzz]);

  useEffect(() => {
    if (!showVenueSplash) return;
    const timer = setTimeout(() => setShowVenueSplash(false), 5000);
    return () => clearTimeout(timer);
  }, [showVenueSplash]);

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
      socket.emit('mini_game_action', { action, value, source: 'unity' });
    },
    [socket],
  );

  const handleUnityGameComplete = useCallback(
    (result: unknown) => {
      if (!socket) return;
      socket.emit('mini_game_action', { action: 'game_complete', value: result, source: 'unity' });
    },
    [socket],
  );

  const handleUnityReady = useCallback(
    (gameType: 'Kangaroo_race' | 'card_shuffle') => {
      if (!socket || gameType !== 'card_shuffle') return;
      socket.emit('mini_game_ready', { game: 'card_shuffle', ready: true, source: 'venue' });
    },
    [socket],
  );

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

    socket.on('session_state', (data: any) => {
      didReceiveSessionState = true;
      if (data.qrCodeData) setQrCodeData(data.qrCodeData);
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
        setLiveResponses({ correct: 0, incorrect: 0, noAnswer: total, total });
      } else if (data.state !== 'QUESTION') {
        setQuestion(null);
      }

      // Determine the correct phase from the server state
      if (data.activeMiniGame) {
        setMiniGameType(data.activeMiniGame);
        if (data.activeMiniGame !== 'card_shuffle') setMiniGameCommand(null);
        setPhase('mini_game');
      } else if (data.state === 'QUESTION') {
        if (data.currentQuestion) {
          setPhase('question');
        } else if (phaseRef.current === 'reveal' || phaseRef.current === 'question') {
          setPhase(phaseRef.current);
        } else if (data.questionState === 'REVEALED') {
          // Server says answer was already revealed — stay on question phase
          // (reveal phase requires revealData from a separate answer_reveal event)
          setPhase('question');
        } else {
          setPhase('question');
        }
      } else if (data.state && stateToPhase[data.state]) {
        setPhase(stateToPhase[data.state]);
      }
    });

    socket.on('team_joined', (team: Team) => {
      setTeams((prev) => [...prev.filter((t) => t.teamId !== team.teamId), team]);
      setTotalTeams((prev) => prev + 1);
    });

    socket.on('team_removed', ({ teamId }: { teamId: number }) => {
      setTeams((prev) => prev.filter((t) => t.teamId !== teamId));
      setTotalTeams((prev) => Math.max(0, prev - 1));
    });

    socket.on('round_intro', (data) => {
      setRoundInfo(data);
      setPhase('round_intro');
      setIsVenueMp3Playing(false);
      stopMp3();
    });

    socket.on('question_active', (data: QuestionData) => {
      setQuestion(data);
      setTimerDuration(data.timerDuration);
      setTimerRemaining(data.timerRemaining ?? data.timerDuration);
      setLiveResponses({
        correct: 0,
        incorrect: 0,
        noAnswer: Math.max(totalTeams, 0),
        total: Math.max(totalTeams, 0),
      });
      setRevealData(null);
      setIsVenueMp3Playing(false);
      stopMp3();
      setPhase('question');
    });

    socket.on('timer_update', (data: { remaining: number }) => setTimerRemaining(data.remaining));
    socket.on('timer_expired', () => setTimerRemaining(0));

    socket.on('response_count', (data: { count: number; total: number }) => {
      setTotalTeams(data.total);
    });
    socket.on(
      'live_response_update',
      (data: { correct: number; incorrect: number; noAnswer: number; total: number }) => {
        setLiveResponses({
          correct: Number(data?.correct || 0),
          incorrect: Number(data?.incorrect || 0),
          noAnswer: Number(data?.noAnswer || 0),
          total: Number(data?.total || 0),
        });
      },
    );

    socket.on('answer_reveal', (data: RevealData) => {
      setRevealData(data);
      setScoreboard(data.teams.sort((a, b) => b.score - a.score));
      setPhase('reveal');
    });

    socket.on('scoreboard', (data: { teams: Team[] }) => {
      if (phaseRef.current !== 'scoreboard') {
        previousPhaseBeforeScoreboardRef.current = phaseRef.current;
      }
      setScoreboard(data.teams.sort((a, b) => b.score - a.score));
      setPhase('scoreboard');
      setIsVenueMp3Playing(false);
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
      setPhase('lobby');
    });

    socket.on('round_end', () => {
      setIsVenueMp3Playing(false);
      stopMp3();
    });

    socket.on('break_start', (data: { duration: number }) => {
      setBreakDuration(data.duration);
      setPhase('break');
    });

    socket.on('break_end', () => {
      // Phase is restored by server via session_state.
      setShowBreakEndedNotice(true);
      setTimeout(() => setShowBreakEndedNotice(false), 2400);
    });

    socket.on('mini_game_start', (data: { game: string }) => {
      setMiniGameType(data.game);
      setMiniGameCommand(null);
      setMiniGameResult(null);
      setPhase('mini_game');
    });

    socket.on(
      'mini_game_command',
      (data: {
        game?: string;
        command?: 'start_game' | 'next_round';
        roundNumber?: 1 | 2 | 3 | 4;
      }) => {
        if (data?.game !== 'card_shuffle' || !data.command) return;
        setMiniGameCommand({
          id: Date.now(),
          game: 'card_shuffle',
          command: data.command,
          roundNumber: data.roundNumber,
        });
      },
    );

    socket.on('music_control', (data: { action: 'play' | 'pause' | 'stop'; mediaUrl?: string }) => {
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
    });

    socket.on(
      'mini_game_end',
      (data: { game: string; winningCard?: number; winningKangaroo?: number }) => {
        if (data.game) {
          setMiniGameResult(data);
          setPhase('mini_game_result');
        }
      },
    );

    socket.on('game_end', (data?: { teams?: Team[] }) => {
      stopMp3();
      setIsVenueMp3Playing(false);
      if (data?.teams) {
        setScoreboard(data.teams.sort((a, b) => b.score - a.score));
      }
      setPhase('game_end');
    });

    return () => {
      clearTimeout(invalidPinTimeout);
      socket.off('connect', joinVenue);
      [
        'session_state',
        'team_joined',
        'team_removed',
        'round_intro',
        'question_active',
        'music_control',
        'timer_update',
        'timer_expired',
        'response_count',
        'live_response_update',
        'answer_reveal',
        'scoreboard',
        'scoreboard_hidden',
        'round_end',
        'break_start',
        'break_end',
        'mini_game_start',
        'mini_game_command',
        'mini_game_end',
        'game_end',
      ].forEach((e) => socket.off(e));
    };
  }, [socket, sessionPin, isPinReady, router, playMp3, setMp3Source, stopMp3]);

  const QROverlay = () => {
    if (!qrCodeData || phase === 'game_end' || phase === 'lobby') return null;
    return (
      <div className="absolute bottom-4 right-4 z-50 flex flex-col items-center gap-1">
        <div className="neon-border rounded-lg p-1 bg-surface/80 bg-white">
          <QRCodeSVG value={`http://localhost:5002/play/join`} size={96} className="rounded" />
        </div>
        <span className="font-mono text-xs text-neon-cyan/60">{sessionPin}</span>
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

  const liveTotalTeams = Math.max(0, liveResponses.total || totalTeams || 0);
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
        {showBreakEndedNotice ? (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 rounded-2xl border border-[#2bdcff]/60 bg-[rgba(8,20,56,0.92)] px-8 py-4 shadow-[0_0_22px_rgba(43,220,255,0.35)]">
            <p className="text-3xl font-extrabold text-[#2be9ff] tracking-wide">Break Ended</p>
          </div>
        ) : null}

        {/* ── WELCOME ── */}
        {phase === 'welcome' && (
          <div className="w-full h-full relative overflow-hidden animate-fadeIn">
            {showVenueSplash ? (
              <div className="w-full h-full relative">
                <img
                  src="/venue-stage-bg.png"
                  alt="Venue background"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/10" />
                <img
                  src="/platform.png"
                  alt="Splash platform"
                  className="absolute left-1/2 -translate-x-1/2 bottom-[4%] w-[84%] max-w-[1150px] object-contain"
                />
                <img
                  src="/logo.png"
                  alt="Max Showdown logo"
                  className="absolute left-1/2 -translate-x-1/2 top-[16%] w-[58%] max-w-[760px] object-contain drop-shadow-[0_0_24px_rgba(0,229,255,0.35)]"
                />
              </div>
            ) : (
              <div
                className="w-full h-full relative bg-cover bg-center"
                style={{ backgroundImage: "url('/venue-stage-bg.png')" }}
              >
                <div className="absolute inset-0 bg-black/10" />

                <div className="absolute inset-0 flex items-center justify-center px-8 pb-8">
                  <div className="w-full max-w-[820px] aspect-video rounded-xl border-4 border-[#00d9ff] shadow-[0_0_30px_rgba(0,217,255,0.35)] overflow-hidden bg-[#39ff14]">
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
            )}

            <div className="absolute left-1/2 -translate-x-1/2 bottom-6 w-full max-w-xl px-4">
              <div className="neon-border-strong rounded-2xl px-8 py-5 bg-surface/85 text-center">
                <p className="text-foreground/40 text-sm mb-1">Session PIN</p>
                <p className="text-4xl font-mono font-black tracking-[0.28em] text-neon-cyan text-glow-cyan">
                  {sessionPin}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── LOBBY ── */}
        {phase === 'lobby' && (
          <div className="w-full h-full flex flex-col px-6 py-5 animate-fadeIn">
            <div className="text-center mb-4">
              <h2 className="text-6xl font-black tracking-wide text-white text-glow-cyan">
                TEAM REGISTRATION
              </h2>
              <p className="text-neon-cyan text-2xl font-semibold mt-1">
                {teams.length} of 25 Teams Joined
              </p>
            </div>

            {sessionPin ? (
              <div className="mx-auto mb-4 rounded-xl border border-neon-cyan/45 bg-[#051230]/85 px-4 py-3 shadow-[0_0_20px_rgba(0,229,255,0.18)] flex items-center gap-3">
                <div className="w-20 h-20 rounded bg-white p-1 flex items-center justify-center">
                  <QRCodeSVG
                    value={`http://localhost:5002/play/join`}
                    size={72}
                  />
                </div>
                <div className="text-left">
                  <p className="text-neon-cyan font-bold text-sm">SCAN TO JOIN</p>
                  <p className="text-white/70 text-xs mt-1">Session PIN: {sessionPin}</p>
                </div>
              </div>
            ) : null}

            <div className="flex-1 grid grid-cols-5 gap-3 content-start">
              {Array.from({ length: 25 }).map((_, i) => {
                const team = teams[i];
                return (
                  <div key={i} className="relative">
                    <div className="absolute -top-2 right-1 z-10 w-5 h-5 rounded-full bg-[#0c4ac4] border border-neon-cyan/40 text-[10px] font-black text-white flex items-center justify-center shadow-[0_0_8px_rgba(0,229,255,0.25)]">
                      {i + 1}
                    </div>
                    <div
                      className={cn(
                        'h-[56px] rounded-xl border px-3 flex items-center gap-2 transition-all duration-500 backdrop-blur-sm',
                        team
                          ? 'bg-gradient-to-r from-[#0f4bc2]/85 via-[#0a2a92]/80 to-[#9f0ed2]/80 border-neon-cyan/65 shadow-[0_0_14px_rgba(0,229,255,0.25)]'
                          : 'bg-[#130f2e]/55 border-white/25 border-dashed',
                      )}
                    >
                      {team ? (
                        <>
                          <div className="w-5 h-5 rounded-full bg-[#00be57] flex items-center justify-center text-white text-[11px] font-black">
                            {'\u2713'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">{team.teamName}</p>
                            <p className="text-[10px] text-[#66ffb2] font-semibold -mt-0.5">
                              Ready
                            </p>
                          </div>
                        </>
                      ) : (
                        <p className="w-full text-center text-white/70 text-sm">Waiting...</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {phase === 'round_intro' && roundInfo && (
          <div className="w-full h-full flex items-center justify-center animate-fadeIn px-6">
            <div className="relative w-full max-w-[1240px] h-[720px]">
              <img
                src="/Venue Round Intro.png"
                alt="Round intro background"
                className="absolute inset-0 w-full h-full object-contain drop-shadow-[0_0_26px_rgba(0,0,0,0.6)]"
              />

              <div className="absolute inset-0 pointer-events-none text-center">
                <div className="absolute left-1/2 top-[34%] w-[62%] -translate-x-1/2 -translate-y-1/2">
                  <h2 className="text-[75px] leading-none font-black text-[#fff4c2] drop-shadow-[0_0_18px_rgba(255,225,120,0.65)]">
                    ROUND {(roundInfo.roundIndex || 0) + 1}
                  </h2>
                  <p className="mt-2 text-[40px] leading-[1.05] font-extrabold text-[#25eaff] drop-shadow-[0_0_16px_rgba(37,234,255,0.55)]">
                    {normalizeRoundTitle(roundInfo.round?.name)}
                  </p>
                </div>

                <div className="absolute left-1/2 top-[80%] w-[74%] -translate-x-1/2 -translate-y-1/2">
                  <p className="text-[32px] font-black text-[#39ff14] leading-none mb-5 drop-shadow-[0_0_8px_rgba(57,255,20,0.45)]">
                    + {getRoundScoringLines(roundInfo.round?.type).positive}
                  </p>
                  <p className="text-[32px] font-black text-[#ff3e3e] leading-none drop-shadow-[0_0_8px_rgba(255,62,62,0.45)]">
                    - {getRoundScoringLines(roundInfo.round?.type).negative}
                  </p>
                </div>
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
        {phase === 'question' && question && (
          <div className="max-w-[75%] h-[95%] mx-auto mt-10">
            <div className="mx-auto w-full flex-1 rounded-2xl mt-4">
              <div className="rounded-xl mb-3 flex items-center gap-4 justify-between">
                <div className="flex items-center gap-4 flex-1 border  border-[#00C8FF] rounded-xl max-w-2xl ">
                  <div className="relative w-12 h-12 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
                    <div className="absolute inset-0 bg-linear-to-br from-purple-500/20 to-transparent" />
                    <svg
                      viewBox="0 0 24 24"
                      className="w-7 h-7 text-[#20e7ff] relative z-10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M3 5h18M3 12h14M3 19h10" />
                    </svg>
                  </div>

                  {/* 2. The Progress Container (The black pill with blue border) */}
                  <div className="flex-1 max-w-2xl rounded-xl px-4">
                    {[
                      {
                        key: 'correct',
                        color: 'from-[#00ff00] to-[#008000]', // Brighter green
                        track: 'bg-[#3d7a3d]/60',
                        value: liveResponses.correct,
                        icon: '✓',
                        iconBg: 'bg-green-500',
                      },
                      {
                        key: 'incorrect',
                        color: 'from-[#ff0000] to-[#800000]', // Brighter red
                        track: 'bg-[#7a3d3d]/60',
                        value: liveResponses.incorrect,
                        icon: '×',
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
                          <span className="w-6 text-right text-lg font-black text-[#47f3ff] italic">
                            {item.value}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-5 shrink-0 pr-1">
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
                    <span className="text-5xl font-black text-white leading-none">
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
                    <span className="text-5xl font-black text-white leading-none">
                      {liveQuestionPoints}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── QUESTION ── */}
            <div className="w-full h-[85%] flex flex-col animate-fadeIn">
              <div className="mx-auto w-full flex-1 rounded-2xl flex flex-col border">
                {/* Media Section */}
                <div className="relative rounded-t-2xl  overflow-hidden shrink-0">
                  <div className="absolute left-4 top-3 z-10 text-white/90 text-2xl font-semibold">
                    Question {(question.questionIndex || 0) + 1}/{question.totalQuestions}
                  </div>
                  {/* Media */}
                  <div className="h-96">
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
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-px z-30 w-64 h-32 overflow-hidden">
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
                        <span className="mt-6 text-6xl font-black text-white relative z-10 tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                          {timerRemaining}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Questions/Options Section */}
                <div className="relative rounded-2xl border-t-2 border-t-white/50 flex-1 bg-linear-to-b from-[#100048] to-[#000000] z-20 pt-10 px-5 pb-5 ">
                  <div className="mb-4">
                    <p className="text-2xl font-bold text-white">
                      Q{(question.questionIndex || 0) + 1}. {question.question.text}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {question.question.options.map((opt, i) => (
                      <div
                        key={i}
                        className={cn(
                          'rounded-lg border px-4 py-4 text-white font-bold text-2xl flex items-center shadow-[0_8px_18px_rgba(0,0,0,0.35)]',
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

        {phase === 'reveal' && (!revealData || !question) && (
          <div className="w-full h-full flex flex-col items-center justify-center animate-fadeIn z-10 relative">
            <div className="text-3xl text-white font-bold animate-pulse text-glow-cyan neon-border-strong rounded-2xl px-12 py-8 bg-surface/85">
              Processing Results...
            </div>
          </div>
        )}

        {phase === 'reveal' && revealData && question && (
          <div className="w-full h-full flex flex-col p-4 animate-fadeIn">
            <div className="mx-auto w-full max-w-265 flex-1 rounded-2xl border  bg-[#060f2a]/78 shadow-[0_0_24px_rgba(0,229,255,0.22)] p-3">
              <div className="rounded-xl border  bg-[#08142f]/90 px-4 py-2 mb-3 flex items-center justify-between">
                <div className="text-[11px] text-neon-cyan font-semibold tracking-wide">
                  ANSWER REVEALED
                </div>
                <div className="text-sm font-bold text-neon-cyan">
                  Correct: {OPTION_LETTERS[revealData.correctOptionIndex]}
                </div>
              </div>

              <div className="relative rounded-2xl border border-white/20 overflow-hidden">
                <div className="absolute left-4 top-3 z-10 text-white/90 text-2xl font-semibold">
                  Question {(question.questionIndex || 0) + 1}/{question.totalQuestions}
                </div>

                <div className="h-75 bg-[#020b22]">
                  {resolveMediaUrl(question.question.mediaUrl) &&
                  (question.question.mediaType || '').toLowerCase() === 'image' ? (
                    <img
                      src={resolveMediaUrl(question.question.mediaUrl)}
                      alt="Question media"
                      className="w-full h-full object-cover"
                    />
                  ) : resolveMediaUrl(question.question.mediaUrl) &&
                    (question.question.mediaType || '').toLowerCase() === 'mp4' ? (
                    <video
                      src={resolveMediaUrl(question.question.mediaUrl)}
                      autoPlay
                      muted={false}
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={
                        isMusicRound || (question.question.mediaType || '').toLowerCase() === 'mp3'
                          ? '/musicbg.png'
                          : '/withoutImagequestion.png'
                      }
                      alt="Question fallback"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>

                <div className="absolute left-1/2 -translate-x-1/2 -bottom-10 z-20 w-[124px] h-[124px] rounded-full p-1.25 bg-linear-to-r from-[#ff4a4a] via-[#ffd400] to-[#00ff6a] shadow-[0_0_16px_rgba(0,229,255,0.4)]">
                  <div className="w-full h-full rounded-full bg-[#1a0b5d] border border-white/20 flex items-center justify-center">
                    <span className="text-6xl font-black text-white">0</span>
                  </div>
                </div>
              </div>

              <div className="mt-12 rounded-xl border  bg-[#1a0f61]/85 px-5 py-4">
                <p className="text-2xl font-bold text-white">
                  Q{(question.questionIndex || 0) + 1}. {question.question.text}
                </p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                {question.question.options.map((opt, i) => {
                  const isCorrect = i === revealData.correctOptionIndex;
                  return (
                    <div
                      key={i}
                      className={cn(
                        'rounded-lg border px-4 py-3 text-white font-bold text-2xl flex items-center transition-all duration-500 shadow-[0_8px_18px_rgba(0,0,0,0.35)]',
                        VENUE_OPTION_COLOR_CLASSES[i % VENUE_OPTION_COLOR_CLASSES.length],
                        isCorrect
                          ? 'ring-2 ring-[#39ff4a] shadow-[0_0_22px_rgba(57,255,74,0.65)] scale-[1.01]'
                          : 'opacity-35 blur-[1.6px] saturate-50',
                      )}
                    >
                      <span className="font-black mr-3">{OPTION_LETTERS[i]}.</span>
                      <span className="truncate">{opt.text}</span>
                      {isCorrect && <span className="ml-auto text-2xl">&#10003;</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {phase === 'scoreboard' && (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 animate-fadeIn">
            <div className="w-full max-w-5xl rounded-[24px] border border-[#9fbeff]/70 bg-[linear-gradient(180deg,rgba(24,9,76,0.95)_0%,rgba(12,6,48,0.95)_100%)] shadow-[0_0_24px_rgba(0,216,255,0.25)] px-8 py-6">
              <h3 className="text-[42px] font-black text-white text-center mb-3">Scoreboard</h3>

              <div className="text-center mb-5">
                <p className="text-[52px] font-extrabold text-white leading-none">
                  The Correct Answer is :
                </p>
                <p className="text-[50px] font-extrabold text-[#39ff4a] leading-none mt-2">
                  {revealData
                    ? `${OPTION_LETTERS[revealData.correctOptionIndex]}. ${revealData.correctText}`
                    : '-'}
                </p>
              </div>

              <div className="grid grid-cols-[110px_1.5fr_1fr_1fr_1fr] items-center px-5 mb-3 text-white text-[30px] font-bold">
                <div>Rank</div>
                <div>Team Name</div>
                <div>Option</div>
                <div>Points</div>
              </div>

              <div className="space-y-3">
                {scoreboard.slice(0, 8).map((team, idx) => {
                  const response = revealData?.responseDetails?.find(
                    (r) => r.teamId === team.teamId,
                  );
                  const selectedOptionIndex = response?.selectedOptionIndex ?? -1;
                  const selectedLabel =
                    selectedOptionIndex >= 0 && selectedOptionIndex < OPTION_LETTERS.length
                      ? OPTION_LETTERS[selectedOptionIndex]
                      : '-';
                  const timeText =
                    response?.responseTime !== null && response?.responseTime !== undefined
                      ? Number(response.responseTime).toFixed(2)
                      : '--';
                  const delta = revealData?.scores[String(team.teamId)] ?? 0;

                  return (
                    <div
                      key={team.teamId}
                      className="grid grid-cols-[110px_1.5fr_1fr_1fr_1fr] items-center rounded-[10px] border border-[#2ec7ff]/50 bg-[linear-gradient(90deg,#2c00a8_0%,#9a00b8_100%)] px-5 py-3 text-white text-[28px] font-semibold"
                    >
                      <div>
                        <span className="inline-flex h-10 min-w-10 items-center justify-center rounded bg-[#080327] px-3 text-[24px] font-bold">
                          {idx + 1}
                        </span>
                      </div>
                      <div className={cn(team.isEliminated && 'line-through opacity-60')}>
                        {team.teamName}
                      </div>
                      <div>{selectedLabel}</div>
                      <div>{timeText}</div>
                      <div className="text-[#00f0ff]">
                        {delta >= 0 ? '+' : ''}
                        {String(delta).padStart(3, '0')}
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
          <div className=" flex flex-col animate-fadeIn">
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
            {miniGameResult.game === 'card_shuffle' && miniGameResult.winningCard && (
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
            )}
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
  const remainingDeg = Math.max(0, Math.min(360, (remaining / total) * 360));
  const ringStyle = {
    background: `conic-gradient(
      #ff2424 0deg,
      #ff2424 92deg,
      #ff9b00 136deg,
      #fff100 188deg,
      #b7ff00 244deg,
      #78ff00 ${Math.max(250, remainingDeg)}deg,
      #f5f7ff ${Math.max(250, remainingDeg)}deg,
      #f5f7ff 360deg
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
