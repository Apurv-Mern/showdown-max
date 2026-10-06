'use client';

import { cn } from '@/lib/utils';
import { playerWagerChoiceStyleForIndex } from '@/lib/playerWagerChoiceAssets';

type PlayerWagerChoiceButtonProps = {
  index: number;
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
};

/** Figma mobile wager tile (~340×65 in UI; 400×65 in file with glow inset). */
export function PlayerWagerChoiceButton({
  index,
  label,
  selected = false,
  disabled = false,
  onClick,
  className,
}: PlayerWagerChoiceButtonProps) {
  const { frame, effect } = playerWagerChoiceStyleForIndex(index);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'relative mx-auto h-[65px] w-[calc(100%-1rem)] max-w-[340px] shrink-0 touch-manipulation transition-transform active:scale-[0.99]',
        disabled && 'pointer-events-none opacity-40',
        className,
      )}
    >
      <span className="pointer-events-none absolute inset-[-10%_-2%]">
        <img alt="" src={frame} className="block size-full max-w-none" draggable={false} />
      </span>
      <span className="pointer-events-none absolute left-0 top-1/2 h-[65px] w-[65px] -translate-y-1/2 overflow-hidden">
        <img
          alt=""
          src={effect}
          className="absolute inset-0 size-full max-w-none object-cover opacity-20"
          draggable={false}
        />
      </span>
      <span className="pointer-events-none absolute right-0 top-1/2 h-[65px] w-[65px] -translate-y-1/2 overflow-hidden">
        <img
          alt=""
          src={effect}
          className="absolute inset-0 size-full max-w-none object-cover opacity-20"
          draggable={false}
        />
      </span>
      <span className="relative flex h-full items-center justify-center text-[45px] font-extrabold leading-none text-white [text-shadow:0_4px_4px_rgba(0,0,0,0.7)]">
        {label}
      </span>
    </button>
  );
}
