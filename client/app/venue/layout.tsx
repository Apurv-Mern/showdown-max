export default function VenueLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center overflow-hidden">
      <div className="w-full aspect-video max-h-screen relative">
        {children}
      </div>
    </div>
  );
}
