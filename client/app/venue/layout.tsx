import { VenueLayoutClient } from '@/components/venue/VenueLayoutClient';

export default function VenueLayout({ children }: { children: React.ReactNode }) {
  return <VenueLayoutClient>{children}</VenueLayoutClient>;
}
