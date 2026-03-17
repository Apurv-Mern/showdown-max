import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-5xl font-bold tracking-tight">
        Max <span className="text-primary">Showdown</span> Trivia
      </h1>
      <p className="text-lg text-foreground/60 max-w-md text-center">
        Real-time live trivia platform for venues
      </p>
      <div className="grid grid-cols-2 gap-4 mt-4">
        <Link
          href="/admin/quizzes"
          className="px-6 py-3 rounded-lg bg-surface hover:bg-surface-light border border-border text-center transition-colors"
        >
          Admin Panel
        </Link>
        <Link
          href="/host/sessions"
          className="px-6 py-3 rounded-lg bg-primary hover:bg-primary-light text-white text-center transition-colors"
        >
          Host Panel
        </Link>
        <Link
          href="/play/join"
          className="px-6 py-3 rounded-lg bg-surface hover:bg-surface-light border border-border text-center transition-colors"
        >
          Join Game
        </Link>
        <Link
          href="/venue/display"
          className="px-6 py-3 rounded-lg bg-surface hover:bg-surface-light border border-border text-center transition-colors"
        >
          Venue Display
        </Link>
      </div>
    </main>
  );
}
