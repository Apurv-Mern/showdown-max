'use client';

import { VenueStage } from '@/components/venue/VenueStage';
import { VenueStageBackdropProvider } from '@/components/venue/VenueStageBackdrop';
import { VenueCodeOfConductScreen } from '@/components/venue/VenueCodeOfConductScreen';

/** Local-only layout check: open /venue/preview/code-of-conduct */
export default function VenueCodeOfConductPreviewPage() {
  return (
    <VenueStageBackdropProvider>
      <VenueStage>
        <VenueCodeOfConductScreen />
      </VenueStage>
    </VenueStageBackdropProvider>
  );
}
