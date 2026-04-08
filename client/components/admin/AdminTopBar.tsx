'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function AdminTopBar() {
  const router = useRouter();
  const { logout, email } = useAuth();

  const initial = email ? email[0].toUpperCase() : 'A';

  const handleLogout = () => {
    logout();
    router.replace('/admin/login');
  };

  return (
    <header className="flex h-20 shrink-0 items-center justify-between border-b-2 border-[rgba(0,217,255,0.3)] bg-[#0f1420] px-6">
      {/* Left: brand + panel name */}
      <div className="flex items-center gap-8">
        <div className="flex items-center">
          <span className="text-2xl font-medium leading-8 tracking-[0.6px] text-white">
            MAX{' '}
            <span className="text-2xl font-bold leading-8 tracking-[0.6px] text-[#00d9ff]">
              SHOWDOWN
            </span>
          </span>

        </div>
        <div className="h-8 w-px bg-[rgba(0,217,255,0.3)]" />
        <span className="text-xl font-medium leading-7 text-[rgba(0,217,255,0.8)]">
          Admin Control Panel
        </span>
      </div>

      {/* Right: search + notification + avatar */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6a7282]"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search questions / quizzes..."
            className="h-10 w-80 rounded-[10px] border border-[rgba(0,217,255,0.3)] bg-[#1a1f35] pl-10 pr-4 text-sm text-white placeholder:text-[#6a7282] outline-none transition-colors duration-200 focus:border-[rgba(0,217,255,0.6)]"
          />
        </div>

        {/* Notification bell */}
        <button className="relative flex size-[38px] items-center justify-center rounded-[10px] border border-[rgba(0,217,255,0.3)] bg-[#1a1f35] transition-colors duration-150 hover:bg-[#252b45]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-[#0b0f1a] bg-[#ff0004]" />
        </button>

        {/* Avatar / logout */}
        <button
          onClick={handleLogout}
          title="Sign out"
          className="flex size-10 items-center justify-center rounded-full border-2 border-[rgba(0,217,255,0.5)] bg-[linear-gradient(135deg,#00d9ff_0%,#8b00ff_100%)] text-base font-bold text-white transition-transform duration-150 hover:scale-105"
        >
          {initial}
        </button>
      </div>
    </header>
  );
}
