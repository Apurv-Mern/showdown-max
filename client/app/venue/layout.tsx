import { VenueStage } from '@/components/venue/VenueStage';

export default function VenueLayout({ children }: { children: React.ReactNode }) {
  return (
    <VenueStage>
      <div className="relative h-full w-full overflow-hidden">{children}</div>
    </VenueStage>
  );
}
