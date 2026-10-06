'use client';

import { cn } from '@/lib/utils';
import { kangarooChoiceStyleForIndex } from '@/lib/kangarooSelectAssets';

type PlayerKangarooChoiceButtonProps = {
  index: number;
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
};

/** Figma kangaroo pick tile: 185×83 with colored frame and corner halftone. */
export function PlayerKangarooChoiceButton({
  index,
  label,
  selected = false,
  disabled = false,
  onClick,
  className,
}: PlayerKangarooChoiceButtonProps) {
  const { frame, effect } = kangarooChoiceStyleForIndex(index);

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'relative h-[83px] w-full min-w-0 touch-manipulation transition-[transform,box-shadow,opacity] active:scale-[0.99]',
        disabled && !selected && 'pointer-events-none opacity-40',
        selected && 'z-[1] opacity-100',
        className,
      )}
    >
      <span className="pointer-events-none absolute inset-[-10%_-2%]">
        <img alt="" src={frame} className="block size-full max-w-none" draggable={false} />
      </span>
      <span className="pointer-events-none absolute left-0 top-1/2 h-[50px] w-[50px] -translate-y-1/2 overflow-hidden">
        <img
          alt=""
          src={effect}
          className={cn(
            'absolute inset-0 size-full max-w-none object-cover',
            selected ? 'opacity-35' : 'opacity-20',
          )}
          draggable={false}
        />
      </span>
      <span className="pointer-events-none absolute right-0 top-1/2 h-[50px] w-[50px] -translate-y-1/2 overflow-hidden">
        <img
          alt=""
          src={effect}
          className={cn(
            'absolute inset-0 size-full max-w-none object-cover',
            selected ? 'opacity-35' : 'opacity-20',
          )}
          draggable={false}
        />
      </span>
      <span className="relative flex h-full items-center justify-center px-1.5 text-center text-[20px] font-extrabold leading-[1.1] text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.5)]">
        {label}
      </span>
    </button>
  );
}
