'use client';

import { cn } from '@/lib/utils';

type PlayerScreenShellProps = {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

/**
 * Shared player chrome from Figma (440×956): navy gradient + bottom dotted halo.
 */
export function PlayerScreenShell({
  children,
  className,
  contentClassName,
}: PlayerScreenShellProps) {
  return (
    <div className={cn('player-figma-bg relative h-full min-h-0 w-full overflow-hidden', className)}>
      <div
        className="pointer-events-none absolute left-1/2 top-[81%] z-0 h-[46%] w-[99%] -translate-x-1/2 opacity-10"
        aria-hidden
      >
        <img
          src="/figma/player-dot-halo.png"
          alt=""
          className="h-full w-full object-contain object-bottom"
        />
      </div>
      <div className={cn('relative z-10 flex h-full min-h-0 w-full flex-col', contentClassName)}>
        {children}
      </div>
    </div>
  );
}
