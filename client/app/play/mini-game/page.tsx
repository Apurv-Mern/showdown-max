'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { connectSocket } from '@/lib/socket';
import { usePlayerSession } from '../playerSession';
import { Button } from '@/components/shared/Button';

type MiniGameType = 'horse_race' | 'card_shuffle' | null;

interface HorseOption {
  id: number;
  name: string;
  color: string;
}

const HORSES: HorseOption[] = [
  { id: 1, name: 'Thunder', color: 'bg-[#e21b3c]' },
  { id: 2, name: 'Lightning', color: 'bg-[#1368ce]' },
  { id: 3, name: 'Storm', color: 'bg-[#d89e00]' },
  { id: 4, name: 'Blaze', color: 'bg-[#26890c]' },
];

const CARD_POSITIONS = [
  { id: 1, label: 'Left', buttonClass: 'bg-[#007BFF] shadow-[0_6px_0_#0056b3]' },
  { id: 2, label: 'Middle', buttonClass: 'bg-[#FF8C00] shadow-[0_6px_0_#cc7000]' },
  { id: 3, label: 'Right', buttonClass: 'bg-[#28A745] shadow-[0_6px_0_#1c7a32]' },
] as const;

/** Decorative “?” marks for card shuffle backdrop */
function CardShuffleQuestionMarks() {
  const marks = [
    { className: 'left-[4%] top-[10%] text-[7rem] rotate-[-12deg]' },
    { className: 'right-[6%] top-[18%] text-[5.5rem] rotate-[8deg]' },
    { className: 'left-[22%] top-[4%] text-[4rem] opacity-40' },
    { className: 'right-[18%] top-[8%] text-[3.5rem] opacity-35' },
    { className: 'left-[40%] top-[14%] text-[6rem] opacity-25 -translate-x-1/2' },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 z-1 overflow-hidden" aria-hidden>
      {marks.map((m, i) => (
        <span
          key={i}
          className={`absolute font-black leading-none text-[#a78bfa]/22 ${m.className}`}
        >
          ?
        </span>
      ))}
    </div>
  );
}

/** Semicircle of dots along the bottom (stadium-style) */
function CardShuffleBottomDots() {
  const n = 28;
  const cx = 200;
  const cy = 108;
  const r = 168;
  const dots = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const angleDeg = 200 + t * (340 - 200);
    const rad = (angleDeg * Math.PI) / 180;
    const x = cx + r * Math.cos(rad);
    const y = cy + r * Math.sin(rad);
    return { x, y, key: i };
  });
  return (
    <svg
      className="pointer-events-none absolute bottom-0 left-1/2 z-1 h-[min(28vh,200px)] w-[min(140%,28rem)] -translate-x-1/2 text-white/25"
      viewBox="0 0 400 120"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden
    >
      {dots.map((d) => (
        <circle key={d.key} cx={d.x} cy={d.y} r={2.2} fill="currentColor" />
      ))}
    </svg>
  );
}

