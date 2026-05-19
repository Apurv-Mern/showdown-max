'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';

interface DashboardStats {
  totalQuizzes: number;
  totalQuestions: number;
  activeSessions: number;
}

const STAT_CARDS: {
  key: keyof DashboardStats;
  label: string;
  href: string;
  icon: React.ReactNode;
}[] = [
  {
    key: 'totalQuizzes',
    label: 'Total Quizzes Created',
    href: '/admin/quizzes',
    icon: (
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#00d9ff"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="3" width="20" height="18" rx="2" />
        <path d="M8 7h8M8 11h8M8 15h4" />
      </svg>
    ),
  },
  {
    key: 'totalQuestions',
    label: 'Total Questions in Bank',
    href: '/admin/questions',
    icon: (
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#00d9ff"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <line x1="9" y1="9" x2="15" y2="9" />
        <line x1="12" y1="6" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    key: 'activeSessions',
    label: 'Active Sessions',
    href: '/admin/sessions',
    icon: (
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#00d9ff"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
  },
];

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalQuizzes: 0,
    totalQuestions: 0,
    activeSessions: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetchStats() {
      try {
        const [quizRes, questionRes, pendingRes, activeRes] = await Promise.all([
          api.get<{ quizzes: unknown[]; total: number }>('/api/quizzes?limit=1'),
          api.get<{ questions: unknown[]; total: number }>('/api/questions?limit=1'),
          api.get<{ sessions: unknown[]; total: number }>('/api/sessions?status=pending&limit=1'),
          api.get<{ sessions: unknown[]; total: number }>('/api/sessions?status=active&limit=1'),
        ]);

        if (!mounted) return;

        setStats({
          totalQuizzes: Number(quizRes.data.total) || 0,
          totalQuestions: Number(questionRes.data.total) || 0,
          activeSessions:
            (Number(pendingRes.data.total) || 0) + (Number(activeRes.data.total) || 0),
        });
      } catch {
        /* unauthenticated or network error — api helper redirects on 401 */
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchStats();
    const intervalId = setInterval(fetchStats, 10000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[30px] font-medium leading-9 text-white">Dashboard Overview</h1>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {STAT_CARDS.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className="relative block overflow-hidden rounded-2xl border-2 border-[rgba(0,217,255,0.3)] bg-[linear-gradient(150deg,rgb(26,31,53)_0%,rgb(20,25,42)_50%,rgb(15,20,32)_100%)] p-6 transition-all duration-200 hover:-translate-y-1 hover:border-[rgba(0,217,255,0.6)] hover:shadow-[0_0_20px_rgba(0,217,255,0.15)]"
          >
            <div
              className="pointer-events-none absolute -right-6 -top-6 size-32 rounded-full bg-[rgba(0,217,255,0.05)] blur-3xl"
              aria-hidden
            />
            <div className="relative flex flex-col gap-3">
              <span>{card.icon}</span>
              <span className="text-4xl leading-10 text-[#00d9ff]">
                {loading ? '—' : stats[card.key]}
              </span>
              <span className="text-sm leading-5 text-white">{card.label}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
