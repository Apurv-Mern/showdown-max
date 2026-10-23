'use client';

import { getMobileRoundIntroImageUrl } from '@/lib/roundIntroAssets';

type PlayerRoundIntroScreenProps = {
  roundNumber: number;
};

/** Full-bleed per-round art from `public/Round Intro Images/Mobile/`. */
export function PlayerRoundIntroScreen({ roundNumber }: PlayerRoundIntroScreenProps) {
  return (
    <img
      src={getMobileRoundIntroImageUrl(roundNumber)}
      alt=""
      className="h-auto w-full"
      draggable={false}
    />
  );
}
