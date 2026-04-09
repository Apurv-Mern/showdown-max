'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { clientLogger } from '@/lib/clientLogger';

export function ClientRouteLogger() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const search = searchParams?.toString();
    const route = search ? `${pathname}?${search}` : pathname;
    clientLogger.info('route', 'Route changed', { route });
  }, [pathname, searchParams]);

  useEffect(() => {
    clientLogger.info('app', 'Client app mounted', {
      online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });
  }, []);

  return null;
}
