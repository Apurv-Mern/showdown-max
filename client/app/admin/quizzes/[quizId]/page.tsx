'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, apiUpload } from '@/lib/api';
import { Button } from '@/components/shared/Button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Modal } from '@/components/shared/Modal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

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
      options: question.options.length > 0 ? [...question.options] : [...defaultNewQuestion.options],
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

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">{quiz.title}</h1>
          {quiz.description && <p className="text-foreground/50 mt-1">{quiz.description}</p>}
          <p className="text-foreground/30 text-sm mt-1">
            {quiz.rounds.length} rounds &middot; {totalQuestions} questions
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/admin/quizzes/${quizId}/preview`}>
            <Button variant="secondary">Preview</Button>
          </Link>
          <Link href="/admin/quizzes">
            <Button variant="ghost">&larr; Back</Button>
          </Link>
        </div>
      </div>

      <div className="space-y-6">
        {quiz.rounds
          .sort((a, b) => a.order - b.order)
          .map((round, roundIdx) => (
            <div key={round.id} className="bg-surface border border-border rounded-xl overflow-hidden">
              {/* Round Header */}
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-foreground/30 text-sm font-mono">R{roundIdx + 1}</span>
                    <h2 className="text-lg font-semibold">{round.name}</h2>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${ROUND_TYPE_COLORS[round.type] || 'bg-primary/20 text-primary'}`}>
                      {ROUND_TYPE_LABELS[round.type] || round.type}
                    </span>
                    <span className="text-xs text-foreground/30">
                      {round.timerDuration}s default timer
                    </span>
                    <span className="text-xs text-foreground/30">
                      &middot; {ROUND_TYPE_SCORING[round.type] || ''}
                    </span>
                    <span className="text-xs text-foreground/30">
                      &middot; {round.questions.length} Q{round.questions.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <Button size="sm" onClick={() => openAddModal(round.id)}>
                  + Add Question
                </Button>
              </div>

              {/* Questions List */}
              {round.questions.length === 0 ? (
                <div className="px-5 py-8 text-center text-foreground/30 text-sm">
                  No questions yet &mdash; click &quot;Add Question&quot; above
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {round.questions
                    .sort((a, b) => a.order - b.order)
                    .map((q, idx) => (
                      <div
                        key={q.id}
                        className="px-5 py-3 flex items-start gap-3 hover:bg-surface-light/50 transition-colors group"
                      >
                        <span className="text-foreground/30 text-sm font-mono mt-0.5 w-6 shrink-0">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{q.text}</p>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {q.options.map((opt, oi) => (
                              <span
                                key={oi}
                                className={`text-xs px-2 py-0.5 rounded ${
                                  opt.isCorrect
                                    ? 'bg-success/20 text-success border border-success/30'
                                    : 'bg-surface-light text-foreground/50 border border-border'
                                }`}
                              >
                                {opt.text}
                              </span>
                            ))}
                          </div>
                          <div className="flex gap-3 mt-1 text-xs text-foreground/30">
                            {q.category && <span>📁 {q.category}</span>}
                            {q.mediaType && (
                              <span>
                                {q.mediaType === 'mp3' ? '🎵' : q.mediaType === 'mp4' ? '🎬' : '🖼'}
                                {' '}{q.mediaType.toUpperCase()}
                              </span>
                            )}
                            {q.timerDuration && (
                              <span>⏱ {q.timerDuration}s</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(q, round.id)}
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
          ))}
      </div>

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
            <label className="block text-sm font-medium text-foreground/70 mb-1">Media Attachment</label>
            {formData.mediaUrl ? (
              <div className="bg-surface-light border border-border rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg shrink-0">
                    {formData.mediaType === 'mp3' ? '🎵' : formData.mediaType === 'mp4' ? '🎬' : '🖼'}
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
                  <Button variant="ghost" size="sm" onClick={removeMedia} className="text-danger/60 hover:text-danger">
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
                <span className="text-foreground/30 font-normal ml-1">(click radio to mark correct)</span>
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
              {saving
                ? 'Saving...'
                : editingQuestion
                  ? 'Update Question'
                  : 'Add Question'}
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
