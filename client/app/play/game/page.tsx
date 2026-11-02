'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Back-compat: player game UI now lives at `/`. */
export default function LegacyPlayGameRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/');
  }, [router]);

  return null;
}
