'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/shared/Button';

const ROUND_TYPES = [
  { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice' },
  { value: 'WAGER', label: 'Wager' },
  { value: 'MUSIC', label: 'Music' },
  { value: 'ELIMINATION', label: 'Elimination' },
  { value: 'MAJORITY_RULES', label: 'Majority Rules' },
  { value: 'FINAL_MULTIPLE_CHOICE', label: 'Final Multiple Choice' },
  { value: 'FINAL_WAGER', label: 'Final Wager' },
];

interface RoundInput {
  name: string;
  type: string;
  timerDuration: number;
}

const PREDEFINED_ROUNDS: RoundInput[] = [
  { name: 'Round 1 - Multiple Choice', type: 'MULTIPLE_CHOICE', timerDuration: 30 },
  { name: 'Round 2 - Wager', type: 'WAGER', timerDuration: 30 },
  { name: 'Round 3 - Music', type: 'MUSIC', timerDuration: 30 },
  { name: 'Round 4 - Elimination', type: 'ELIMINATION', timerDuration: 30 },
  { name: 'Round 5 - Majority Rules', type: 'MAJORITY_RULES', timerDuration: 30 },
  { name: 'Round 6 - Final Multiple Choice', type: 'FINAL_MULTIPLE_CHOICE', timerDuration: 30 },
  { name: 'Round 7 - Final Wager', type: 'FINAL_WAGER', timerDuration: 30 },
];

export default function NewQuizPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rounds, setRounds] = useState<RoundInput[]>(PREDEFINED_ROUNDS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateRound = (index: number, field: keyof RoundInput, value: string | number) => {
    setRounds((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const moveRound = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rounds.length) return;

    setRounds((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Quiz title is required');
      return;
    }
    if (rounds.length !== 7) {
      setError('Exactly 7 rounds are required');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        rounds: rounds.map((r, i) => ({
          name: r.name,
          type: r.type,
          order: i,
          timerDuration: r.timerDuration,
        })),
      };
      await api.post('/api/quizzes', payload);
      router.push('/admin/quizzes');
    } catch (err: any) {
      setError(err.message || 'Failed to create quiz');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold mb-8">Create New Quiz</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-foreground/70 mb-1">Quiz Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Friday Night Trivia"
            className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/70 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description..."
            rows={2}
            className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-foreground/70">Rounds</label>
            <span className="text-xs text-foreground/50">Fixed 7 rounds</span>
          </div>

          <div className="space-y-3">
            {rounds.map((round, index) => (
              <div
                key={index}
                className="bg-surface border border-border rounded-lg p-4 flex gap-3 items-start"
              >
                <span className="text-foreground/30 text-sm font-mono mt-2.5 w-6">{index + 1}</span>
                <div className="flex-1 grid grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={round.name}
                    onChange={(e) => updateRound(index, 'name', e.target.value)}
                    placeholder="Round name"
                    className="bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <select
                    value={round.type}
                    onChange={(e) => updateRound(index, 'type', e.target.value)}
                    className="bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {ROUND_TYPES.map((rt) => (
                      <option key={rt.value} value={rt.value}>
                        {rt.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={round.timerDuration}
                      onChange={(e) => updateRound(index, 'timerDuration', Number(e.target.value))}
                      min={5}
                      max={300}
                      className="w-20 bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <span className="text-xs text-foreground/40">sec</span>
                  </div>
                </div>
                <div className="flex gap-1 mt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => moveRound(index, 'up')}
                    disabled={index === 0}
                    aria-label={`Move ${round.name} up`}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => moveRound(index, 'down')}
                    disabled={index === rounds.length - 1}
                    aria-label={`Move ${round.name} down`}
                  >
                    ↓
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button type="submit" disabled={saving}>
            {saving ? 'Creating...' : 'Create Quiz'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push('/admin/quizzes')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
