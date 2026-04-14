'use client';

import Link from 'next/link';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { useAuth } from '@/lib/auth';

/** Keep `?pin=&sessionId=` in the address bar so refresh and deep links stay on the host session. */
function HostSessionUrlSync() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { assignedSession, meFetched } = useAuth();
  const urlPin = searchParams.get('pin') || '';
  const urlSessionId = searchParams.get('sessionId') || '';

  useEffect(() => {
    if (!meFetched || !assignedSession?.pin || !assignedSession?.id) return;
    if (pathname !== '/host/dashboard' && pathname !== '/host/teams') return;
    if (urlPin === assignedSession.pin && urlSessionId === String(assignedSession.id)) return;
    const qs = `?pin=${encodeURIComponent(assignedSession.pin)}&sessionId=${encodeURIComponent(String(assignedSession.id))}`;
    router.replace(`${pathname}${qs}`);
  }, [meFetched, assignedSession, pathname, urlPin, urlSessionId, router]);

  return null;
}

function HostNav() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { logout, assignedSession } = useAuth();
  const pin = searchParams.get('pin') || assignedSession?.pin || '';
  const sessionId = searchParams.get('sessionId') || (assignedSession?.id ? String(assignedSession.id) : '');
  const isDashboardPage = pathname === '/host/dashboard';

  const qs = pin ? `?pin=${pin}${sessionId ? `&sessionId=${sessionId}` : ''}` : '';

  const handleLogout = () => {
    logout();
    router.replace('/host/login');
  };

  return (
    <header className="border-b border-border/50 px-4 py-1.5 flex items-center justify-between bg-surface/80">
      <Link href={pin ? `/host/dashboard${qs}` : '/host/login'} className="text-lg font-bold">
        MAX <span className="text-neon-cyan text-glow-cyan">SHOWDOWN</span>
        <span className="text-foreground/30 text-sm ml-2 font-normal">Host Control</span>
      </Link>
      <nav className="flex items-center gap-4">
        {!isDashboardPage && pin && (
          <button
            onClick={() => router.push(`/host/dashboard${qs}`)}
            className="inline-flex items-center gap-2 rounded-lg border border-neon-cyan/25 bg-neon-cyan/8 px-3 py-1 text-sm font-medium text-neon-cyan hover:bg-neon-cyan/14 transition-colors"
          >
            <span aria-hidden="true">←</span>
            <span>Back</span>
          </button>
        )}
        {pin && (
          <span className="font-mono text-neon-cyan font-bold text-sm bg-neon-cyan/10 border border-neon-cyan/20 px-3 py-1 rounded-lg">
            PIN: {pin}
          </span>
        )}
        <Link href={`/host/dashboard${qs}`} className="text-foreground/50 hover:text-neon-cyan transition-colors text-sm">
          Dashboard
        </Link>
        <Link href={`/host/teams${qs}`} className="text-foreground/50 hover:text-neon-cyan transition-colors text-sm">
          Teams
        </Link>
        <button
          onClick={handleLogout}
          className="text-foreground/40 hover:text-neon-red transition-colors text-sm ml-2"
        >
          Sign Out
        </button>
      </nav>
    </header>
  );
}

function HostAuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, role, assignedSession, meFetched } = useAuth();

  if (pathname === '/host/login') {
    return <>{children}</>;
  }

  if (!isAuthenticated || role !== 'host') {
    router.replace('/host/login');
    return null;
  }

  if (!meFetched) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-white/60">
        Loading session…
      </div>
    );
  }

  if (!assignedSession?.pin || !assignedSession?.id) {
    if (pathname !== '/host/login') {
      router.replace('/host/login');
    }
    return null;
  }

  const assignedQs = `?pin=${assignedSession.pin}&sessionId=${assignedSession.id}`;

  if (pathname === '/host/sessions') {
    router.replace(`/host/dashboard${assignedQs}`);
    return null;
  }

  if (pathname === '/host/dashboard') {
    return (
      <>
        <Suspense fallback={null}>
          <HostSessionUrlSync />
        </Suspense>
        {children}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Suspense fallback={null}>
        <HostSessionUrlSync />
        <HostNav />
      </Suspense>
      <main className="p-2">{children}</main>
    </div>
  );
}

export default function HostLayout({ children }: { children: React.ReactNode }) {
  return <HostAuthGuard>{children}</HostAuthGuard>;
}
