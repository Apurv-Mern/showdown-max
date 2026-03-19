'use client';

import { AuthProvider } from '@/lib/auth';

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return <AuthProvider>{children}</AuthProvider>;
};
