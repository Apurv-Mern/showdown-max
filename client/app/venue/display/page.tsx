'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { useTimerSound } from '@/hooks/useTimerSound';
import { useAudio } from '@/hooks/useAudio';
import { cn } from '@/lib/utils';
import DynamicUnityGame from '@/components/mini-games/DynamicUnityGame';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

type VenuePhase =
  | 'welcome'
  | 'lobby'
  | 'round_intro'
  | 'question'
  | 'reveal'
  | 'scoreboard'
  | 'break'
  | 'mini_game'
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

const OPTION_BG: Record<number, string> = {
  0: 'bg-[#00c853]',
  1: 'bg-[#1565c0]',
  2: 'bg-[#1565c0]',
  3: 'bg-[#c62828]',
};

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function TimerRing({ remaining, total, size = 140 }: { remaining: number; total: number; size?: number }) {
  const radius = (size - 16) / 2;
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
          strokeWidth={10}
        />
        <circle
          className="timer-ring-progress"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={10}
          stroke={getColor()}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 8px ${getColor()})` }}
        />
      </svg>
      <span
        className={cn(
          'text-5xl font-black font-mono',
          remaining <= 5 ? 'text-neon-red text-glow-red' : 'text-neon-cyan text-glow-cyan',
        )}
      >
        {remaining}
      </span>
    </div>
  );
}

function VenueDisplayContent() {
  const searchParams = useSearchParams();
  const initialPin = searchParams.get('pin') || '';

  const { socket, isConnected } = useSocket();

  const [sessionPin, setSessionPin] = useState(initialPin);
  const [pinInput, setPinInput] = useState(initialPin);
  const [phase, setPhase] = useState<VenuePhase>('welcome');
  const [qrCodeData, setQrCodeData] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [roundInfo, setRoundInfo] = useState<{ round: any; roundIndex: number; totalRounds: number } | null>(null);
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const [timerDuration, setTimerDuration] = useState(30);
  const [responseCount, setResponseCount] = useState(0);
  const [totalTeams, setTotalTeams] = useState(0);
  const [revealData, setRevealData] = useState<RevealData | null>(null);
  const [scoreboard, setScoreboard] = useState<Team[]>([]);
  const [breakDuration, setBreakDuration] = useState(360);
  const [miniGameType, setMiniGameType] = useState<string | null>(null);
  const [endCountdown, setEndCountdown] = useState(0);

  const isMusicRound = question?.roundType === 'MUSIC';
  const { playTick, playBuzz } = useTimerSound({ enabled: true, muted: isMusicRound });
  const { play: playMp3, stop: stopMp3, setSource: setMp3Source } = useAudio({ loop: false, volume: 0.8 });
  const prevTimerRef = useRef(0);

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
    if (!question?.question?.mediaUrl) return;
    if (question.question.mediaType === 'mp3') {
      setMp3Source(`${API_URL}${question.question.mediaUrl}`);
      playMp3();
    }
    return () => { stopMp3(); };
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
    if (!socket || !sessionPin) return;

    const joinVenue = () => { socket.emit('venue_connect', { pin: sessionPin }); };
    joinVenue();
    socket.on('connect', joinVenue);

    socket.on('session_state', (data: any) => {
      if (data.qrCodeData) setQrCodeData(data.qrCodeData);
      if (data.teams) {
        const teamList = typeof data.teams === 'object' && !Array.isArray(data.teams)
          ? Object.values(data.teams) as Team[]
          : data.teams as Team[];
        setTeams(teamList);
        setTotalTeams(teamList.length);
      }
      const stateToPhase: Record<string, VenuePhase> = {
        LOBBY: 'lobby', ROUND_INTRO: 'round_intro', QUESTION: 'question',
        SCOREBOARD: 'scoreboard', BREAK: 'break', MINI_GAME: 'mini_game', FINAL_RESULTS: 'game_end',
      };
      if (data.state && stateToPhase[data.state]) setPhase(stateToPhase[data.state]);
      if (data.rounds && data.currentRoundIndex !== undefined) {
        const round = data.rounds[data.currentRoundIndex];
        if (round) setRoundInfo({ round, roundIndex: data.currentRoundIndex, totalRounds: data.rounds.length });
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

    socket.on('round_intro', (data) => { setRoundInfo(data); setPhase('round_intro'); });

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
      setPhase('mini_game');
    });

    socket.on('game_end', (data: { teams: Team[] }) => {
      setScoreboard(data.teams.sort((a, b) => b.score - a.score));
      setPhase('game_end');
      setEndCountdown(15);
      const countdownInterval = setInterval(() => {
        setEndCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            setPhase('welcome');
            setSessionPin('');
            setPinInput('');
            setTeams([]);
            setQrCodeData('');
            setRoundInfo(null);
            setQuestion(null);
            setRevealData(null);
            setScoreboard([]);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    });

    return () => {
      socket.off('connect', joinVenue);
      ['session_state', 'team_joined', 'team_removed', 'round_intro', 'question_active',
        'timer_update', 'timer_expired', 'response_count', 'answer_reveal', 'scoreboard',
        'round_end', 'break_start', 'break_end', 'mini_game_start', 'game_end',
      ].forEach((e) => socket.off(e));
    };
  }, [socket, sessionPin]);

  const QROverlay = () => {
    if (!qrCodeData || phase === 'game_end') return null;
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
      <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-neon-green shadow-[0_0_8px_rgba(0,255,106,0.6)]' : 'bg-neon-red shadow-[0_0_8px_rgba(255,23,68,0.6)]'}`} />
    </div>
  );

  return (
    <div className="w-full h-full relative sci-fi-bg">
      <ConnectionDot />
      <QROverlay />

      {/* ── WELCOME ── */}
      {phase === 'welcome' && (
        <div className="w-full h-full flex flex-col items-center justify-center text-center animate-fadeIn">
          <div className="mb-8">
            <h1 className="text-8xl font-black tracking-tight animate-neon-flicker">
              MAX <span className="text-neon-cyan text-glow-cyan">SHOWDOWN</span>
            </h1>
            <div className="h-1 w-48 bg-neon-cyan mx-auto mt-4 rounded-full shadow-[0_0_20px_rgba(0,229,255,0.5)]" />
          </div>
          <p className="text-3xl text-foreground/50 font-light">Trivia Night</p>
          {sessionPin ? (
            <div className="mt-12 neon-border-strong rounded-2xl px-10 py-6 bg-surface/80">
              <p className="text-foreground/40 text-sm mb-2">Join with PIN</p>
              <p className="text-5xl font-mono font-black tracking-[0.4em] text-neon-cyan text-glow-cyan">{sessionPin}</p>
            </div>
          ) : (
            <form
              className="mt-12 flex flex-col items-center gap-4"
              onSubmit={(e) => { e.preventDefault(); if (pinInput.length === 6) setSessionPin(pinInput); }}
            >
              <input
                type="text"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 6-digit PIN"
                className="text-5xl font-mono font-black tracking-[0.3em] text-center bg-surface neon-border rounded-xl px-6 py-4 w-96 focus:border-neon-cyan outline-none text-neon-cyan"
              />
              <button
                type="submit"
                disabled={pinInput.length !== 6}
                className="bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 px-10 py-3 rounded-lg text-xl font-bold disabled:opacity-40 hover:bg-neon-cyan/30 transition-colors"
              >
                Connect
              </button>
            </form>
          )}
        </div>
      )}

      {/* ── LOBBY ── */}
      {phase === 'lobby' && (
        <div className="w-full h-full flex flex-col p-8 animate-fadeIn">
          <div className="text-center mb-6">
            <h2 className="text-4xl font-bold">
              Join Now! <span className="text-neon-cyan text-glow-cyan font-mono tracking-widest">{sessionPin}</span>
            </h2>
            <p className="text-foreground/40 mt-1">{teams.length} team{teams.length !== 1 ? 's' : ''} joined</p>
          </div>
          <div className="flex-1 grid grid-cols-6 gap-3 content-start overflow-hidden">
            {Array.from({ length: Math.max(30, teams.length) }).map((_, i) => {
              const team = teams[i];
              return (
                <div
                  key={i}
                  className={cn(
                    'rounded-xl border px-3 py-3 flex items-center gap-2 transition-all duration-500',
                    team
                      ? 'bg-neon-green/5 border-neon-green/40 animate-scaleIn shadow-[0_0_10px_rgba(0,255,106,0.15)]'
                      : 'bg-surface/50 border-border/30',
                  )}
                >
                  <span className="text-foreground/20 font-mono text-xs w-5">{i + 1}</span>
                  {team ? (
                    <>
                      <span className="text-neon-green text-sm">✓</span>
                      <span className="text-sm font-medium truncate">{team.teamName}</span>
                    </>
                  ) : (
                    <span className="text-foreground/10 text-sm">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ROUND INTRO ── */}
      {phase === 'round_intro' && roundInfo && (
        <div className="w-full h-full flex flex-col items-center justify-center text-center animate-fadeIn">
          <p className="text-foreground/30 text-xl mb-3">
            Round {(roundInfo.roundIndex || 0) + 1} of {roundInfo.totalRounds}
          </p>
          <h1 className="text-6xl font-black mb-4 text-glow-cyan">{roundInfo.round?.name}</h1>
          <span className="bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 px-6 py-2 rounded-full text-xl font-medium">
            {roundInfo.round?.type?.replace(/_/g, ' ')}
          </span>
        </div>
      )}

      {/* ── QUESTION ── */}
      {phase === 'question' && question && (
        <div className="w-full h-full flex flex-col p-6 animate-fadeIn">
          {/* Question number header */}
          <div className="mb-4">
            <h2 className="text-2xl font-black text-foreground/80">
              Question {(question.questionIndex || 0) + 1}/{question.totalQuestions}
            </h2>
          </div>

          {/* Main content area with neon border */}
          <div className="flex-1 flex flex-col neon-border-strong rounded-2xl p-6 bg-surface/60">
            {/* Media image */}
            {question.question.mediaUrl && question.question.mediaType === 'image' && (
              <div className="flex justify-center mb-4">
                <img
                  src={`${API_URL}${question.question.mediaUrl}`}
                  alt="Question media"
                  className="max-h-52 rounded-xl object-contain neon-border"
                />
              </div>
            )}

            {question.question.mediaUrl && question.question.mediaType === 'mp4' && (
              <div className="flex justify-center mb-4">
                <video
                  src={`${API_URL}${question.question.mediaUrl}`}
                  autoPlay muted={false} playsInline
                  className="max-h-52 rounded-xl neon-border"
                />
              </div>
            )}

            {question.question.mediaUrl && question.question.mediaType === 'mp3' && (
              <div className="flex justify-center mb-4">
                <div className="neon-border rounded-xl px-8 py-4 flex items-center gap-4 bg-surface/80">
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
              </div>
            )}

            {/* Timer ring - centered */}
            <div className="flex justify-center mb-4">
              <TimerRing remaining={timerRemaining} total={timerDuration} size={120} />
            </div>

            {/* Question text in styled bar */}
            <div className="neon-border rounded-xl px-6 py-4 mb-6 bg-surface/80 text-center">
              <p className="text-2xl font-bold">
                Q{(question.questionIndex || 0) + 1}. {question.question.text}
              </p>
            </div>

            {/* Options grid - hexagonal style */}
            <div className={cn(
              'grid gap-3',
              question.question.options.length <= 4 ? 'grid-cols-2' : 'grid-cols-3',
            )}>
              {question.question.options.map((opt, i) => (
                <div
                  key={i}
                  className={cn(
                    'hex-option py-4 px-8 text-white font-bold text-lg flex items-center',
                    OPTION_BG[i] || 'bg-[#1565c0]',
                  )}
                >
                  <span className="font-black mr-3 opacity-80">{OPTION_LETTERS[i]}.</span>
                  <span>{opt.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── REVEAL ── */}
      {phase === 'reveal' && revealData && question && (
        <div className="w-full h-full flex flex-col p-6 animate-fadeIn">
          <div className="text-center mb-4">
            <h2 className="text-3xl font-bold">{question.question.text}</h2>
          </div>

          <div className={cn(
            'grid gap-3 mb-6',
            question.question.options.length <= 4 ? 'grid-cols-2' : 'grid-cols-3',
          )}>
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
              {revealData.eliminations.length} team{revealData.eliminations.length !== 1 ? 's' : ''} eliminated
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
                      <span className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                        idx === 0 ? 'bg-neon-gold/20 text-neon-gold' : 'bg-surface-light text-foreground/40',
                      )}>
                        {idx + 1}
                      </span>
                      <span className={cn('text-sm font-medium', team.isEliminated && 'line-through text-foreground/30')}>
                        {team.teamName}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-neon-cyan text-sm">
                      {revealData.scores[String(team.teamId)] !== undefined && (
                        <span className={cn(
                          'mr-2 text-xs',
                          revealData.scores[String(team.teamId)] > 0 ? 'text-neon-green' : 'text-neon-red',
                        )}>
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
                <span className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center text-lg font-black',
                  idx === 0 ? 'bg-neon-gold/20 text-neon-gold text-glow-gold' :
                    idx === 1 ? 'bg-foreground/10 text-foreground/50' :
                      idx === 2 ? 'bg-orange-500/20 text-orange-400' :
                        'bg-surface-light text-foreground/20',
                )}>
                  {idx + 1}
                </span>
                <span className="flex-1 text-xl font-semibold">{team.teamName}</span>
                <span className="text-2xl font-mono font-black text-neon-cyan text-glow-cyan">{team.score}</span>
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
                    <p className="text-lg font-bold text-foreground/60 mb-2">{scoreboard[1]?.teamName}</p>
                    <div className="w-32 h-24 neon-border bg-surface/80 rounded-t-xl flex items-center justify-center">
                      <span className="text-2xl font-mono font-bold">{scoreboard[1]?.score}</span>
                    </div>
                    <div className="bg-foreground/5 py-1 text-foreground/30 text-sm">2nd</div>
                  </div>
                )}
                <div className="text-center">
                  <p className="text-xl font-black text-neon-gold text-glow-gold mb-2">{scoreboard[0]?.teamName}</p>
                  <div className="w-36 h-36 bg-neon-gold/10 border-2 border-neon-gold/40 rounded-t-xl flex items-center justify-center shadow-[0_0_30px_rgba(255,215,0,0.2)]">
                    <span className="text-3xl font-mono font-black text-neon-gold">{scoreboard[0]?.score}</span>
                  </div>
                  <div className="bg-neon-gold/10 py-1 text-neon-gold text-sm font-bold">1st 🏆</div>
                </div>
                {scoreboard.length > 2 && (
                  <div className="text-center">
                    <p className="text-lg font-bold text-orange-400/60 mb-2">{scoreboard[2]?.teamName}</p>
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
  );
}

function BreakView({ duration, pin, qrCodeData }: { duration: number; pin: string; qrCodeData: string }) {
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
          <p className="font-mono text-2xl font-bold tracking-widest text-neon-cyan text-glow-cyan">{pin}</p>
        </div>
      )}
    </div>
  );
}

export default function VenueDisplayPage() {
  return (
    <Suspense fallback={
      <div className="w-full h-full flex items-center justify-center sci-fi-bg">
        <div className="w-16 h-16 border-4 border-neon-cyan border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(0,229,255,0.5)]" />
      </div>
    }>
      <VenueDisplayContent />
    </Suspense>
  );
}
