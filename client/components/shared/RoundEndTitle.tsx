'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Figma linear gradient — top → bottom on title text. */
export const ROUND_END_TITLE_GRADIENT =
  'linear-gradient(180deg, #4EDDFE 0%, #00D9FF 20%, #6BF8FF 40%, #4FDBFE 60%, #3AC1FF 80%, #097FFF 100%)';

const gradientTextStyle = {
  backgroundImage: ROUND_END_TITLE_GRADIENT,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  fontWeight: 900,
} as const;

const playerGradientTextStyle = {
  ...gradientTextStyle,
  WebkitTextStroke: '1.5px rgba(9, 127, 255, 0.55)',
  paintOrder: 'stroke fill' as const,
};

export type RoundEndTitleVariant = 'player' | 'venue' | 'host';

const VARIANT_CLASS: Record<RoundEndTitleVariant, string> = {
  player:
    'mt-[clamp(3.5rem,18vh,8rem)] pt-2 text-[clamp(2.85rem,14vw,4.75rem)] leading-[1.05] tracking-[0.02em] drop-shadow-[0_0_28px_rgba(71,234,255,0.45)]',
  venue:
    'pt-4 text-[150px] leading-none tracking-[0.02em] text-white [text-shadow:0_10px_10px_black,0_0_20px_#0010FF]',
  host: 'pt-1 text-[clamp(1.75rem,4.5vw,2.75rem)] leading-tight tracking-[0.04em] drop-shadow-[0_0_18px_rgba(71,234,255,0.32)]',
};

function GradientLine({
  children,
  nowrap,
  variant = 'venue',
}: {
  children: ReactNode;
  nowrap?: boolean;
  variant?: RoundEndTitleVariant;
}) {
  return (
    <span
      className={cn('block font-black', nowrap && 'whitespace-nowrap')}
      style={variant === 'player' ? playerGradientTextStyle : gradientTextStyle}
    >
      {children}
    </span>
  );
}

export function RoundEndTitle({
  roundNumber,
  variant = 'player',
  className,
}: {
  roundNumber: number;
  variant?: RoundEndTitleVariant;
  className?: string;
}) {
  const n = Math.max(1, roundNumber);

  return (
    <h1 className={cn('text-center font-black uppercase', VARIANT_CLASS[variant], className)}>
      {variant === 'player' ? (
        <>
          <GradientLine variant="player">END OF</GradientLine>
          <GradientLine variant="player">ROUND {n}</GradientLine>
        </>
      ) : (
        variant === 'venue' ? (
          <span className="block whitespace-nowrap font-extrabold text-white">
            END OF ROUND {n}
          </span>
        ) : (
          <GradientLine nowrap variant={variant}>
            END OF ROUND {n}
          </GradientLine>
        )
      )}
    </h1>
  );
}
