'use client';

import { cn, toDisplayUpper } from '@/lib/utils';
import { FIGMA_OPTION_ACCENTS } from '@/lib/designTokens';
import {
  FINAL_WAGER_GRID,
  STANDARD_WAGER_GRID,
  formatWagerGridLabel,
} from '@/lib/wagerGrid';
import { VenueLogo } from '@/components/venue/VenueLogo';
import { VenueWagerHud } from '@/components/venue/VenueLiveResponseHud';

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
      : 'WAGER ROUND';
  const gridValues = isFinalWager ? FINAL_WAGER_GRID : STANDARD_WAGER_GRID;
  const totalTeams = Math.max(1, wagerLockedTotal);

  return (
    <div className="relative h-full w-full animate-fadeIn">
      <VenueWagerHud
        lockedCount={wagerLockedCount}
        total={totalTeams}
        className="absolute right-[40px] top-[40px] z-10"
      />

      <div className="flex flex-col items-center pt-[8px]">
        <VenueLogo width={530} />
        <h1
          className="mt-4 text-center text-[150px] font-extrabold uppercase leading-[80px] text-white"
          style={{ textShadow: '0 10px 10px black, 0 0 20px #0010FF' }}
        >
          {headline}
        </h1>
      </div>

      <div className="absolute left-[170px] top-[525px] grid w-[1580px] grid-cols-3 gap-x-[40px] gap-y-[40px]">
        {gridValues.map((value, index) => {
          const tone = FIGMA_OPTION_ACCENTS[index % FIGMA_OPTION_ACCENTS.length];
          const n = wagerDistributionCounts[String(value)] ?? 0;
          return (
            <div
              key={value}
              className={cn(
                'relative flex h-[220px] w-[500px] items-center justify-center rounded-[30px]',
              )}
              style={{
                background: `linear-gradient(180deg, ${tone.from} 0%, ${tone.to} 100%)`,
                boxShadow: `0 0 18px ${tone.accent}88`,
              }}
            >
              <p className="text-[120px] font-extrabold uppercase leading-none text-white [text-shadow:0_6px_8px_black]">
                {formatWagerGridLabel(value, isFinalWager)}
              </p>
              {n > 0 ? (
                <span className="absolute bottom-4 text-[22px] font-bold uppercase tracking-wide text-white/90">
                  {n} {n === 1 ? 'team' : 'teams'}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
