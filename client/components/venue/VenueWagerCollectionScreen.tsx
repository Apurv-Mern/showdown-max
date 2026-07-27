'use client';

import { cn, toDisplayUpper } from '@/lib/utils';
import {
  FINAL_WAGER_GRID,
  formatWagerGridLabel,
  STANDARD_WAGER_GRID,
  tileClassForWagerValue,
  wagerInstructionText,
} from '@/lib/wagerGrid';

export function VenueWagerCollectionScreen({
  category,
  roundType,
  wagerLockedCount = 0,
  wagerLockedTotal = 0,
}: {
  category?: string | null;
  roundType?: string;
  wagerLockedCount?: number;
  wagerLockedTotal?: number;
}) {
  const isFinalWager = (roundType || '').toUpperCase() === 'FINAL_WAGER';
  const gridValues = isFinalWager ? FINAL_WAGER_GRID : STANDARD_WAGER_GRID;
  const headline = isFinalWager
    ? 'FINAL QUESTION'
    : category
      ? toDisplayUpper(category)
      : 'WAGER ROUND';
  const totalTeams = Math.max(1, wagerLockedTotal);

  return (
    <div
      className={cn(
        'relative mx-auto flex w-full max-w-[min(100vw,1480px)] animate-fadeIn flex-col',
        'rounded-[18px] border-2 border-[#00d9ff]/70',
        'px-[clamp(2.5rem,5vw,4.5rem)] pt-[clamp(2rem,4vh,3rem)] pb-[clamp(2.25rem,4.5vh,3.5rem)]',
        'shadow-[0_0_40px_rgba(0,180,255,0.25),inset_0_0_60px_rgba(80,0,180,0.15)]',
      )}
      style={{
        background: 'linear-gradient(180deg, #4020BA 0%, #000000 60%)',
      }}
    >
      <div
        className="absolute right-[clamp(1rem,2.2vw,1.75rem)] top-[clamp(1rem,2.2vh,1.75rem)] rounded-xl border border-[#00d9ff]/45 bg-[rgba(4,12,32,0.82)] px-[clamp(0.85rem,1.6vw,1.15rem)] py-[clamp(0.65rem,1.2vh,0.85rem)] text-right shadow-[0_0_18px_rgba(0,217,255,0.18)]"
        aria-live="polite"
        aria-label={`${wagerLockedCount} of ${totalTeams} teams wagered`}
      >
        <p className="text-[clamp(0.62rem,1vw,0.72rem)] font-bold uppercase tracking-[0.14em] text-[#9de9ff]/85">
          Teams wagered
        </p>
        <p className="mt-0.5 text-[clamp(1.35rem,2.2vw,1.85rem)] font-black leading-none text-white">
          <span className="text-[#00d9ff]">{wagerLockedCount}</span>
          <span className="text-white/55"> / {totalTeams}</span>
        </p>
      </div>
      <div className="shrink-0 text-center">
        <h1
          className="text-[clamp(2.5rem,3.8vw,6.75rem)] font-black uppercase leading-[0.88] tracking-[0.02em]"
          style={{
            color: '#47EAFF',
            textShadow:
              '0 1px 0 #0a6a9a, 0 2px 0 #085a82, 0 3px 0 #064a6a, 0 4px 0 #043a52, 0 5px 0 #022a3a, 0 7px 14px rgba(0,0,0,0.55)',
          }}
        >
          {headline}
        </h1>

        <p className="mt-[clamp(0.65rem,1.5vh,1.25rem)] text-[clamp(1.05rem,1.95vw,1.65rem)] font-bold uppercase leading-snug tracking-[0.1em] text-white">
          {toDisplayUpper(wagerInstructionText(isFinalWager))}
        </p>
      </div>

      <div className="min-h-[clamp(3rem,5vh,5rem)] shrink-0" aria-hidden />

      {/* Wager grid */}
      <div className="mx-auto grid w-full max-w-[min(900px,100%)] shrink-0 grid-cols-2 gap-[clamp(0.9rem,1.7vw,1.35rem)]">
        {gridValues.map((value) => (
          <div
            key={value}
            aria-hidden
            className={cn(
              'pointer-events-none flex min-h-[clamp(4.5rem,0vh,6.5rem)] select-none items-center justify-center rounded-[10px]',
              'text-[clamp(2.5rem,5.5vw,2rem)] font-black leading-none text-white',
              'shadow-[inset_0_2px_0_rgba(255,255,255,0.32),inset_0_-3px_0_rgba(0,0,0,0.32),0_6px_18px_rgba(0,0,0,0.45)]',
              tileClassForWagerValue(value, isFinalWager),
            )}
          >
            {formatWagerGridLabel(value, isFinalWager)}
          </div>
        ))}
      </div>
    </div>
  );
}
