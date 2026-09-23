'use client';

import { cn } from '@/lib/utils';
import { optionAccent } from '@/lib/designTokens';

type PlayerChoiceBarProps = {
  index: number;
  letter?: string;
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  as?: 'button' | 'div';
};

/**
 * Figma choice row: dark navy pill, colored letter block, matching outline glow.
 */
export function PlayerChoiceBar({
  index,
  letter,
  label,
  selected = false,
  disabled = false,
  onClick,
  className,
  as = 'button',
}: PlayerChoiceBarProps) {
  const tone = optionAccent(index);
  const Comp = as;
  return (
    <Comp
      type={as === 'button' ? 'button' : undefined}
      onClick={onClick}
      disabled={as === 'button' ? disabled : undefined}
      className={cn(
        'relative flex h-[50px] w-full items-center overflow-hidden rounded-[10px]',
        'touch-manipulation select-none text-left transition-transform',
        !disabled && as === 'button' && 'active:scale-[0.99]',
        disabled && 'cursor-not-allowed',
        className,
      )}
      style={{
        background: 'linear-gradient(180deg, #00072F 0%, #00010A 100%)',
        border: `1.5px solid ${tone.accent}`,
        boxShadow: selected
          ? `0 0 16px ${tone.accent}, inset 0 0 10px rgba(0, 217, 255, 0.18)`
          : `0 0 10px ${tone.accent}66`,
      }}
    >
      <span
        className="flex h-full w-[50px] shrink-0 items-center justify-center rounded-l-[10px]"
        style={{
          background: `linear-gradient(180deg, ${tone.from} 0%, ${tone.to} 100%)`,
        }}
      >
        <span className="text-[30px] font-extrabold leading-none text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.5)]">
          {letter}
        </span>
      </span>
      <span className="min-w-0 flex-1 truncate px-2.5 text-[20px] font-extrabold uppercase leading-none text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.5)]">
        {label}
      </span>
    </Comp>
  );
}
