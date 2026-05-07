'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { connectSocket } from '@/lib/socket';
import { usePlayerSession } from '../playerSession';
import { Button } from '@/components/shared/Button';
import { cn } from '@/lib/utils';

type MiniGameType = 'kangaroo_race' | 'card_shuffle' | null;

interface HorseOption {
  id: number;
  buttonClass: string;
}

const HORSES: HorseOption[] = [
  { id: 1, buttonClass: 'bg-[#008df5] shadow-[0_7px_0_#005aa3]' },
  { id: 2, buttonClass: 'bg-[#ff8900] shadow-[0_7px_0_#b45f00]' },
  { id: 3, buttonClass: 'bg-[#2aac00] shadow-[0_7px_0_#1f7b00]' },
  { id: 4, buttonClass: 'bg-[#e09b00] shadow-[0_7px_0_#9a6b00]' },
  { id: 5, buttonClass: 'bg-[#6c00c8] shadow-[0_7px_0_#42007c]' },
  { id: 6, buttonClass: 'bg-[#d50024] shadow-[0_7px_0_#8a0017]' },
];

const CARD_POSITIONS = [
  { id: 1, label: 'Left', buttonClass: 'bg-[#007BFF] shadow-[0_6px_0_#0056b3]' },
  { id: 2, label: 'Middle', buttonClass: 'bg-[#FF8C00] shadow-[0_6px_0_#cc7000]' },
  { id: 3, label: 'Right', buttonClass: 'bg-[#28A745] shadow-[0_6px_0_#1c7a32]' },
] as const;

const CARD_LABEL_MAP: Record<number, string> = { 1: 'Left', 2: 'Middle', 3: 'Right' };
const CARD_ROUND_BONUS: Record<1 | 2 | 3 | 4, number> = {
  1: 10,
  2: 20,
  3: 30,
  4: 50,
};
const CARD_FINISHED_MESSAGE = 'Host will Start the game shortly !!';

/** Unity may send 1–3 (Left/Middle/Right) or 0–2; player UI always uses 1–3. */
function normalizeCardSlotToChoice(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  if (t >= 1 && t <= 3) return t;
  if (t >= 0 && t <= 2) return t + 1;
  return null;
}

function normalizeMiniGameId(game: unknown): string {
  if (game == null || game === '') return '';
  return String(game).toLowerCase().replace(/-/g, '_');
}

