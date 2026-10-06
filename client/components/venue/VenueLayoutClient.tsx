'use client';

import type { ReactNode } from 'react';
import { VenueStage } from '@/components/venue/VenueStage';
import { VenueStageBackdropProvider } from '@/components/venue/VenueStageBackdrop';

export function VenueLayoutClient({ children }: { children: ReactNode }) {
  return (
    <VenueStageBackdropProvider>
      <VenueStage>
        <div className="relative h-full w-full overflow-hidden">{children}</div>
      </VenueStage>
    </VenueStageBackdropProvider>
  );
}
