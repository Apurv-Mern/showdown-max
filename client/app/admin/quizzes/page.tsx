'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/shared/Button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

interface Round {
  id: number;
  name: string;
  type: string;
  order: number;
  timerDuration: number;
}

interface Quiz {
  id: number;
  title: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  rounds: Round[];
}

export default function QuizzesPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchQuizzes = async () => {
    try {
      setLoading(true);
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await api.get<{ quizzes: Quiz[]; total: number }>(`/api/quizzes${params}`);
      setQuizzes(res.data.quizzes);
    } catch (err) {
      console.error('Failed to fetch quizzes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchQuizzes();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this quiz?')) return;
    try {
      await api.delete(`/api/quizzes/${id}`);
      setQuizzes((prev) => prev.filter((q) => q.id !== id));
    } catch (err) {
      console.error('Failed to delete quiz:', err);
    }
  };

  const handleDuplicate = async (id: number) => {
    try {
      const res = await api.post<Quiz>(`/api/quizzes/${id}/duplicate`, {});
      setQuizzes((prev) => [res.data, ...prev]);
    } catch (err) {
      console.error('Failed to duplicate quiz:', err);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Quizzes</h1>
        <Link href="/admin/quizzes/new">
          <Button>+ Create Quiz</Button>
        </Link>
      </div>

      <form onSubmit={handleSearch} className="mb-6 flex gap-3">
        <input
          type="text"
          placeholder="Search quizzes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-surface border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <Button type="submit" variant="secondary">Search</Button>
      </form>

      {loading ? (
        <LoadingSpinner />
      ) : quizzes.length === 0 ? (
        <div className="text-center py-16 text-foreground/50">
          <p className="text-lg mb-4">No quizzes yet</p>
          <Link href="/admin/quizzes/new">
            <Button>Create your first quiz</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {quizzes.map((quiz) => (
            <div
              key={quiz.id}
              className="bg-surface border border-border rounded-xl p-5 flex items-center justify-between hover:border-primary/40 transition-colors"
            >
              <div className="flex-1">
                <Link href={`/admin/quizzes/${quiz.id}`} className="text-lg font-semibold hover:text-primary transition-colors">
                  {quiz.title}
                </Link>
                {quiz.description && (
                  <p className="text-foreground/50 text-sm mt-1">{quiz.description}</p>
                )}
                <div className="flex gap-3 mt-2 text-xs text-foreground/40">
                  <span>{quiz.rounds.length} round{quiz.rounds.length !== 1 ? 's' : ''}</span>
                  <span>•</span>
                  <span>{new Date(quiz.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex gap-2 ml-4">
                <Link href={`/admin/quizzes/${quiz.id}/preview`}>
                  <Button variant="ghost" size="sm">Preview</Button>
                </Link>
                <Link href={`/admin/quizzes/${quiz.id}`}>
                  <Button variant="secondary" size="sm">Edit</Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={() => handleDuplicate(quiz.id)}>
                  Duplicate
                </Button>
                <Button variant="danger" size="sm" onClick={() => handleDelete(quiz.id)}>
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
