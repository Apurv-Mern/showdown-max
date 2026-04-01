'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { useTimerSound } from '@/hooks/useTimerSound';
import { useAudio } from '@/hooks/useAudio';
import { cn } from '@/lib/utils';
import DynamicUnityGame from '@/components/mini-games/DynamicUnityGame';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
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
  const [responseCount, setResponseCount] = useState(0);
  const [totalTeams, setTotalTeams] = useState(0);
  const [revealData, setRevealData] = useState<RevealData | null>(null);
  const [scoreboard, setScoreboard] = useState<Team[]>([]);
  const [breakDuration, setBreakDuration] = useState(360);
  const [miniGameType, setMiniGameType] = useState<string | null>(null);
  const [miniGameResult, setMiniGameResult] = useState<{
    game: string;
    winningCard?: number;
    winningKangaroo?: number;
  } | null>(null);
  const [endCountdown, setEndCountdown] = useState(0);
  const [showVenueSplash, setShowVenueSplash] = useState(true);
  const [showIntroVideoFallback, setShowIntroVideoFallback] = useState(false);

  const isMusicRound = question?.roundType === 'MUSIC';
  const { playTick, playBuzz } = useTimerSound({ enabled: true, muted: isMusicRound });
  const {
    play: playMp3,
    stop: stopMp3,
    setSource: setMp3Source,
  } = useAudio({ loop: false, volume: 0.8 });
  const prevTimerRef = useRef(0);

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
    if (!question?.question?.mediaUrl) return;
    const mediaType = (question.question.mediaType || '').toLowerCase();
    if (mediaType === 'mp3') {
      setMp3Source(resolveMediaUrl(question.question.mediaUrl));
      playMp3();
    }
    return () => {
      stopMp3();
    };
  }, [question?.question?.mediaUrl, question?.question?.mediaType, setMp3Source, playMp3, stopMp3]);

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
      if (data.activeMiniGame) {
        setMiniGameType(data.activeMiniGame);
        setPhase('mini_game');
      } else if (data.activeMiniGame === null && data.state && stateToPhase[data.state]) {
        setPhase(stateToPhase[data.state]);
      } else if (data.state && stateToPhase[data.state]) {
        setPhase(stateToPhase[data.state]);
      }
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
      } else if (data.state !== 'QUESTION') {
        setQuestion(null);
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
    });

    socket.on('question_active', (data: QuestionData) => {
      setQuestion(data);
      setTimerDuration(data.timerDuration);
      setTimerRemaining(data.timerDuration);
      setResponseCount(0);
      setRevealData(null);
      setPhase('question');
    });

    socket.on('timer_update', (data: { remaining: number }) => setTimerRemaining(data.remaining));
    socket.on('timer_expired', () => setTimerRemaining(0));

    socket.on('response_count', (data: { count: number; total: number }) => {
      setResponseCount(data.count);
      setTotalTeams(data.total);
    });

    socket.on('answer_reveal', (data: RevealData) => {
      setRevealData(data);
      setScoreboard(data.teams.sort((a, b) => b.score - a.score));
      setPhase('reveal');
    });

    socket.on('scoreboard', (data: { teams: Team[] }) => {
      setScoreboard(data.teams.sort((a, b) => b.score - a.score));
      setPhase('scoreboard');
    });

    socket.on('round_end', () => setPhase('scoreboard'));

    socket.on('break_start', (data: { duration: number }) => {
      setBreakDuration(data.duration);
      setPhase('break');
    });

    socket.on('break_end', () => setPhase('lobby'));

    socket.on('mini_game_start', (data: { game: string }) => {
      setMiniGameType(data.game);
      setMiniGameResult(null);
      setPhase('mini_game');
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

    socket.on('game_end', () => {
      setPhase('welcome');
      setShowVenueSplash(true);
      setShowIntroVideoFallback(false);
      setSessionPin('');
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(VENUE_PIN_STORAGE_KEY);
      }
      router.replace('/venue');
      setTeams([]);
      setQrCodeData('');
      setRoundInfo(null);
      setQuestion(null);
      setRevealData(null);
      setScoreboard([]);
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
        'timer_update',
        'timer_expired',
        'response_count',
        'answer_reveal',
        'scoreboard',
        'round_end',
        'break_start',
        'break_end',
        'mini_game_start',
        'mini_game_end',
        'game_end',
      ].forEach((e) => socket.off(e));
    };
  }, [socket, sessionPin, isPinReady, router]);

  const QROverlay = () => {
    if (!qrCodeData || phase === 'game_end' || phase === 'lobby') return null;
    return (
      <div className="absolute bottom-4 right-4 z-50 flex flex-col items-center gap-1">
        <div className="neon-border rounded-lg p-1 bg-surface/80">
          <img src={qrCodeData} alt="Join QR" className="w-24 h-24 rounded" />
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

          {qrCodeData ? (
            <div className="mx-auto mb-4 rounded-xl border border-neon-cyan/45 bg-[#051230]/85 px-4 py-3 shadow-[0_0_20px_rgba(0,229,255,0.18)] flex items-center gap-3">
              <img src={qrCodeData} alt="Scan to join" className="w-20 h-20 rounded bg-white p-1" />
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
                          <p className="text-[10px] text-[#66ffb2] font-semibold -mt-0.5">Ready</p>
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
        <div className="w-full h-full flex flex-col items-center justify-center text-center animate-fadeIn px-6">
          <div className="relative mb-8">
            <div className="w-[420px] h-[320px] rounded-[999px] bg-gradient-to-b from-[#ffb300] via-[#ff8f00] to-[#7a2b00] p-2 shadow-[0_0_28px_rgba(255,183,0,0.45)]">
              <div className="w-full h-full rounded-[999px] bg-gradient-to-b from-[#6d23d9] to-[#341180] border-4 border-[#ffcc4d] flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.25)_2px,transparent_2px)] [background-size:14px_14px]" />
                <p className="relative z-10 text-[#ffe9a7] text-[58px] font-black leading-none tracking-wide">
                  ROUND {(roundInfo.roundIndex || 0) + 1}
                </p>
                <p className="relative z-10 text-neon-cyan text-4xl font-bold mt-3">
                  {roundInfo.round?.name}
                </p>
              </div>
            </div>

            <div className="absolute inset-0 pointer-events-none">
              {Array.from({ length: 10 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute w-6 h-6 rounded-full bg-[#ffe66d] shadow-[0_0_14px_rgba(255,230,109,0.95)] border border-[#ffd54d]"
                  style={{
                    left: `${50 + 46 * Math.cos((i / 10) * 2 * Math.PI)}%`,
                    top: `${50 + 44 * Math.sin((i / 10) * 2 * Math.PI)}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              ))}
            </div>
          </div>

          <div className="relative -mt-4 mb-4 flex items-center gap-6">
            <span className="text-6xl text-[#ffd64d] drop-shadow-[0_0_10px_rgba(255,214,77,0.8)]">
              *
            </span>
            <span className="text-8xl text-[#ffd64d] drop-shadow-[0_0_10px_rgba(255,214,77,0.8)]">
              *
            </span>
            <span className="text-6xl text-[#ffd64d] drop-shadow-[0_0_10px_rgba(255,214,77,0.8)]">
              *
            </span>
          </div>

          <div className="w-full max-w-[760px] rounded-3xl p-[3px] bg-gradient-to-r from-[#2cd7ff] via-[#1588ff] to-[#2cd7ff] shadow-[0_0_24px_rgba(44,215,255,0.45)]">
            <div className="rounded-[22px] bg-gradient-to-r from-[#1e0a88]/95 to-[#5a14a8]/95 px-10 py-8 text-left">
              <p className="text-[40px] font-black text-[#39ff14] leading-none mb-3">
                + {getRoundScoringLines(roundInfo.round?.type).positive}
              </p>
              <p className="text-[40px] font-black text-[#ff2d2d] leading-none">
                - {getRoundScoringLines(roundInfo.round?.type).negative}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── QUESTION ── */}
      {phase === 'question' && question && (
        <div className="w-full h-full flex flex-col p-4 animate-fadeIn">
          <div className="mx-auto w-full max-w-[1060px] flex-1 rounded-2xl border border-neon-cyan/55 bg-[#060f2a]/78 shadow-[0_0_24px_rgba(0,229,255,0.22)] p-3">
            <div className="rounded-xl border border-neon-cyan/35 bg-[#08142f]/90 px-4 py-2 mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-20 h-3 rounded-full bg-[#0b1836] border border-neon-cyan/40 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#00e5ff] to-[#00ff6a]"
                    style={{ width: `${Math.min(100, Math.round((responseCount / Math.max(1, totalTeams)) * 100))}%` }}
                  />
                </div>
                <div className="text-[11px] text-neon-cyan font-semibold tracking-wide">
                  WAITING FOR RESPONSES
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm font-bold text-neon-cyan">
                <span>{responseCount}</span>
                <span>{totalTeams}</span>
              </div>
            </div>

            <div className="relative rounded-2xl border border-white/20 overflow-hidden">
              <div className="absolute left-4 top-3 z-10 text-white/90 text-2xl font-semibold">
                Question {(question.questionIndex || 0) + 1}/{question.totalQuestions}
              </div>

              <div className="h-[300px] bg-[#020b22]">
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
                    src="/withoutImagequestion.png"
                    alt="Question fallback"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              <div className="absolute left-1/2 -translate-x-1/2 -bottom-10 z-20 w-[124px] h-[124px] rounded-full p-[5px] bg-gradient-to-r from-[#ff4a4a] via-[#ffd400] to-[#00ff6a] shadow-[0_0_16px_rgba(0,229,255,0.4)]">
                <div className="w-full h-full rounded-full bg-[#1a0b5d] border border-white/20 flex items-center justify-center">
                  <span className="text-6xl font-black text-white">{timerRemaining}</span>
                </div>
              </div>
            </div>

            <div className="mt-12 rounded-xl border border-neon-cyan/35 bg-[#1a0f61]/85 px-5 py-4">
              <p className="text-2xl font-bold text-white">
                Q{(question.questionIndex || 0) + 1}. {question.question.text}
              </p>
            </div>

            {resolveMediaUrl(question.question.mediaUrl) &&
              (question.question.mediaType || '').toLowerCase() === 'mp3' && (
              <div className="mt-3 neon-border rounded-xl px-8 py-3 flex items-center gap-4 bg-surface/80">
                <div className="flex items-end gap-1">
                  {[0.6, 1, 0.4, 0.8, 0.5].map((h, i) => (
                    <div
                      key={i}
                      className="w-1.5 bg-neon-cyan rounded-full animate-pulse"
                      style={{ height: `${h * 24}px`, animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
                <span className="text-neon-cyan font-medium">Now Playing</span>
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-3">
              {question.question.options.map((opt, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-lg border border-neon-cyan/45 bg-[#071327]/95 px-4 py-3 text-white font-bold text-2xl flex items-center shadow-[inset_0_0_12px_rgba(0,229,255,0.08)]',
                    i === 0 && 'bg-[#1d5fbe] border-[#2cd7ff]',
                  )}
                >
                  <span className="font-black mr-3">{OPTION_LETTERS[i]}.</span>
                  <span className="truncate">{opt.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {phase === 'reveal' && revealData && question && (
        <div className="w-full h-full flex flex-col p-6 animate-fadeIn">
          <div className="text-center mb-4">
            <h2 className="text-3xl font-bold">{question.question.text}</h2>
          </div>

          <div
            className={cn(
              'grid gap-3 mb-6',
              question.question.options.length <= 4 ? 'grid-cols-2' : 'grid-cols-3',
            )}
          >
            {question.question.options.map((opt, i) => {
              const isCorrect = i === revealData.correctOptionIndex;
              return (
                <div
                  key={i}
                  className={cn(
                    'hex-option py-4 px-8 text-white font-bold text-lg flex items-center transition-all duration-500',
                    isCorrect
                      ? 'bg-neon-green shadow-[0_0_25px_rgba(0,255,106,0.5)] scale-105'
                      : 'bg-surface-light/50 opacity-40',
                  )}
                >
                  <span className="font-black mr-3 opacity-80">{OPTION_LETTERS[i]}.</span>
                  <span>{opt.text}</span>
                  {isCorrect && <span className="ml-auto text-2xl">✓</span>}
                </div>
              );
            })}
          </div>

          {revealData.allWrong && (
            <div className="text-center bg-neon-gold/10 border border-neon-gold/30 text-neon-gold rounded-xl px-6 py-3 text-lg mb-4">
              Everyone got it wrong — no eliminations!
            </div>
          )}

          {revealData.eliminations.length > 0 && (
            <div className="text-center text-neon-red text-glow-red text-sm mb-2">
              {revealData.eliminations.length} team{revealData.eliminations.length !== 1 ? 's' : ''}{' '}
              eliminated
            </div>
          )}

          <div className="flex-1 flex justify-center">
            <div className="w-full max-w-2xl">
              <div className="grid grid-cols-2 gap-2">
                {scoreboard.slice(0, 10).map((team, idx) => (
                  <div
                    key={team.teamId}
                    className={cn(
                      'flex items-center justify-between px-4 py-2 rounded-xl',
                      team.isEliminated
                        ? 'bg-neon-red/10 border border-neon-red/20'
                        : 'neon-border bg-surface/80',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                          idx === 0
                            ? 'bg-neon-gold/20 text-neon-gold'
                            : 'bg-surface-light text-foreground/40',
                        )}
                      >
                        {idx + 1}
                      </span>
                      <span
                        className={cn(
                          'text-sm font-medium',
                          team.isEliminated && 'line-through text-foreground/30',
                        )}
                      >
                        {team.teamName}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-neon-cyan text-sm">
                      {revealData.scores[String(team.teamId)] !== undefined && (
                        <span
                          className={cn(
                            'mr-2 text-xs',
                            revealData.scores[String(team.teamId)] > 0
                              ? 'text-neon-green'
                              : 'text-neon-red',
                          )}
                        >
                          {revealData.scores[String(team.teamId)] > 0 ? '+' : ''}
                          {revealData.scores[String(team.teamId)]}
                        </span>
                      )}
                      {team.score}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SCOREBOARD ── */}
      {phase === 'scoreboard' && (
        <div className="w-full h-full flex flex-col items-center justify-center p-8 animate-fadeIn">
          <h2 className="text-4xl font-black mb-8 text-glow-cyan">Scoreboard</h2>
          <div className="w-full max-w-3xl space-y-2">
            {scoreboard.slice(0, 15).map((team, idx) => (
              <div
                key={team.teamId}
                className="flex items-center gap-4 neon-border bg-surface/80 rounded-xl px-6 py-3"
                style={{ animationDelay: `${idx * 80}ms` }}
              >
                <span
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-lg font-black',
                    idx === 0
                      ? 'bg-neon-gold/20 text-neon-gold text-glow-gold'
                      : idx === 1
                        ? 'bg-foreground/10 text-foreground/50'
                        : idx === 2
                          ? 'bg-orange-500/20 text-orange-400'
                          : 'bg-surface-light text-foreground/20',
                  )}
                >
                  {idx + 1}
                </span>
                <span className="flex-1 text-xl font-semibold">{team.teamName}</span>
                <span className="text-2xl font-mono font-black text-neon-cyan text-glow-cyan">
                  {team.score}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BREAK ── */}
      {phase === 'break' && (
        <BreakView duration={breakDuration} pin={sessionPin} qrCodeData={qrCodeData} />
      )}

      {/* ── MINI GAME ── */}
      {phase === 'mini_game' && miniGameType && (
        <div className="w-full h-full flex flex-col animate-fadeIn">
          <div className="px-6 py-3 flex items-center justify-between border-b border-border/30">
            <h2 className="text-2xl font-black text-neon-cyan text-glow-cyan">
              {miniGameType === 'horse_race' ? '🏇 Horse Race' : '🃏 Card Shuffle'}
            </h2>
            <p className="text-foreground/40 text-sm">Players pick on their devices</p>
          </div>
          <div className="flex-1 p-4">
            <DynamicUnityGame
              gameType={miniGameType as 'horse_race' | 'card_shuffle'}
              onPlayerAction={handleUnityPlayerAction}
              onGameComplete={handleUnityGameComplete}
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
          {miniGameResult.game === 'horse_race' && miniGameResult.winningKangaroo && (
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
          <h1 className="text-6xl font-black mb-2 text-glow-cyan">Game Over!</h1>
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
          {endCountdown > 0 && (
            <p className="text-foreground/30 text-sm mt-6">
              Returning to home in {endCountdown}s...
            </p>
          )}
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

  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center animate-fadeIn">
      <div className="text-6xl mb-6">☕</div>
      <h2 className="text-5xl font-black mb-4 text-glow-cyan">Break Time</h2>
      <p className="text-7xl font-mono font-black text-neon-cyan text-glow-cyan mb-6">
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </p>
      <p className="text-xl text-foreground/40">We&apos;ll be right back</p>
      {qrCodeData && (
        <div className="mt-8 neon-border-strong bg-surface/80 rounded-2xl px-8 py-6 flex flex-col items-center gap-3">
          <p className="text-foreground/40 text-sm">Still want to join?</p>
          <img src={qrCodeData} alt="Join QR" className="w-40 h-40 rounded-lg" />
          <p className="font-mono text-2xl font-bold tracking-widest text-neon-cyan text-glow-cyan">
            {pin}
          </p>
        </div>
      )}
    </div>
  );
}

export default function VenueDisplayPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-neon-cyan border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(0,229,255,0.5)]" />
        </div>
      }
    >
      <VenueDisplayContent />
    </Suspense>
  );
}
