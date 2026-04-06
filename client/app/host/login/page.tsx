'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Montserrat } from 'next/font/google';
import { useAuth } from '@/lib/auth';
import { PUBLIC_API_URL } from '@/lib/env';

const montserrat = Montserrat({
  weight: ['400', '500', '600', '700', '800', '900'],
  subsets: ['latin'],
  display: 'swap',
});
const API_URL = PUBLIC_API_URL;

export default function HostLoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, role, assignedSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated && role === 'host' && assignedSession?.pin) {
    router.replace(`/host/dashboard?pin=${assignedSession.pin}&sessionId=${assignedSession.id}`);
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password, 'host');
      const params = new URLSearchParams(window.location.search);
      const nextPin = params.get('pin');
      const nextSessionId = params.get('sessionId');
      if (nextPin && nextSessionId) {
        router.replace(`/host/dashboard?pin=${nextPin}&sessionId=${nextSessionId}`);
      } else {
        const meRes = await fetch(`${API_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token_host') || ''}` },
        });
        const meData = await meRes.json();
        const assigned = meData?.data?.assignedSession;
        if (assigned?.pin && assigned?.id) {
          router.replace(`/host/dashboard?pin=${assigned.pin}&sessionId=${assigned.id}`);
        } else {
          setError('No session assigned to this host account');
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-name="Host Login"
      data-node-id="232:3347"
      className={`${montserrat.className} relative min-h-screen w-full overflow-x-hidden bg-linear-to-b from-[#0b0f1a] from-50% to-[#151b2b] antialiased`}
    >
      {/* Figma 232:3348 / 232:3349 — ambient blurs */}
      <div
        data-name="Container"
        data-node-id="232:3348"
        className="pointer-events-none absolute left-[20%] top-[20%] size-[min(488px,90vw)] -translate-x-1/2 rounded-full bg-[rgba(43,127,255,0.1)] opacity-[0.37] blur-3xl"
        aria-hidden
      />
      <div
        data-name="Container"
        data-node-id="232:3349"
        className="pointer-events-none absolute right-[10%] top-[28%] size-[min(501px,95vw)] rounded-full bg-[rgba(0,184,219,0.1)] opacity-[0.32] blur-3xl"
        aria-hidden
      />

      {/* Figma 232:3350 — logo + tagline */}
      <header
        className="absolute left-0 right-0 top-0 z-20 px-5 pt-8 sm:px-10 sm:pt-10 lg:px-14"
        data-node-id="232:3350"
      >
        <div className="mx-auto flex max-w-[1400px] flex-col gap-6 sm:flex-row sm:items-end sm:gap-10 lg:gap-16">
          <div
            className="font-black tracking-[-0.04em] text-white [text-shadow:0_0_50px_rgba(59,130,246,0.6)]"
            data-node-id="232:3351"
          >
            <span className="block text-[clamp(2.5rem,8vw,5rem)] leading-[1.05] sm:inline sm:leading-[128px]">
              MAX{' '}
            </span>
            <span className="block text-[clamp(2.5rem,8vw,5rem)] leading-[1.05] text-[#00d9ff] sm:inline sm:leading-[128px]">
              SHOWDOWN
            </span>
          </div>
          <p
            className="max-w-md text-[clamp(0.65rem,2vw,1.125rem)] font-medium uppercase tracking-[0.25em] text-white sm:pb-2 lg:tracking-[0.3em]"
            data-node-id="232:3352"
          >
            Live Trivia Experience
          </p>
        </div>
      </header>

      {/* Figma 232:3353 — centered login block */}
      <main
        className="relative z-10 flex min-h-screen flex-col items-center justify-center px-5 pb-12 pt-36 sm:px-8 sm:pt-40"
        data-node-id="232:3353"
      >
        <div className="flex w-full max-w-[800px] flex-col items-center">
          <div className="mb-2 text-center text-white" data-node-id="232:3354">
            <h1 className="font-bold leading-normal text-[clamp(1.75rem,5vw,2.5rem)]">
              Host Login
            </h1>
            <p className="mt-1 font-medium leading-normal text-[clamp(1rem,3vw,1.875rem)] text-[#00d9ff]">
              Sign-In Manage Live Games
            </p>
          </div>

          {/* Figma 232:3355 card area → form with neon border */}
          <form
            data-node-id="232:3355"
            onSubmit={handleSubmit}
            className="mt-8 w-full max-w-[750px] rounded-2xl border border-solid border-[rgba(0,217,255,0.55)] bg-[rgba(26,31,46,0.92)] px-7 py-8 shadow-[0_0_15px_rgba(0,217,255,0.35),0_0_40px_rgba(0,217,255,0.1)] sm:px-10 sm:py-10"
          >
            {error && (
              <div
                className="mb-5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400"
                role="alert"
              >
                {error}
              </div>
            )}

            <div className="flex flex-col gap-6" data-node-id="232:3360">
              <div data-node-id="232:3361">
                <label
                  htmlFor="host-email"
                  className="mb-2 block text-xl font-semibold text-white"
                  data-node-id="232:3362"
                >
                  Enter Email
                </label>
                <input
                  id="host-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="Enter your Email"
                  data-node-id="232:3364"
                  className="h-[57px] w-full rounded-[10px] border border-white/10 bg-[#050508] px-4 text-base text-white outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[#a1a1a1] focus:border-[rgba(0,217,255,0.5)] focus:shadow-[0_0_0_2px_rgba(0,217,255,0.15)]"
                />
              </div>

              <div data-node-id="232:3366">
                <label
                  htmlFor="host-password"
                  className="mb-2 block text-xl font-semibold text-white"
                  data-node-id="232:3367"
                >
                  Enter Password
                </label>
                <input
                  id="host-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Enter Password"
                  data-node-id="232:3369"
                  className="h-[57px] w-full rounded-[10px] border border-white/10 bg-[#050508] px-4 text-base text-white outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[#a1a1a1] focus:border-[rgba(0,217,255,0.5)] focus:shadow-[0_0_0_2px_rgba(0,217,255,0.15)]"
                />

                <label
                  className="mt-4 flex cursor-pointer select-none items-center gap-2.5"
                  data-node-id="232:3371"
                >
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="sr-only"
                  />
                  <span
                    className={`inline-flex size-[21px] shrink-0 items-center justify-center rounded border-2 border-solid border-[#00d9ff] transition-transform duration-150 active:scale-95 ${rememberMe ? 'bg-[#00d9ff] shadow-[0_0_10px_rgba(0,217,255,0.45)]' : 'bg-transparent'}`}
                    aria-hidden
                    data-node-id="232:3373"
                  >
                    {rememberMe ? (
                      <svg width="12" height="10" viewBox="0 0 12 10" fill="none" aria-hidden>
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
                  <span className="text-base text-white" data-node-id="232:3372">
                    Remember Me
                  </span>
                </label>
              </div>
            </div>

            {/* Figma 232:3357 — red gradient Login */}
            <div className="mt-8 flex justify-center" data-node-id="232:3356">
              <button
                type="submit"
                disabled={loading}
                data-name="Button"
                data-node-id="232:3357"
                className="h-[50px] min-w-[200px] max-w-[90%] rounded-[10px] border border-white bg-linear-to-b from-red-600 to-[#0b0f1a] px-12 text-xl font-bold text-white shadow-[0_4px_5px_rgba(0,0,0,0.5)] transition-[filter,transform] duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 sm:min-w-[292px]"
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
