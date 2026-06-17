'use client';

import { cn } from '@/lib/utils';

export type RoundEndScreenSize = 'player' | 'host' | 'venue';

const SIZE_CONFIG: Record<
  RoundEndScreenSize,
  { line: string; wrapper: string; logo: string; logoBottom: string }
> = {
  player: {
    line: 'text-[clamp(2rem,10vw,3.5rem)] font-black uppercase leading-[0.95] tracking-[0.04em]',
    wrapper: 'px-4',
    logo: 'h-auto w-[min(72vw,280px)] max-w-[300px] sm:w-[min(56vw,300px)] sm:max-w-[340px]',
    logoBottom: 'bottom-0 pb-0',
  },
  host: {
    line: 'text-[clamp(2rem,5vw,3.5rem)] font-black uppercase leading-[0.95] tracking-[0.05em]',
    wrapper: 'px-6',
    logo: 'h-auto w-[min(280px,36vw)] max-w-[320px]',
    logoBottom: 'bottom-0 pb-2',
  },
  venue: {
    line: 'text-[clamp(3rem,8vw,6rem)] font-black uppercase leading-[0.95] tracking-[0.06em]',
    wrapper: 'px-8',
    logo: 'h-auto w-[min(340px,42vw)] max-w-full',
    logoBottom: 'bottom-0 pb-4',
  },
};

export interface RoundEndScreenProps {
  roundIndex: number;
  size?: RoundEndScreenSize;
  className?: string;
}

/** End-of-round transition — "END OF ROUND N" with logo anchored on the dot pattern. */
export function RoundEndScreen({
  roundIndex,
  size = 'player',
  className,
}: RoundEndScreenProps) {
  const cfg = SIZE_CONFIG[size];
  const roundNumber = Math.max(1, roundIndex + 1);

  return (
    <div className={cn('relative h-full min-h-0 w-full overflow-hidden', className)}>
      <div
        className={cn(
          'relative z-10 flex h-full flex-col items-center justify-center pb-[min(34vh,250px)] sm:pb-[min(32vh,280px)]',
          cfg.wrapper,
        )}
      >
        <div className="text-center">
          <p
            className={cn(
              'text-[#00e8ff] drop-shadow-[0_0_22px_rgba(0,232,255,0.8)]',
              cfg.line,
            )}
          >
            END OF
          </p>
          <p
            className={cn(
              'mt-1 text-[#00e8ff] drop-shadow-[0_0_22px_rgba(0,232,255,0.8)] sm:mt-2',
              cfg.line,
            )}
          >
            ROUND {roundNumber}
          </p>
        </div>
      </div>

      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 z-20 flex justify-center',
          cfg.logoBottom,
        )}
      >
        <img
          src="/logo.png"
          alt="Max Showdown Trivia"
          className={cn('object-contain drop-shadow-[0_8px_32px_rgba(0,0,0,0.45)]', cfg.logo)}
        />
      </div>
    </div>
  );
}
