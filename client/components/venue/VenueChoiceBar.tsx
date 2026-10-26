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
 * Figma venue option: white pill (grey when revealed incorrect), 120px letter block, reveal check on winner.
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

  const borderColor = dimmed ? `${tone.accent}99` : tone.accent;
  const outerGlow = isWinner
    ? `0 0 20px ${tone.accent}, 0 0 10px rgba(255, 255, 255, 0.25)`
    : dimmed
      ? `0 0 8px ${tone.accent}33`
      : `0 0 12px ${tone.accent}55`;

  const answerBg = dimmed ? '#E3E3E3' : '#FFFFFF';

  return (
    <div className={cn('relative min-w-0', className)}>
      <div
        className="relative flex h-[110px] w-full items-center overflow-hidden rounded-[20px]"
        style={{
          background: answerBg,
          border: `2px solid ${borderColor}`,
          boxShadow: outerGlow,
        }}
      >
        <span
          className="flex h-full w-[120px] shrink-0 items-center justify-center rounded-l-[18px]"
          style={{
            background: dimmed
              ? `linear-gradient(180deg, ${tone.from}99 0%, ${tone.to} 100%)`
              : `linear-gradient(180deg, ${tone.from} 0%, ${tone.to} 100%)`,
            filter: dimmed ? 'saturate(0.45) brightness(0.55)' : undefined,
          }}
        >
          <span
            className={cn(
              'text-[80px] font-extrabold uppercase leading-none [text-shadow:0_4px_6px_rgba(0,0,0,0.8)]',
              dimmed ? 'text-[#9A9A9A]' : 'text-white',
            )}
          >
            {letter}
          </span>
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate px-4 text-[35px] font-extrabold uppercase leading-none',
            dimmed ? 'text-[#7F8084]' : 'text-black',
          )}
          style={{ background: answerBg }}
        >
          {label}
        </span>
        {isWinner ? (
          <span
            className="mr-6 flex size-[65px] shrink-0 items-center justify-center rounded-full border border-[#38FF00] shadow-[0_0_12px_#38FF00]"
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
    </div>
  );
}
