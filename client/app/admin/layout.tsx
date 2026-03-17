import Link from 'next/link';

const navItems = [
  { href: '/admin/quizzes', label: 'Quizzes' },
  { href: '/admin/questions', label: 'Question Bank' },
  { href: '/admin/sessions', label: 'Sessions' },
  { href: '/admin/media', label: 'Media' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-surface border-r border-border p-6 flex flex-col gap-2">
        <Link href="/admin/quizzes" className="text-xl font-bold text-primary mb-6">
          Admin Panel
        </Link>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="px-4 py-2 rounded-lg hover:bg-surface-light transition-colors text-foreground/80 hover:text-foreground"
          >
            {item.label}
          </Link>
        ))}
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
