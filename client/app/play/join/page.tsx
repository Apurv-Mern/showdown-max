'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LegacyJoinRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const q = searchParams.toString();
    router.replace(q ? `/join?${q}` : '/join');
  }, [router, searchParams]);

  return null;
}

/** Back-compat: old QR links used `/play/join`. */
export default function LegacyPlayJoinRedirect() {
  return (
    <Suspense fallback={null}>
      <LegacyJoinRedirectInner />
    </Suspense>
  );
}
