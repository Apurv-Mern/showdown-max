'use client';

import { cn } from '@/lib/utils';
import { GameshowEndTitle } from '@/components/shared/GameshowEndTitle';

/** Player gameshow closing — gradient title, white subtext, logo at bottom. No card/box background. */
export function GameshowEndPlayerView({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]',
        className,
      )}
    >
      <GameshowEndTitle variant="player" />

      <div className="min-h-[2rem] flex-1" aria-hidden />

      <div className="flex shrink-0 justify-center">
        <img
          src="/logo.png"
          alt="Max Showdown Trivia"
          className="h-auto w-[min(88vw,360px)] max-w-full object-contain drop-shadow-[0_8px_28px_rgba(0,0,0,0.5)]"
        />
      </div>
    </div>
  );
}
