'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
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
  round: { id: number; name: string; type: string } | null;
}

interface RoundInfo {
  id: number;
  name: string;
  type: string;
  order: number;
  timerDuration: number;
  questionCount?: number;
  quiz?: { id: number; title: string };
}

const ROUND_TYPES = [
  'MULTIPLE_CHOICE',
  'WAGER',
  'MUSIC',
  'ELIMINATION',
  'MAJORITY_RULES',
  'FINAL_MULTIPLE_CHOICE',
  'FINAL_WAGER',
] as const;

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
  MULTIPLE_CHOICE: '+10 correct, −2 incorrect',
  WAGER: '0–50 pts wager',
  MUSIC: '+10 correct, −2 incorrect',
  ELIMINATION: 'Incremental 10–120, knockout',
  MAJORITY_RULES: '+50 majority, −50 minority',
  FINAL_MULTIPLE_CHOICE: '+10 correct, −2 incorrect',
  FINAL_WAGER: '% of total score',
};

const ROUND_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  MULTIPLE_CHOICE: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  WAGER: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  MUSIC: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  ELIMINATION: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  MAJORITY_RULES: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  FINAL_MULTIPLE_CHOICE: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  FINAL_WAGER: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
};

const ROUND_TYPE_ICONS: Record<string, string> = {
  MULTIPLE_CHOICE: '🔵',
  WAGER: '💰',
  MUSIC: '🎵',
  ELIMINATION: '💀',
  MAJORITY_RULES: '👥',
  FINAL_MULTIPLE_CHOICE: '🏁',
  FINAL_WAGER: '🎲',
};

interface FormData {
  text: string;
  category: string;
  options: Option[];
  mediaUrl: string;
  mediaType: string;
  timerDuration: string;
  roundId: string;
}

