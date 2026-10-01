'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

type VenueTimerRingProps = {
  remainingSeconds: number;
  totalSeconds?: number;
  className?: string;
  /** Outer size in px. Venue default 152; player HUD uses ~80. */
  size?: number;
};

/**
 * Circular countdown ring used on venue and player question screens.
 */
export function VenueTimerRing({
  remainingSeconds,
  totalSeconds = 30,
  className,
  size = 152,
}: VenueTimerRingProps) {
  const gradId = useId().replace(/:/g, '');
  const display = Math.max(0, Math.ceil(remainingSeconds));
  const total = Math.max(1, totalSeconds);
  const progress = Math.max(0, Math.min(1, remainingSeconds / total));
  const stroke = size >= 140 ? 10 : 7;
  const cx = size / 2;
  const r = cx - stroke;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);
  const fontSize = size >= 140 ? 70 : Math.round(size * 0.4);

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 size-full -rotate-90">
        <circle cx={cx} cy={cx} r={r} fill="#00010A" stroke="#001040" strokeWidth={stroke} />
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00D9FF" />
            <stop offset="100%" stopColor="#0010FF" />
          </linearGradient>
        </defs>
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-bold leading-none text-white"
        style={{ fontSize }}
      >
        {display}
      </span>
    </div>
  );
}
