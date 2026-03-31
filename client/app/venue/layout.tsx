export default function VenueLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#020514]">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/venue-stage-bg.png')" }}
      />
      <div className="absolute inset-0 bg-[#020514]/45" />
      <div className="relative z-10 w-full h-full">{children}</div>
    </div>
  );
}
