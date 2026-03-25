'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { usePlayerSession } from '../layout';
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
  { id: 1, label: 'Left', emoji: '🃏' },
  { id: 2, label: 'Middle', emoji: '🃏' },
  { id: 3, label: 'Right', emoji: '🃏' },
] as const;

const CARD_LABEL_MAP: Record<number, string> = { 1: 'Left', 2: 'Middle', 3: 'Right' };

type ResultPhase = null | 'winner' | 'loser';

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
    });

    socket.on('mini_game_end', (data: { game?: string; winningCard?: number; winningKangaroo?: number }) => {
      const winning = data.winningCard ?? data.winningKangaroo ?? null;
      setWinningValue(winning);

      if (winning !== null && selectedChoice !== null) {
        setResultPhase(selectedChoice === winning ? 'winner' : 'loser');
      } else {
        setResultPhase('loser');
      }

      setTimeout(() => {
        router.push('/play/game');
      }, 5000);
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
      socket.off('mini_game_end');
      socket.off('break_end');
      socket.off('round_intro');
      socket.off('game_end');
    };
  }, [socket, router, selectedChoice, clearSession]);

  const handleChoice = (choiceId: number) => {
    if (selectedChoice !== null || !socket) return;
    setSelectedChoice(choiceId);
    socket.emit('mini_game_action', {
      action: 'select',
      value: choiceId,
    });
  };

  if (resultPhase) {
    const isWinner = resultPhase === 'winner';
    const winLabel = gameType === 'card_shuffle' && winningValue
      ? CARD_LABEL_MAP[winningValue] || `Card ${winningValue}`
      : gameType === 'horse_race' && winningValue
        ? `Kangaroo #${winningValue}`
        : '';

    return (
      <div className="flex-1 flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-surface/50">
          <span className="text-sm font-semibold text-primary">{session.teamName}</span>
          <span className="text-sm font-mono font-bold">{session.score} pts</span>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm text-center">
            {isWinner ? (
              <>
                <div className="text-7xl mb-4 animate-bounce">🏆</div>
                <h2 className="text-3xl font-black text-[#ffd700] mb-2">
                  You Won!
                </h2>
                <p className="text-foreground/60 text-sm mb-4">
                  You picked <span className="font-bold text-[#ffd700]">{winLabel}</span> — that was the winning card!
                </p>
              </>
            ) : (
              <>
                <div className="text-7xl mb-4">😔</div>
                <h2 className="text-3xl font-black text-foreground/60 mb-2">
                  Better Luck Next Time
                </h2>
                <p className="text-foreground/40 text-sm mb-4">
                  The winning card was <span className="font-bold text-primary">{winLabel}</span>
                  {selectedChoice
                    ? ` — you picked ${gameType === 'card_shuffle' ? (CARD_LABEL_MAP[selectedChoice] || `Card ${selectedChoice}`) : `#${selectedChoice}`}`
                    : ' — you didn\'t pick'}.
                </p>
              </>
            )}
            <p className="text-xs text-foreground/30 mt-6">Returning to game...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-surface/50">
        <span className="text-sm font-semibold text-primary">{session.teamName}</span>
        <span className="text-sm font-mono font-bold">{session.score} pts</span>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        {/* Horse Race */}
        {gameType === 'horse_race' && (
          <div className="w-full max-w-sm text-center">
            <div className="text-4xl mb-3">🏇</div>
            <h2 className="text-2xl font-bold mb-2">Horse Race</h2>
            <p className="text-foreground/50 text-sm mb-6">
              {selectedChoice
                ? 'Your bet is locked! Watch the race on the big screen.'
                : 'Pick a horse to bet on!'}
            </p>

            <div className="grid grid-cols-2 gap-3">
              {HORSES.map((horse) => (
                <button
                  key={horse.id}
                  onClick={() => handleChoice(horse.id)}
                  disabled={selectedChoice !== null}
                  className={`${horse.color} rounded-xl p-5 text-white font-bold text-center transition-all active:scale-95 ${
                    selectedChoice === horse.id
                      ? 'ring-4 ring-white/50 scale-105'
                      : selectedChoice !== null
                        ? 'opacity-30'
                        : 'hover:scale-105'
                  }`}
                >
                  <div className="text-3xl mb-1">🐴</div>
                  <div className="text-sm">{horse.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Card Shuffle — left / middle / right */}
        {gameType === 'card_shuffle' && (
          <div className="w-full max-w-md text-center">
            <div className="text-4xl mb-3">🃏</div>
            <h2 className="text-2xl font-bold mb-2">Card Shuffle</h2>
            <p className="text-foreground/50 text-sm mb-6">
              {selectedChoice
                ? 'Your pick is locked! Watch the shuffle on the big screen.'
                : 'Which card is yours?'}
            </p>

            <div className="flex gap-3 justify-center">
              {CARD_POSITIONS.map((pos) => (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() => handleChoice(pos.id)}
                  disabled={selectedChoice !== null}
                  className={`flex-1 max-w-[130px] rounded-xl border-2 bg-surface px-3 py-6 text-center transition-all active:scale-95 ${
                    selectedChoice === pos.id
                      ? 'border-primary bg-primary/10 scale-105 ring-2 ring-primary/30'
                      : selectedChoice !== null
                        ? 'border-border opacity-30'
                        : 'border-border hover:border-primary/50 hover:scale-[1.03]'
                  }`}
                >
                  <div className="text-4xl mb-2" aria-hidden>
                    {pos.emoji}
                  </div>
                  <div className="text-base font-bold text-foreground">{pos.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* No game yet */}
        {!gameType && (
          <div className="text-center">
            <div className="text-4xl mb-3">🎮</div>
            <h2 className="text-xl font-bold mb-2">Mini-Game</h2>
            <p className="text-foreground/50 text-sm mb-6">
              Waiting for the host to launch a game...
            </p>
            <Button variant="ghost" onClick={() => router.push('/play/game')}>
              ← Back to Game
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