function normalizeUnityPayload(value: unknown, depth = 0): Record<string, unknown> {
  if (depth > 10) return {};
  if (value == null) return {};
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return normalizeUnityPayload(parsed, depth + 1);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

type ResultPhase = null | 'winner' | 'loser' | 'finished';

function MobileFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-[#050017]">
      <div
        className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden"
        style={{
          backgroundImage: "url('/mobilebackground.png')",
          backgroundSize: '100% 100%',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function MiniGamePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, clearSession } = usePlayerSession();

  const gameParam = searchParams.get('game') as MiniGameType;
  const [gameType, setGameType] = useState<MiniGameType>(gameParam);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  /** Same as selectedChoice but stable for socket handlers (avoid stale closure / effect churn). */
  const lockedPickRef = useRef<number | null>(null);
  const selectedChoiceRef = useRef<number | null>(null);
  const [resultPhase, setResultPhase] = useState<ResultPhase>(null);
  const [winningValue, setWinningValue] = useState<number | null>(null);
  const [roundOpen, setRoundOpen] = useState(false);
  /** True once Unity sends SHUFFLE_COMPLETE — cards have stopped, player should pick. */
  const [shuffleComplete, setShuffleComplete] = useState(false);
  const [activeCardRound, setActiveCardRound] = useState<1 | 2 | 3 | 4 | null>(null);
  /** Short banner when host starts round 1 / advances to round 2+ */
  const [roundAnnouncement, setRoundAnnouncement] = useState<string | null>(null);
  const sessionPinRef = useRef(session.pin);
  sessionPinRef.current = session.pin;
  selectedChoiceRef.current = selectedChoice;

  useEffect(() => {
    if (!session.pin || !session.teamId) {
      router.replace('/play/join');
      return;
    }
  }, [session, router]);

  useEffect(() => {
    /** Singleton; read here so listeners always register (avoids first-paint `useSocket` null). */
    const socket = connectSocket();

    const logSocketIn = (event: string, payload?: unknown) => {
      console.log('[play/mini-game][socket][in]', event, payload ?? null);
    };

    /** Re‑join the session room after any reconnect (Fast Refresh, network drop, etc.)
     *  join_session is blocked by the name-collision guard when the old socket is still
     *  briefly alive — mini_game_rejoin bypasses that and also replays the reveal state. */
    const rejoinSession = () => {
      const pin = sessionPinRef.current;
      const teamId = session.teamId;
      if (!pin || !teamId) return;
      console.log('[play/mini-game] reconnected — emitting mini_game_rejoin', { pin, teamId });
      socket.emit('mini_game_rejoin', {
        pin,
        teamId,
        teamName: session.teamName,
      });
    };
    socket.on('connect', rejoinSession);
    // Also rejoin immediately if the socket is already connected.
    if (socket.connected) rejoinSession();

    const exitMiniGameToGame = () => {
      lockedPickRef.current = null;
      setSelectedChoice(null);
      setResultPhase(null);
      setWinningValue(null);
      setRoundOpen(false);
      setShuffleComplete(false);
      setActiveCardRound(null);
      setRoundAnnouncement(null);
      window.location.assign('/play/game');
    };

    const applyCardShuffleReveal = (payload: {
      correctPosition?: number;
      correct_position?: number;
      roundNumber?: number;
    }) => {
      setGameType('card_shuffle');
      const raw = payload.correctPosition ?? payload.correct_position;
      const winning = normalizeCardSlotToChoice(raw);
      setWinningValue(winning);
      setRoundOpen(false);
      setRoundAnnouncement(null);
      const rn = Number(payload.roundNumber);
      if (Number.isFinite(rn) && rn >= 1 && rn <= 4) {
        setActiveCardRound(rn as 1 | 2 | 3 | 4);
      }
      const pick = lockedPickRef.current ?? selectedChoiceRef.current;
      if (winning !== null && pick !== null) {
        setResultPhase(pick === winning ? 'winner' : 'loser');
      } else {
        setResultPhase('loser');
      }
    };

    const onMiniGameStart = (data: { game: string }) => {
      logSocketIn('mini_game_start', data);
      setGameType(data.game as MiniGameType);
      lockedPickRef.current = null;
      setSelectedChoice(null);
      setResultPhase(null);
      setWinningValue(null);
      setRoundOpen(false);
      setActiveCardRound(null);
      setRoundAnnouncement(null);
    };

    const onMiniGameCommand = (data: {
      game?: string;
      command?: 'start_game' | 'next_round' | 'reveal_cards' | 'reveal_winner';
      roundNumber?: number;
      cardShuffleReveal?: {
        game?: string;
        correctPosition?: number;
        correct_position?: number;
        roundNumber?: number;
        cardPositions?: number[];
      };
    }) => {
      logSocketIn('mini_game_command', data);
      const gid = normalizeMiniGameId(data?.game);
      if (gid === 'kangaroo_race') {
        if (data.command === 'start_game') {
          lockedPickRef.current = null;
          setSelectedChoice(null);
          setResultPhase(null);
          setWinningValue(null);
          setRoundOpen(true);
          setShuffleComplete(false);
          setRoundAnnouncement('Race started - pick your kangaroo');
          window.setTimeout(() => setRoundAnnouncement(null), 2800);
        }
        if (data.command === 'reveal_winner') {
          setRoundOpen(false);
          setRoundAnnouncement('Revealing winner...');
          window.setTimeout(() => setRoundAnnouncement(null), 1800);
        }
        return;
      }

      if (gid !== 'card_shuffle') return;
      if (data.command === 'reveal_cards') {
        // Server now explicitly sends mini_game_reveal after reveal_cards.
        // We just log here — the result will come via onMiniGameReveal.
        console.log(
          '[play/mini-game] mini_game_command reveal_cards — waiting for mini_game_reveal from server',
        );
      }
      if (data.command === 'start_game' || data.command === 'next_round') {
        lockedPickRef.current = null;
        setSelectedChoice(null);
        setResultPhase(null);
        setWinningValue(null);
        setRoundOpen(true);
        setShuffleComplete(false);
        const n =
          data.command === 'start_game'
            ? 1
            : Number.isFinite(Number(data.roundNumber))
              ? Number(data.roundNumber)
              : 2;
        if (n >= 1 && n <= 4) {
          setActiveCardRound(n as 1 | 2 | 3 | 4);
        }
        setRoundAnnouncement(`Round ${n} — make your pick`);
        window.setTimeout(() => setRoundAnnouncement(null), 2800);
      }
    };

    const onMiniGameReveal = (data: {
      game?: string;
      correctPosition?: number;
      correct_position?: number;
      winningKangaroo?: number;
      roundNumber?: number;
      cardPositions?: number[];
    }) => {
      logSocketIn('mini_game_reveal', data);
      const gid = normalizeMiniGameId(data?.game);
      if (gid === 'kangaroo_race') {
        const winning = Number(data?.winningKangaroo);
        setGameType('kangaroo_race');
        setWinningValue(Number.isFinite(winning) ? winning : null);
        setRoundOpen(false);
        setRoundAnnouncement(null);
        const pick = lockedPickRef.current ?? selectedChoiceRef.current;
        if (Number.isFinite(winning) && pick !== null) {
          setResultPhase(pick === winning ? 'winner' : 'loser');
        }
        return;
      }

      if (gid && gid !== 'card_shuffle') return;
      console.log(
        '[play/mini-game] mini_game_reveal (authoritative winning slot from server):',
        data,
      );
      applyCardShuffleReveal(data);
    };

    const onMiniGamePlayerResult = (data: {
      game?: string;
      result?: 'winner' | 'loser';
      correctPosition?: number;
      correct_position?: number;
      winningKangaroo?: number;
      selectedChoice?: number | null;
      roundNumber?: number;
    }) => {
      logSocketIn('mini_game_player_result', data);
      const gid = normalizeMiniGameId(data?.game);
      if (gid === 'kangaroo_race') {
        const winning = Number(data?.winningKangaroo);
        const selected = Number(data?.selectedChoice);

        setGameType('kangaroo_race');
        setWinningValue(Number.isFinite(winning) ? winning : null);
        setRoundOpen(false);
        setRoundAnnouncement(null);

        if (Number.isFinite(selected) && selected >= 1 && selected <= 6) {
          lockedPickRef.current = selected;
          setSelectedChoice(selected);
        }

        setResultPhase(data?.result === 'winner' ? 'winner' : 'loser');
        return;
      }

      if (gid && gid !== 'card_shuffle') return;

      const winning = normalizeCardSlotToChoice(data?.correctPosition ?? data?.correct_position);
      const selected = normalizeCardSlotToChoice(data?.selectedChoice);

      setGameType('card_shuffle');
      setWinningValue(winning);
      setRoundOpen(false);
      setRoundAnnouncement(null);
      const rn = Number(data?.roundNumber);
      if (Number.isFinite(rn) && rn >= 1 && rn <= 4) {
        setActiveCardRound(rn as 1 | 2 | 3 | 4);
      }

      if (selected !== null) {
        lockedPickRef.current = selected;
        setSelectedChoice(selected);
      }

      setResultPhase(data?.result === 'winner' ? 'winner' : 'loser');
    };

    const onMiniGameUpdate = (data: {
      source?: string;
      action?: string;
      value?: unknown;
      game?: string;
    }) => {
      logSocketIn('mini_game_update', data);
      const gid = normalizeMiniGameId(data?.game);
      if (gid && gid !== 'card_shuffle' && data?.source !== 'unity') return;

      const action = String(data?.action || '').toUpperCase();
      const directValue = normalizeUnityPayload(data?.value);
      const nestedPayload = normalizeUnityPayload(directValue.payload);

      if (action === 'SHUFFLE_COMPLETE') {
        // Cards have stopped shuffling — mark it so the UI prompts the player to pick.
        // Win/lose is only shown after the HOST taps "reveal".
        console.log(
          '[play/mini-game] mini_game_update SHUFFLE_COMPLETE — cards stopped, round stays open for picking',
          {
            correctPosition:
              nestedPayload.correct_position ??
              directValue.correct_position ??
              '(hidden until host reveals)',
          },
        );
        setShuffleComplete(true);
        // Do NOT call applyCardShuffleReveal here.
        return;
      }

      // MINIGAME_REVEAL and ROUND_COMPLETE no longer auto-reveal on mobile.
      // The host controls the reveal via reveal_cards → mini_game_reveal.
      if (action === 'MINIGAME_REVEAL' || action === 'ROUND_COMPLETE') {
        console.log(
          `[play/mini-game] mini_game_update ${action} — ignoring (host controls reveal)`,
        );
        return;
      }

      if (action === 'GAME_COMPLETE' || action === 'RAW') {
        const resultType = String(directValue.type || '').toUpperCase();
        console.log('[play/mini-game] mini_game_update GAME_COMPLETE/RAW resultType:', resultType);
        // No auto-reveal for any sub-type — host controls it.
      }
    };

    const onMiniGameEnd = (data: {
      game?: string;
      winningCard?: number;
      winningKangaroo?: number;
      holdScreen?: boolean;
      status?: string;
      message?: string;
    }) => {
      logSocketIn('mini_game_end', data);
      if (normalizeMiniGameId(data?.game) === 'card_shuffle' && data?.holdScreen) {
        setGameType('card_shuffle');
        setWinningValue(null);
        setRoundOpen(false);
        setRoundAnnouncement(CARD_FINISHED_MESSAGE);
        setResultPhase('finished');
        return;
      }
      const winning = data.winningCard ?? data.winningKangaroo ?? null;
      setWinningValue(winning);
      lockedPickRef.current = null;
      setSelectedChoice(null);
      setResultPhase(null);
      setRoundOpen(false);
      setRoundAnnouncement(null);
      window.location.assign('/play/game');
    };

    const onBreakEnd = () => {
      logSocketIn('break_end');
      exitMiniGameToGame();
    };

    const onRoundIntro = () => {
      logSocketIn('round_intro');
      exitMiniGameToGame();
    };

    const onQuestionActive = () => {
      logSocketIn('question_active');
      exitMiniGameToGame();
    };

    const onAnswerReveal = () => {
      logSocketIn('answer_reveal');
      exitMiniGameToGame();
    };

    const onScoreboard = () => {
      logSocketIn('scoreboard');
      exitMiniGameToGame();
    };

    const onSessionState = (data: any) => {
      logSocketIn('session_state', data);
      const gameState = data?.gameState ?? data;
      if (!gameState || !gameState.state) return;
      if (!gameState.activeMiniGame && gameState.state !== 'LOBBY') {
        exitMiniGameToGame();
      }
    };

    const onGameEnd = () => {
      logSocketIn('game_end');
      clearSession();
      router.replace('/play/join');
    };

    const onSessionDeleted = (data: { pin?: string }) => {
      logSocketIn('session_deleted', data);
      const pin = data?.pin ? String(data.pin) : '';
      if (!pin || pin !== String(sessionPinRef.current)) return;
      clearSession();
      router.replace('/play/join');
    };

    const onDisconnect = (reason: string) => {
      console.warn('[play/mini-game][socket][disconnect]', reason);
    };

    const onConnectError = (error: Error) => {
      console.error('[play/mini-game][socket][connect_error]', error?.message || error);
    };

    socket.on('mini_game_start', onMiniGameStart);
    socket.on('mini_game_command', onMiniGameCommand);
    socket.on('mini_game_reveal', onMiniGameReveal);
    socket.on('mini_game_player_result', onMiniGamePlayerResult);
    socket.on('mini_game_update', onMiniGameUpdate);
    socket.on('mini_game_end', onMiniGameEnd);
    socket.on('break_end', onBreakEnd);
    socket.on('round_intro', onRoundIntro);
    socket.on('question_active', onQuestionActive);
    socket.on('answer_reveal', onAnswerReveal);
    socket.on('scoreboard', onScoreboard);
    socket.on('session_state', onSessionState);
    socket.on('game_end', onGameEnd);
    socket.on('session_deleted', onSessionDeleted);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    return () => {
      socket.off('connect', rejoinSession);
      socket.off('mini_game_start', onMiniGameStart);
      socket.off('mini_game_command', onMiniGameCommand);
      socket.off('mini_game_reveal', onMiniGameReveal);
      socket.off('mini_game_player_result', onMiniGamePlayerResult);
      socket.off('mini_game_update', onMiniGameUpdate);
      socket.off('mini_game_end', onMiniGameEnd);
      socket.off('break_end', onBreakEnd);
      socket.off('round_intro', onRoundIntro);
      socket.off('question_active', onQuestionActive);
      socket.off('answer_reveal', onAnswerReveal);
      socket.off('scoreboard', onScoreboard);
      socket.off('session_state', onSessionState);
      socket.off('game_end', onGameEnd);
      socket.off('session_deleted', onSessionDeleted);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, [router, clearSession]);

  const handleChoice = (choiceId: number) => {
    const socket = connectSocket();
    if (!roundOpen || lockedPickRef.current !== null) return;
    lockedPickRef.current = choiceId;
    setSelectedChoice(choiceId);
    console.log('[play/mini-game][socket][out] mini_game_action', {
      action: 'select',
      value: choiceId,
    });
    socket.emit('mini_game_action', {
      action: 'select',
      value: choiceId,
    });
  };

  const activeRoundBonus =
    activeCardRound != null ? CARD_ROUND_BONUS[activeCardRound] : CARD_ROUND_BONUS[1];

  /** Card shuffle shows win/lose on the themed pick screen; horse race uses full-screen result. */
  if (resultPhase && gameType !== 'card_shuffle') {
    const isWinner = resultPhase === 'winner';
    const winLabel =
      gameType === 'kangaroo_race' && winningValue != null ? `Kangaroo #${winningValue}` : '';

    return (
      <MobileFrame>
        <div className="flex flex-1 items-center justify-center p-4 sm:p-6 md:p-8">
          <div className="w-full max-w-sm text-center sm:max-w-md">
            {isWinner ? (
              <>
                <div className="mb-4 text-5xl sm:text-6xl">WIN</div>
                <h2 className="mb-2 text-2xl font-black text-[#ffd700] sm:text-3xl">
                  You win this round!
                </h2>
                <p className="text-foreground/60 text-sm mb-4">
                  You picked <span className="font-bold text-[#ffd700]">{winLabel}</span> — that was
                  the winner.
                </p>
              </>
            ) : (
              <>
                <div className="mb-4 text-5xl sm:text-6xl">LOSE</div>
                <h2 className="mb-2 text-2xl font-black text-foreground/60 sm:text-3xl">
                  You lose this round
                </h2>
                <p className="text-foreground/40 text-sm mb-4">
                  The winning pick was <span className="font-bold text-primary">{winLabel}</span>
                  {selectedChoice != null ? `; you picked #${selectedChoice}.` : '.'}
                </p>
              </>
            )}
            <p className="text-xs text-foreground/30 mt-6">
              Waiting for the host to start the next round...
            </p>
          </div>
        </div>
      </MobileFrame>
    );
  }

  return (
    <MobileFrame>
      <div
        className={
          gameType === 'card_shuffle'
            ? 'relative flex min-h-0 flex-1 flex-col overflow-hidden'
            : 'relative flex flex-1 items-center justify-center p-4 sm:p-6 md:p-8'
        }
      >
        {roundAnnouncement && resultPhase !== 'finished' ? (
          <div
            className="pointer-events-none absolute inset-x-4 top-6 z-20 mx-auto max-w-md animate-fadeIn rounded-2xl border border-[#00d8ff]/60 bg-[linear-gradient(180deg,rgba(20,40,90,0.96)_0%,rgba(10,8,40,0.98)_100%)] px-4 py-3 text-center shadow-[0_0_24px_rgba(0,216,255,0.35)] sm:inset-x-8"
            role="status"
          >
            <p className="text-lg font-black text-white drop-shadow-sm sm:text-xl">
              {roundAnnouncement}
            </p>
          </div>
        ) : null}

        {gameType === 'kangaroo_race' && (
          <div className="relative z-10 flex min-h-0 flex-1 flex-col px-5 pb-8 pt-8 sm:px-8">
            <header className="shrink-0 text-center">
              <h1 className="text-[clamp(1.65rem,6vw,2.2rem)] font-black uppercase leading-tight tracking-[0.06em] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]">
                Kangaroo Race !!
              </h1>
              <p className="mt-2 text-[1.05rem] font-extrabold leading-tight text-white sm:text-xl">
                Which Kangaroo will win
              </p>
              <p className="text-[1.05rem] font-extrabold leading-tight text-white sm:text-xl">
                Pick your Kangaroo
              </p>
            </header>

            <div className="mx-auto mt-4 flex h-[170px] w-[170px] items-center justify-center rounded-2xl bg-[radial-gradient(circle_at_50%_10%,rgba(255,255,255,0.2),transparent_70%)]">
              <img
                src="/kangarooPic.png"
                alt="Kangaroo"
                className="h-full w-full object-contain"
                onError={(e) => {
                  const el = e.currentTarget;
                  el.style.display = 'none';
                }}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {HORSES.map((horse) => (
                <button
                  key={horse.id}
                  onClick={() => handleChoice(horse.id)}
                  disabled={!roundOpen || selectedChoice !== null || resultPhase !== null}
                  className={cn(
                    'rounded-xl py-4 text-center text-5xl font-black text-white transition-all duration-200 active:translate-y-0.5 active:shadow-none',
                    horse.buttonClass,
                    selectedChoice === horse.id
                      ? 'ring-4 ring-white/55 scale-[1.02]'
                      : !roundOpen || selectedChoice !== null || resultPhase !== null
                        ? 'opacity-40 saturate-75'
                        : 'hover:brightness-110 hover:scale-[1.02]',
                  )}
                >
                  {horse.id}
                </button>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-[#00d8ff]/65 bg-[rgba(0,0,0,0.62)] px-4 py-3 text-center shadow-[0_0_12px_rgba(0,216,255,0.25)]">
              <p className="text-base font-black text-white">
                {resultPhase
                  ? 'Waiting for the host to start the next race...'
                  : selectedChoice
                    ? 'Pick locked! Watch the race on the venue screen !!'
                    : roundOpen
                      ? 'Tap a number to lock your kangaroo'
                      : 'Waiting for host to start race...'}
              </p>
            </div>
          </div>
        )}

        {gameType === 'card_shuffle' && (
          <div className="relative z-10 flex min-h-0 flex-1 flex-col px-5 pb-8 pt-10 sm:px-8">
            {resultPhase !== 'finished' ? (
              <header className="shrink-0 text-center">
                <h1 className="text-[clamp(1.75rem,6vw,2.35rem)] font-black uppercase leading-tight tracking-[0.06em] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]">
                  Card shuffle !!
                </h1>
                <p className="mt-3 text-base font-bold leading-snug text-white sm:text-lg">
                  Which Card is the Queen of Hearts{' '}
                  <span className="inline-block" aria-hidden>
                    ❤️
                  </span>
                </p>
                <p className="mt-2 text-xs font-extrabold uppercase tracking-[0.14em] text-cyan-200/95 sm:text-sm">
                  {activeCardRound != null
                    ? `Round ${activeCardRound} running • Correct pick = +${activeRoundBonus}`
                    : 'Waiting for Round 1 to start'}
                </p>
              </header>
            ) : null}

            {resultPhase === 'winner' ? (
              <div className="mx-auto mt-6 w-full max-w-md shrink-0 animate-fadeIn rounded-xl border-2 border-[#22c55e] bg-black px-4 py-3.5 text-center shadow-[0_0_20px_rgba(34,197,94,0.35)]">
                <p className="text-lg font-black uppercase tracking-wide text-white sm:text-xl">
                  You win this round!
                </p>
                <p className="mt-2 text-[0.95rem] font-black leading-snug tracking-wide text-[#39ff14] sm:text-base">
                  {`Correct — you found the Queen +${activeRoundBonus}`}
                </p>
              </div>
            ) : resultPhase === 'loser' ? (
              <div className="mx-auto mt-6 w-full max-w-md shrink-0 animate-fadeIn rounded-xl border-2 border-[#f87171] bg-black px-4 py-3.5 text-center shadow-[0_0_16px_rgba(248,113,113,0.25)]">
                <p className="text-lg font-black uppercase tracking-wide text-[#fecaca] sm:text-xl">
                  You lose this round
                </p>
                <p className="mt-2 text-[0.95rem] font-bold leading-snug text-[#fecaca]/90 sm:text-base">
                  {selectedChoice == null
                    ? 'You did not pick in time — the Queen was hiding elsewhere.'
                    : `Not this time — the Queen was in the ${
                        winningValue != null
                          ? CARD_LABEL_MAP[winningValue] || `position ${winningValue}`
                          : 'other'
                      } position.`}
                </p>
              </div>
            ) : resultPhase === 'finished' ? null : (
              <div className="mx-auto mt-6 w-full max-w-md shrink-0 border-2 border-[#22d3ee] bg-black px-4 py-3.5 text-center shadow-[0_0_0_1px_rgba(34,211,238,0.15)]">
                <p className="text-[0.95rem] font-bold leading-snug text-white sm:text-base">
                  {!roundOpen
                    ? 'Waiting for the host to start the round...'
                    : selectedChoice
                      ? shuffleComplete
                        ? 'Pick locked! Waiting for the host to reveal...'
                        : 'Your pick is locked! Watch the shuffle on the big screen.'
                      : shuffleComplete
                        ? '🃏 Cards have stopped! Make your pick now!'
                        : 'Tap a Card to make your Selection !!'}
                </p>
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-6">
              {resultPhase === 'finished' ? (
                <div className="mx-auto w-full max-w-md text-center">
                  <h2 className="text-[clamp(3.2rem,18vw,5.6rem)] font-black uppercase leading-[0.9] tracking-[0.05em] text-[#59d8ff] [text-shadow:0_0_0_rgb(0,0,0),0_2px_0_#0d4d89,0_0_18px_rgba(89,216,255,0.8)]">
                    GAME
                    <br />
                    OVER
                  </h2>
                  <p className="mt-8 text-[1.05rem] font-extrabold leading-snug text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">
                    {CARD_FINISHED_MESSAGE}
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex w-full max-w-md items-stretch justify-center gap-3 sm:gap-4">
                    {CARD_POSITIONS.map((pos) => {
                      const revealed = resultPhase != null;
                      const lockedPick = selectedChoice !== null;
                      const isSelected = selectedChoice === pos.id;
                      const isWinningPos = winningValue != null && Number(winningValue) === pos.id;

                      let stateClass = 'cursor-not-allowed opacity-35 saturate-[0.85]';
                      if (!revealed) {
                        if (!roundOpen) {
                          stateClass = 'cursor-not-allowed opacity-35';
                        } else if (lockedPick) {
                          stateClass = isSelected
                            ? 'cursor-default ring-4 ring-white ring-offset-2 ring-offset-[#0a0a0c] scale-[1.02]'
                            : 'cursor-not-allowed opacity-40 saturate-75';
                        } else {
                          stateClass =
                            'hover:brightness-110 hover:scale-[1.02] active:translate-y-0.5 active:shadow-none';
                        }
                      } else if (resultPhase === 'winner') {
                        if (isSelected && isWinningPos) {
                          stateClass =
                            'cursor-default scale-[1.03] shadow-[0_0_28px_rgba(57,255,20,0.95),0_0_52px_rgba(0,255,80,0.45)] ring-2 ring-[#39ff14]';
                        } else {
                          stateClass = 'cursor-default opacity-38 saturate-75';
                        }
                      } else {
                        if (isWinningPos) {
                          stateClass =
                            'cursor-default scale-[1.02] shadow-[0_0_24px_rgba(57,255,20,0.75),0_0_40px_rgba(34,197,94,0.35)] ring-2 ring-[#4ade80]';
                        } else if (isSelected) {
                          stateClass =
                            'cursor-default opacity-45 ring-2 ring-[#f87171] ring-offset-2 ring-offset-black saturate-75';
                        } else {
                          stateClass = 'cursor-default opacity-35';
                        }
                      }

                      return (
                        <button
                          key={pos.id}
                          type="button"
                          onClick={() => handleChoice(pos.id)}
                          disabled={!roundOpen || lockedPick || revealed}
                          className={`flex min-h-[120px] min-w-0 flex-1 max-w-[120px] flex-col items-center justify-center rounded-xl px-2 py-5 text-center font-black uppercase tracking-wide text-white transition-all duration-300 sm:min-h-[132px] sm:max-w-[132px] sm:rounded-2xl sm:py-6 ${pos.buttonClass} ${stateClass}`}
                        >
                          <span className="text-lg sm:text-xl">{pos.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {resultPhase != null ? (
                    <p className="mt-4 max-w-md px-2 text-center text-xs font-medium text-white/45">
                      Waiting for the host to start the next round...
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        )}

        {!gameType && (
          <div className="text-center">
            <div className="text-4xl mb-3">MINI GAME</div>
            <h2 className="text-xl font-bold mb-2">Mini-Game</h2>
            <p className="text-foreground/50 text-sm mb-6">
              Waiting for the host to launch a game...
            </p>
            <Button variant="ghost" onClick={() => router.push('/play/game')}>
              Back to Game
            </Button>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}
