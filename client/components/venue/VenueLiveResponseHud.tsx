'use client';

import { cn } from '@/lib/utils';

export type VenueLiveResponseStats = {
  correct: number;
  incorrect: number;
  noAnswer: number;
  total: number;
};

type VenueLiveResponseHudProps = {
  stats: VenueLiveResponseStats;
  roundType?: string;
  className?: string;
};

function HudIcon({
  kind,
}: {
  kind: 'correct' | 'incorrect' | 'none';
}) {
  if (kind === 'correct') {
    return (
      <span
        className="flex size-[65px] items-center justify-center rounded-full border border-[#38FF00]"
        style={{ background: 'radial-gradient(circle at 50% 50%, #38FF00 0%, #007B00 90%)' }}
      >
        <svg viewBox="0 0 24 24" className="size-[43px] text-white" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M5 12.5 9.5 17 19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (kind === 'incorrect') {
    return (
      <span
        className="flex size-[65px] items-center justify-center rounded-full border border-[#FF0000]"
        style={{ background: 'radial-gradient(circle at 50% 50%, #FF0000 0%, #7D0003 90%)' }}
      >
        <svg viewBox="0 0 24 24" className="size-[36px] text-white" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M6 6 18 18M18 6 6 18" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="flex size-[65px] items-center justify-center rounded-full border border-[#1A00FF]"
      style={{ background: 'radial-gradient(circle at 50% 50%, #1A00FF 0%, #00010A 90%)' }}
    >
      <span className="text-[36px] font-extrabold leading-none text-white">?</span>
    </span>
  );
}

/**
 * Figma venue "LIVE TEAM RESPONSE" capsule (750×152).
 */
export function VenueLiveResponseHud({ stats, roundType, className }: VenueLiveResponseHudProps) {
  const isMajority = (roundType || '').toUpperCase() === 'MAJORITY_RULES';

  const items = [
    {
      key: 'correct',
      kind: 'correct' as const,
      value: stats.correct,
      color: '#38FF00',
      label: isMajority ? 'MAJORITY' : 'CORRECT',
    },
    {
      key: 'incorrect',
      kind: 'incorrect' as const,
      value: stats.incorrect,
      color: '#FF0000',
      label: isMajority ? 'MINORITY' : 'INCORRECT',
    },
    {
      key: 'none',
      kind: 'none' as const,
      value: stats.noAnswer,
      color: '#00D9FF',
      label: 'NO ANSWER',
    },
  ];

  return (
    <div
      className={cn(
        'flex h-[152px] w-[750px] flex-col items-center justify-center rounded-[20px] px-6',
        className,
      )}
      style={{
        background: 'linear-gradient(180deg, #00072F 0%, #00010A 100%)',
        border: '2px solid #00D9FF',
        boxShadow: '0 0 16px rgba(0, 217, 255, 0.35)',
      }}
    >
      <p className="text-[25px] font-bold uppercase leading-none text-white">LIVE TEAM RESPONSE</p>
      <div className="mt-3 flex items-center gap-6">
        {items.map((item) => (
          <div key={item.key} className="flex items-center gap-2">
            <HudIcon kind={item.kind} />
            <div className="min-w-[106px] text-center font-extrabold uppercase leading-none">
              <p className="text-[40px]" style={{ color: item.color }}>
                {item.value}
              </p>
              <p className="mt-0.5 text-[20px] text-white">{item.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type VenueWagerHudProps = {
  lockedCount: number;
  total: number;
  className?: string;
};

/** Compact top-right HUD on Figma wager collection. */
export function VenueWagerHud({ lockedCount, total, className }: VenueWagerHudProps) {
  return (
    <div
      className={cn(
        'flex h-[152px] w-[397px] flex-col items-center justify-center rounded-[20px]',
        className,
      )}
      style={{
        background: 'linear-gradient(180deg, #00072F 0%, #00010A 100%)',
        border: '2px solid #00D9FF',
        boxShadow: '0 0 16px rgba(0, 217, 255, 0.35)',
      }}
      aria-label={`${lockedCount} of ${total} teams wagered`}
    >
      <p className="text-[25px] font-bold uppercase leading-none text-white">LIVE TEAM RESPONSE</p>
      <div className="mt-3 flex items-center gap-3">
        <span
          className="flex size-[76px] items-center justify-center rounded-full border-2 border-[#00D9FF]"
          style={{ background: 'radial-gradient(circle at 50% 50%, #0085FF 0%, #00010A 90%)' }}
        >
          <svg viewBox="0 0 24 24" className="size-9 text-white" fill="currentColor">
            <path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 1a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 8 12Zm8 1.5c-2.6 0-7.8 1.3-7.8 4V20h15.6v-2.5c0-2.7-5.2-4-7.8-4ZM8 14.2c-.3 0-.6 0-.9.05C4.7 14.7 2 16 2 18.1V20h5.3v-2.3c0-.9.3-1.7.8-2.4A9.4 9.4 0 0 0 8 14.2Z" />
          </svg>
        </span>
        <p className="text-[40px] font-extrabold leading-none text-white">
          {lockedCount}/{Math.max(1, total)}
        </p>
      </div>
    </div>
  );
}
