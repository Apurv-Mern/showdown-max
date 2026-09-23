'use client';

import { cn } from '@/lib/utils';
import { VENUE_LOGO_SRC } from '@/lib/designTokens';

type VenueLogoProps = {
  className?: string;
  width?: number;
};

export function VenueLogo({ className, width = 530 }: VenueLogoProps) {
  return (
    <img
      src={VENUE_LOGO_SRC}
      alt="Max Showdown Live"
      className={cn('h-auto object-contain object-bottom', className)}
      style={{ width }}
      draggable={false}
    />
  );
}
