'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function AdminTopBar() {
  const router = useRouter();
  const { logout, email } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const initial = email ? email[0].toUpperCase() : 'A';

  const handleLogout = () => {
    logout();
    router.replace('/admin/login');
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

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

      {/* Right: avatar dropdown */}
      <div className="flex items-center gap-4 relative" ref={dropdownRef}>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          title="Profile menu"
          className="flex size-10 items-center justify-center rounded-full border-2 border-[rgba(0,217,255,0.5)] bg-[linear-gradient(135deg,#00d9ff_0%,#8b00ff_100%)] text-base font-bold text-white transition-transform duration-150 hover:scale-105"
        >
          {initial}
        </button>

        {isDropdownOpen && (
          <div className="absolute right-0 top-12 mt-2 w-48 rounded-xl border border-[rgba(0,217,255,0.2)] bg-[#1a1f35] p-2 shadow-xl z-50">
            <div className="px-3 py-2 mb-2 border-b border-white/10">
              <p className="text-sm font-medium text-white truncate" title={email || 'Admin'}>
                {email || 'Admin'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/5 hover:text-white"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
