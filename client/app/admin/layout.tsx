'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import AdminTopBar from '@/components/admin/AdminTopBar';
import AdminSidebar from '@/components/admin/AdminSidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, role } = useAuth();

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (!isAuthenticated || role !== 'admin') {
    router.replace('/admin/login');
    return null;
  }

  return (
    <div
      className="font-sans flex h-screen flex-col overflow-hidden bg-[#0b0f1a]"
    >
      <AdminTopBar />
      <div className="flex flex-1 overflow-hidden">
        <AdminSidebar />
        <main className="flex-1 overflow-y-auto px-8 pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}
