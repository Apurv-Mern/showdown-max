'use client';

import { cn } from '@/lib/utils';
import { venueWagerChoiceStyleForIndex } from '@/lib/venueWagerChoiceAssets';

type VenueWagerChoiceCardProps = {
  index: number;
  label: string;
  teamCount?: number;
  className?: string;
};

/**
 * Figma venue wager tile: 500×220, SVG frame with glow inset, corner halftone at 20% opacity.
 */
export function VenueWagerChoiceCard({
  index,
  label,
  teamCount = 0,
  className,
}: VenueWagerChoiceCardProps) {
  const { frame, effect } = venueWagerChoiceStyleForIndex(index);

  return (
    <div className={cn('relative h-[220px] w-[500px] shrink-0', className)}>
      <div className="pointer-events-none absolute inset-[-6.82%_-3%]">
        <img alt="" src={frame} className="block size-full max-w-none" draggable={false} />
      </div>
      <div className="pointer-events-none absolute left-0 top-1/2 h-[198px] w-[197px] -translate-y-1/2 overflow-hidden">
        <img
          alt=""
          src={effect}
          className="absolute inset-0 size-full max-w-none object-cover opacity-20"
          draggable={false}
        />
      </div>
      <div className="pointer-events-none absolute right-0 top-1/2 h-[198px] w-[197px] -translate-y-1/2 overflow-hidden">
        <img
          alt=""
          src={effect}
          className="absolute inset-0 size-full max-w-none object-cover opacity-20"
          draggable={false}
        />
      </div>
      <p className="absolute inset-0 flex items-center justify-center text-center text-[120px] font-extrabold uppercase leading-none text-white [text-shadow:0_6px_8px_black]">
        {label}
      </p>
      {teamCount > 0 ? (
        <span className="absolute bottom-3 left-0 right-0 text-center text-[22px] font-bold uppercase tracking-wide text-white/90 [text-shadow:0_2px_4px_black]">
          {teamCount} {teamCount === 1 ? 'team' : 'teams'}
        </span>
      ) : null}
    </div>
  );
}
