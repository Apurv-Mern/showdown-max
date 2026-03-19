'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const navItems = [
  { href: '/admin/quizzes', label: 'Quizzes' },
  { href: '/admin/questions', label: 'Question Bank' },
  { href: '/admin/sessions', label: 'Sessions' },
  { href: '/admin/media', label: 'Media' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, role, logout } = useAuth();

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (!isAuthenticated || role !== 'admin') {
    router.replace('/admin/login');
    return null;
  }

  const handleLogout = () => {
    logout();
    router.replace('/admin/login');
  };

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-surface border-r border-border p-6 flex flex-col">
        <Link href="/admin/quizzes" className="text-xl font-bold text-primary mb-6">
          Admin Panel
        </Link>
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 py-2 rounded-lg transition-colors ${
                pathname.startsWith(item.href)
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground/80 hover:bg-surface-light hover:text-foreground'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <button
          onClick={handleLogout}
          className="mt-auto px-4 py-2 rounded-lg text-foreground/50 hover:text-red-400 hover:bg-red-500/10 transition-colors text-sm text-left"
        >
          Sign Out
        </button>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
