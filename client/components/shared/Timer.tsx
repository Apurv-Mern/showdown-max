'use client';

import { cn } from '@/lib/utils';

interface TimerProps {
  remaining: number;
  total?: number;
  className?: string;
}

export const Timer = ({ remaining, total, className }: TimerProps) => {
  const isLow = remaining <= 5;
  const percentage = total ? (remaining / total) * 100 : 100;

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <span className={cn('text-4xl font-bold tabular-nums', isLow ? 'text-danger animate-pulse' : 'text-foreground')}>
        {remaining}
      </span>
      {total && (
        <div className="w-full h-2 bg-surface-light rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-1000', isLow ? 'bg-danger' : 'bg-primary')}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
};
