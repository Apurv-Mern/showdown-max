'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/shared/Button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

interface Session {
  id: number;
  pin: string;
  status: string;
  maxTeams: number;
  createdAt: string;
  quiz: { id: number; title: string };
  teams: { id: number; teamName: string; score: number; isConnected: boolean }[];
}

export default function HostSessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await api.get<{ sessions: Session[]; total: number }>('/api/sessions?status=pending');
        const activeRes = await api.get<{ sessions: Session[]; total: number }>('/api/sessions?status=active');
        setSessions([...activeRes.data.sessions, ...res.data.sessions]);
      } catch (err) {
        console.error('Failed to fetch sessions:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSessions();
  }, []);

  const handleSelect = (session: Session) => {
    router.push(`/host/dashboard?pin=${session.pin}&sessionId=${session.id}`);
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-warning/20 text-warning',
    active: 'bg-success/20 text-success',
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Select a Session to Host</h1>
      <p className="text-foreground/50 mb-8">Choose a pending or active session to start hosting.</p>

      {loading ? (
        <LoadingSpinner />
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-foreground/50">
          <p className="text-lg mb-4">No sessions available</p>
          <p className="text-sm mb-4">Create a session from the Admin Panel first.</p>
          <Button onClick={() => router.push('/admin/sessions')}>Go to Admin</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => handleSelect(session)}
              className="w-full bg-surface border border-border rounded-xl p-5 text-left hover:border-primary/50 hover:bg-surface-light/50 transition-all"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-2xl font-bold tracking-wider text-primary">{session.pin}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${statusColors[session.status] || ''}`}>
                      {session.status}
                    </span>
                  </div>
                  <p className="text-foreground/60 mt-1">{session.quiz?.title}</p>
                  <p className="text-xs text-foreground/30 mt-1">
                    {session.teams?.length || 0} teams connected • Max {session.maxTeams}
                  </p>
                </div>
                <span className="text-primary text-2xl">→</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
