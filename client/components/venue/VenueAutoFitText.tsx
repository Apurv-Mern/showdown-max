'use client';

import { type CSSProperties, type ReactNode, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

type VenueAutoFitTextProps = {
  children: ReactNode;
  className?: string;
  minFontSize: number;
  maxFontSize: number;
  step?: number;
  style?: CSSProperties;
};

/**
 * Fits dynamic venue copy into a bounded box. The box must have a constrained width and height.
 * Font fitting happens in logical 1920×1080 stage pixels, so it is resolution-independent.
 */
export function VenueAutoFitText({
  children,
  className,
  minFontSize,
  maxFontSize,
  step = 2,
  style,
}: VenueAutoFitTextProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return;

    const fit = () => {
      let size = maxFontSize;
      text.style.fontSize = `${size}px`;

      while (
        size > minFontSize &&
        (text.scrollHeight > box.clientHeight + 1 || text.scrollWidth > box.clientWidth + 1)
      ) {
        size = Math.max(minFontSize, size - step);
        text.style.fontSize = `${size}px`;
      }
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) fit();
    });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [children, maxFontSize, minFontSize, step]);

  return (
    <div ref={boxRef} className={cn('min-h-0 min-w-0 overflow-hidden', className)} style={style}>
      <span ref={textRef} className="block max-w-full">
        {children}
      </span>
    </div>
  );
}
