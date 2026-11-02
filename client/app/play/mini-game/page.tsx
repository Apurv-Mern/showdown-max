'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LegacyMiniGameRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const q = searchParams.toString();
    router.replace(q ? `/mini-game?${q}` : '/mini-game');
  }, [router, searchParams]);

  return null;
}

/** Back-compat: mini-game now lives at `/mini-game`. */
export default function LegacyPlayMiniGameRedirect() {
  return (
    <Suspense fallback={null}>
      <LegacyMiniGameRedirectInner />
    </Suspense>
  );
}