const defaultFormData: FormData = {
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
  roundId: '',
};

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [rounds, setRounds] = useState<RoundInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRoundId, setSelectedRoundId] = useState<string>('');
  const [selectedRoundType, setSelectedRoundType] = useState<string>('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [formData, setFormData] = useState<FormData>({ ...defaultFormData });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchRounds = useCallback(async () => {
    try {
      const res = await api.get<RoundInfo[]>('/api/rounds');
      setRounds(res.data);
    } catch (err) {
      console.error('Failed to fetch rounds:', err);
    }
  }, []);

  const fetchQuestions = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (selectedRoundId) params.set('roundId', selectedRoundId);
      else if (selectedRoundType) params.set('roundType', selectedRoundType);
      params.set('page', page.toString());
      params.set('limit', '30');

      const res = await api.get<{ questions: Question[]; total: number }>(`/api/questions?${params}`);
      setQuestions(res.data.questions);
      setTotal(res.data.total);
    } catch (err) {
      console.error('Failed to fetch questions:', err);
    } finally {
      setLoading(false);
    }
  }, [search, selectedRoundId, selectedRoundType, page]);

  useEffect(() => {
    fetchRounds();
  }, [fetchRounds]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchQuestions();
  };

  const filteredRounds = selectedRoundType
    ? rounds.filter((r) => r.type === selectedRoundType)
    : rounds;

  const openAddModal = (preselectedRoundId?: number) => {
    setEditingQuestion(null);
    setFormData({
      ...defaultFormData,
      roundId: preselectedRoundId ? String(preselectedRoundId) : '',
    });
    setModalOpen(true);
  };

  const openEditModal = (question: Question) => {
    setEditingQuestion(question);
    setFormData({
      text: question.text,
      category: question.category || '',
      options: question.options.length > 0 ? [...question.options] : [...defaultFormData.options],
      mediaUrl: question.mediaUrl || '',
      mediaType: question.mediaType || '',
      timerDuration: question.timerDuration ? String(question.timerDuration) : '',
      roundId: question.round ? String(question.round.id) : '',
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingQuestion(null);
    setFormData({ ...defaultFormData });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fd = new FormData();
    fd.append('file', file);

    try {
      setUploading(true);
      const response = await fetch(`${API_URL}/api/media/upload`, {
        method: 'POST',
        body: fd,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload failed');

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
    if (!formData.text.trim()) return;

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

    if (!formData.roundId) {
      alert('Please select a round for this question');
      return;
    }

    const payload: any = {
      text: formData.text.trim(),
      category: formData.category.trim() || undefined,
      options: validOptions.map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect })),
      roundId: Number(formData.roundId),
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
      fetchQuestions();
      fetchRounds();
    } catch (err: any) {
      alert(err.message || 'Failed to save question');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = async (id: number) => {
    if (!confirm('Delete this question?')) return;
    try {
      await api.delete(`/api/questions/${id}`);
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      setTotal((prev) => prev - 1);
      fetchRounds();
    } catch (err) {
      console.error('Failed to delete question:', err);
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

  const totalPages = Math.ceil(total / 30);

  const getRoundColor = (type: string) =>
    ROUND_TYPE_COLORS[type] || { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/30' };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Question Bank</h1>
          <p className="text-foreground/40 text-sm mt-1">
            {total} question{total !== 1 ? 's' : ''} across {rounds.length} round{rounds.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => openAddModal()}>+ Add Question</Button>
      </div>

      {/* Round Type Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => { setSelectedRoundType(''); setSelectedRoundId(''); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            !selectedRoundType
              ? 'bg-primary text-white'
              : 'bg-surface border border-border text-foreground/60 hover:text-foreground'
          }`}
        >
          All Rounds
        </button>
        {ROUND_TYPES.map((type) => {
          const color = getRoundColor(type);
          const count = rounds.filter((r) => r.type === type).reduce(
            (sum, r) => sum + (Number(r.questionCount) || 0), 0,
          );
          return (
            <button
              key={type}
              onClick={() => {
                setSelectedRoundType(type);
                setSelectedRoundId('');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                selectedRoundType === type
                  ? `${color.bg} ${color.text} ${color.border}`
                  : 'bg-surface border-border text-foreground/60 hover:text-foreground'
              }`}
            >
              {ROUND_TYPE_ICONS[type]} {ROUND_TYPE_LABELS[type]}
              <span className="ml-1.5 text-xs opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Round Selector + Search */}
      <div className="flex gap-3 mb-6">
        <form onSubmit={handleSearch} className="flex-1 flex gap-3">
          <input
            type="text"
            placeholder="Search questions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-surface border border-border rounded-lg px-4 py-2 text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <Button type="submit" variant="secondary">Search</Button>
        </form>
        <select
          value={selectedRoundId}
          onChange={(e) => { setSelectedRoundId(e.target.value); setPage(1); }}
          className="bg-surface border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 max-w-xs"
        >
          <option value="">All Rounds</option>
          {filteredRounds.map((r) => (
            <option key={r.id} value={r.id}>
              {r.quiz?.title ? `${r.quiz.title} → ` : ''}{r.name} ({ROUND_TYPE_LABELS[r.type]})
            </option>
          ))}
        </select>
      </div>

      {/* Round Info Cards (when a type is selected) */}
      {selectedRoundType && !selectedRoundId && (
        <div className="mb-6 p-4 rounded-xl border border-border bg-surface">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{ROUND_TYPE_ICONS[selectedRoundType]}</span>
            <div>
              <h3 className="font-semibold text-lg">{ROUND_TYPE_LABELS[selectedRoundType]}</h3>
              <p className="text-sm text-foreground/40">{ROUND_TYPE_SCORING[selectedRoundType]}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {rounds
              .filter((r) => r.type === selectedRoundType)
              .map((r) => {
                const color = getRoundColor(r.type);
                return (
                  <button
                    key={r.id}
                    onClick={() => { setSelectedRoundId(String(r.id)); setPage(1); }}
                    className={`px-3 py-2 rounded-lg text-sm border transition-colors hover:opacity-80 ${color.bg} ${color.text} ${color.border}`}
                  >
                    <span className="font-medium">{r.name}</span>
                    {r.quiz && <span className="opacity-60 ml-1">({r.quiz.title})</span>}
                    <span className="block text-xs opacity-50 mt-0.5">
                      {Number(r.questionCount) || 0} questions · {r.timerDuration}s timer
                    </span>
                  </button>
                );
              })}
            {rounds.filter((r) => r.type === selectedRoundType).length === 0 && (
              <p className="text-foreground/30 text-sm">No rounds of this type exist yet. Create a quiz first.</p>
            )}
          </div>
        </div>
      )}

      {/* Questions List */}
      {loading ? (
        <LoadingSpinner />
      ) : questions.length === 0 ? (
        <div className="text-center py-16 text-foreground/50">
          <p className="text-lg">No questions found</p>
          <p className="text-sm mt-2">
            Click &quot;+ Add Question&quot; to create one
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {questions.map((q) => {
              const roundColor = q.round ? getRoundColor(q.round.type) : null;
              return (
                <div
                  key={q.id}
                  className="bg-surface border border-border rounded-xl p-4 hover:border-primary/30 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {q.round && (
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${roundColor?.bg} ${roundColor?.text} border ${roundColor?.border}`}>
                            {ROUND_TYPE_ICONS[q.round.type]} {q.round.name}
                          </span>
                        )}
                        {q.category && (
                          <span className="text-xs px-2 py-0.5 rounded bg-surface-light text-foreground/50 border border-border">
                            📁 {q.category}
                          </span>
                        )}
                      </div>
                      <p className="font-medium">{q.text}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {q.options.map((opt, i) => (
                          <span
                            key={i}
                            className={`text-xs px-2 py-0.5 rounded ${
                              opt.isCorrect
                                ? 'bg-success/20 text-success border border-success/30'
                                : 'bg-surface-light text-foreground/50 border border-border'
                            }`}
                          >
                            {String.fromCharCode(65 + i)}. {opt.text}
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-3 mt-2 text-xs text-foreground/30">
                        {q.mediaType && (
                          <span>
                            {q.mediaType === 'mp3' ? '🎵' : q.mediaType === 'mp4' ? '🎬' : '🖼'}
                            {' '}{q.mediaType.toUpperCase()}
                          </span>
                        )}
                        {q.timerDuration && <span>⏱ {q.timerDuration}s</span>}
                        <span className="opacity-50">#{q.id}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => openEditModal(q)}>
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
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ← Prev
              </Button>
              <span className="text-sm text-foreground/50">Page {page} of {totalPages}</span>
              <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next →
              </Button>
            </div>
          )}
        </>
      )}

      {/* Add / Edit Question Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingQuestion ? 'Edit Question' : 'Add Question'}
        className="max-w-2xl"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Round Selection */}
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">
              Round *
            </label>
            <select
              value={formData.roundId}
              onChange={(e) => setFormData((p) => ({ ...p, roundId: e.target.value }))}
              className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Select a round...</option>
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {ROUND_TYPE_ICONS[r.type]} {r.quiz?.title ? `${r.quiz.title} → ` : ''}{r.name} ({ROUND_TYPE_LABELS[r.type]})
                </option>
              ))}
            </select>
            {formData.roundId && (() => {
              const selected = rounds.find((r) => String(r.id) === formData.roundId);
              if (!selected) return null;
              const color = getRoundColor(selected.type);
              return (
                <div className={`mt-2 px-3 py-2 rounded-lg text-xs ${color.bg} ${color.text} border ${color.border}`}>
                  {ROUND_TYPE_LABELS[selected.type]} — {ROUND_TYPE_SCORING[selected.type]}
                  <span className="opacity-60 ml-2">Default timer: {selected.timerDuration}s</span>
                </div>
              );
            })()}
          </div>

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
                <span className="text-foreground/30 font-normal ml-1">optional</span>
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
                <div className="flex items-center gap-2 shrink-0">
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
                  <span className="text-foreground/30 text-sm font-mono w-5 shrink-0">
                    {String.fromCharCode(65 + i)}
                  </span>
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
              {formData.options.length}/6 options · min 2 required
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-border">
            <Button onClick={handleSaveQuestion} disabled={saving || !formData.text.trim() || !formData.roundId}>
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
