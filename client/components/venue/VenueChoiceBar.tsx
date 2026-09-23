'use client';

import { cn } from '@/lib/utils';
import { optionAccent } from '@/lib/designTokens';

type VenueChoiceBarProps = {
  index: number;
  letter: string;
  label: string;
  revealed?: boolean;
  isWinner?: boolean;
  className?: string;
};

/**
 * Figma venue option: 880×110 navy pill, 120px letter block, 35px label.
 */
export function VenueChoiceBar({
  index,
  letter,
  label,
  revealed = false,
  isWinner = false,
  className,
}: VenueChoiceBarProps) {
  const tone = optionAccent(index);
  const dimmed = revealed && !isWinner;

  return (
    <div
      className={cn(
        'relative flex h-[110px] w-full items-center overflow-hidden rounded-[20px]',
        className,
      )}
      style={{
        background: 'linear-gradient(180deg, #00072F 0%, #00010A 100%)',
        border: `2px solid ${dimmed ? `${tone.accent}66` : tone.accent}`,
        boxShadow: isWinner
          ? `0 0 18px ${tone.accent}, 0 0 10px #38FF00`
          : `0 0 12px ${tone.accent}55`,
      }}
    >
      <span
        className="flex h-full w-[120px] shrink-0 items-center justify-center"
        style={{
          background: `linear-gradient(180deg, ${tone.from} 0%, ${tone.to} 100%)`,
          opacity: dimmed ? 0.45 : 1,
        }}
      >
        <span
          className={cn(
            'text-[80px] font-extrabold uppercase leading-none [text-shadow:0_4px_6px_rgba(0,0,0,0.8)]',
            dimmed ? 'text-[#7F8084]' : 'text-white',
          )}
        >
          {letter}
        </span>
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate px-2.5 text-[35px] font-extrabold uppercase leading-none [text-shadow:0_2px_4px_rgba(0,0,0,0.5)]',
          dimmed ? 'text-[#7F8084]' : 'text-white',
        )}
      >
        {label}
      </span>
      {isWinner ? (
        <span
          className="mr-6 flex size-[65px] shrink-0 items-center justify-center rounded-full border border-[#38FF00] shadow-[0_0_10px_#38FF00]"
          style={{
            background: 'radial-gradient(circle at 50% 50%, #38FF00 0%, #007B00 90%)',
          }}
          aria-label="Correct answer"
        >
          <svg viewBox="0 0 24 24" className="size-8 text-white" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M5 12.5 9.5 17 19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : null}
    </div>
  );
}
