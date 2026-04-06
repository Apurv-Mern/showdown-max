'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, apiUpload } from '@/lib/api';
import { Button } from '@/components/shared/Button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Modal } from '@/components/shared/Modal';
import { PUBLIC_API_URL } from '@/lib/env';

const API_URL = PUBLIC_API_URL;

interface Option {
  text: string;
  isCorrect: boolean;
}

interface Question {
  id: number;
  text: string;
  options: Option[];
  category: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  timerDuration: number | null;
  order: number;
}

interface Round {
  id: number;
  name: string;
  type: string;
  order: number;
  timerDuration: number;
  questions: Question[];
}

interface Quiz {
  id: number;
  title: string;
  description: string | null;
  rounds: Round[];
}

const ROUND_TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: 'Multiple Choice',
  WAGER: 'Wager',
  MUSIC: 'Music',
  ELIMINATION: 'Elimination',
  MAJORITY_RULES: 'Majority Rules',
  FINAL_MULTIPLE_CHOICE: 'Final Multiple Choice',
  FINAL_WAGER: 'Final Wager',
};

const ROUND_TYPE_SCORING: Record<string, string> = {
  MULTIPLE_CHOICE: '+10 correct, -2 incorrect',
  WAGER: '0-50 pts wager',
  MUSIC: '+10 correct, -2 incorrect',
  ELIMINATION: 'Incremental 10-120, knockout',
  MAJORITY_RULES: '+50 majority, -50 minority',
  FINAL_MULTIPLE_CHOICE: '+10 correct, -2 incorrect',
  FINAL_WAGER: '% of total score',
};

/** One-line preview for Round Configuration card (Figma-style) */
const ROUND_POINTS_PREVIEW: Record<string, string> = {
  MULTIPLE_CHOICE: 'Correct answer: +10 pts · Incorrect: −2 pts',
  WAGER: 'Wager 0–50 pts · Win/lose wager amount',
  MUSIC: 'Correct answer: +10 pts · Incorrect: −2 pts',
  ELIMINATION: '10–120 pts ladder · Wrong answer = knockout',
  MAJORITY_RULES: 'Majority +50 pts · Minority −50 pts',
  FINAL_MULTIPLE_CHOICE: 'Correct answer: +10 pts · Incorrect: −2 pts',
  FINAL_WAGER: 'Wager 0–100% of score · Win/lose wager',
};

const ROUND_TYPE_COLORS: Record<string, string> = {
  MULTIPLE_CHOICE: 'bg-blue-500/20 text-blue-400',
  WAGER: 'bg-amber-500/20 text-amber-400',
  MUSIC: 'bg-purple-500/20 text-purple-400',
  ELIMINATION: 'bg-red-500/20 text-red-400',
  MAJORITY_RULES: 'bg-emerald-500/20 text-emerald-400',
  FINAL_MULTIPLE_CHOICE: 'bg-cyan-500/20 text-cyan-400',
  FINAL_WAGER: 'bg-orange-500/20 text-orange-400',
};

interface NewQuestion {
  text: string;
  category: string;
  options: Option[];
  mediaUrl: string;
  mediaType: string;
  timerDuration: string;
}

const defaultNewQuestion: NewQuestion = {
  text: '',
  category: '',
  options: [
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ],
  mediaUrl: '',
  mediaType: '',
  timerDuration: '',
};

