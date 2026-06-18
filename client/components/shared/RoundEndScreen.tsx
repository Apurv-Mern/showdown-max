'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type RoundEndScreenSize = 'player' | 'host' | 'venue';

const SIZE_CONFIG: Record<
  RoundEndScreenSize,
  {
    title: string;
    box: string;
    logo: string;
    pad: string;
  }
> = {
  player: {
    title:
      'text-[clamp(2rem,10vw,3.5rem)] font-black uppercase leading-[0.92] tracking-[0.04em]',
    box: 'w-full max-w-[min(27rem,94vw)] min-h-[min(78vh,660px)] rounded-[18px] border-2 border-[#00d9ff]/65 shadow-[0_0_32px_rgba(0,217,255,0.28)]',
    logo: 'h-auto w-[min(72vw,260px)] max-w-[280px]',
    pad: 'px-5 py-8 sm:px-6 sm:py-10',
  },
  host: {
    title: 'text-[clamp(1.75rem,4.5vw,2.75rem)] font-black uppercase leading-[0.92] tracking-[0.05em]',
    box: 'w-full max-w-[min(640px,92vw)] min-h-[min(52vh,480px)] rounded-[16px] border-2 border-[#00d9ff]/55 shadow-[0_0_28px_rgba(0,217,255,0.22)]',
    logo: 'h-auto w-[min(240px,50vw)] max-w-[280px]',
    pad: 'px-6 py-8',
  },
  venue: {
    title: 'text-[clamp(2.75rem,7.5vw,5.5rem)] font-black uppercase leading-[0.9] tracking-[0.05em]',
    box: 'w-[min(92vw,1060px)] min-h-[min(72vh,640px)] rounded-[20px] border-2 border-[#00d9ff]/70 shadow-[0_0_40px_rgba(0,217,255,0.3)]',
    logo: 'h-auto w-[min(380px,42vw)] max-w-[460px]',
    pad: 'px-8 py-10 sm:px-10 sm:py-12',
  },
};

/** Box fill: #4020BA at 0% → #000000 at 60% (linear, top to bottom). */
const ROUND_END_BOX_GRADIENT = 'linear-gradient(180deg, #4020BA 0%, #000000 60%)';

const TITLE_SHADOW =
  '0 1px 0 #0a6a9a, 0 2px 0 #085a82, 0 3px 0 #064a6a, 0 4px 0 #043a52, 0 5px 0 #022a3a, 0 8px 18px rgba(0,0,0,0.55)';

export interface RoundEndScreenProps {
  roundIndex: number;
  size?: RoundEndScreenSize;
  className?: string;
  children?: ReactNode;
}

/** End-of-round transition — centered box with gradient fill, title, and logo. */
export function RoundEndScreen({
  roundIndex,
  size = 'player',
  className,
  children,
}: RoundEndScreenProps) {
  const cfg = SIZE_CONFIG[size];
  const roundNumber = Math.max(1, roundIndex + 1);

  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full items-center justify-center px-4 py-6 sm:px-6',
        className,
      )}
    >
      <div
        className={cn('relative flex flex-col overflow-hidden', cfg.box, cfg.pad)}
        style={{ background: ROUND_END_BOX_GRADIENT }}
      >
        <div
          className={cn(
            'relative z-10 flex flex-1 flex-col items-center justify-between gap-6',
            children ? 'justify-center' : '',
          )}
        >
          <div className={cn('flex flex-col items-center', children ? 'gap-5' : 'flex-1 justify-center')}>
            <h1
              className={cn('text-center text-[#47eaff]', cfg.title)}
              style={{ textShadow: TITLE_SHADOW }}
            >
              END OF ROUND {roundNumber}
            </h1>
            {children}
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
