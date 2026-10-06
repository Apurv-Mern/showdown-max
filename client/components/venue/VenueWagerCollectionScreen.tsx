'use client';

import { toDisplayUpper } from '@/lib/utils';
import {
  FINAL_WAGER_GRID,
  STANDARD_WAGER_GRID,
  formatWagerGridLabel,
} from '@/lib/wagerGrid';
import { VenueLogo } from '@/components/venue/VenueLogo';
import { VenueWagerHud } from '@/components/venue/VenueLiveResponseHud';
import { VenueWagerChoiceCard } from '@/components/venue/VenueWagerChoiceCard';
import { formatRoundTypeDisplayLabel } from '@/lib/roundDisplayLabels';

export function VenueWagerCollectionScreen({
  category,
  roundType,
  wagerLockedCount = 0,
  wagerLockedTotal = 0,
  wagerDistributionCounts = {},
}: {
  category?: string | null;
  roundType?: string;
  wagerLockedCount?: number;
  wagerLockedTotal?: number;
  wagerDistributionCounts?: Record<string, number>;
}) {
  const isFinalWager = (roundType || '').toUpperCase() === 'FINAL_WAGER';
  const headline = isFinalWager
    ? 'FINAL QUESTION'
    : category
      ? toDisplayUpper(category)
      : formatRoundTypeDisplayLabel('WAGER');
  const gridValues = isFinalWager ? FINAL_WAGER_GRID : STANDARD_WAGER_GRID;
  const totalTeams = Math.max(1, wagerLockedTotal);

  return (
    <div className="relative h-full w-full animate-fadeIn">
      <VenueWagerHud
        lockedCount={wagerLockedCount}
        total={totalTeams}
        className="absolute right-[40px] top-[40px] z-10"
      />

      <div className="relative z-10 flex flex-col items-center pt-[8px]">
        <VenueLogo width={530} />
        <h1
          className="mt-4 text-center text-[150px] font-extrabold uppercase leading-[80px] text-white"
          style={{ textShadow: '0 10px 10px black, 0 0 20px #0010FF' }}
        >
          {headline}
        </h1>
      </div>

      <div className="absolute left-[170px] top-[525px] z-10 grid w-[1584px] grid-cols-3 gap-x-[40px] gap-y-[40px]">
        {gridValues.map((value, index) => {
          const n = wagerDistributionCounts[String(value)] ?? 0;
          return (
            <VenueWagerChoiceCard
              key={value}
              index={index}
              label={formatWagerGridLabel(value, isFinalWager)}
              teamCount={n}
            />
          );
        })}
      </div>
    </div>
  );
}
