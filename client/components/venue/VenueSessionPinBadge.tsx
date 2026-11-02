'use client';

import { cn } from '@/lib/utils';

type VenueSessionPinBadgeProps = {
  sessionPin: string;
  className?: string;
  /** Compact overlay on in-game slides; larger on welcome. */
  size?: 'default' | 'compact';
};

/** High-contrast PIN chip for venue readability over stage backgrounds. */
export function VenueSessionPinBadge({
  sessionPin,
  className,
  size = 'default',
}: VenueSessionPinBadgeProps) {
  const compact = size === 'compact';

  return (
    <div
      className={cn(
        'pointer-events-none select-none text-center text-white',
        'rounded-[20px] border-2 border-[#00D9FF] bg-black',
        'shadow-[0_0_20px_rgba(0,217,255,0.35)]',
        compact ? 'px-5 py-3' : 'px-8 py-4',
        className,
      )}
    >
      <p
        className={cn(
          'font-bold uppercase leading-none tracking-wide',
          compact ? 'text-[22px]' : 'text-[40px]',
        )}
      >
        Session Pin
      </p>
      <p
        className={cn(
          'font-extrabold leading-none text-[#00D9FF]',
          compact ? 'mt-2 text-[48px]' : 'mt-3 text-[80px]',
        )}
      >
        {sessionPin}
      </p>
    </div>
  );
}