const CARD_LABEL_MAP: Record<number, string> = { 1: 'Left', 2: 'Middle', 3: 'Right' };

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
        className="mobile-play-bg relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden"
        style={{
          backgroundImage: "url('/Mobile_BG.png')",
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

    const applyCardShuffleReveal = (payload: {
      correctPosition?: number;
      correct_position?: number;
    }) => {
      setGameType('card_shuffle');
      const raw = payload.correctPosition ?? payload.correct_position;
      const winning = normalizeCardSlotToChoice(raw);
      setWinningValue(winning);
      setRoundOpen(false);
      setRoundAnnouncement(null);
      const pick = lockedPickRef.current ?? selectedChoiceRef.current;
      if (winning !== null && pick !== null) {
        setResultPhase(pick === winning ? 'winner' : 'loser');
      } else {
        setResultPhase('loser');
      }
    };

    const onMiniGameStart = (data: { game: string }) => {
      setGameType(data.game as MiniGameType);
      lockedPickRef.current = null;
      setSelectedChoice(null);
      setResultPhase(null);
      setWinningValue(null);
      setRoundOpen(false);
      setRoundAnnouncement(null);
    };

    const onMiniGameCommand = (data: {
      game?: string;
      command?: 'start_game' | 'next_round' | 'reveal_cards';
      roundNumber?: number;
      cardShuffleReveal?: {
        game?: string;
        correctPosition?: number;
        correct_position?: number;
        roundNumber?: number;
        cardPositions?: number[];
      };
    }) => {
      if (normalizeMiniGameId(data?.game) !== 'card_shuffle') return;
      if (data.command === 'reveal_cards') {
        console.log('[play/mini-game] mini_game_command reveal_cards — full payload:', data);
        const snap = data.cardShuffleReveal;
        if (snap) {
          const rawCp = snap.correctPosition ?? snap.correct_position;
          const cpNorm = normalizeCardSlotToChoice(rawCp);
          if (cpNorm !== null) {
            // Server already has the winning slot — apply immediately.
            console.log('[play/mini-game] Applying correctPosition from snapshot:', cpNorm);
            applyCardShuffleReveal({ correctPosition: cpNorm });
          } else {
            console.info(
              '[play/mini-game] No correctPosition yet — waiting for mini_game_reveal / mini_game_update (SHUFFLE_COMPLETE).',
            );
          }
        } else {
          console.warn(
            '[play/mini-game] reveal_cards but cardShuffleReveal missing — server may not have attached snapshot',
          );
        }
      }
      if (data.command === 'start_game' || data.command === 'next_round') {
        lockedPickRef.current = null;
        setSelectedChoice(null);
        setResultPhase(null);
        setWinningValue(null);
        setRoundOpen(true);
        const n =
          data.command === 'start_game'
            ? 1
            : Number.isFinite(Number(data.roundNumber))
              ? Number(data.roundNumber)
              : 2;
        setRoundAnnouncement(`Round ${n} — make your pick`);
        window.setTimeout(() => setRoundAnnouncement(null), 2800);
      }
    };

    const onMiniGameReveal = (data: {
      game?: string;
      correctPosition?: number;
      correct_position?: number;
      roundNumber?: number;
      cardPositions?: number[];
    }) => {
      const gid = normalizeMiniGameId(data?.game);
      if (gid && gid !== 'card_shuffle') return;
      console.log('[play/mini-game] mini_game_reveal (authoritative winning slot from server):', data);
      applyCardShuffleReveal(data);
    };

    const onMiniGamePlayerResult = (data: {
      game?: string;
      result?: 'winner' | 'loser';
      correctPosition?: number;
      correct_position?: number;
      selectedChoice?: number | null;
    }) => {
      const gid = normalizeMiniGameId(data?.game);
      if (gid && gid !== 'card_shuffle') return;

      const winning = normalizeCardSlotToChoice(
        data?.correctPosition ?? data?.correct_position,
      );
      const selected = normalizeCardSlotToChoice(data?.selectedChoice);

      setGameType('card_shuffle');
      setWinningValue(winning);
      setRoundOpen(false);
      setRoundAnnouncement(null);

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
      const gid = normalizeMiniGameId(data?.game);
      if (gid && gid !== 'card_shuffle' && data?.source !== 'unity') return;

      const action = String(data?.action || '').toUpperCase();
      const directValue = normalizeUnityPayload(data?.value);
      const nestedPayload = normalizeUnityPayload(directValue.payload);

      if (action === 'SHUFFLE_COMPLETE') {
        const rawSlot =
          nestedPayload.correct_position ??
          nestedPayload.correctPosition ??
          directValue.correct_position ??
          directValue.correctPosition;
        const n = Number(rawSlot);
        console.log('[play/mini-game] mini_game_update SHUFFLE_COMPLETE:', {
          rawSlot,
          nestedKeys: Object.keys(nestedPayload),
          directKeys: Object.keys(directValue),
        });
        if (Number.isFinite(n)) {
          applyCardShuffleReveal({ correctPosition: n });
        } else {
          console.warn('[play/mini-game] SHUFFLE_COMPLETE but could not read correct_position', data);
        }
        return;
      }

      // Server enriches MINIGAME_REVEAL and ROUND_COMPLETE with the stored
      // correctPosition so mobile gets the result even if it missed the first relay.
      if (action === 'MINIGAME_REVEAL' || action === 'ROUND_COMPLETE') {
        const cp = (data as Record<string, unknown>).correctPosition as number | undefined;
        console.log(`[play/mini-game] mini_game_update ${action} — correctPosition from server:`, cp);
        if (Number.isFinite(cp)) {
          applyCardShuffleReveal({ correctPosition: cp });
        } else {
          console.warn(`[play/mini-game] ${action} received but no correctPosition attached`, data);
        }
        return;
      }

      if (action === 'GAME_COMPLETE' || action === 'RAW') {
        const resultType = String(directValue.type || '').toUpperCase();
        if (resultType === 'SHUFFLE_COMPLETE') {
          const rawSlot =
            nestedPayload.correct_position ??
            nestedPayload.correctPosition ??
            directValue.correct_position ??
            directValue.correctPosition;
          const n = Number(rawSlot);
          console.log('[play/mini-game] mini_game_update nested SHUFFLE_COMPLETE:', { rawSlot, data });
          if (Number.isFinite(n)) {
            applyCardShuffleReveal({ correctPosition: n });
          }
        }
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
      if (normalizeMiniGameId(data?.game) === 'card_shuffle' && data?.holdScreen) {
        setGameType('card_shuffle');
        setWinningValue(null);
        setRoundOpen(false);
        setRoundAnnouncement(data.message || 'Game Over');
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
      router.push('/play/game');
    };

    const onBreakEnd = () => {
      window.location.assign('/play/game');
      // router.push('/play/game');
    };

    const onRoundIntro = () => {
      router.push('/play/game');
    };

    const onGameEnd = () => {
      clearSession();
      router.replace('/play/join');
    };

    const onSessionDeleted = (data: { pin?: string }) => {
      const pin = data?.pin ? String(data.pin) : '';
      if (!pin || pin !== String(sessionPinRef.current)) return;
      clearSession();
      router.replace('/play/join');
    };

    socket.on('mini_game_start', onMiniGameStart);
    socket.on('mini_game_command', onMiniGameCommand);
    socket.on('mini_game_reveal', onMiniGameReveal);
    socket.on('mini_game_player_result', onMiniGamePlayerResult);
    socket.on('mini_game_update', onMiniGameUpdate);
    socket.on('mini_game_end', onMiniGameEnd);
    socket.on('break_end', onBreakEnd);
    socket.on('round_intro', onRoundIntro);
    socket.on('game_end', onGameEnd);
    socket.on('session_deleted', onSessionDeleted);

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
      socket.off('game_end', onGameEnd);
      socket.off('session_deleted', onSessionDeleted);
    };
  }, [router, clearSession]);

  const handleChoice = (choiceId: number) => {
    const socket = connectSocket();
    if (!roundOpen || lockedPickRef.current !== null) return;
    lockedPickRef.current = choiceId;
    setSelectedChoice(choiceId);
    socket.emit('mini_game_action', {
      action: 'select',
      value: choiceId,
    });
  };

  /** Card shuffle shows win/lose on the themed pick screen; horse race uses full-screen result. */
  if (resultPhase && gameType !== 'card_shuffle') {
    const isWinner = resultPhase === 'winner';
    const winLabel =
      gameType === 'horse_race' && winningValue != null ? `Kangaroo #${winningValue}` : '';

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
        {gameType === 'card_shuffle' ? (
          <>
            <div
              className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,#1e3a8a_0%,#5b21b6_32%,#4c1d95_48%,#0f0f12_62%,#000000_78%,#000000_100%)]"
              aria-hidden
            />
            <CardShuffleQuestionMarks />
            <CardShuffleBottomDots />
          </>
        ) : null}

        {roundAnnouncement ? (
          <div
            className="pointer-events-none absolute inset-x-4 top-6 z-20 mx-auto max-w-md animate-fadeIn rounded-2xl border border-[#00d8ff]/60 bg-[linear-gradient(180deg,rgba(20,40,90,0.96)_0%,rgba(10,8,40,0.98)_100%)] px-4 py-3 text-center shadow-[0_0_24px_rgba(0,216,255,0.35)] sm:inset-x-8"
            role="status"
          >
            <p className="text-lg font-black text-white drop-shadow-sm sm:text-xl">
              {roundAnnouncement}
            </p>
          </div>
        ) : null}

        {gameType === 'horse_race' && (
          <div className="w-full max-w-sm text-center sm:max-w-md">
            <div className="mb-3 text-3xl sm:text-4xl">RACE</div>
            <h2 className="mb-2 text-xl font-bold sm:text-2xl">Horse Race</h2>
            <p className="text-foreground/50 text-sm mb-6">
              {selectedChoice
                ? 'Your bet is locked! Watch the race on the big screen.'
                : roundOpen
                  ? 'Pick a horse to bet on!'
                  : 'Waiting for the host to start the round...'}
            </p>

            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {HORSES.map((horse) => (
                <button
                  key={horse.id}
                  onClick={() => handleChoice(horse.id)}
                  disabled={!roundOpen || selectedChoice !== null}
                  className={`${horse.color} rounded-xl p-4 text-center text-sm font-bold text-white transition-all active:scale-95 sm:p-5 sm:text-base ${
                    selectedChoice === horse.id
                      ? 'ring-4 ring-white/50 scale-105'
                      : !roundOpen || selectedChoice !== null
                        ? 'opacity-30'
                        : 'hover:scale-105'
                  }`}
                >
                  <div className="mb-1 text-2xl sm:text-3xl">Horse</div>
                  <div className="text-xs sm:text-sm">{horse.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {gameType === 'card_shuffle' && (
          <div className="relative z-10 flex min-h-0 flex-1 flex-col px-5 pb-8 pt-10 sm:px-8">
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
            </header>

            {resultPhase === 'finished' ? (
              <div className="mx-auto mt-6 w-full max-w-md shrink-0 animate-fadeIn rounded-xl border-2 border-[#22d3ee] bg-black px-4 py-3.5 text-center shadow-[0_0_20px_rgba(34,211,238,0.28)]">
                <p className="text-lg font-black uppercase tracking-wide text-white sm:text-xl">
                  Game Over
                </p>
                <p className="mt-2 text-[0.95rem] font-bold leading-snug text-[#9cecff] sm:text-base">
                  {roundAnnouncement || 'Game Over'}
                </p>
              </div>
            ) : resultPhase === 'winner' ? (
              <div className="mx-auto mt-6 w-full max-w-md shrink-0 animate-fadeIn rounded-xl border-2 border-[#22c55e] bg-black px-4 py-3.5 text-center shadow-[0_0_20px_rgba(34,197,94,0.35)]">
                <p className="text-lg font-black uppercase tracking-wide text-white sm:text-xl">
                  You win this round!
                </p>
                <p className="mt-2 text-[0.95rem] font-black leading-snug tracking-wide text-[#39ff14] sm:text-base">
                  Correct — you found the Queen +10
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
            ) : (
              <div className="mx-auto mt-6 w-full max-w-md shrink-0 border-2 border-[#22d3ee] bg-black px-4 py-3.5 text-center shadow-[0_0_0_1px_rgba(34,211,238,0.15)]">
                <p className="text-[0.95rem] font-bold leading-snug text-white sm:text-base">
                  {!roundOpen
                    ? 'Waiting for the host to start the round...'
                    : selectedChoice
                      ? 'Your pick is locked! Watch the shuffle on the big screen.'
                      : 'Tap a Card to make your Selection !!'}
                </p>
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-6">
              {resultPhase === 'finished' ? (
                <div className="mx-auto w-full max-w-md rounded-2xl border border-[#22d3ee]/55 bg-[rgba(6,10,25,0.86)] px-5 py-8 text-center shadow-[0_0_26px_rgba(34,211,238,0.2)]">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[#22d3ee]/60 bg-[rgba(10,20,40,0.75)]">
                    <span className="text-3xl">🃏</span>
                  </div>
                  <p className="text-xl font-black uppercase tracking-wide text-white">Game Over</p>
                  <p className="mt-3 text-sm font-semibold leading-snug text-[#9cecff]">
                    {roundAnnouncement || 'Game Over'}
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
