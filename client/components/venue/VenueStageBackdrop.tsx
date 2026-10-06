'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export const VENUE_WAGER_SELECTION_BG = '/Wager-Selection-bg.png';
export const VENUE_DEFAULT_STAGE_BG = '/venue-stage-bg.png';

type VenueStageBackdropContextValue = {
  backdropSrc: string | null;
  setBackdropSrc: (src: string | null) => void;
  /** Full viewport shell (outside the scaled 1920×1080 stage). Used for Unity mini-games. */
  viewportEl: HTMLDivElement | null;
  setViewportEl: (el: HTMLDivElement | null) => void;
};

const VenueStageBackdropContext = createContext<VenueStageBackdropContextValue | null>(null);

export function VenueStageBackdropProvider({ children }: { children: ReactNode }) {
  const [backdropSrc, setBackdropSrc] = useState<string | null>(null);
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null);
  const value = useMemo(
    () => ({ backdropSrc, setBackdropSrc, viewportEl, setViewportEl }),
    [backdropSrc, viewportEl],
  );
  return (
    <VenueStageBackdropContext.Provider value={value}>{children}</VenueStageBackdropContext.Provider>
  );
}

export function useVenueStageBackdrop() {
  const ctx = useContext(VenueStageBackdropContext);
  if (!ctx) {
    throw new Error('useVenueStageBackdrop must be used within VenueStageBackdropProvider');
  }
  return ctx;
}

export function useVenueStageViewport() {
  return useVenueStageBackdrop().viewportEl;
}

/** Swap the viewport backdrop for the current screen; clears on unmount or when `src` changes. */
export function useVenueStageBackdropOverride(src: string | null) {
  const { setBackdropSrc } = useVenueStageBackdrop();
  useEffect(() => {
    setBackdropSrc(src);
    return () => setBackdropSrc(null);
  }, [src, setBackdropSrc]);
}
