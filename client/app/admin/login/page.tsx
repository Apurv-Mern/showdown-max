'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Montserrat } from 'next/font/google';
import { useAuth } from '@/lib/auth';

const montserrat = Montserrat({
  weight: ['400', '500', '600', '700', '800'],
  subsets: ['latin'],
  display: 'swap',
});

export default function AdminLoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, role } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated && role === 'admin') {
    router.replace('/admin/quizzes');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password, 'admin');
      router.replace('/admin/quizzes');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`${montserrat.className} relative min-h-screen w-full overflow-x-hidden bg-[radial-gradient(ellipse_85%_65%_at_50%_42%,#141a2a_0%,#0d121c_45%,#0a0f1a_72%,#06080e_100%)] antialiased`}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_35%,rgba(0,209,255,0.06)_0%,transparent_65%)]"
        aria-hidden
      />

      {/* Top-left: stacked cyan logo + white tagline to the right */}
      <header className="absolute left-0 right-0 top-0 z-20 px-5 pt-7 sm:px-10 sm:pt-9 lg:px-14">
        <div className="mx-auto flex max-w-[1400px] flex-row flex-wrap items-center gap-x-10 gap-y-4 sm:gap-x-14 lg:gap-x-20">
          <div className="flex flex-col leading-[0.95]">
            <span className="font-black uppercase tracking-tight text-[clamp(1.75rem,4.5vw,3.25rem)] text-[#00d1ff] [text-shadow:0_0_15px_rgba(0,209,255,0.5),0_0_32px_rgba(0,209,255,0.25)]">
              MAX
            </span>
            <span className="font-black uppercase tracking-tight text-[clamp(1.75rem,4.5vw,3.25rem)] text-[#00d1ff] [text-shadow:0_0_15px_rgba(0,209,255,0.5),0_0_32px_rgba(0,209,255,0.25)]">
              SHOWDOWN
            </span>
          </div>
          <p className="max-w-48 text-[10px] font-medium uppercase leading-snug tracking-[0.28em] text-white sm:max-w-none sm:text-xs sm:tracking-[0.32em] lg:text-sm">
            Live Trivia Experience
          </p>
        </div>
      </header>

      {/* Centered column: titles + card (viewport center) */}
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-5 pb-10 pt-24 sm:px-8 sm:pt-28">
        <div className="flex w-full max-w-[440px] flex-col items-center">
          <h1 className="text-center text-[clamp(1.5rem,4vw,2.25rem)] font-bold text-white">Admin Login</h1>
          <p className="mt-2 text-center text-[clamp(0.875rem,2.2vw,1.125rem)] font-medium text-[#00d1ff]">
            Sign-In Manage Live Games
          </p>

          <form
            onSubmit={handleSubmit}
            className="mt-8 w-full rounded-2xl border border-solid border-[rgba(0,209,255,0.55)] bg-[rgba(26,31,46,0.92)] px-7 py-8 shadow-[0_0_15px_rgba(0,209,255,0.5),0_0_40px_rgba(0,209,255,0.12)] sm:px-9 sm:py-10"
          >
            {error && (
              <div
                className="mb-5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400"
                role="alert"
              >
                {error}
              </div>
            )}

            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label htmlFor="admin-email" className="text-sm font-bold text-white">
                  Enter Email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="Enter your Email"
                  className="h-12 w-full rounded-lg border border-white/10 bg-[#050508] px-3.5 text-sm text-white outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[#a1a1a1] focus:border-[rgba(0,209,255,0.5)] focus:shadow-[0_0_0_2px_rgba(0,209,255,0.15)]"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="admin-password" className="text-sm font-bold text-white">
                  Enter Password
                </label>
                <input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Enter Password"
                  className="h-12 w-full rounded-lg border border-white/10 bg-[#050508] px-3.5 text-sm text-white outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[#a1a1a1] focus:border-[rgba(0,209,255,0.5)] focus:shadow-[0_0_0_2px_rgba(0,209,255,0.15)]"
                />
              </div>

              <label className="flex cursor-pointer select-none items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="sr-only"
                />
                <span
                  className={`inline-flex size-[18px] shrink-0 items-center justify-center rounded border-2 border-solid border-[#00d1ff] transition-transform duration-150 active:scale-95 ${rememberMe ? 'bg-[#00d1ff] shadow-[0_0_10px_rgba(0,209,255,0.45)]' : 'bg-transparent'}`}
                  aria-hidden
                >
                  {rememberMe ? (
                    <svg width="11" height="9" viewBox="0 0 12 10" fill="none" aria-hidden>
                      <path
                        d="M1 5l3.5 3.5L11 1"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </span>
                <span className="text-sm text-white">Remember Me</span>
              </label>
            </div>

            <div className="mt-8 flex justify-center">
              <button
                type="submit"
                disabled={loading}
                className="h-11 min-w-[200px] max-w-[85%] rounded-lg bg-[linear-gradient(180deg,#dc2626_0%,#7f1d1d_100%)] px-10 text-base font-bold text-white shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition-[filter,transform] duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 sm:min-w-[240px]"
              >
                {loading ? 'Signing in…' : 'Login'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
