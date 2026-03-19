'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function HostLoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, role } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated && role === 'host') {
    router.replace('/host/sessions');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password, 'host');
      router.replace('/host/sessions');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center sci-fi-bg p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">
            MAX <span className="text-neon-cyan text-glow-cyan">SHOWDOWN</span>
          </h1>
          <p className="text-foreground/50 text-sm mt-2">Host sign in</p>
        </div>

        <form onSubmit={handleSubmit} className="neon-border bg-surface/90 rounded-xl p-6 space-y-4">
          {error && (
            <div className="bg-neon-red/10 border border-neon-red/30 text-neon-red text-sm rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full bg-surface-light border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-neon-cyan/50"
              placeholder="host@showdown.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-surface-light border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-neon-cyan/50"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 font-semibold py-2.5 rounded-lg hover:bg-neon-cyan/30 transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
