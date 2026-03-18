'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useTimerSound } from '@/hooks/useTimerSound';
import { useAudio } from '@/hooks/useAudio';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

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
  rounds: { id: number; name: string; type: string; timerDuration: number; questions: any[] }[];
  teams: Record<string, Team>;
  activeTeamIds: number[];
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

function HostTimerRing({ remaining, total }: { remaining: number; total: number }) {
  const size = 100;
  const radius = (size - 12) / 2;
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
        <circle className="timer-ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={8} />
        <circle
          className="timer-ring-progress"
          cx={size / 2} cy={size / 2} r={radius} strokeWidth={8}
          stroke={getColor()}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 6px ${getColor()})` }}
        />
      </svg>
      <span className={cn(
        'text-3xl font-black font-mono',
        remaining <= 5 ? 'text-neon-red text-glow-red' : 'text-neon-cyan text-glow-cyan',
      )}>
        {remaining}
      </span>
    </div>
  );
}

function HostDashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pin = searchParams.get('pin') || '';

  const { socket, isConnected } = useSocket();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null);
  const [revealData, setRevealData] = useState<RevealData | null>(null);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const [timerDuration, setTimerDuration] = useState(30);
  const [timerPaused, setTimerPaused] = useState(false);
  const [scoreboard, setScoreboard] = useState<Team[]>([]);

  const [addTeamName, setAddTeamName] = useState('');
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [editScoreTeamId, setEditScoreTeamId] = useState<number | null>(null);
  const [editScoreValue, setEditScoreValue] = useState('');
  const [showRemoveTeam, setShowRemoveTeam] = useState(false);
  const [mp3Playing, setMp3Playing] = useState(false);
  const [mp4Playing, setMp4Playing] = useState(false);

  const isMusicRound = currentQuestion?.roundType === 'MUSIC';
  const { playTick, playBuzz } = useTimerSound({ enabled: true, muted: isMusicRound });
  const { play: playMp3, stop: stopMp3, setSource: setMp3Source } = useAudio({ loop: false, volume: 0.7 });
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
    if (currentQuestion.question.mediaType === 'mp3') {
      setMp3Source(`${API_URL}${currentQuestion.question.mediaUrl}`);
    }
  }, [currentQuestion?.question?.mediaUrl, currentQuestion?.question?.mediaType, setMp3Source]);

  useEffect(() => {
    if (!socket || !pin) return;

    const joinHost = () => { socket.emit('host_connect', { pin }); };
    joinHost();
    socket.on('connect', joinHost);

    socket.on('session_state', (data: any) => {
      if (data.state) setGameState(data);
      if (data.teams) {
        const teamList = typeof data.teams === 'object' && !Array.isArray(data.teams)
          ? Object.values(data.teams) as Team[]
          : data.teams as Team[];
        setScoreboard(teamList.sort((a, b) => b.score - a.score));
      }
    });

    socket.on('question_active', (data: QuestionData) => {
      setCurrentQuestion(data);
      setRevealData(null);
      setTimerDuration(data.timerDuration);
      setTimerRemaining(data.timerDuration);
      setGameState((prev) => prev ? { ...prev, state: 'QUESTION', questionState: 'ACTIVE' } : prev);
    });

    socket.on('timer_update', (data: { remaining: number; paused?: boolean }) => {
      setTimerRemaining(data.remaining);
      if (data.paused !== undefined) setTimerPaused(data.paused);
    });

    socket.on('timer_expired', () => setTimerRemaining(0));

    socket.on('answer_reveal', (data: RevealData) => {
      setRevealData(data);
      setScoreboard(data.teams.sort((a, b) => b.score - a.score));
      setGameState((prev) => prev ? { ...prev, questionState: 'REVEALED' } : prev);
    });

    socket.on('response_count', (data: { count: number; total: number }) => {
      setGameState((prev) => prev ? { ...prev, responseCount: data.count, totalTeams: data.total } : prev);
    });

    socket.on('round_intro', (data: any) => {
      setCurrentQuestion(null);
      setRevealData(null);
      setGameState((prev) => prev ? {
        ...prev, state: 'ROUND_INTRO', questionState: 'WAITING',
        currentRoundIndex: data.roundIndex ?? prev.currentRoundIndex,
        currentQuestionIndex: 0, responseCount: 0,
      } : prev);
    });

    socket.on('scoreboard', (data: { teams: Team[] }) => {
      setScoreboard(data.teams.sort((a, b) => b.score - a.score));
      setGameState((prev) => prev ? { ...prev, state: 'SCOREBOARD' } : prev);
    });

    socket.on('round_end', () => {
      setCurrentQuestion(null); setRevealData(null);
      setGameState((prev) => prev ? { ...prev, state: 'SCOREBOARD' } : prev);
    });

    socket.on('break_start', () => setGameState((prev) => prev ? { ...prev, state: 'BREAK' } : prev));
    socket.on('break_end', () => setGameState((prev) => prev ? { ...prev, state: 'ROUND_INTRO' } : prev));

    socket.on('game_end', (data: { teams: Team[] }) => {
      setScoreboard(data.teams.sort((a, b) => b.score - a.score));
      setGameState((prev) => prev ? { ...prev, state: 'FINAL_RESULTS' } : prev);
      setTimeout(() => {
        router.replace('/host/sessions');
      }, 10000);
    });

    socket.on('team_joined', (team: Team) => {
      setGameState((prev) => {
        if (!prev) return prev;
        return { ...prev, teams: { ...prev.teams, [team.teamId]: team }, totalTeams: Object.keys(prev.teams).length + 1 };
      });
      setScoreboard((prev) => [...prev.filter((t) => t.teamId !== team.teamId), team].sort((a, b) => b.score - a.score));
    });

    socket.on('team_removed', ({ teamId }: { teamId: number }) => {
      setGameState((prev) => {
        if (!prev) return prev;
        const teams = { ...prev.teams };
        delete teams[teamId];
        return { ...prev, teams, totalTeams: Object.keys(teams).length };
      });
      setScoreboard((prev) => prev.filter((t) => t.teamId !== teamId));
    });

    socket.on('team_updated', ({ teamId, score }: { teamId: number; score: number }) => {
      setGameState((prev) => {
        if (!prev || !prev.teams[teamId]) return prev;
        return { ...prev, teams: { ...prev.teams, [teamId]: { ...prev.teams[teamId], score } } };
      });
      setScoreboard((prev) => prev.map((t) => t.teamId === teamId ? { ...t, score } : t).sort((a, b) => b.score - a.score));
    });

    return () => {
      socket.off('connect', joinHost);
      ['session_state', 'question_active', 'timer_update', 'timer_expired', 'answer_reveal',
        'response_count', 'round_intro', 'scoreboard', 'round_end', 'break_start', 'break_end',
        'game_end', 'team_joined', 'team_removed', 'team_updated',
      ].forEach((e) => socket.off(e));
    };
  }, [socket, pin]);

  const emit = useCallback((event: string, data?: any) => {
    if (socket) socket.emit(event, { pin, ...data });
  }, [socket, pin]);

  const handleStartGame = () => emit('start_game');
  const handleNextQuestion = () => emit('next_question');
  const handleRevealAnswer = () => emit('reveal_answer');
  const handleStartTimer = () => emit('start_timer');
  const handlePauseTimer = () => emit('pause_timer');
  const handleShowScoreboard = () => emit('show_scoreboard');
  const handleAdvanceRound = () => emit('advance_round');
  const handleStartBreak = () => emit('start_break');
  const handleEndBreak = () => emit('end_break');
  const handleEndGame = () => {
    if (confirm('End the game? This shows final results to all players.')) emit('end_game');
  };
  const handleLaunchMiniGame = (game: string) => emit('launch_mini_game', { game });

  const handleAddTeam = () => {
    if (!addTeamName.trim()) return;
    emit('add_team', { teamName: addTeamName.trim() });
    setAddTeamName('');
    setShowAddTeam(false);
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
    if (mp3Playing) { stopMp3(); setMp3Playing(false); }
    else { playMp3(); setMp3Playing(true); }
  };

  useKeyboardShortcuts({
    ' ': handleNextQuestion,
    t: handleStartTimer,
    p: handlePauseTimer,
    s: handleShowScoreboard,
    r: handleRevealAnswer,
  });

  const currentRound = gameState?.rounds?.[gameState.currentRoundIndex];
  const state = gameState?.state || 'LOBBY';
  const questionState = gameState?.questionState || 'WAITING';
  const teamList = gameState?.teams ? Object.values(gameState.teams) : [];
  const sortedTeams = [...teamList].sort((a, b) => b.score - a.score);

  if (!pin) {
    return (
      <div className="text-center py-16">
        <p className="text-foreground/50">No session PIN provided. Go to Sessions to select one.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-3 h-[calc(100vh-3.5rem)] sci-fi-bg">
      {/* ═══════ LEFT SIDEBAR ═══════ */}
      <div className="w-52 shrink-0 flex flex-col gap-3 overflow-y-auto">
        <SidebarSection title="TEAM MANAGEMENT">
          <SidebarBtn icon="➕" onClick={() => setShowAddTeam(true)}>Add Team</SidebarBtn>
          <SidebarBtn icon="📝" onClick={() => setEditScoreTeamId(-1)}>Edit Score</SidebarBtn>
          <SidebarBtn icon="🗑" onClick={() => setShowRemoveTeam(true)}>Remove Team</SidebarBtn>
        </SidebarSection>

        <SidebarSection title="VENUE DISPLAY">
          <SidebarBtn icon="🖥" onClick={() => emit('show_scoreboard')}>Welcome Screen</SidebarBtn>
          <SidebarBtn icon="📋" onClick={() => emit('show_scoreboard')}>Team Registration</SidebarBtn>
          <SidebarBtn icon="🎯" onClick={() => emit('advance_round')}>Round Intro</SidebarBtn>
        </SidebarSection>

        <SidebarSection title="MEDIA CONTROLS">
          <SidebarBtn
            icon="🎵"
            onClick={handleToggleMp3}
            active={mp3Playing}
            disabled={!currentQuestion?.question?.mediaUrl || currentQuestion?.question?.mediaType !== 'mp3'}
          >
            {mp3Playing ? 'Pause' : 'Play'} MP3
          </SidebarBtn>
          <SidebarBtn
            icon="🎬"
            onClick={() => setMp4Playing((p) => !p)}
            active={mp4Playing}
            disabled={!currentQuestion?.question?.mediaUrl || currentQuestion?.question?.mediaType !== 'mp4'}
          >
            {mp4Playing ? 'Pause' : 'Play'} MP4
          </SidebarBtn>
        </SidebarSection>
      </div>

      {/* ═══════ CENTER CONTENT ═══════ */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 overflow-y-auto">
        {/* Top Status Bar */}
        <div className="flex items-center justify-between neon-border rounded-xl px-4 py-2 bg-surface/80 shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-black text-lg">MAX <span className="text-neon-cyan text-glow-cyan">SHOWDOWN</span></span>
            <span className="text-foreground/30 text-sm">Host Control</span>
          </div>
          <div className="flex items-center gap-4">
            {currentRound && (
              <span className="text-sm font-bold uppercase text-neon-cyan">
                Round {(gameState?.currentRoundIndex || 0) + 1} – {currentRound.type.replace(/_/g, ' ')}
              </span>
            )}
            <span className="text-sm text-foreground/40">
              Session Pin: <span className="font-mono font-bold text-neon-cyan">{pin}</span>
            </span>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-neon-green shadow-[0_0_8px_rgba(0,255,106,0.6)] animate-pulse' : 'bg-neon-red shadow-[0_0_8px_rgba(255,23,68,0.6)]'}`} />
              <span className={`text-xs ${isConnected ? 'text-neon-green' : 'text-neon-red'}`}>{isConnected ? 'Live' : 'Offline'}</span>
            </div>
            <span className="text-sm font-medium text-neon-cyan">
              {gameState?.totalTeams || 0} Teams Connected
            </span>
          </div>
        </div>

        {/* Question Display */}
        {currentQuestion ? (
          <div className="flex-1 flex flex-col neon-border-strong rounded-xl p-5 bg-surface/60 min-h-0">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h2 className="text-xl font-bold">
                Question {(currentQuestion.questionIndex || 0) + 1}/{currentQuestion.totalQuestions}
              </h2>
              {currentQuestion.pointsForQuestion && (
                <span className="text-sm text-neon-cyan font-bold">{currentQuestion.pointsForQuestion} pts</span>
              )}
            </div>

            {/* Media Preview */}
            {currentQuestion.question.mediaUrl && (
              <div className="mb-3 shrink-0 flex justify-center">
                {currentQuestion.question.mediaType === 'image' && (
                  <img
                    src={`${API_URL}${currentQuestion.question.mediaUrl}`}
                    alt="Question media"
                    className="max-h-36 rounded-lg object-contain neon-border"
                  />
                )}
                {currentQuestion.question.mediaType === 'mp4' && (
                  <video
                    src={`${API_URL}${currentQuestion.question.mediaUrl}`}
                    className="max-h-36 rounded-lg neon-border"
                    controls={mp4Playing} autoPlay={mp4Playing} muted={false}
                  />
                )}
                {currentQuestion.question.mediaType === 'mp3' && (
                  <div className="neon-border rounded-lg px-4 py-2 text-sm text-neon-cyan flex items-center gap-2 bg-surface/80">
                    🎵 Audio track attached
                    <button onClick={handleToggleMp3} className="underline text-xs">{mp3Playing ? 'Pause' : 'Play'}</button>
                  </div>
                )}
              </div>
            )}

            {/* Timer Ring */}
            <div className="flex justify-center mb-3 shrink-0">
              <HostTimerRing remaining={timerRemaining} total={timerDuration} />
              {timerPaused && <p className="self-center ml-3 text-xs text-neon-gold font-bold">⏸ PAUSED</p>}
            </div>

            {/* Question Text */}
            <div className="neon-border rounded-xl px-5 py-4 mb-3 shrink-0 text-center bg-surface/80">
              <p className="text-lg font-semibold">
                Q{(currentQuestion.questionIndex || 0) + 1}. {currentQuestion.question.text}
              </p>
            </div>

            {/* Options Grid - hexagonal */}
            <div className="grid grid-cols-2 gap-2 shrink-0">
              {currentQuestion.question.options.map((opt, i) => {
                const isCorrect = revealData && i === revealData.correctOptionIndex;
                const isWrong = revealData && i !== revealData.correctOptionIndex;
                return (
                  <div
                    key={i}
                    className={cn(
                      'hex-option px-5 py-3 text-white font-semibold text-sm',
                      isCorrect
                        ? 'bg-neon-green shadow-[0_0_20px_rgba(0,255,106,0.4)]'
                        : isWrong
                          ? 'opacity-35 ' + (OPTION_BG[i] || 'bg-[#1565c0]')
                          : OPTION_BG[i] || 'bg-[#1565c0]',
                    )}
                  >
                    <span className="font-mono mr-2 opacity-80">{OPTION_LETTERS[i]}.</span>
                    {opt.text}
                    {isCorrect && <span className="ml-2">✓</span>}
                  </div>
                );
              })}
            </div>

            {revealData?.allWrong && (
              <div className="mt-3 bg-neon-gold/10 border border-neon-gold/30 text-neon-gold rounded-lg px-4 py-2 text-sm text-center shrink-0">
                All teams answered incorrectly — no eliminations
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center neon-border rounded-xl bg-surface/40">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground/20 mb-2">
                {state === 'LOBBY' ? 'Waiting for teams to join...' :
                  state === 'ROUND_INTRO' ? `Round ${(gameState?.currentRoundIndex || 0) + 1}: ${currentRound?.name || ''}` :
                    state === 'SCOREBOARD' ? 'Showing Scoreboard' :
                      state === 'BREAK' ? '☕ Break Time' :
                        state === 'FINAL_RESULTS' ? '🏆 Game Over' : 'Waiting...'}
              </p>
              {state === 'LOBBY' && (
                <p className="text-foreground/30 text-sm">{teamList.length} team{teamList.length !== 1 ? 's' : ''} in lobby</p>
              )}
            </div>
          </div>
        )}

        {/* Bottom Controls - two rows */}
        <div className="neon-border rounded-xl p-3 shrink-0 bg-surface/80">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {state === 'LOBBY' && (
              <CtrlBtn color="green" onClick={handleStartGame}>🎮 START GAME</CtrlBtn>
            )}
            {state === 'ROUND_INTRO' && (
              <CtrlBtn color="green" onClick={handleNextQuestion}>🎮 START ROUND</CtrlBtn>
            )}
            {(state === 'QUESTION' && questionState === 'REVEALED') && (
              <CtrlBtn color="cyan" onClick={handleNextQuestion}>⏭ NEXT QUESTION</CtrlBtn>
            )}
            {state === 'QUESTION' && questionState === 'WAITING' && (
              <CtrlBtn color="green" onClick={handleStartTimer}>▶ PLAY TIMER</CtrlBtn>
            )}
            {state === 'QUESTION' && questionState === 'ACTIVE' && (
              <>
                <CtrlBtn color="gold" onClick={handlePauseTimer}>⏸ PAUSE TIMER</CtrlBtn>
                <CtrlBtn color="purple" onClick={handleRevealAnswer}>👁 REVEAL ANSWER</CtrlBtn>
              </>
            )}
            {state === 'SCOREBOARD' && (
              <CtrlBtn color="green" onClick={handleAdvanceRound}>⏭ NEXT ROUND</CtrlBtn>
            )}
            {state === 'BREAK' && (
              <CtrlBtn color="green" onClick={handleEndBreak}>▶ END BREAK</CtrlBtn>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
            {state !== 'LOBBY' && state !== 'BREAK' && (
              <CtrlBtn color="gold" onClick={handleStartBreak}>☕ START BREAK</CtrlBtn>
            )}
            <CtrlBtn color="cyan" onClick={handleShowScoreboard}>📊 SHOW SCOREBOARD</CtrlBtn>
            {state !== 'LOBBY' && state !== 'FINAL_RESULTS' && (
              <>
                <CtrlBtn color="purple" onClick={() => emit('advance_round')}>🎯 ROUND INTRO</CtrlBtn>
                <CtrlBtn color="cyan" onClick={handleAdvanceRound}>⏭ NEXT ROUND</CtrlBtn>
                <CtrlBtn color="red" onClick={handleEndGame}>⏹ END GAME</CtrlBtn>
              </>
            )}
          </div>
          <p className="text-center text-xs text-foreground/20 mt-2">
            Space=Next · T=Timer · P=Pause · R=Reveal · S=Scoreboard
          </p>
        </div>
      </div>

      {/* ═══════ RIGHT SIDEBAR ═══════ */}
      <div className="w-52 shrink-0 flex flex-col gap-3 overflow-y-auto">
        <SidebarSection title="GAME CONTROLS">
          <SidebarBtn icon="🐎" onClick={() => handleLaunchMiniGame('horse-race')} disabled={state !== 'BREAK'}>
            Horse Race
          </SidebarBtn>
          <SidebarBtn icon="🃏" onClick={() => handleLaunchMiniGame('card-shuffle')} disabled={state !== 'BREAK'}>
            Card Shuffle
          </SidebarBtn>
        </SidebarSection>

        <SidebarSection title="LIVE RESPONSES">
          <div className="px-3 py-3 text-center">
            <p className="text-sm text-foreground/40 mb-1">
              <span className="text-neon-cyan text-glow-cyan font-bold text-lg">{gameState?.responseCount || 0}</span>
              <span className="mx-1">of</span>
              <span className="font-bold text-lg">{gameState?.totalTeams || 0}</span>
              <span className="ml-1">Teams responded</span>
            </p>
            {gameState && (gameState.responseCount || 0) > 0 && (
              <div className="mt-2 h-2 bg-surface-light rounded-full overflow-hidden">
                <div
                  className="h-full bg-neon-cyan rounded-full transition-all shadow-[0_0_8px_rgba(0,229,255,0.4)]"
                  style={{ width: `${gameState.totalTeams ? ((gameState.responseCount || 0) / gameState.totalTeams) * 100 : 0}%` }}
                />
              </div>
            )}
          </div>
        </SidebarSection>

        <SidebarSection title="TEAM SCORE">
          <div className="max-h-80 overflow-y-auto">
            {sortedTeams.length === 0 ? (
              <p className="text-center text-foreground/30 text-xs py-3">No teams yet</p>
            ) : (
              <div className="space-y-1 px-1 py-1">
                {sortedTeams.map((team) => (
                  <div
                    key={team.teamId}
                    className={cn(
                      'flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm',
                      team.isEliminated ? 'opacity-40 line-through' : 'bg-surface-light/30',
                    )}
                  >
                    <span className="font-medium truncate mr-2">{team.teamName}</span>
                    <span className="font-mono font-bold text-neon-cyan shrink-0">{team.score} Points</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SidebarSection>
      </div>

      {/* ═══════ MODALS ═══════ */}
      {showAddTeam && (
        <ModalOverlay onClose={() => setShowAddTeam(false)} title="Add Team">
          <input
            type="text" value={addTeamName}
            onChange={(e) => setAddTeamName(e.target.value)}
            placeholder="Team name"
            className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-neon-cyan/50 mb-3"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleAddTeam()}
          />
          <div className="flex gap-2">
            <button onClick={handleAddTeam} className="flex-1 bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/40 py-2 rounded-lg text-sm font-medium hover:bg-neon-cyan/30">Add</button>
            <button onClick={() => setShowAddTeam(false)} className="flex-1 border border-border py-2 rounded-lg text-sm font-medium hover:bg-surface-light">Cancel</button>
          </div>
        </ModalOverlay>
      )}

      {editScoreTeamId !== null && (
        <ModalOverlay onClose={() => setEditScoreTeamId(null)} title="Edit Team Score">
          {editScoreTeamId === -1 ? (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {sortedTeams.map((team) => (
                <button
                  key={team.teamId}
                  onClick={() => { setEditScoreTeamId(team.teamId); setEditScoreValue(String(team.score)); }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-light text-sm"
                >
                  <span>{team.teamName}</span>
                  <span className="font-mono text-neon-cyan">{team.score}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <p className="text-sm text-foreground/50 mb-2">
                {sortedTeams.find((t) => t.teamId === editScoreTeamId)?.teamName}
              </p>
              <input
                type="number" value={editScoreValue}
                onChange={(e) => setEditScoreValue(e.target.value)}
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-neon-cyan/50 mb-3"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleEditScore(editScoreTeamId)}
              />
              <div className="flex gap-2">
                <button onClick={() => handleEditScore(editScoreTeamId)} className="flex-1 bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/40 py-2 rounded-lg text-sm font-medium hover:bg-neon-cyan/30">Save</button>
                <button onClick={() => setEditScoreTeamId(null)} className="flex-1 border border-border py-2 rounded-lg text-sm font-medium hover:bg-surface-light">Cancel</button>
              </div>
            </>
          )}
        </ModalOverlay>
      )}

      {showRemoveTeam && (
        <ModalOverlay onClose={() => setShowRemoveTeam(false)} title="Remove Team">
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {teamList.length === 0 ? (
              <p className="text-center text-foreground/30 text-sm py-4">No teams to remove</p>
            ) : (
              teamList.map((team) => (
                <div key={team.teamId} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-light">
                  <span className="text-sm">{team.teamName}</span>
                  <button
                    onClick={() => { handleRemoveTeam(team.teamId); setShowRemoveTeam(false); }}
                    className="text-xs text-neon-red hover:text-neon-red/80 font-medium"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sidebar-section">
      <div className="sidebar-section-title">{title}</div>
      <div className="p-2 space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarBtn({
  children, onClick, active, disabled, icon,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  icon?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'sidebar-btn',
        active && 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/30',
      )}
    >
      {icon && <span className="text-sm">{icon}</span>}
      {children}
    </button>
  );
}

const CTRL_COLORS: Record<string, string> = {
  green: 'bg-neon-green/15 text-neon-green border-neon-green/40 hover:bg-neon-green/25',
  cyan: 'bg-neon-cyan/15 text-neon-cyan border-neon-cyan/40 hover:bg-neon-cyan/25',
  red: 'bg-neon-red/15 text-neon-red border-neon-red/40 hover:bg-neon-red/25',
  gold: 'bg-neon-gold/15 text-neon-gold border-neon-gold/40 hover:bg-neon-gold/25',
  purple: 'bg-neon-purple/15 text-neon-purple border-neon-purple/40 hover:bg-neon-purple/25',
};

function CtrlBtn({ children, onClick, color = 'cyan' }: { children: React.ReactNode; onClick: () => void; color?: string }) {
  return (
    <button onClick={onClick} className={`ctrl-btn ${CTRL_COLORS[color] || CTRL_COLORS.cyan}`}>
      {children}
    </button>
  );
}

function ModalOverlay({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="neon-border bg-surface rounded-2xl p-5 w-80 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
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
