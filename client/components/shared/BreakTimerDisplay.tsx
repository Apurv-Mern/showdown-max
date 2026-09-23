'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export type BreakTimerSize = 'player' | 'host' | 'venue';

const SIZE_CONFIG: Record<
  BreakTimerSize,
  {
    box: string;
    canvasSize: number;
    time: string;
    label: string;
    innerInset: string;
    ringInset: string;
  }
> = {
  player: {
    box: 'w-[min(88vw,320px)] max-w-[360px] aspect-square sm:w-[min(82vw,340px)] md:max-w-[400px]',
    canvasSize: 360,
    time: 'text-[clamp(2.75rem,12vw,4.25rem)]',
    label: 'text-sm sm:text-base md:text-lg',
    innerInset: 'inset-[28%]',
    ringInset: 'inset-[12%]',
  },
  host: {
    box: 'h-[260px] w-[260px] sm:h-[300px] sm:w-[300px]',
    canvasSize: 300,
    time: 'text-5xl sm:text-6xl',
    label: 'text-sm sm:text-base',
    innerInset: 'inset-[28%]',
    ringInset: 'inset-[12%]',
  },
  venue: {
    box: 'h-[518px] w-[518px]',
    canvasSize: 518,
    time: 'text-[120px]',
    label: 'text-[35px]',
    innerInset: 'inset-[28%]',
    ringInset: 'inset-[12%]',
  },
};

function drawProgressRing(
  canvas: HTMLCanvasElement,
  remainingSeconds: number,
  totalSeconds: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const cx = W / 2;
  const cy = W / 2;

  const R = W * 0.46;
  const lw = W * 0.05;

  ctx.clearRect(0, 0, W, W);

  const total = Math.max(1, totalSeconds);
  const remaining = Math.max(0, remainingSeconds);
  const elapsed = total - remaining;
  const startAngle = -Math.PI / 2;
  const elapsedAngle = (elapsed / total) * Math.PI * 2;

  // Track background (dark)
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = '#141a33';
  ctx.lineWidth = lw + 2;
  ctx.stroke();

  // Elapsed dark arc
  if (elapsed > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, R, startAngle, startAngle + elapsedAngle);
    ctx.strokeStyle = '#3a3f5a';
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // Remaining arc: green(120) → yellow(60) → red(0)
  if (remaining > 0) {
    const remStart = startAngle + elapsedAngle;
    const remEnd = startAngle + Math.PI * 2;
    const SEGMENTS = 90;

    // Color fill pass
    for (let i = 0; i < SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const a0 = remStart + t * (remEnd - remStart);
      const a1 = remStart + ((i + 1) / SEGMENTS) * (remEnd - remStart);
      const hue = 120 - t * 120; // green → yellow → red
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0, a1);
      ctx.strokeStyle = `hsl(${hue}, 100%, 50%)`;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Glow pass
    ctx.save();
    ctx.filter = `blur(${W * 0.012}px)`;
    for (let i = 0; i < SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const a0 = remStart + t * (remEnd - remStart);
      const a1 = remStart + ((i + 1) / SEGMENTS) * (remEnd - remStart);
      const hue = 120 - t * 120;
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0, a1);
      ctx.strokeStyle = `hsla(${hue}, 100%, 60%, 0.4)`;
      ctx.lineWidth = lw + W * 0.02;
      ctx.lineCap = 'butt';
      ctx.stroke();
    }
    ctx.restore();
  }
}

export interface BreakTimerDisplayProps {
  remainingSeconds: number;
  totalSeconds: number;
  size?: BreakTimerSize;
  className?: string;
}

export function BreakTimerDisplay({
  remainingSeconds,
  totalSeconds,
  size = 'player',
  className,
}: BreakTimerDisplayProps) {
  const cfg = SIZE_CONFIG[size];
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const minutes = Math.floor(Math.max(0, remainingSeconds) / 60);
  const seconds = Math.max(0, remainingSeconds) % 60;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawProgressRing(canvas, remainingSeconds, totalSeconds);
  }, [remainingSeconds, totalSeconds]);

  return (
    <div className={cn('relative mx-auto shrink-0 rounded-full', cfg.box, className)}>
      {/* Layer 1 — Timer_BG.png as the outermost ring (blue neon border) */}
      <div
        className="absolute inset-0 rounded-full bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/Timer_BG.png')" }}
      />

      {/* Layer 2 — green→red progress ring canvas, inset inside the BG image border */}
      <canvas
        ref={canvasRef}
        width={cfg.canvasSize}
        height={cfg.canvasSize}
        className={cn('absolute rounded-full', cfg.ringInset)}
        style={{ width: '76%', height: '76%' }}
      />

      {/* Layer 3 — dark inner circle with time display */}
      <div
        className={cn(
          'absolute flex flex-col items-center justify-center rounded-full',
          cfg.innerInset,
        )}
      >
        <p
          className={cn('font-mono font-black leading-none text-white text-2xl', cfg.time)}
          style={{ textShadow: '0 0 20px rgba(255,255,255,0.3)' }}
        >
          {minutes}:{String(seconds).padStart(2, '0')}
        </p>
        <p
          className={cn(
            'mt-1 font-extrabold uppercase tracking-[1px] text-white sm:mt-2',
            cfg.label,
          )}
          style={{ textShadow: '0 5px 2px black' }}
        >
          TIME REMAINING
        </p>
      </div>
    </div>
  );
}
