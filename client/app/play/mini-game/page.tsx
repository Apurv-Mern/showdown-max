'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
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
  { id: 1, label: 'Left', symbol: 'Card 1' },
  { id: 2, label: 'Middle', symbol: 'Card 2' },
  { id: 3, label: 'Right', symbol: 'Card 3' },
] as const;

const CARD_LABEL_MAP: Record<number, string> = { 1: 'Left', 2: 'Middle', 3: 'Right' };

type ResultPhase = null | 'winner' | 'loser';

function MobileFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 h-full min-h-0 w-full bg-[#050017]">
      <div
        className="relative h-full min-h-0 w-full overflow-hidden mobile-play-bg"
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
  const { socket } = useSocket();
  const { session, clearSession } = usePlayerSession();

  const gameParam = searchParams.get('game') as MiniGameType;
  const [gameType, setGameType] = useState<MiniGameType>(gameParam);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [resultPhase, setResultPhase] = useState<ResultPhase>(null);
  const [winningValue, setWinningValue] = useState<number | null>(null);
  const [roundOpen, setRoundOpen] = useState(false);

  useEffect(() => {
    if (!session.pin || !session.teamId) {
      router.replace('/play/join');
      return;
    }
  }, [session, router]);

  useEffect(() => {
    if (!socket) return;

    socket.on('mini_game_start', (data: { game: string }) => {
      setGameType(data.game as MiniGameType);
      setSelectedChoice(null);
      setResultPhase(null);
      setWinningValue(null);
      setRoundOpen(false);
    });

    socket.on(
      'mini_game_command',
      (data: { game?: string; command?: 'start_game' | 'next_round' | 'reveal_cards' }) => {
        if (data?.game !== 'card_shuffle') return;
        if (data.command === 'start_game' || data.command === 'next_round') {
          setSelectedChoice(null);
          setResultPhase(null);
          setWinningValue(null);
          setRoundOpen(true);
        }
      },
    );

    socket.on(
      'mini_game_reveal',
      (data: { game?: string; correctPosition?: number }) => {
        if (data?.game !== 'card_shuffle') return;
        const winning = Number.isFinite(Number(data.correctPosition))
          ? Number(data.correctPosition)
          : null;
        setWinningValue(winning);
        setRoundOpen(false);
        if (winning !== null && selectedChoice !== null) {
          setResultPhase(selectedChoice === winning ? 'winner' : 'loser');
        } else {
          setResultPhase('loser');
        }
      },
    );

    socket.on('mini_game_end', (data: { winningCard?: number; winningKangaroo?: number }) => {
      const winning = data.winningCard ?? data.winningKangaroo ?? null;
      setWinningValue(winning);
      setSelectedChoice(null);
      setResultPhase(null);
      setRoundOpen(false);
      router.push('/play/game');
    });

    socket.on('break_end', () => {
      router.push('/play/game');
    });

    socket.on('round_intro', () => {
      router.push('/play/game');
    });

    socket.on('game_end', () => {
      clearSession();
      router.replace('/play/join');
    });

    return () => {
      socket.off('mini_game_start');
      socket.off('mini_game_command');
      socket.off('mini_game_reveal');
      socket.off('mini_game_end');
      socket.off('break_end');
      socket.off('round_intro');
      socket.off('game_end');
    };
  }, [socket, router, selectedChoice, clearSession]);

  const handleChoice = (choiceId: number) => {
    if (!roundOpen || selectedChoice !== null || !socket) return;
    setSelectedChoice(choiceId);
    socket.emit('mini_game_action', {
      action: 'select',
      value: choiceId,
    });
  };

  if (resultPhase) {
    const isWinner = resultPhase === 'winner';
    const winLabel =
      gameType === 'card_shuffle' && winningValue
        ? CARD_LABEL_MAP[winningValue] || `Card ${winningValue}`
        : gameType === 'horse_race' && winningValue
          ? `Kangaroo #${winningValue}`
          : '';

    return (
      <MobileFrame>
        <div className="flex flex-1 items-center justify-center p-4 sm:p-6 md:p-8">
          <div className="w-full max-w-sm text-center sm:max-w-md">
            {isWinner ? (
              <>
                <div className="mb-4 text-5xl sm:text-6xl">WIN</div>
                <h2 className="mb-2 text-2xl font-black text-[#ffd700] sm:text-3xl">You Won!</h2>
                <p className="text-foreground/60 text-sm mb-4">
                  You picked <span className="font-bold text-[#ffd700]">{winLabel}</span> and it was correct.
                </p>
              </>
            ) : (
              <>
                <div className="mb-4 text-5xl sm:text-6xl">LOSE</div>
                <h2 className="mb-2 text-2xl font-black text-foreground/60 sm:text-3xl">Better Luck Next Time</h2>
                <p className="text-foreground/40 text-sm mb-4">
                  The winning choice was <span className="font-bold text-primary">{winLabel}</span>
                  {selectedChoice
                    ? ` and you picked ${gameType === 'card_shuffle' ? (CARD_LABEL_MAP[selectedChoice] || `Card ${selectedChoice}`) : `#${selectedChoice}`}.`
                    : "."}
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
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6 md:p-8">
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
          <div className="w-full max-w-md text-center md:max-w-lg">
            <div className="mb-3 text-3xl sm:text-4xl">CARD</div>
            <h2 className="mb-2 text-xl font-bold sm:text-2xl">Card Shuffle</h2>
            <p className="text-foreground/50 text-sm mb-6">
              {selectedChoice
                ? 'Your pick is locked! Watch the shuffle on the big screen.'
                : roundOpen
                  ? 'Which card is yours?'
                  : 'Waiting for the host to start the round...'}
            </p>

            <div className="flex gap-3 justify-center">
              {CARD_POSITIONS.map((pos) => (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() => handleChoice(pos.id)}
                  disabled={!roundOpen || selectedChoice !== null}
                  className={`flex-1 max-w-[130px] rounded-xl border-2 bg-surface px-3 py-6 text-center transition-all active:scale-95 ${
                    selectedChoice === pos.id
                      ? 'border-primary bg-primary/10 scale-105 ring-2 ring-primary/30'
                      : !roundOpen || selectedChoice !== null
                        ? 'border-border opacity-30'
                        : 'border-border hover:border-primary/50 hover:scale-[1.03]'
                  }`}
                >
                  <div className="text-base font-bold text-foreground mb-2">{pos.symbol}</div>
                  <div className="text-base font-bold text-foreground">{pos.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {!gameType && (
          <div className="text-center">
            <div className="text-4xl mb-3">MINI GAME</div>
            <h2 className="text-xl font-bold mb-2">Mini-Game</h2>
            <p className="text-foreground/50 text-sm mb-6">Waiting for the host to launch a game...</p>
            <Button variant="ghost" onClick={() => router.push('/play/game')}>
              Back to Game
            </Button>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}
