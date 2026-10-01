'use client';

import { type ReactNode, useEffect, useState } from 'react';

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;

function readViewport() {
  if (typeof window === 'undefined') {
    return { width: STAGE_WIDTH, height: STAGE_HEIGHT };
  }
  const viewport = window.visualViewport;
  return {
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
}

export function VenueStage({ children }: { children: ReactNode }) {
  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
    const updateViewport = () => setViewport(readViewport());
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
    };
  }, []);

  // Fit the full 1920×1080 stage inside the viewport (no top/bottom or side clipping).
  // Standard 16:9 displays (1080p–8K) scale uniformly to fill the screen; ultrawide keeps
  // the entire UI visible with the stage backdrop filling any side letterbox.
  const scaleX = viewport.width / STAGE_WIDTH;
  const scaleY = viewport.height / STAGE_HEIGHT;
  const scale = Math.min(scaleX, scaleY);

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#020514]">
      {/* Backdrop spans the whole screen behind the scaled 1920×1080 stage. */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/venue-stage-bg.png')" }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-black/40" aria-hidden />
      <div
        className="absolute left-1/2 top-1/2 isolate overflow-hidden"
        data-venue-stage
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          containerType: 'size',
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: 'center',
        }}
      >
        {children}
      </div>
    </div>
  );
}
