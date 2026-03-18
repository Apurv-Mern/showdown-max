'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function HostNav() {
  const searchParams = useSearchParams();
  const pin = searchParams.get('pin') || '';
  const sessionId = searchParams.get('sessionId') || '';

  const qs = pin ? `?pin=${pin}${sessionId ? `&sessionId=${sessionId}` : ''}` : '';

  return (
    <header className="border-b border-border/50 px-4 py-1.5 flex items-center justify-between bg-surface/80">
      <Link href={`/host/sessions`} className="text-lg font-bold">
        MAX <span className="text-neon-cyan text-glow-cyan">SHOWDOWN</span>
        <span className="text-foreground/30 text-sm ml-2 font-normal">Host Control</span>
      </Link>
      <nav className="flex items-center gap-4">
        {pin && (
          <span className="font-mono text-neon-cyan font-bold text-sm bg-neon-cyan/10 border border-neon-cyan/20 px-3 py-1 rounded-lg">
            PIN: {pin}
          </span>
        )}
        <Link href={`/host/sessions`} className="text-foreground/50 hover:text-neon-cyan transition-colors text-sm">
          Sessions
        </Link>
        <Link href={`/host/dashboard${qs}`} className="text-foreground/50 hover:text-neon-cyan transition-colors text-sm">
          Dashboard
        </Link>
        <Link href={`/host/teams${qs}`} className="text-foreground/50 hover:text-neon-cyan transition-colors text-sm">
          Teams
        </Link>
      </nav>
    </header>
  );
}

export default function HostLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Suspense fallback={null}>
        <HostNav />
      </Suspense>
      <main className="p-2">{children}</main>
    </div>
  );
}
