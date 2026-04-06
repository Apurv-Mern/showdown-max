'use client';

import { useEffect, useState } from 'react';
import { getStoredToken } from '@/lib/auth';
import { PUBLIC_API_URL } from '@/lib/env';

const API_URL = PUBLIC_API_URL;

interface DashboardStats {
  totalQuizzes: number;
  totalQuestions: number;
  activeSessions: number;
  totalTeams: number;
}

const STAT_CARDS: {
  key: keyof DashboardStats;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    key: 'totalQuizzes',
    label: 'Total Quizzes Created',
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
  {
    key: 'totalTeams',
    label: 'Total Teams Registered',
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
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalQuizzes: 0,
    totalQuestions: 0,
    activeSessions: 0,
    totalTeams: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const token = getStoredToken();
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

        const [quizRes, questionRes, sessionRes] = await Promise.allSettled([
          fetch(`${API_URL}/api/quizzes`, { headers }),
          fetch(`${API_URL}/api/questions`, { headers }),
          fetch(`${API_URL}/api/sessions`, { headers }),
        ]);

        const quizData =
          quizRes.status === 'fulfilled' && quizRes.value.ok ? await quizRes.value.json() : null;
        const questionData =
          questionRes.status === 'fulfilled' && questionRes.value.ok
            ? await questionRes.value.json()
            : null;
        const sessionData =
          sessionRes.status === 'fulfilled' && sessionRes.value.ok
            ? await sessionRes.value.json()
            : null;

        setStats({
          totalQuizzes: quizData?.data?.length ?? quizData?.length ?? 0,
          totalQuestions: questionData?.data?.length ?? questionData?.length ?? 0,
          activeSessions: Array.isArray(sessionData?.data)
            ? sessionData.data.filter(
                (s: { status?: string }) => s.status === 'active' || s.status === 'in_progress',
              ).length
            : 0,
          totalTeams: 0,
        });
      } catch {
        /* silently fallback to zeros */
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[30px] font-medium leading-9 text-white">Dashboard Overview</h1>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {STAT_CARDS.map((card) => (
          <div
            key={card.key}
            className="relative overflow-hidden rounded-2xl border-2 border-[rgba(0,217,255,0.3)] bg-[linear-gradient(150deg,rgb(26,31,53)_0%,rgb(20,25,42)_50%,rgb(15,20,32)_100%)] p-6"
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
          </div>
        ))}
      </div>
    </div>
  );
}
