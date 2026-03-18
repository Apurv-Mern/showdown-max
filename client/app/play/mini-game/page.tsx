'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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

const CARDS = [
  { id: 1, label: '♠', name: 'Spades' },
  { id: 2, label: '♥', name: 'Hearts' },
  { id: 3, label: '♦', name: 'Diamonds' },
  { id: 4, label: '♣', name: 'Clubs' },
];

export default function MiniGamePage() {
  const router = useRouter();
  const { socket } = useSocket();
  const { session } = usePlayerSession();

  const [gameType, setGameType] = useState<MiniGameType>(null);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);

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
    });

    socket.on('mini_game_end', () => {
      router.push('/play/game');
    });

    socket.on('break_end', () => {
      router.push('/play/game');
    });

    socket.on('round_intro', () => {
      router.push('/play/game');
    });

    return () => {
      socket.off('mini_game_start');
      socket.off('mini_game_end');
      socket.off('break_end');
      socket.off('round_intro');
    };
  }, [socket, router]);

  const handleChoice = (choiceId: number) => {
    if (selectedChoice !== null || !socket) return;
    setSelectedChoice(choiceId);
    socket.emit('mini_game_action', {
      action: 'select',
      value: choiceId,
    });
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
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
              {selectedChoice ? 'Your bet is locked! Watch the race on the big screen.' : 'Pick a horse to bet on!'}
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

        {/* Card Shuffle */}
        {gameType === 'card_shuffle' && (
          <div className="w-full max-w-sm text-center">
            <div className="text-4xl mb-3">🃏</div>
            <h2 className="text-2xl font-bold mb-2">Card Shuffle</h2>
            <p className="text-foreground/50 text-sm mb-6">
              {selectedChoice ? 'Card chosen! Watch the shuffle on the big screen.' : 'Pick a card!'}
            </p>

            <div className="grid grid-cols-2 gap-3">
              {CARDS.map((card) => (
                <button
                  key={card.id}
                  onClick={() => handleChoice(card.id)}
                  disabled={selectedChoice !== null}
                  className={`bg-surface border-2 border-border rounded-xl p-6 text-center transition-all active:scale-95 ${
                    selectedChoice === card.id
                      ? 'border-primary bg-primary/10 scale-105'
                      : selectedChoice !== null
                        ? 'opacity-30'
                        : 'hover:border-primary/50 hover:scale-105'
                  }`}
                >
                  <div className={`text-5xl mb-1 ${card.label === '♥' || card.label === '♦' ? 'text-danger' : 'text-foreground'}`}>
                    {card.label}
                  </div>
                  <div className="text-sm text-foreground/60">{card.name}</div>
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
            <p className="text-foreground/50 text-sm mb-6">Waiting for the host to launch a game...</p>
            <Button variant="ghost" onClick={() => router.push('/play/game')}>
              ← Back to Game
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
