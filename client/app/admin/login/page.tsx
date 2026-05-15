'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Montserrat } from 'next/font/google';
import { useAuth } from '@/lib/auth';
import Image from 'next/image';

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
    router.replace('/admin');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password, 'admin');
      router.replace('/admin');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`${montserrat.className} flex items-center justify-center min-h-screen w-full overflow-x-hidden bg-[radial-gradient(ellipse_85%_65%_at_50%_42%,#141a2a_0%,#0d121c_45%,#0a0f1a_72%,#06080e_100%)] antialiased px-4 sm:px-8`}
    >
      <div className="flex flex-col lg:flex-row items-center justify-center m-12 gap-12 lg:gap-24 w-full">
        {/* Left Side: Logo */}
        <div className="shrink-0 flex items-center justify-center ">
          <Image
            src={'/logo.png'}
            className="  sm:w-125 lg:w-200 h-auto object-contain"
            alt="Max Showdown LIVE Logo"
            width={800}
            height={600}
            priority
          />
        </div>

        {/* Right Side: Form Container */}
        <main className="z-10 flex flex-col items-center justify-center w-full max-w-180">
          <div className="flex w-full flex-col items-center">
            <h1 className="text-center text-[clamp(1.5rem,4vw,2.25rem)] font-bold text-white">
              Admin Login
            </h1>
            <p className="mt-2 text-center text-[clamp(0.875rem,2.2vw,1.125rem)] font-medium text-[#00d1ff]">
              Sign-In Manage Live Games
            </p>

            <form
              onSubmit={handleSubmit}
              className="mt-8 w-full rounded-2xl bg-[rgba(26,31,46,0.92)] px-7 py-8 shadow-[0_0_15px_rgba(0,209,255,0.5),0_0_40px_rgba(0,209,255,0.12)] sm:px-9 sm:py-10"
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

                {/* <label className="flex cursor-pointer select-none items-center gap-2.5">
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
                  {/* <span className="text-sm text-white">Remember Me</span> */}
                {/* </label> */}
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
    </div>
  );
}
