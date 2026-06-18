'use client';

import { cn, toDisplayUpper } from '@/lib/utils';
import {
  FINAL_WAGER_GRID,
  formatWagerGridLabel,
  STANDARD_WAGER_GRID,
  tileClassForWagerValue,
  wagerInstructionText,
} from '@/lib/wagerGrid';
import { VenueLiveResponseBars } from '@/components/venue/VenueLiveResponseBars';

export function VenueWagerCollectionScreen({
  category,
  roundType,
  wagerLockedCount,
  wagerLockedTotal,
  liveTotalTeams,
}: {
  category?: string | null;
  roundType?: string;
  wagerLockedCount: number;
  wagerLockedTotal: number;
  liveTotalTeams: number;
}) {
  const isFinalWager = (roundType || '').toUpperCase() === 'FINAL_WAGER';
  const gridValues = isFinalWager ? FINAL_WAGER_GRID : STANDARD_WAGER_GRID;
  const total = Math.max(1, wagerLockedTotal || liveTotalTeams || 1);
  const pending = Math.max(0, total - wagerLockedCount);
  const headline = category
    ? toDisplayUpper(category)
    : isFinalWager
      ? 'FINAL WAGER'
      : 'WAGER ROUND';

  return (
    <div className="relative flex h-full w-full animate-fadeIn items-center justify-center bg-linear-to-b from-[#1a004d] via-[#120838] to-[#000000] px-[4%] py-[3%]">
      <VenueLiveResponseBars
        variant="compact"
        className="absolute left-[3%] top-[4%] z-20 sm:left-[4%] sm:top-[5%]"
        stats={{
          correct: wagerLockedCount,
          incorrect: pending,
          noAnswer: 0,
          total,
        }}
      />

      <div
        className={cn(
          'relative flex w-full max-w-[min(820px,78vw)] min-h-[min(82vh,920px)] flex-col',
          'rounded-[28px] border-2 border-[#e8eef5]/85',
          'bg-linear-to-b from-[#1c208f] via-[#14185a] to-[#060612]',
          'px-[clamp(2.25rem,5vw,4rem)] pt-[clamp(2.5rem,5.5vh,4.25rem)] pb-[clamp(2rem,4vh,3rem)]',
          'shadow-[0_0_48px_rgba(0,80,180,0.38)]',
        )}
      >
        <div className="text-center">
          <h1
            className="text-[clamp(3.25rem,7.5vw,6rem)] font-black uppercase leading-[0.88] tracking-[0.02em] drop-shadow-[0_4px_0_rgba(0,60,140,0.65),0_0_24px_rgba(71,234,255,0.45)]"
            style={{
              background:
                'linear-gradient(180deg, #6BF8FF 0%, #47EAFF 35%, #00D9FF 65%, #3AC1FF 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {headline}
          </h1>

          <p className="mt-[clamp(1.75rem,3.5vh,2.5rem)] text-[clamp(1.05rem,2vw,1.65rem)] font-bold uppercase leading-snug tracking-[0.1em] text-white">
            {wagerInstructionText(isFinalWager)}
          </p>
        </div>

        <div className="flex-1 min-h-[clamp(2rem,5vh,4rem)]" aria-hidden />

        <div className="mx-auto grid w-full max-w-[min(600px,94%)] grid-cols-2 gap-[clamp(0.85rem,1.6vw,1.25rem)]">
          {gridValues.map((value) => (
            <div
              key={value}
              aria-hidden
              className={cn(
                'pointer-events-none flex min-h-[clamp(5.25rem,12vh,7.5rem)] select-none items-center justify-center rounded-2xl',
                'text-[clamp(2.75rem,6vw,4.25rem)] font-black leading-none text-white',
                'shadow-[inset_0_3px_0_rgba(255,255,255,0.28),0_6px_20px_rgba(0,0,0,0.52)]',
                tileClassForWagerValue(value, isFinalWager),
              )}
            >
              {formatWagerGridLabel(value, isFinalWager)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
