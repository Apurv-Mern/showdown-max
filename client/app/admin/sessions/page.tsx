'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/shared/Button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Modal } from '@/components/shared/Modal';

interface Quiz {
  id: number;
  title: string;
}

interface Team {
  id: number;
  teamName: string;
  score: number;
  isConnected: boolean;
}

interface Session {
  id: number;
  pin: string;
  status: string;
  maxTeams: number;
  createdAt: string;
  quiz: Quiz;
  teams: Team[];
}

interface NewSession {
  id: number;
  pin: string;
  hostToken: string;
  qrCodeData: string;
  quizTitle: string;
  maxTeams: number;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState<number | ''>('');
  const [maxTeams, setMaxTeams] = useState(50);
  const [creating, setCreating] = useState(false);
  const [createdSession, setCreatedSession] = useState<NewSession | null>(null);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ sessions: Session[]; total: number }>('/api/sessions');
      setSessions(res.data.sessions);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchQuizzes = async () => {
    try {
      const res = await api.get<{ quizzes: Quiz[]; total: number }>('/api/quizzes');
      setQuizzes(res.data.quizzes);
    } catch (err) {
      console.error('Failed to fetch quizzes:', err);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchQuizzes();
  }, []);

  const handleCreate = async () => {
    if (!selectedQuiz) return;
    try {
      setCreating(true);
      const res = await api.post<NewSession>('/api/sessions', {
        quizId: Number(selectedQuiz),
        maxTeams,
      });
      setCreatedSession(res.data);
      setShowCreate(false);
      fetchSessions();
    } catch (err: any) {
      alert(err.message || 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  const handleEnd = async (id: number) => {
    if (!confirm('End this session?')) return;
    try {
      await api.post(`/api/sessions/${id}/end`, {});
      fetchSessions();
    } catch (err) {
      console.error('Failed to end session:', err);
    }
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-warning/20 text-warning',
    active: 'bg-success/20 text-success',
    completed: 'bg-foreground/10 text-foreground/50',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Sessions</h1>
        <Button onClick={() => setShowCreate(true)}>+ New Session</Button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-foreground/50">
          <p className="text-lg mb-4">No sessions yet</p>
          <Button onClick={() => setShowCreate(true)}>Create your first session</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="bg-surface border border-border rounded-xl p-5 flex items-center justify-between hover:border-primary/30 transition-colors"
            >
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-lg font-bold tracking-wider">{session.pin}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${statusColors[session.status] || ''}`}>
                    {session.status}
                  </span>
                </div>
                <p className="text-foreground/50 text-sm mt-1">{session.quiz?.title}</p>
                <div className="flex gap-3 text-xs text-foreground/30 mt-1">
                  <span>{session.teams?.length || 0} team{(session.teams?.length || 0) !== 1 ? 's' : ''}</span>
                  <span>•</span>
                  <span>Max: {session.maxTeams}</span>
                  <span>•</span>
                  <span>{new Date(session.createdAt).toLocaleString()}</span>
                </div>
              </div>
              <div className="flex gap-2">
                {session.status !== 'completed' && (
                  <Link href={`/host/dashboard?pin=${session.pin}&sessionId=${session.id}`}>
                    <Button size="sm">Host</Button>
                  </Link>
                )}
                <Link href={`/api/sessions/${session.id}/results`}>
                  <Button variant="secondary" size="sm">Results</Button>
                </Link>
                {session.status !== 'completed' && (
                  <Button variant="danger" size="sm" onClick={() => handleEnd(session.id)}>End</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create New Session">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">Select Quiz *</label>
            <select
              value={selectedQuiz}
              onChange={(e) => setSelectedQuiz(e.target.value ? Number(e.target.value) : '')}
              className="w-full bg-surface-light border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Choose a quiz...</option>
              {quizzes.map((q) => (
                <option key={q.id} value={q.id}>{q.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">Max Teams</label>
            <input
              type="number"
              value={maxTeams}
              onChange={(e) => setMaxTeams(Number(e.target.value))}
              min={1}
              max={500}
              className="w-full bg-surface-light border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={handleCreate} disabled={!selectedQuiz || creating}>
              {creating ? 'Creating...' : 'Create Session'}
            </Button>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={createdSession !== null}
        onClose={() => setCreatedSession(null)}
        title="Session Created!"
        className="max-w-md"
      >
        {createdSession && (
          <div className="text-center space-y-4">
            <div className="bg-surface-light rounded-xl p-6">
              <p className="text-foreground/50 text-sm mb-2">Game PIN</p>
              <p className="text-5xl font-mono font-bold tracking-[0.3em] text-primary">{createdSession.pin}</p>
            </div>
            {createdSession.qrCodeData && (
              <div className="flex justify-center">
                <img src={createdSession.qrCodeData} alt="QR Code" className="w-48 h-48" />
              </div>
            )}
            <p className="text-foreground/50 text-sm">{createdSession.quizTitle}</p>
            <div className="flex gap-3 justify-center pt-2">
              <Link href={`/host/dashboard?pin=${createdSession.pin}&sessionId=${createdSession.id}`}>
                <Button>Start Hosting</Button>
              </Link>
              <Button variant="secondary" onClick={() => setCreatedSession(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
