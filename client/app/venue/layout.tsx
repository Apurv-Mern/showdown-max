export default function VenueLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-screen h-screen bg-background overflow-hidden">
      {children}
    </div>
  );
}
