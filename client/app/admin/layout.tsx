'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Montserrat } from 'next/font/google';
import { useAuth } from '@/lib/auth';
import AdminTopBar from '@/components/admin/AdminTopBar';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { Toaster } from 'react-hot-toast';

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
});

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
      className={`${montserrat.variable} ${montserrat.className} flex h-screen flex-col overflow-hidden bg-[#0b0f1a]`}
    >
      <AdminTopBar />
      <div className="flex flex-1 overflow-hidden">
        <AdminSidebar />
        <main className="flex-1 overflow-y-auto px-8 pt-8">
          {children}
        </main>
      </div>
      <Toaster 
        position="top-right" 
        toastOptions={{
          style: {
            background: '#1a1f35',
            color: '#fff',
            border: '1px solid rgba(0,217,255,0.3)',
          },
          success: {
            iconTheme: {
              primary: '#00d9ff',
              secondary: '#1a1f35',
            },
          },
        }} 
      />
    </div>
  );
}
