'use client';

import { cn, toDisplayUpper } from '@/lib/utils';
import { VenueAutoFitText } from '@/components/venue/VenueAutoFitText';
import { formatRoundTypeDisplayLabel } from '@/lib/roundDisplayLabels';

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
    title: 'mt-0 w-full max-h-full font-extrabold uppercase leading-[1.05]',
    line: 'bg-linear-to-b from-[#FFFFFF] to-[#FFC870] bg-clip-text text-transparent',
    min: 14,
    max: 28,
  },
  host: {
    wrap: 'h-full w-full px-[5%]',
    title:
      'flex h-full w-full items-center justify-center font-black uppercase leading-[0.92] text-[#fff4c2]',
    line: '',
    min: 22,
    max: 42,
  },
  hostModal: {
    wrap: 'h-full w-full px-[6%]',
    title:
      'flex h-full w-full items-center justify-center font-black uppercase leading-[0.92] text-[#fff4c2]',
    line: '',
    min: 24,
    max: 46,
  },
  venue: {
    wrap: 'h-full w-full px-[12%]',
    title:
      'flex h-full w-full items-center justify-center text-center font-extrabold uppercase leading-[0.88] text-white [text-shadow:0_8px_10px_rgba(0,0,0,0.8)]',
    line: '',
    min: 56,
    max: 150,
  },
} as const;

type RoundIntroHeadlineProps = {
  roundNumber: number;
  subtitle?: string;
  roundType?: string;
  size?: HeadlineSize;
  className?: string;
};

export function RoundIntroHeadline({
  roundNumber,
  subtitle,
  roundType,
  size = 'player',
  className,
}: RoundIntroHeadlineProps) {
  const cfg = SIZE[size];
  const titleSource =
    (subtitle || '').trim() ||
    formatRoundTypeDisplayLabel(roundType) ||
    toDisplayUpper(`Round ${roundNumber}`);
  let lines = splitRoundIntroSubtitle(titleSource);
  if (size === 'host' || size === 'hostModal') {
    const joined = lines.join(' ').trim();
    if (joined.length > 0 && joined.length <= 16) {
      lines = [joined];
    }
  }

  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-col items-center justify-center text-center',
        cfg.wrap,
        className,
      )}
    >
      <VenueAutoFitText
        className={cfg.title}
        minFontSize={cfg.min}
        maxFontSize={cfg.max}
        step={size === 'venue' ? 2 : 1}
      >
        {lines.map((line) => (
          <span key={line} className={cn('block w-full text-center', cfg.line || undefined)}>
            {line}
          </span>
        ))}
      </VenueAutoFitText>
    </div>
  );
}
