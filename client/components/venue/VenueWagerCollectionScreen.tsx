'use client';

import { cn, toDisplayUpper } from '@/lib/utils';
import { wagerInstructionText } from '@/lib/wagerGrid';
import { WagerDistributionGrid } from '@/components/shared/WagerDistributionGrid';

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
  const totalTeams = Math.max(1, wagerLockedTotal);

  return (
    <div
      className={cn(
        'relative mx-auto flex w-full max-w-[min(100cqw,1480px)] animate-fadeIn flex-col',
        'rounded-[18px] border-2 border-[#00d9ff]/70',
        'px-[clamp(2.5rem,5cqw,4.5rem)] pt-[clamp(2rem,4cqh,3rem)] pb-[clamp(2.25rem,4.5cqh,3.5rem)]',
        'shadow-[0_0_40px_rgba(0,180,255,0.25),inset_0_0_60px_rgba(80,0,180,0.15)]',
      )}
      style={{
        background: 'linear-gradient(180deg, #4020BA 0%, #000000 60%)',
      }}
    >
      <div
        className="absolute right-[clamp(1rem,2.2cqw,1.75rem)] top-[clamp(1rem,2.2cqh,1.75rem)] rounded-xl border border-[#00d9ff]/45 bg-[rgba(4,12,32,0.82)] px-[clamp(0.85rem,1.6cqw,1.15rem)] py-[clamp(0.65rem,1.2cqh,0.85rem)] text-right shadow-[0_0_18px_rgba(0,217,255,0.18)]"
        aria-live="polite"
        aria-label={`${wagerLockedCount} of ${totalTeams} teams wagered`}
      >
        <p className="text-[clamp(0.62rem,1cqw,0.72rem)] font-bold uppercase tracking-[0.14em] text-[#9de9ff]/85">
          Teams wagered
        </p>
        <p className="mt-0.5 text-[clamp(1.35rem,2.2cqw,1.85rem)] font-black leading-none text-white">
          <span className="text-[#00d9ff]">{wagerLockedCount}</span>
          <span className="text-white/55"> / {totalTeams}</span>
        </p>
      </div>
      <div className="shrink-0 text-center">
        <h1
          className="text-[clamp(2.5rem,3.8cqw,6.75rem)] font-black uppercase leading-[0.88] tracking-[0.02em]"
          style={{
            color: '#47EAFF',
            textShadow:
              '0 1px 0 #0a6a9a, 0 2px 0 #085a82, 0 3px 0 #064a6a, 0 4px 0 #043a52, 0 5px 0 #022a3a, 0 7px 14px rgba(0,0,0,0.55)',
          }}
        >
          {headline}
        </h1>

        <p className="mt-[clamp(0.65rem,1.5cqh,1.25rem)] text-[clamp(1.05rem,1.95cqw,1.65rem)] font-bold uppercase leading-snug tracking-[0.1em] text-white">
          {toDisplayUpper(wagerInstructionText(isFinalWager))}
        </p>
      </div>

      <div className="min-h-[clamp(3rem,5cqh,5rem)] shrink-0" aria-hidden />

      <div className="mx-auto w-full max-w-[min(900px,100%)] shrink-0">
        <WagerDistributionGrid
          variant="venue"
          roundType={roundType}
          counts={wagerDistributionCounts}
        />
      </div>
    </div>
  );
}
