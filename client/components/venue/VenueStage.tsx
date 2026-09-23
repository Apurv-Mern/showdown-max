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

  const scale = Math.min(viewport.width / STAGE_WIDTH, viewport.height / STAGE_HEIGHT);

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#020514]">
      {/* Backdrop spans the whole screen, not the 16:9 stage, so non-16:9 displays letterbox
          into the venue artwork instead of bare black. */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/venue-stage-bg.png')" }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-[#030818]/70" aria-hidden />
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
