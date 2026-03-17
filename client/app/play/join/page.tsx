export default function JoinPage() {
  return (
    <div className="w-full max-w-sm mx-auto text-center">
      <h1 className="text-3xl font-bold mb-2">
        Max <span className="text-primary">Showdown</span>
      </h1>
      <p className="text-foreground/60 mb-8">Enter the game PIN and your team name to join</p>
      <div className="flex flex-col gap-4">
        <input
          type="text"
          placeholder="Game PIN"
          className="w-full px-4 py-3 rounded-lg bg-surface border border-border text-foreground text-center text-xl tracking-widest focus:outline-none focus:border-primary"
          maxLength={6}
        />
        <input
          type="text"
          placeholder="Team Name"
          className="w-full px-4 py-3 rounded-lg bg-surface border border-border text-foreground text-center focus:outline-none focus:border-primary"
          maxLength={50}
        />
        <button className="w-full py-3 rounded-lg bg-primary hover:bg-primary-light text-white font-semibold text-lg transition-colors">
          Join Game
        </button>
      </div>
    </div>
  );
}
