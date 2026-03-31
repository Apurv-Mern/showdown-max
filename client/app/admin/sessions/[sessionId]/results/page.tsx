'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/shared/Button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

interface TeamResult {
  rank: number;
  teamId: number;
  teamName: string;
  score: number;
}

interface SessionResults {
  sessionId: number;
  quizTitle: string | null;
  pin: string;
  status: string;
  teams: TeamResult[];
}

export default function SessionResultsPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const [results, setResults] = useState<SessionResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await api.get<SessionResults>(`/api/sessions/${sessionId}/results`);
        if (!cancelled) setResults(res.data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load results');
          setResults(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !results) {
    return (
      <div>
        <Link href="/admin/sessions" className="text-sm text-primary hover:underline mb-6 inline-block">
          ← Back to sessions
        </Link>
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-lg text-foreground/80 mb-4">{error || 'Session not found'}</p>
          <Link href="/admin/sessions">
            <Button variant="secondary">Return to sessions</Button>
          </Link>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-warning/20 text-warning',
    active: 'bg-success/20 text-success',
    completed: 'bg-foreground/10 text-foreground/60',
  };

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/sessions" className="text-sm text-primary hover:underline mb-3 inline-block">
            ← Sessions
          </Link>
          <h1 className="text-3xl font-bold">Session results</h1>
          <p className="mt-1 text-foreground/60">{results.quizTitle || 'Quiz'}</p>
        </div>
        <div className="text-right text-sm text-foreground/50">
          <p>
            PIN: <span className="font-mono font-semibold text-foreground">{results.pin}</span>
          </p>
          <p className="mt-1">
            Status:{' '}
            <span className={`inline-block rounded px-2 py-0.5 text-xs ${statusColors[results.status] || ''}`}>
              {results.status}
            </span>
          </p>
        </div>
      </div>

      {results.teams.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center text-foreground/50">
          No teams registered for this session yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-surface-light/50 text-xs uppercase tracking-wide text-foreground/50">
                <th className="px-5 py-3 font-medium">Rank</th>
                <th className="px-5 py-3 font-medium">Team</th>
                <th className="px-5 py-3 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {results.teams.map((row, i) => (
                <tr
                  key={row.teamId}
                  className={`border-b border-border/80 last:border-0 ${
                    i === 0 ? 'bg-primary/5' : ''
                  }`}
                >
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                        row.rank === 1
                          ? 'bg-amber-500/20 text-amber-400'
                          : row.rank === 2
                            ? 'bg-slate-400/20 text-slate-300'
                            : row.rank === 3
                              ? 'bg-amber-800/30 text-amber-700'
                              : 'bg-foreground/5 text-foreground/70'
                      }`}
                    >
                      {row.rank}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-medium">{row.teamName}</td>
                  <td className="px-5 py-4 text-right font-mono tabular-nums">{row.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
