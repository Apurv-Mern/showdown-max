import Link from 'next/link';

export default function HostLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <Link href="/host/sessions" className="text-xl font-bold">
          <span className="text-primary">Host</span> Control Panel
        </Link>
        <nav className="flex gap-4">
          <Link href="/host/sessions" className="text-foreground/70 hover:text-foreground transition-colors">
            Sessions
          </Link>
          <Link href="/host/dashboard" className="text-foreground/70 hover:text-foreground transition-colors">
            Dashboard
          </Link>
          <Link href="/host/teams" className="text-foreground/70 hover:text-foreground transition-colors">
            Teams
          </Link>
        </nav>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
