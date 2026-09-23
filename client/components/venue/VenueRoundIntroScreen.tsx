'use client';

import { RoundIntroScoringLines } from '@/lib/roundIntroInstructions';
import { RoundIntroHeadline } from '@/components/shared/RoundIntroHeadline';

type VenueRoundIntroScreenProps = {
  roundNumber: number;
  roundType?: string;
  subtitle?: string;
};

export function VenueRoundIntroScreen({
  roundNumber,
  roundType,
  subtitle,
}: VenueRoundIntroScreenProps) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden animate-fadeIn">
      <div className="relative h-full aspect-[821/1042]">
        <img
          src="/Venue Round Intro.png"
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />

        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-[20%] flex h-[42%] w-[64%] -translate-x-1/2 items-center justify-center overflow-hidden rounded-full">
            <RoundIntroHeadline size="venue" roundNumber={roundNumber} subtitle={subtitle} />
          </div>

          <div className="absolute inset-x-[7%] top-[68%] bottom-[8%] flex flex-col items-stretch justify-center overflow-hidden">
            <RoundIntroScoringLines roundType={roundType} variant="venue" />
          </div>
        </div>
      </div>
    </div>
  );
}
