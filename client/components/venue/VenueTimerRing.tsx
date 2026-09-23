'use client';

import { cn } from '@/lib/utils';

type VenueTimerRingProps = {
  remainingSeconds: number;
  totalSeconds?: number;
  className?: string;
};

/**
 * Figma venue timer: 152px circle, 70px count, cyan/blue ring.
 */
export function VenueTimerRing({
  remainingSeconds,
  totalSeconds = 30,
  className,
}: VenueTimerRingProps) {
  const display = Math.max(0, Math.ceil(remainingSeconds));
  const total = Math.max(1, totalSeconds);
  const progress = Math.max(0, Math.min(1, remainingSeconds / total));
  const r = 66;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);

  return (
    <div className={cn('relative size-[152px] shrink-0', className)}>
      <svg viewBox="0 0 152 152" className="absolute inset-0 size-full -rotate-90">
        <circle cx="76" cy="76" r={r} fill="#00010A" stroke="#001040" strokeWidth="10" />
        <circle
          cx="76"
          cy="76"
          r={r}
          fill="none"
          stroke="url(#venueTimerGrad)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
        <defs>
          <linearGradient id="venueTimerGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00D9FF" />
            <stop offset="100%" stopColor="#0010FF" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[70px] font-bold leading-none text-white">
        {display}
      </span>
    </div>
  );
}
