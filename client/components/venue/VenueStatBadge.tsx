'use client';

import { cn } from '@/lib/utils';

type VenueStatBadgeProps = {
  kind: 'teams' | 'points';
  value: string | number;
  className?: string;
};

/** Figma top-right people / trophy badges. */
export function VenueStatBadge({ kind, value, className }: VenueStatBadgeProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span
        className="flex size-[110px] items-center justify-center rounded-full border-2 border-[#00D9FF]"
        style={{
          background: 'radial-gradient(circle at 50% 50%, #0010FF 0%, #00010A 85%)',
          boxShadow: '0 0 14px rgba(0, 217, 255, 0.35)',
        }}
      >
        {kind === 'teams' ? (
          <svg viewBox="0 0 24 24" className="size-[54px] text-[#00D9FF]" fill="currentColor">
            <path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 1a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 8 12Zm8 1.5c-2.6 0-7.8 1.3-7.8 4V20h15.6v-2.5c0-2.7-5.2-4-7.8-4ZM8 14.2c-.3 0-.6 0-.9.05C4.7 14.7 2 16 2 18.1V20h5.3v-2.3c0-.9.3-1.7.8-2.4A9.4 9.4 0 0 0 8 14.2Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="size-[62px]" fill="none">
            <path d="M7 4h10v2.2c0 2.6-1.8 4.8-4.2 5.5V14h3v2H8v-2h3V11.7C8.8 11 7 8.8 7 6.2V4Z" fill="#FFCC00" />
            <path d="M7 4H4.5C4.5 6.8 6 8.6 8 9M17 4h2.5C19.5 6.8 18 8.6 16 9" stroke="#FFCC00" strokeWidth="1.6" />
            <rect x="6" y="16" width="12" height="2.2" rx="0.6" fill="#FFCC00" />
            <rect x="8" y="18.2" width="8" height="2.3" rx="0.6" fill="#E6B000" />
          </svg>
        )}
      </span>
      <span className="min-w-[59px] text-[45px] font-extrabold leading-none text-white">{value}</span>
    </div>
  );
}
