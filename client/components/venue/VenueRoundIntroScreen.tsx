'use client';

import { getVenueRoundIntroImageUrl } from '@/lib/roundIntroAssets';

type VenueRoundIntroScreenProps = {
  roundNumber: number;
  /** Kept for call-site compatibility; art is baked into per-round PNGs. */
  roundType?: string;
  subtitle?: string;
};

/** Full-bleed per-round art from `public/Round Intro Images/Venue/`. */
export function VenueRoundIntroScreen({ roundNumber }: VenueRoundIntroScreenProps) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden animate-fadeIn">
      <div className="relative h-full aspect-[821/1042]">
        <img
          src={getVenueRoundIntroImageUrl(roundNumber)}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />
      </div>
    </div>
  );
}
