'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
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
  MAJORITY_RULES: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
  },
  FINAL_MULTIPLE_CHOICE: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
  },
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

type DifficultyKey = 'EASY' | 'MEDIUM' | 'HARD' | 'GENERAL';

function difficultyFromCategory(category: string | null): DifficultyKey {
  const c = (category || '').trim().toLowerCase();
  if (c === 'easy') return 'EASY';
  if (c === 'medium') return 'MEDIUM';
  if (c === 'hard') return 'HARD';
  return 'GENERAL';
}

const DIFFICULTY_STYLE: Record<DifficultyKey, { label: string; className: string }> = {
  EASY: { label: 'Easy', className: 'bg-[rgba(0,201,80,0.2)] text-[#05df72]' },
  MEDIUM: { label: 'Medium', className: 'bg-[rgba(240,177,0,0.2)] text-[#fdc700]' },
  HARD: { label: 'Hard', className: 'bg-[rgba(239,68,68,0.2)] text-[#f87171]' },
  GENERAL: { label: 'General', className: 'bg-white/10 text-[#99a1af]' },
};

const DIFFICULTY_OPTIONS: { value: string; label: string }[] = [
  { value: 'EASY', label: 'Easy' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HARD', label: 'Hard' },
  { value: 'GENERAL', label: 'General' },
];

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
  category: 'GENERAL',
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
  const [difficultyFilter, setDifficultyFilter] = useState<string>('');
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
      if (difficultyFilter) params.set('category', difficultyFilter);
      params.set('page', page.toString());
      params.set('limit', '30');

      const res = await api.get<{ questions: Question[]; total: number }>(
        `/api/questions?${params}`,
      );
      setQuestions(res.data.questions);
      setTotal(res.data.total);
    } catch (err) {
      console.error('Failed to fetch questions:', err);
    } finally {
      setLoading(false);
    }
  }, [search, selectedRoundId, selectedRoundType, difficultyFilter, page]);

  useEffect(() => {
    fetchRounds();
  }, [fetchRounds]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const filteredRounds = selectedRoundType
    ? rounds.filter((r) => r.type === selectedRoundType)
    : rounds;

  const openAddModal = (preselectedRoundId?: number) => {
    setEditingQuestion(null);
    setFormData({
      ...defaultFormData,
      category: 'GENERAL',
      roundId: preselectedRoundId ? String(preselectedRoundId) : '',
    });
    setModalOpen(true);
  };

  const openEditModal = (question: Question) => {
    setEditingQuestion(question);
    setFormData({
      text: question.text,
      category: difficultyFromCategory(question.category),
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

    // Get the selected round's type
    const selectedRound = rounds.find((r) => String(r.id) === formData.roundId);
    const roundType = selectedRound?.type;

    // Check if user is trying to upload MP3/MP4 for non-MUSIC rounds
    const fileType = file.type.toLowerCase();
    const isAudioOrVideo = fileType.includes('audio') || fileType.includes('video');
    const isMP3orMP4 =
      fileType.includes('audio/mpeg') ||
      fileType.includes('audio/mp3') ||
      fileType.includes('video/mp4');

    if (isAudioOrVideo && isMP3orMP4 && roundType !== 'MUSIC') {
      toast.error('MP3 and MP4 files can only be uploaded for MUSIC rounds');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

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
      toast.success('Media uploaded');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveQuestion = async () => {
    if (!formData.text.trim()) return;

    const validOptions = formData.options.filter((o) => o.text.trim());
    if (validOptions.length < 2) {
      toast.error('At least 2 options with text are required');
      return;
    }

    const correctCount = validOptions.filter((o) => o.isCorrect).length;
    if (correctCount < 1) {
      toast.error('At least one option must be marked as correct');
      return;
    }

    if (!formData.roundId) {
      toast.error('Please select a round for this question');
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
      toast.success(editingQuestion ? 'Question updated' : 'Question created');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save question');
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
      toast.success('Question deleted');
    } catch (err) {
      console.error('Failed to delete question:', err);
      toast.error('Failed to delete question');
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
    ROUND_TYPE_COLORS[type] || {
      bg: 'bg-primary/10',
      text: 'text-primary',
      border: 'border-primary/30',
    };

  return (
    <div className="flex flex-col gap-6 antialiased">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-4">
        <h1 className="text-[30px] font-medium leading-9 text-white">Question Bank</h1>
        <button
          type="button"
          onClick={() => openAddModal()}
          className="flex h-12 items-center gap-3 rounded-[14px] bg-[#2e354c] px-5 text-base font-medium text-white transition-colors hover:bg-[#3a4260]"
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
          Add Question
        </button>
      </div>
      <p className="text-sm text-[#99a1af]">
        {total} question{total !== 1 ? 's' : ''} · set category to Easy, Medium, or Hard to tag
        difficulty for filters
      </p>

      {/* Filter bar — Figma 232:1390 */}
      <section
        className="rounded-2xl border-2 border-[rgba(0,217,255,0.3)] px-6 pb-2 pt-6"
        style={{
          background:
            'linear-gradient(176deg, rgb(26, 31, 53) 0%, rgb(25, 30, 50) 12.5%, rgb(23, 28, 48) 25%, rgb(22, 27, 45) 37.5%, rgb(20, 25, 42) 50%, rgb(19, 24, 40) 62.5%, rgb(18, 23, 37) 75%, rgb(16, 21, 35) 87.5%, rgb(15, 20, 32) 100%)',
        }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <svg
            className="size-5 shrink-0 text-[#00d9ff]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <select
            value={difficultyFilter}
            onChange={(e) => {
              setDifficultyFilter(e.target.value);
              setPage(1);
            }}
            className="h-[41px] min-w-[160px] rounded-[10px] border border-[rgba(0,217,255,0.3)] bg-[#252b45] px-3 text-sm font-bold text-white outline-none focus:border-[rgba(0,217,255,0.55)]"
          >
            <option value="">All Difficulties</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
          <select
            value={selectedRoundType}
            onChange={(e) => {
              setSelectedRoundType(e.target.value);
              setSelectedRoundId('');
              setPage(1);
            }}
            className="h-[41px] min-w-[160px] rounded-[10px] border border-[rgba(0,217,255,0.3)] bg-[#252b45] px-3 text-sm font-bold text-white outline-none focus:border-[rgba(0,217,255,0.55)]"
          >
            <option value="">All Round Type</option>
            {ROUND_TYPES.map((type) => (
              <option key={type} value={type}>
                {ROUND_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <select
            value={selectedRoundId}
            onChange={(e) => {
              setSelectedRoundId(e.target.value);
              setPage(1);
            }}
            className="h-[41px] min-w-[200px] flex-1 rounded-[10px] border border-[rgba(0,217,255,0.3)] bg-[#252b45] px-3 text-sm font-medium text-white outline-none focus:border-[rgba(0,217,255,0.55)] sm:max-w-md"
          >
            <option value="">Specific round (optional)</option>
            {filteredRounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.quiz?.title ? `${r.quiz.title} → ` : ''}
                {r.name} ({ROUND_TYPE_LABELS[r.type]})
              </option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Search question text…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-[41px] min-w-[200px] flex-1 rounded-[10px] border border-[rgba(0,217,255,0.3)] bg-[#252b45] px-3 text-sm text-white placeholder:text-[#6a7282] outline-none focus:border-[rgba(0,217,255,0.55)] lg:max-w-xs"
          />
        </div>
      </section>

      {/* Table — Figma 232:1410 */}
      {loading ? (
        <LoadingSpinner />
      ) : questions.length === 0 ? (
        <div className="rounded-2xl border-2 border-[rgba(0,217,255,0.3)] py-16 text-center text-[#99a1af]">
          <p className="text-lg text-white/80">No questions found</p>
          <p className="mt-2 text-sm">Try changing filters or add a question.</p>
        </div>
      ) : (
        <>
          <section
            className="overflow-hidden rounded-2xl border-2 border-[rgba(0,217,255,0.3)]"
            style={{
              background:
                'linear-gradient(168deg, rgb(26, 31, 53) 0%, rgb(25, 30, 50) 12.5%, rgb(23, 28, 48) 25%, rgb(22, 27, 45) 37.5%, rgb(20, 25, 42) 50%, rgb(19, 24, 40) 62.5%, rgb(18, 23, 37) 75%, rgb(16, 21, 35) 87.5%, rgb(15, 20, 32) 100%)',
            }}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[rgba(0,217,255,0.3)] bg-[#252b45] text-sm font-bold text-[#99a1af]">
                    <th className="px-6 py-4 font-bold">Question</th>
                    <th className="w-36 px-6 py-4 font-bold">Difficulty</th>
                    <th className="w-44 px-6 py-4 font-bold">Round Type</th>
                    <th className="w-32 px-6 py-4 font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((q) => {
                    const dKey = difficultyFromCategory(q.category);
                    const diff = DIFFICULTY_STYLE[dKey];
                    const roundLabel = q.round
                      ? ROUND_TYPE_LABELS[q.round.type] || q.round.type
                      : '—';
                    return (
                      <tr
                        key={q.id}
                        className="border-b border-[rgba(0,217,255,0.1)] last:border-b-0"
                      >
                        <td className="max-w-md px-6 py-4 align-middle">
                          <p className="line-clamp-2 text-base leading-6 text-white" title={q.text}>
                            {q.text}
                          </p>
                        </td>
                        <td className="px-6 py-4 align-middle">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-normal leading-4 ${diff.className}`}
                          >
                            {diff.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 align-middle text-base text-white">
                          {roundLabel}
                        </td>
                        <td className="px-6 py-4 align-middle">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(q)}
                              className="flex size-[34px] items-center justify-center rounded-[10px] border border-[rgba(0,217,255,0.3)] bg-[#252b45] text-[#00d9ff] transition-colors hover:bg-[#2e354c]"
                              aria-label="Edit question"
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteQuestion(q.id)}
                              className="flex size-[34px] items-center justify-center rounded-[10px] border border-[rgba(255,0,128,0.3)] bg-[#252b45] text-pink-400 transition-colors hover:bg-[#2e354c]"
                              aria-label="Delete question"
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Prev
              </Button>
              <span className="text-sm text-[#99a1af]">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
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
            <label className="block text-sm font-medium text-foreground/70 mb-1">Round *</label>
            <select
              value={formData.roundId}
              onChange={(e) => setFormData((p) => ({ ...p, roundId: e.target.value }))}
              className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Select a round...</option>
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {ROUND_TYPE_ICONS[r.type]} {r.quiz?.title ? `${r.quiz.title} → ` : ''}
                  {r.name} ({ROUND_TYPE_LABELS[r.type]})
                </option>
              ))}
            </select>
            {formData.roundId &&
              (() => {
                const selected = rounds.find((r) => String(r.id) === formData.roundId);
                if (!selected) return null;
                const color = getRoundColor(selected.type);
                return (
                  <div
                    className={`mt-2 px-3 py-2 rounded-lg text-xs ${color.bg} ${color.text} border ${color.border}`}
                  >
                    {ROUND_TYPE_LABELS[selected.type]} — {ROUND_TYPE_SCORING[selected.type]}
                    <span className="opacity-60 ml-2">
                      Default timer: {selected.timerDuration}s
                    </span>
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
              <label className="block text-sm font-medium text-foreground/70 mb-1">
                Difficulty
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {DIFFICULTY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
                <div className="flex items-center gap-2 shrink-0">
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
                  accept={(() => {
                    const selectedRound = rounds.find((r) => String(r.id) === formData.roundId);
                    if (selectedRound?.type === 'MUSIC') {
                      return 'audio/mpeg,audio/mp3,video/mp4,image/jpeg,image/png,image/gif,image/webp';
                    }
                    return 'image/jpeg,image/png,image/gif,image/webp';
                  })()}
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  title={(() => {
                    const selectedRound = rounds.find((r) => String(r.id) === formData.roundId);
                    if (selectedRound?.type === 'MUSIC') {
                      return '';
                    }
                    return 'MP3 and MP4 files can only be uploaded for MUSIC rounds';
                  })()}
                >
                  {uploading ? 'Uploading...' : '📎 Upload File'}
                </Button>
                <span className="text-xs text-foreground/30 self-center">
                  {(() => {
                    const selectedRound = rounds.find((r) => String(r.id) === formData.roundId);
                    if (selectedRound?.type === 'MUSIC') {
                      return 'JPG, PNG, GIF, WebP, MP3, or MP4';
                    }
                    return 'JPG, PNG, GIF, or WebP only';
                  })()}
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
            <Button
              onClick={handleSaveQuestion}
              disabled={saving || !formData.text.trim() || !formData.roundId}
            >
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
