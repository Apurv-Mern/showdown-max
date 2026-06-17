'use client';

import { cn } from '@/lib/utils';

export type VenueLiveResponseStats = {
  correct: number;
  incorrect: number;
  noAnswer: number;
  total: number;
};

type VenueLiveResponseBarsProps = {
  stats: VenueLiveResponseStats;
  roundType?: string;
  /** Compact = top-left overlay (wager collection). Inline = bordered row (question/reveal). */
  variant?: 'compact' | 'inline';
  className?: string;
};

export function VenueLiveResponseBars({
  stats,
  roundType,
  variant = 'inline',
  className,
}: VenueLiveResponseBarsProps) {
  const isMajorityRules = (roundType || '').toUpperCase() === 'MAJORITY_RULES';
  const total = Math.max(1, stats.total || 1);
  const isCompact = variant === 'compact';

  const rows = [
    {
      key: 'correct',
      color: 'from-[#00ff00] to-[#008000]',
      track: 'bg-[#3d7a3d]/60',
      value: stats.correct,
      icon: isMajorityRules ? '+' : '✓',
      iconBg: 'bg-green-500',
    },
    {
      key: 'incorrect',
      color: 'from-[#ff0000] to-[#800000]',
      track: 'bg-[#7a3d3d]/60',
      value: stats.incorrect,
      icon: isMajorityRules ? '-' : '×',
      iconBg: 'bg-red-500',
    },
    {
      key: 'no_answer',
      color: 'from-[#3b82f6] to-[#1e3a8a]',
      track: 'bg-[#3d507a]/60',
      value: stats.noAnswer,
      icon: '?',
      iconBg: 'bg-blue-500',
    },
  ];

  const bars = (
    <div className={cn('flex-1 min-w-0', isCompact ? 'space-y-2' : 'rounded-xl px-2 md:px-4')}>
      {rows.map((item) => {
        const width = Math.max(0, Math.min(100, Math.round((item.value / total) * 100)));
        return (
          <div key={item.key} className={cn('flex items-center', isCompact ? 'gap-2.5' : 'gap-3')}>
            {!isCompact ? (
              <div
                className={`${item.iconBg} h-4 w-4 rounded-full flex items-center justify-center text-[10px] text-white font-bold border border-white/20 shrink-0`}
              >
                {item.icon}
              </div>
            ) : null}
            <div
              className={cn(
                'flex-1 overflow-hidden rounded-full border border-white/10',
                item.track,
                isCompact ? 'h-2.5 sm:h-3' : 'h-4',
              )}
            >
              <div
                className={`h-full rounded-full bg-linear-to-r ${item.color} shadow-[0_0_12px_rgba(255,255,255,0.4)]`}
                style={{
                  width: `${width}%`,
                  minWidth: item.value > 0 ? '8px' : '0px',
                  transition: 'width 0.5s ease-out',
                }}
              />
            </div>
            <span
              className={cn(
                'text-right font-black italic text-[#47f3ff] shrink-0',
                isCompact ? 'w-4 text-base sm:w-5 sm:text-lg' : 'w-6 text-sm md:text-base lg:text-lg',
              )}
            >
              {item.value}
            </span>
          </div>
        );
      })}
    </div>
  );

  const icon = (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        isCompact
          ? 'h-11 w-11 border-2 border-[#1de8ff]/70 bg-[#0c1238]/90 shadow-[0_0_14px_rgba(29,232,255,0.35)] sm:h-12 sm:w-12'
          : 'h-8 w-8 md:h-10 md:w-10 lg:h-12 lg:w-12',
      )}
    >
      {!isCompact ? <div className="absolute inset-0 bg-linear-to-br from-purple-500/20 to-transparent" /> : null}
      <svg
        viewBox="0 0 24 24"
        className={cn(
          'relative z-10 text-[#20e7ff]',
          isCompact ? 'h-5 w-5 sm:h-6 sm:w-6' : 'h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7',
        )}
        fill="none"
        stroke="currentColor"
        strokeWidth={isCompact ? '2' : '2.5'}
      >
        <path d="M3 5h18M3 12h14M3 19h10" />
      </svg>
    </div>
  );

  if (isCompact) {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        {icon}
        <div className="min-w-[140px] sm:min-w-[168px]">{bars}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex w-full items-center gap-2 border border-[#00C8FF] rounded-xl px-3 py-2 md:gap-4 md:px-4 md:py-3 lg:max-w-2xl',
        className,
      )}
    >
      {icon}
      {bars}
    </div>
  );
}
