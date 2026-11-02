'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Back-compat: lobby now lives at `/lobby`. */
export default function LegacyPlayLobbyRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/lobby');
  }, [router]);

  return null;
}
