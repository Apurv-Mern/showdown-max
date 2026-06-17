'use client';

import { cn } from '@/lib/utils';

export type BreakScreenHeadingSize = 'player' | 'host' | 'venue';

const SIZE_CONFIG: Record<
  BreakScreenHeadingSize,
  { line: string; sub: string; wrapper: string; titleGap: string }
> = {
  player: {
    line: 'text-[clamp(1.15rem,4.8vw,2rem)] font-extrabold leading-[1.1] tracking-[0.02em]',
    sub: 'mt-2 text-[clamp(1rem,4.6vw,1.65rem)] font-extrabold leading-snug tracking-[0.03em]',
    wrapper: 'w-full max-w-md shrink-0 px-2 sm:px-4',
    titleGap: 'gap-0.5',
  },
  host: {
    line: 'text-xl sm:text-2xl font-black leading-[1.08] tracking-[0.02em]',
    sub: 'mt-3 text-base sm:text-lg font-extrabold leading-tight tracking-[0.06em]',
    wrapper: 'max-w-[640px] px-2',
    titleGap: 'gap-0',
  },
  venue: {
    line: 'text-[clamp(2rem,3.2vw,40px)] font-black leading-[1.05] tracking-[0.02em]',
    sub: 'mt-4 text-[clamp(1.35rem,2.2vw,32px)] font-extrabold leading-tight tracking-[0.05em]',
    wrapper: 'max-w-[980px] px-6',
    titleGap: 'gap-0',
  },
};

export interface BreakScreenHeadingProps {
  size?: BreakScreenHeadingSize;
  upNextLabel?: string | null;
  className?: string;
}

/** Break screen title — two-line white headline + optional cyan "… UP NEXT" subline. */
export function BreakScreenHeading({
  size = 'player',
  upNextLabel,
  className,
}: BreakScreenHeadingProps) {
  const cfg = SIZE_CONFIG[size];

  return (
    <header className={cn('text-center', cfg.wrapper, className)}>
      <div className={cn('flex flex-col items-center', cfg.titleGap)}>
        <p className={cn('text-white drop-shadow-[0_0_14px_rgba(255,255,255,0.35)]', cfg.line)}>
          WE&apos;LL BE BACK RIGHT AFTER OUR
        </p>
        <p className={cn('text-white drop-shadow-[0_0_14px_rgba(255,255,255,0.35)]', cfg.line)}>
          FIRST OFFICIAL BREAK !!
        </p>
      </div>
      {upNextLabel ? (
        <p
          className={cn(
            'relative z-20 mx-auto w-full mb-4 max-w-md text-[#00e8ff] drop-shadow-[0_0_14px_rgba(0,232,255,0.65)]',
            cfg.sub,
          )}
        >
          {upNextLabel}
        </p>
      ) : null}
    </header>
  );
}
