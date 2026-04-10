'use client';

import { AuthProvider } from '@/lib/auth';
import { ClientDebugPanel } from '@/components/debug/ClientDebugPanel';
import { ClientRouteLogger } from '@/components/debug/ClientRouteLogger';
import { Toaster } from 'react-hot-toast';

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <AuthProvider>
      <ClientRouteLogger />
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: {
            background: '#101523',
            color: '#ffffff',
            border: '1px solid rgba(0, 217, 255, 0.35)',
            boxShadow: '0 0 20px rgba(0, 217, 255, 0.18)',
          },
          success: {
            iconTheme: {
              primary: '#05df72',
              secondary: '#101523',
            },
          },
          error: {
            iconTheme: {
              primary: '#ff4d6d',
              secondary: '#101523',
            },
          },
        }}
      />
      <ClientDebugPanel />
    </AuthProvider>
  );
};
