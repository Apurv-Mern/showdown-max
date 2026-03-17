export default function LobbyPage() {
  return (
    <div className="text-center">
      <h1 className="text-2xl font-bold mb-4">Waiting for host to start...</h1>
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
      <p className="text-foreground/60 mt-6">You are connected. Sit tight!</p>
    </div>
  );
}
