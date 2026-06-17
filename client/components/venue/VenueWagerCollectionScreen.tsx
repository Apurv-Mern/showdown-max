'use client';

import { cn, toDisplayUpper } from '@/lib/utils';
import { VenueLiveResponseBars } from '@/components/venue/VenueLiveResponseBars';

const STANDARD_WAGER_VALUES = [0, 10, 20, 30, 40, 50] as const;
const FINAL_WAGER_VALUES = [0, 20, 40, 60, 80, 100] as const;

/** 2×3 grid order: left column 0/20/40, right column 10/30/50 (matches design). */
const STANDARD_WAGER_GRID: readonly (typeof STANDARD_WAGER_VALUES)[number][] = [
  0, 10, 20, 30, 40, 50,
];

const FINAL_WAGER_GRID: readonly (typeof FINAL_WAGER_VALUES)[number][] = [
  0, 20, 40, 60, 80, 100,
];

const WAGER_TILE_CLASS: Record<number, string> = {
  0: 'bg-linear-to-b from-[#0190F5] to-[#015FB4]',
  10: 'bg-linear-to-b from-[#FF6F00] to-[#994200]',
  20: 'bg-linear-to-b from-[#2DA600] to-[#227E00]',
  30: 'bg-linear-to-b from-[#F29B00] to-[#B97700]',
  40: 'bg-linear-to-b from-[#460073] to-[#5C0098]',
  50: 'bg-linear-to-b from-[#990003] to-[#D20023]',
};

function tileClassForValue(value: number, isFinalWager: boolean): string {
  if (!isFinalWager) {
    return WAGER_TILE_CLASS[value] ?? 'bg-linear-to-b from-[#1565c0] to-[#0d47a1]';
  }
  const idx = FINAL_WAGER_GRID.indexOf(value as (typeof FINAL_WAGER_VALUES)[number]);
  const standardVal = STANDARD_WAGER_GRID[Math.max(0, idx)] ?? 0;
  return WAGER_TILE_CLASS[standardVal] ?? 'bg-linear-to-b from-[#1565c0] to-[#0d47a1]';
}

function formatTileLabel(value: number, isFinalWager: boolean): string {
  return isFinalWager ? `${value}%` : String(value);
}

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

  return (
    <div className="relative flex h-full w-full animate-fadeIn items-center justify-center px-[5%] py-[4%]">
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
          'relative flex w-full max-w-[min(760px,70vw)] min-h-[min(78vh,860px)] flex-col',
          'rounded-[26px] border-2 border-[#d8e4f0]/90',
          'bg-linear-to-b from-[#1c208f] via-[#14185a] to-[#060612]',
          'px-[clamp(2rem,4.5vw,3.75rem)] py-[clamp(2.5rem,5vh,4rem)]',
          'shadow-[0_0_40px_rgba(0,80,180,0.35)]',
        )}
      >
        <div className="text-center">
          <h1
            className="text-[clamp(3rem,7vw,5.5rem)] font-black uppercase leading-[0.9] tracking-[0.02em] drop-shadow-[0_3px_0_rgba(0,80,160,0.55),0_0_22px_rgba(71,234,255,0.5)]"
            style={{
              background:
                'linear-gradient(180deg, #6BF8FF 0%, #47EAFF 35%, #00D9FF 65%, #3AC1FF 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {category ? toDisplayUpper(category) : 'WAGER ROUND'}
          </h1>

          <p className="mt-[clamp(1.5rem,3vh,2.25rem)] text-[clamp(1rem,1.9vw,1.55rem)] font-bold uppercase leading-snug tracking-[0.08em] text-white">
            {isFinalWager
              ? 'Select the percentage you want to wager'
              : 'Select the points you want to wager'}
          </p>
        </div>

        <div className="flex-1 min-h-[clamp(1.5rem,4vh,3rem)]" aria-hidden />

        <div className="mx-auto grid w-full max-w-[min(580px,92%)] grid-cols-2 gap-[clamp(0.75rem,1.5vw,1.1rem)]">
          {gridValues.map((value) => (
            <div
              key={value}
              aria-hidden
              className={cn(
                'pointer-events-none flex min-h-[clamp(5rem,11vh,7.25rem)] select-none items-center justify-center rounded-2xl',
                'text-[clamp(2.5rem,5.5vw,4rem)] font-black leading-none text-white',
                'shadow-[inset_0_3px_0_rgba(255,255,255,0.28),0_6px_18px_rgba(0,0,0,0.5)]',
                tileClassForValue(value, isFinalWager),
              )}
            >
              {formatTileLabel(value, isFinalWager)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
