'use client';

import { cn, toDisplayUpper } from '@/lib/utils';
import { VenueAutoFitText } from '@/components/venue/VenueAutoFitText';

export function splitRoundIntroSubtitle(title: string): string[] {
  const words = toDisplayUpper(title)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length <= 1) return words.length ? words : [];
  if (words.join(' ').length <= 10) return [words.join(' ')];
  if (words.length === 2) return words;
  if (words.length === 3) return [words[0], `${words[1]} ${words[2]}`];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

type HeadlineSize = 'player' | 'host' | 'hostModal' | 'venue';

const SIZE = {
  player: {
    wrap: 'h-full w-full px-[14%]',
    round:
      'bg-linear-to-b from-[#FFFFFF] to-[#FFC870] bg-clip-text text-[clamp(1.2rem,4.2vw,1.85rem)] font-extrabold uppercase leading-none text-transparent md:text-[clamp(1.45rem,3vw,2.05rem)]',
    subtitle: 'mt-1 w-full max-h-[46%] font-extrabold uppercase leading-[1.05]',
    line: 'bg-linear-to-b from-[#FFFFFF] to-[#FFC870] bg-clip-text text-transparent',
    min: 11,
    max: 22,
  },
  host: {
    wrap: 'w-full px-[8%]',
    round: 'font-black uppercase leading-none text-[#fff4c2] text-[clamp(1.35rem,2.6vw,2.1rem)]',
    subtitle: 'mt-1.5 w-full max-h-[4.5rem] font-black uppercase leading-[1.05] text-[#fff4c2]',
    line: '',
    min: 13,
    max: 24,
  },
  hostModal: {
    wrap: 'w-full px-[10%]',
    round: 'font-black uppercase leading-none text-[#fff4c2] text-[clamp(1.6rem,3.4vw,2.4rem)]',
    subtitle: 'mt-2 w-full max-h-[5.25rem] font-black uppercase leading-[1.05] text-[#fff4c2]',
    line: '',
    min: 14,
    max: 28,
  },
  venue: {
    wrap: 'h-full w-full px-[16%]',
    round: 'text-[clamp(56px,8.4cqw,88px)] font-extrabold uppercase leading-none text-white',
    number: 'text-[clamp(88px,14cqw,150px)] font-extrabold leading-[0.88] text-white',
    subtitle:
      'mt-3 w-full max-h-[128px] font-extrabold uppercase leading-[1.08] text-white [text-shadow:0_8px_10px_rgba(0,0,0,0.8)]',
    line: '',
    min: 22,
    max: 40,
  },
} as const;

type RoundIntroHeadlineProps = {
  roundNumber: number;
  subtitle?: string;
  size?: HeadlineSize;
  className?: string;
};

export function RoundIntroHeadline({
  roundNumber,
  subtitle,
  size = 'player',
  className,
}: RoundIntroHeadlineProps) {
  const cfg = SIZE[size];
  const lines = subtitle ? splitRoundIntroSubtitle(subtitle) : [];

  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-col items-center justify-center text-center',
        cfg.wrap,
        className,
      )}
    >
      {size === 'venue' ? (
        <>
          <p className={cfg.round} style={{ textShadow: '0 8px 10px rgba(0,0,0,0.8)' }}>
            ROUND
          </p>
          <p className={SIZE.venue.number} style={{ textShadow: '0 8px 10px rgba(0,0,0,0.8)' }}>
            {roundNumber}
          </p>
        </>
      ) : (
        <p className={cfg.round}>ROUND {roundNumber}</p>
      )}

      {lines.length ? (
        <VenueAutoFitText
          className={cfg.subtitle}
          minFontSize={cfg.min}
          maxFontSize={cfg.max}
          step={1}
        >
          {lines.map((line) => (
            <span key={line} className={cn('block', cfg.line || undefined)}>
              {line}
            </span>
          ))}
        </VenueAutoFitText>
      ) : null}
    </div>
  );
}
