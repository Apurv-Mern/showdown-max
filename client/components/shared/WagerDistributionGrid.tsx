'use client';

import { cn } from '@/lib/utils';
import {
  FINAL_WAGER_GRID,
  formatWagerGridLabel,
  STANDARD_WAGER_GRID,
  tileClassForWagerValue,
} from '@/lib/wagerGrid';

type WagerDistributionGridProps = {
  roundType?: string;
  counts: Record<string, number>;
  /** Host sidebar uses compact tiles; venue overlays counts on the mock grid. */
  variant?: 'host' | 'venue';
};

export function WagerDistributionGrid({
  roundType,
  counts,
  variant = 'host',
}: WagerDistributionGridProps) {
  const isFinalWager = (roundType || '').toUpperCase() === 'FINAL_WAGER';
  const gridValues = isFinalWager ? FINAL_WAGER_GRID : STANDARD_WAGER_GRID;
  const isHost = variant === 'host';

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-2',
        !isHost && 'gap-[clamp(0.9rem,1.7vw,1.35rem)]',
      )}
    >
      {gridValues.map((value) => {
        const n = counts[String(value)] ?? 0;
        const label = formatWagerGridLabel(value, isFinalWager);
        if (isHost) {
          return (
            <div
              key={value}
              className={cn(
                'flex items-center justify-between gap-2 rounded-lg px-3 py-2',
                'border border-white/10 bg-black/25',
              )}
            >
              <span
                className={cn(
                  'flex h-9 min-w-[3.25rem] items-center justify-center rounded-md text-sm font-black text-white shadow-md',
                  tileClassForWagerValue(value, isFinalWager),
                )}
              >
                {label}
              </span>
              <div className="min-w-0 flex-1 text-right">
                <span className="font-mono text-xl font-bold text-[#00d9ff]">{n}</span>
                <span className="ml-1 text-[10px] uppercase tracking-wider text-white/45">
                  {n === 1 ? 'team' : 'teams'}
                </span>
              </div>
            </div>
          );
        }

        return (
          <div
            key={value}
            className={cn(
              'relative flex min-h-[clamp(4.5rem,0vh,6.5rem)] flex-col items-center justify-center rounded-[10px]',
              'text-[clamp(2.5rem,5.5vw,2rem)] font-black leading-none text-white',
              'shadow-[inset_0_2px_0_rgba(255,255,255,0.32),inset_0_-3px_0_rgba(0,0,0,0.32),0_6px_18px_rgba(0,0,0,0.45)]',
              tileClassForWagerValue(value, isFinalWager),
            )}
          >
            {label}
            <span className="absolute bottom-[clamp(0.35rem,0.8vh,0.55rem)] text-[clamp(0.75rem,1.2vw,0.95rem)] font-bold uppercase tracking-wide text-white/90 drop-shadow-md">
              {n} {n === 1 ? 'team' : 'teams'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
