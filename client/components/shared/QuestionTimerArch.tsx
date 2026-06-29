'use client';

import { cn } from '@/lib/utils';

export type QuestionTimerArchSize = 'host' | 'venue';

const SIZE_CONFIG: Record<
  QuestionTimerArchSize,
  {
    wrapper: string;
    disk: string;
    ring: string;
    inner: string;
    text: string;
    textOffset: string;
  }
> = {
  host: {
    wrapper:
      'pointer-events-none absolute bottom-0 left-1/2 z-30 h-24 w-48 -translate-x-1/2 overflow-hidden',
    disk: 'absolute left-0 top-0 h-48 w-48',
    ring: 'h-full w-full rounded-full p-1.5 bg-linear-to-r from-[#ff0000] via-[#ddff00] via-[#ffaa00] to-[#00ff00]',
    inner:
      'relative flex h-full w-full overflow-hidden rounded-full border border-white/10 bg-[#030818] justify-center',
    text: 'relative z-10 text-5xl font-black tracking-tighter text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]',
    textOffset: 'pt-6',
  },
  venue: {
    wrapper:
      'pointer-events-none absolute left-1/2 bottom-px z-30 w-48 h-24 md:w-56 md:h-28 lg:w-64 lg:h-32 -translate-x-1/2 overflow-hidden',
    disk: 'absolute top-6 left-0 h-48 w-48 md:h-56 md:w-56 lg:h-64 lg:w-64',
    ring: 'h-full w-full rounded-full p-2 bg-linear-to-r from-[#ff0000] via-[#ddff00] via-[#ffaa00] to-[#00ff00]',
    inner:
      'relative flex h-full w-full justify-center overflow-hidden rounded-full border border-white/10 bg-[#030818]',
    text: 'relative z-10 font-black tracking-tighter text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] text-4xl md:text-5xl lg:text-6xl',
    textOffset: 'mt-4 md:mt-5 lg:mt-6',
  },
};

export type QuestionTimerArchProps = {
  remainingSeconds: number;
  totalSeconds?: number;
  size?: QuestionTimerArchSize;
  className?: string;
};

/** Static gradient semicircle timer — original venue/host design. */
export function QuestionTimerArch({
  remainingSeconds,
  size = 'venue',
  className,
}: QuestionTimerArchProps) {
  const cfg = SIZE_CONFIG[size];
  const display = Math.max(0, Math.ceil(remainingSeconds));

  return (
    <div className={cn(cfg.wrapper, className)}>
      <div className={cfg.disk}>
        <div className={cfg.ring}>
          <div className={cfg.inner}>
            <div
              className="pointer-events-none absolute inset-0 opacity-20"
              style={{
                backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
                backgroundSize: '8px 8px',
              }}
              aria-hidden
            />
            <span className={cn(cfg.text, cfg.textOffset)}>{display}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
