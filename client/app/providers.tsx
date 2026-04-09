'use client';

import { AuthProvider } from '@/lib/auth';
import { ClientDebugPanel } from '@/components/debug/ClientDebugPanel';
import { ClientRouteLogger } from '@/components/debug/ClientRouteLogger';

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <AuthProvider>
      <ClientRouteLogger />
      {children}
      <ClientDebugPanel />
    </AuthProvider>
  );
};
