'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ROUND_END_TITLE_GRADIENT } from '@/components/shared/RoundEndTitle';

const gradientTextStyle = {
  backgroundImage: ROUND_END_TITLE_GRADIENT,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  fontWeight: 900,
} as const;

export type GameshowEndTitleVariant = 'player' | 'venue' | 'host';

const PLAYER_TITLE_LINE_CLASS =
  'text-[clamp(1.35rem,6vw,1.95rem)] leading-[1.12] tracking-[0.04em] drop-shadow-[0_0_16px_rgba(71,234,255,0.35)]';

const TITLE_VARIANT_CLASS: Record<GameshowEndTitleVariant, string> = {
  player: 'mt-[clamp(4rem,22vh,10rem)]',
  venue:
    'text-[clamp(2.25rem,6.5cqw,5rem)] leading-[0.92] tracking-[0.03em] drop-shadow-[0_0_28px_rgba(71,234,255,0.4)]',
  host: 'text-[clamp(1.5rem,4vw,2.5rem)] leading-[0.92] tracking-[0.03em] drop-shadow-[0_0_18px_rgba(71,234,255,0.32)]',
};

const SUBTITLE_VARIANT_CLASS: Record<GameshowEndTitleVariant, string> = {
  player:
    'mt-6 text-[clamp(1.2rem,5.2vw,1.9rem)] leading-[1.12] tracking-[0.06em] text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.25)]',
  venue:
    'mt-6 text-[clamp(1.25rem,2.8cqw,2rem)] leading-[1.12] tracking-[0.08em] text-white drop-shadow-[0_0_14px_rgba(255,255,255,0.28)]',
  host: 'mt-4 text-[clamp(0.95rem,2vw,1.35rem)] leading-[1.12] tracking-[0.07em] text-white/95',
};

function GradientLine({
  children,
  variant = 'venue',
  className,
}: {
  children: ReactNode;
  variant?: GameshowEndTitleVariant;
  className?: string;
}) {
  return (
    <span
      className={cn('block font-black', className)}
      style={gradientTextStyle}
    >
      {children}
    </span>
  );
}

function SubtitleLine({ children }: { children: ReactNode }) {
  return <span className="block font-black">{children}</span>;
}

export function GameshowEndTitle({
  variant = 'player',
  className,
}: {
  variant?: GameshowEndTitleVariant;
  className?: string;
}) {
  return (
    <div className={cn('text-center font-black uppercase', className)}>
      <h1 className={cn('text-center font-black uppercase', TITLE_VARIANT_CLASS[variant])}>
        {variant === 'player' ? (
          <>
            <GradientLine variant="player" className={PLAYER_TITLE_LINE_CLASS}>
              THAT&apos;S THE END OF
            </GradientLine>
            <GradientLine variant="player" className={cn('mt-1', PLAYER_TITLE_LINE_CLASS)}>
              OUR GAMESHOW
            </GradientLine>
          </>
        ) : variant === 'venue' ? (
          <>
            <GradientLine variant="venue">THAT&apos;S THE END OF</GradientLine>
            <GradientLine variant="venue">OUR GAMESHOW</GradientLine>
          </>
        ) : (
          <GradientLine variant={variant}>THAT&apos;S THE END OF OUR GAMESHOW</GradientLine>
        )}
      </h1>
      <p className={SUBTITLE_VARIANT_CLASS[variant]}>
        <SubtitleLine>FINAL LOOK AT TONIGHT&apos;S SCOREBOARD</SubtitleLine>
      </p>
    </div>
  );
}
