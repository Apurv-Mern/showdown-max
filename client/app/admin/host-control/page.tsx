'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/shared/Button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

interface HostAccount {
  id: number;
  email: string;
  isActive: boolean;
  assignedSession: {
    id: number;
    pin: string;
    status: string;
    quiz?: { id: number; title: string };
  } | null;
}

interface Session {
  id: number;
  pin: string;
  status: string;
  quiz?: { id: number; title: string };
}

export default function HostControlPage() {
  const [hosts, setHosts] = useState<HostAccount[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sessionId, setSessionId] = useState<number | ''>('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [hostsRes, sessionsRes] = await Promise.all([
        api.get<HostAccount[]>('/api/hosts'),
        api.get<{ sessions: Session[]; total: number }>('/api/sessions?status=pending'),
      ]);
      setHosts(hostsRes.data);
      setSessions(sessionsRes.data.sessions);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData().catch((err) => {
      console.error('Failed to load host control data', err);
    });
  }, []);

  const assignedSessionIds = useMemo(() => {
    return new Set(hosts.map((h) => h.assignedSession?.id).filter(Boolean) as number[]);
  }, [hosts]);

  const availableSessions = useMemo(() => {
    return sessions.filter(
      (s) => s.status === 'pending' && !!s.quiz?.title && !assignedSessionIds.has(s.id),
    );
  }, [sessions, assignedSessionIds]);

  const createHost = async () => {
    if (!email.trim() || !password || !sessionId) {
      alert('Email, password, and session are required');
      return;
    }

    try {
      setSaving(true);
      await api.post('/api/hosts', {
        email: email.trim(),
        password,
        sessionId: Number(sessionId),
      });
      setEmail('');
      setPassword('');
      setSessionId('');
      await fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create host account');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (host: HostAccount) => {
    try {
      await api.patch(`/api/hosts/${host.id}`, { isActive: !host.isActive });
      setHosts((prev) => prev.map((h) => (h.id === host.id ? { ...h, isActive: !h.isActive } : h)));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update host account');
    }
  };

  const deleteHost = async (host: HostAccount) => {
    if (!confirm(`Delete host account ${host.email}?`)) return;
    try {
      await api.delete(`/api/hosts/${host.id}`);
      setHosts((prev) => prev.filter((h) => h.id !== host.id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete host account');
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Host Control</h1>
      <p className="text-foreground/50 mb-8">Create host accounts and assign each host to one session.</p>

      <div className="bg-surface border border-border rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold mb-4">Create Host Account</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Host email"
            className="bg-surface-light border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="bg-surface-light border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <select
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value ? Number(e.target.value) : '')}
            className="bg-surface-light border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Select session...</option>
            {availableSessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.pin} - {s.quiz?.title}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4">
          <Button onClick={createHost} disabled={saving}>
            {saving ? 'Creating...' : 'Create Host'}
          </Button>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : hosts.length === 0 ? (
        <div className="text-center py-14 text-foreground/50 bg-surface border border-border rounded-xl">
          No host accounts yet.
        </div>
      ) : (
        <div className="space-y-3">
          {hosts.map((host) => (
            <div key={host.id} className="bg-surface border border-border rounded-xl p-5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <p className="font-semibold">{host.email}</p>
                  <span className={`text-xs px-2 py-0.5 rounded ${host.isActive ? 'bg-success/20 text-success' : 'bg-foreground/10 text-foreground/50'}`}>
                    {host.isActive ? 'active' : 'inactive'}
                  </span>
                </div>
                <p className="text-sm text-foreground/50 mt-1">
                  {host.assignedSession
                    ? `Assigned: ${host.assignedSession.pin} - ${host.assignedSession.quiz?.title || 'Untitled Quiz'}`
                    : 'No session assigned'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => toggleActive(host)}>
                  {host.isActive ? 'Disable' : 'Enable'}
                </Button>
                <Button variant="danger" size="sm" onClick={() => deleteHost(host)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
