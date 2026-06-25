'use client';

import { cn } from '@/lib/utils';

const PLAYER_PREGAME_TITLE_GRADIENT =
  'linear-gradient(180deg, #4EDDFE 0%, #00D9FF 20%, #6BF8FF 40%, #4FDBFE 60%, #3AC1FF 80%, #097FFF 100%)';

export function PlayerPreGameTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={cn(
        'text-center text-[clamp(2.1rem,9.5vw,3.35rem)] font-black uppercase leading-[0.9] tracking-[0.02em]',
        'bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(0,217,255,0.45)]',
        className,
      )}
      style={{ backgroundImage: PLAYER_PREGAME_TITLE_GRADIENT }}
    >
      {children}
    </h1>
  );
}

export function PlayerPreGamePanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('relative flex min-h-0 w-full flex-1 flex-col', className)}>
      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-1 py-2 sm:px-2 sm:py-3">
        {children}
      </div>
    </div>
  );
}