export default function QuizDetailPage() {
  const params = useParams();
  const router = useRouter();
  const quizId = params.quizId as string;

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingToRound, setAddingToRound] = useState<number | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [formData, setFormData] = useState<NewQuestion>({ ...defaultNewQuestion });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedRoundId, setSelectedRoundId] = useState<number | null>(null);
  const [addingRound, setAddingRound] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchQuiz = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<Quiz>(`/api/quizzes/${quizId}`);
      setQuiz(res.data);
    } catch {
      router.push('/admin/quizzes');
    } finally {
      setLoading(false);
    }
  }, [quizId, router]);

  useEffect(() => {
    fetchQuiz();
  }, [fetchQuiz]);

  useEffect(() => {
    if (!quiz?.rounds?.length) {
      setSelectedRoundId(null);
      return;
    }
    const sorted = [...quiz.rounds].sort((a, b) => a.order - b.order);
    setSelectedRoundId((prev) => {
      if (prev && sorted.some((r) => r.id === prev)) return prev;
      return sorted[0].id;
    });
  }, [quiz]);

  const sortedRounds = useMemo(
    () => (quiz ? [...quiz.rounds].sort((a, b) => a.order - b.order) : []),
    [quiz],
  );

  const selectedRound = sortedRounds.find((r) => r.id === selectedRoundId) ?? null;

  const handleAddRound = async () => {
    if (!quiz) return;
    setAddingRound(true);
    try {
      const n = sortedRounds.length + 1;
      const res = await api.post<Round>('/api/rounds', {
        quizId: quiz.id,
        name: `Round ${n}`,
        type: 'MULTIPLE_CHOICE',
        timerDuration: 60,
      });
      await fetchQuiz();
      setSelectedRoundId(res.data.id);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to add round');
    } finally {
      setAddingRound(false);
    }
  };

  const patchRound = async (
    roundId: number,
    patch: Partial<{ name: string; type: string; timerDuration: number }>,
  ) => {
    try {
      await api.patch(`/api/rounds/${roundId}`, patch);
      await fetchQuiz();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to update round');
    }
  };

  const openAddModal = (roundId: number) => {
    setEditingQuestion(null);
    setFormData({ ...defaultNewQuestion });
    setAddingToRound(roundId);
  };

  const openEditModal = (question: Question, roundId: number) => {
    setEditingQuestion(question);
    setFormData({
      text: question.text,
      category: question.category || '',
      options:
        question.options.length > 0 ? [...question.options] : [...defaultNewQuestion.options],
      mediaUrl: question.mediaUrl || '',
      mediaType: question.mediaType || '',
      timerDuration: question.timerDuration ? String(question.timerDuration) : '',
    });
    setAddingToRound(roundId);
  };

  const closeModal = () => {
    setAddingToRound(null);
    setEditingQuestion(null);
    setFormData({ ...defaultNewQuestion });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fd = new FormData();
    fd.append('file', file);

    try {
      setUploading(true);
      const data = await apiUpload<{ url: string; mediaType: string }>('/api/media/upload', fd);

      setFormData((prev) => ({
        ...prev,
        mediaUrl: data.data.url,
        mediaType: data.data.mediaType,
      }));
    } catch (err: any) {
      alert(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveQuestion = async () => {
    if (!formData.text.trim() || !addingToRound) return;

    const validOptions = formData.options.filter((o) => o.text.trim());
    if (validOptions.length < 2) {
      alert('At least 2 options with text are required');
      return;
    }

    const correctCount = validOptions.filter((o) => o.isCorrect).length;
    if (correctCount < 1) {
      alert('At least one option must be marked as correct');
      return;
    }

    const payload: any = {
      text: formData.text.trim(),
      category: formData.category.trim() || undefined,
      options: validOptions.map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect })),
      roundId: addingToRound,
      mediaUrl: formData.mediaUrl || undefined,
      mediaType: formData.mediaType || undefined,
      timerDuration: formData.timerDuration ? Number(formData.timerDuration) : undefined,
    };

    try {
      setSaving(true);
      if (editingQuestion) {
        await api.put(`/api/questions/${editingQuestion.id}`, payload);
      } else {
        await api.post('/api/questions', payload);
      }
      closeModal();
      fetchQuiz();
    } catch (err: any) {
      alert(err.message || 'Failed to save question');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = async (questionId: number) => {
    if (!confirm('Delete this question?')) return;
    try {
      await api.delete(`/api/questions/${questionId}`);
      fetchQuiz();
    } catch (err: any) {
      alert(err.message || 'Failed to delete question');
    }
  };

  const setCorrectOption = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      options: prev.options.map((o, i) => ({ ...o, isCorrect: i === index })),
    }));
  };

  const updateOptionText = (index: number, text: string) => {
    setFormData((prev) => ({
      ...prev,
      options: prev.options.map((o, i) => (i === index ? { ...o, text } : o)),
    }));
  };

  const addOption = () => {
    if (formData.options.length >= 6) return;
    setFormData((prev) => ({
      ...prev,
      options: [...prev.options, { text: '', isCorrect: false }],
    }));
  };

  const removeOption = (index: number) => {
    if (formData.options.length <= 2) return;
    setFormData((prev) => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
    }));
  };

  const removeMedia = () => {
    setFormData((prev) => ({ ...prev, mediaUrl: '', mediaType: '' }));
  };

  if (loading) return <LoadingSpinner />;
  if (!quiz) return null;

  const totalQuestions = quiz.rounds.reduce((sum, r) => sum + r.questions.length, 0);

  const roundIdx = selectedRound ? sortedRounds.findIndex((r) => r.id === selectedRound.id) : -1;

  return (
    <div className="flex flex-col gap-8 antialiased">
      <div className="flex flex-col gap-1">
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-4">
          <h1 className="text-[30px] font-medium leading-9 text-white">Quiz Builder</h1>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link href={`/admin/quizzes/${quizId}/preview`}>
              <Button variant="secondary">Preview</Button>
            </Link>
            <Link href="/admin/quizzes">
              <Button variant="ghost">&larr; Back</Button>
            </Link>
            <button
              type="button"
              onClick={handleAddRound}
              disabled={addingRound}
              className="flex h-12 items-center gap-3 rounded-[14px] bg-[#2e354c] px-5 text-base font-medium text-white transition-colors duration-200 hover:bg-[#3a4260] disabled:opacity-50"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {addingRound ? 'Adding…' : 'Add Round'}
            </button>
          </div>
        </div>
        <p className="text-sm text-white/60">{quiz.title}</p>
        {quiz.description && <p className="text-sm text-white/40">{quiz.description}</p>}
        <p className="text-xs text-white/35">
          {quiz.rounds.length} rounds · {totalQuestions} questions
        </p>
      </div>

      {/* Round Builder Timeline — Figma 232:1251 */}
      <section
        className="flex flex-col gap-4 rounded-2xl border-2 border-[rgba(0,217,255,0.3)] px-6 pb-2 pt-6 sm:gap-4"
        style={{
          background:
            'linear-gradient(170deg, rgb(26, 31, 53) 0%, rgb(25, 30, 50) 12.5%, rgb(23, 28, 48) 25%, rgb(22, 27, 45) 37.5%, rgb(20, 25, 42) 50%, rgb(19, 24, 40) 62.5%, rgb(18, 23, 37) 75%, rgb(16, 21, 35) 87.5%, rgb(15, 20, 32) 100%)',
        }}
      >
        <h2 className="text-xl font-medium leading-7 text-[#00d9ff]">Round Builder Timeline</h2>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {sortedRounds.map((round, idx) => {
            const active = round.id === selectedRoundId;
            return (
              <button
                key={round.id}
                type="button"
                onClick={() => setSelectedRoundId(round.id)}
                className={`relative flex h-24 w-40 shrink-0 items-center justify-center rounded-[14px] border-2 text-base font-normal text-white transition-all duration-150 ${
                  active
                    ? 'border-[rgba(0,217,255,0.6)] bg-[#252b45] shadow-[0_0_16px_rgba(0,217,255,0.15)]'
                    : 'border-[rgba(0,217,255,0.3)] bg-[#252b45] hover:border-[rgba(0,217,255,0.45)]'
                }`}
              >
                <span className="pointer-events-none absolute right-2 top-2 text-[10px] text-white/40">
                  {idx + 1}
                </span>
                {round.name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={handleAddRound}
            disabled={addingRound}
            className="flex h-24 w-40 shrink-0 items-center justify-center rounded-[14px] border-2 border-dashed border-[rgba(0,217,255,0.5)] text-[#00d9ff] transition-colors duration-150 hover:bg-[rgba(0,217,255,0.06)] disabled:opacity-50"
            aria-label="Add round"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </section>

      {/* Round Configuration — Figma 232:1268 */}
      {selectedRound && (
        <section
          className="flex flex-col gap-6 rounded-2xl border-2 border-[rgba(0,217,255,0.3)] px-6 pb-2 pt-6"
          style={{
            background:
              'linear-gradient(167deg, rgb(26, 31, 53) 0%, rgb(25, 30, 50) 12.5%, rgb(23, 28, 48) 25%, rgb(22, 27, 45) 37.5%, rgb(20, 25, 42) 50%, rgb(19, 24, 40) 62.5%, rgb(18, 23, 37) 75%, rgb(16, 21, 35) 87.5%, rgb(15, 20, 32) 100%)',
          }}
        >
          <h2 className="text-xl font-medium leading-7 text-[#00d9ff]">Round Configuration</h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium leading-5 text-[#99a1af]">Round Type</label>
              <select
                value={selectedRound.type}
                onChange={(e) => patchRound(selectedRound.id, { type: e.target.value })}
                className="h-[49px] w-full rounded-[10px] border border-[rgba(0,217,255,0.3)] bg-[#252b45] px-4 text-sm text-white outline-none focus:border-[rgba(0,217,255,0.55)]"
              >
                {Object.entries(ROUND_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium leading-5 text-[#99a1af]">
                Timer (seconds)
              </label>
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[#00d9ff]/80"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <input
                  type="number"
                  min={5}
                  max={300}
                  defaultValue={selectedRound.timerDuration}
                  key={selectedRound.id}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (
                      Number.isFinite(v) &&
                      v >= 5 &&
                      v <= 300 &&
                      v !== selectedRound.timerDuration
                    ) {
                      patchRound(selectedRound.id, { timerDuration: v });
                    }
                  }}
                  className="h-[50px] w-full rounded-[10px] border border-[rgba(0,217,255,0.3)] bg-[#252b45] pl-11 pr-4 text-base text-white outline-none focus:border-[rgba(0,217,255,0.55)]"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium leading-5 text-[#99a1af]">Points Preview</span>
            <div className="flex h-[46px] items-center gap-2 rounded-[10px] border border-[rgba(0,217,255,0.3)] bg-[#252b45] pl-[17px] pr-3">
              <svg
                className="size-5 shrink-0 text-[#00d9ff]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
              <p className="text-sm leading-5 text-white">
                {ROUND_POINTS_PREVIEW[selectedRound.type] ||
                  ROUND_TYPE_SCORING[selectedRound.type] ||
                  '—'}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Questions for selected round */}
      {selectedRound ? (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-foreground/30">R{roundIdx + 1}</span>
                <h2 className="text-lg font-semibold text-white">{selectedRound.name}</h2>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${ROUND_TYPE_COLORS[selectedRound.type] || 'bg-primary/20 text-primary'}`}
                >
                  {ROUND_TYPE_LABELS[selectedRound.type] || selectedRound.type}
                </span>
                <span className="text-xs text-foreground/30">
                  {selectedRound.timerDuration}s default timer
                </span>
                <span className="text-xs text-foreground/30">
                  · {selectedRound.questions.length} Q
                  {selectedRound.questions.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <Button size="sm" onClick={() => openAddModal(selectedRound.id)}>
              + Add Question
            </Button>
          </div>
          {selectedRound.questions.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-foreground/30">
              No questions yet — click &quot;Add Question&quot; above
            </div>
          ) : (
            <div className="divide-y divide-border">
              {selectedRound.questions
                .sort((a, b) => a.order - b.order)
                .map((q, idx) => (
                  <div
                    key={q.id}
                    className="group flex items-start gap-3 px-5 py-3 transition-colors hover:bg-surface-light/50"
                  >
                    <span className="mt-0.5 w-6 shrink-0 font-mono text-sm text-foreground/30">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{q.text}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {q.options.map((opt, oi) => (
                          <span
                            key={oi}
                            className={`rounded px-2 py-0.5 text-xs ${
                              opt.isCorrect
                                ? 'border border-success/30 bg-success/20 text-success'
                                : 'border border-border bg-surface-light text-foreground/50'
                            }`}
                          >
                            {opt.text}
                          </span>
                        ))}
                      </div>
                      <div className="mt-1 flex gap-3 text-xs text-foreground/30">
                        {q.category && <span>📁 {q.category}</span>}
                        {q.mediaType && (
                          <span>
                            {q.mediaType === 'mp3' ? '🎵' : q.mediaType === 'mp4' ? '🎬' : '🖼'}{' '}
                            {q.mediaType.toUpperCase()}
                          </span>
                        )}
                        {q.timerDuration && <span>⏱ {q.timerDuration}s</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditModal(q, selectedRound.id)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="text-danger/60 hover:text-danger"
                      >
                        ✕
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[rgba(0,217,255,0.3)] py-12 text-center text-white/50">
          No rounds yet — use &quot;Add Round&quot; to create one.
        </div>
      )}

      {/* Add / Edit Question Modal */}
      <Modal
        isOpen={addingToRound !== null}
        onClose={closeModal}
        title={editingQuestion ? 'Edit Question' : 'Add Question'}
        className="max-w-2xl"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Question Text */}
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">
              Question Text *
            </label>
            <textarea
              value={formData.text}
              onChange={(e) => setFormData((p) => ({ ...p, text: e.target.value }))}
              placeholder="Enter your question..."
              rows={2}
              className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          {/* Category + Timer Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">Category</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
                placeholder="e.g. Geography, Science..."
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">
                Timer (seconds)
                <span className="text-foreground/30 font-normal ml-1">optional override</span>
              </label>
              <input
                type="number"
                value={formData.timerDuration}
                onChange={(e) => setFormData((p) => ({ ...p, timerDuration: e.target.value }))}
                placeholder="Use round default"
                min={5}
                max={300}
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          {/* Media Section */}
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">
              Media Attachment
            </label>
            {formData.mediaUrl ? (
              <div className="bg-surface-light border border-border rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg shrink-0">
                    {formData.mediaType === 'mp3'
                      ? '🎵'
                      : formData.mediaType === 'mp4'
                        ? '🎬'
                        : '🖼'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {formData.mediaType?.toUpperCase()} attached
                    </p>
                    <p className="text-xs text-foreground/30 truncate">{formData.mediaUrl}</p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {formData.mediaType === 'image' && (
                    <img
                      src={`${API_URL}${formData.mediaUrl}`}
                      alt="preview"
                      className="w-12 h-12 object-cover rounded"
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={removeMedia}
                    className="text-danger/60 hover:text-danger"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/mpeg,audio/mp3,video/mp4,image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? 'Uploading...' : '📎 Upload File'}
                </Button>
                <span className="text-xs text-foreground/30 self-center">
                  JPG, PNG, GIF, WebP, MP3, or MP4
                </span>
              </div>
            )}
          </div>

          {/* Options */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground/70">
                Options
                <span className="text-foreground/30 font-normal ml-1">
                  (click radio to mark correct)
                </span>
              </label>
              {formData.options.length < 6 && (
                <Button type="button" variant="ghost" size="sm" onClick={addOption}>
                  + Add Option
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {formData.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCorrectOption(i)}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${
                      opt.isCorrect
                        ? 'border-success bg-success'
                        : 'border-border hover:border-foreground/50'
                    }`}
                  >
                    {opt.isCorrect && <span className="text-white text-xs">✓</span>}
                  </button>
                  <input
                    type="text"
                    value={opt.text}
                    onChange={(e) => updateOptionText(i, e.target.value)}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    className="flex-1 bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  {formData.options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="text-foreground/30 hover:text-danger transition-colors text-sm shrink-0"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-foreground/30 mt-1.5">
              {formData.options.length}/6 options &middot; min 2 required
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-border">
            <Button onClick={handleSaveQuestion} disabled={saving || !formData.text.trim()}>
              {saving ? 'Saving...' : editingQuestion ? 'Update Question' : 'Add Question'}
            </Button>
            <Button variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
