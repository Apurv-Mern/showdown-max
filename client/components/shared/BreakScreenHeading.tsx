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
    line: 'whitespace-nowrap text-[80px] font-black leading-[50px] tracking-normal',
    sub: 'mt-4 text-[35px] font-extrabold leading-tight tracking-[0.05em]',
    wrapper: 'max-w-none px-6',
    titleGap: 'gap-0',
  },
};

export interface BreakScreenHeadingProps {
  size?: BreakScreenHeadingSize;
  className?: string;
}

/** Break screen title — white headline only. */
export function BreakScreenHeading({
  size = 'player',
  className,
}: BreakScreenHeadingProps) {
  const cfg = SIZE_CONFIG[size];

  return (
    <header className={cn('text-center', cfg.wrapper, className)}>
      <div className={cn('flex flex-col items-center', cfg.titleGap)}>
        <p className={cn('text-white drop-shadow-[0_0_14px_rgba(255,255,255,0.35)]', cfg.line)}>
          {size === 'host' ? 'BREAK TIME' : 'SEE YOU AFTER THE BREAK !!'}
        </p>
      </div>
    </header>
  );
}
