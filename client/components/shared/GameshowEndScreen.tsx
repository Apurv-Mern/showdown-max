'use client';

import { cn } from '@/lib/utils';
import { GameshowEndTitle, type GameshowEndTitleVariant } from '@/components/shared/GameshowEndTitle';

export type GameshowEndScreenSize = 'host' | 'venue';

const SIZE_CONFIG: Record<
  GameshowEndScreenSize,
  {
    box: string;
    logo: string;
    pad: string;
  }
> = {
  host: {
    box: 'w-full max-w-[min(640px,92vw)] min-h-[min(52vh,480px)] rounded-[16px] border-2 border-[#00d9ff]/55 shadow-[0_0_28px_rgba(0,217,255,0.22)]',
    logo: 'h-auto w-[min(240px,50vw)] max-w-[280px]',
    pad: 'px-6 py-8',
  },
  venue: {
    box: 'w-[min(92cqw,1060px)] min-h-[min(72cqh,640px)] rounded-[20px] border-2 border-[#00d9ff]/70 shadow-[0_0_40px_rgba(0,217,255,0.3)]',
    logo: 'h-auto w-[min(380px,42cqw)] max-w-[460px]',
    pad: 'px-8 py-10 sm:px-10 sm:py-12',
  },
};

const GAMESHOW_END_BOX_GRADIENT = 'linear-gradient(180deg, #4020BA 0%, #000000 60%)';

/** Gameshow closing transition for venue/host — shown after the final round, before the scoreboard. */
export function GameshowEndScreen({
  size = 'venue',
  className,
}: {
  size?: GameshowEndScreenSize;
  className?: string;
}) {
  const cfg = SIZE_CONFIG[size];
  const titleVariant: GameshowEndTitleVariant = size;

  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full items-center justify-center px-4 py-6 sm:px-6',
        className,
      )}
    >
      <div
        className={cn('relative flex flex-col overflow-hidden', cfg.box, cfg.pad)}
        style={{ background: GAMESHOW_END_BOX_GRADIENT }}
      >
        <div className="relative z-10 flex flex-1 flex-col items-center justify-between gap-6">
          <div className="flex flex-1 flex-col items-center justify-center">
            <GameshowEndTitle variant={titleVariant} />
          </div>

          <div className="flex shrink-0 justify-center">
            <img
              src="/logo.png"
              alt="Max Showdown Trivia"
              className={cn('object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]', cfg.logo)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
