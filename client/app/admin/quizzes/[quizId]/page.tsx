'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  api,
  apiUpload,
  MAX_UPLOAD_SIZE_BYTES,
  MAX_UPLOAD_SIZE_LABEL,
  formatBytes,
} from '@/lib/api';
import { Button } from '@/components/shared/Button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Modal } from '@/components/shared/Modal';
import { toast } from 'react-hot-toast';
import { PUBLIC_API_URL } from '@/lib/env';
import { toPublicMediaPreviewUrl } from '@/lib/mediaUrls';

const API_URL = PUBLIC_API_URL;

/** Live Elimination rounds use a fixed 12-question ladder (10–120 pts). */
const ELIMINATION_QUESTION_COUNT = 12;

interface Option {
  text: string;
  isCorrect: boolean;
  correctOrder?: number;
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
  MULTIPLE_CHOICE: '+20 correct, -2 incorrect',
  WAGER: '0-50 pts wager',
  MUSIC: '+10 correct, -2 incorrect',
  ELIMINATION: 'Incremental 10-120, knockout',
  MAJORITY_RULES: '+50 majority, -50 minority',
  FINAL_MULTIPLE_CHOICE: '+20 correct, -2 incorrect',
  FINAL_WAGER: '% of total score',
};

/** One-line preview for Round Configuration card (Figma-style) */
const ROUND_POINTS_PREVIEW: Record<string, string> = {
  MULTIPLE_CHOICE: 'Correct answer: +20 pts · Incorrect: −2 pts',
  WAGER: 'Wager 0–50 pts · Win/lose wager amount',
  MUSIC: 'Correct answer: +10 pts · Incorrect: −2 pts',
  ELIMINATION: '10–120 pts ladder · Wrong answer = knockout',
  MAJORITY_RULES: 'Majority +50 pts · Minority −50 pts',
  FINAL_MULTIPLE_CHOICE: 'Correct answer: +20 pts · Incorrect: −2 pts',
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

const getRoundDisplayName = (round: Round) => {
  const base = (round.name || '').trim();
  const typeLabel = ROUND_TYPE_LABELS[round.type] || round.type.replace(/_/g, ' ');

  if (!base) return typeLabel;

  const normalizedBase = base.replace(/\s+/g, ' ').toLowerCase();
  const normalizedType = typeLabel.replace(/\s+/g, ' ').toLowerCase();
  if (normalizedBase.includes(normalizedType)) return base;

  return `${base} - ${typeLabel}`;
};

const getRoundQuestionLimit = (round: Round) => {
  switch (round.type) {
    case 'MULTIPLE_CHOICE':
      return 10;
    case 'WAGER':
      return 10;
    case 'MUSIC':
      return 20;
    case 'ELIMINATION':
      return 12;
    case 'MAJORITY_RULES':
      return 5;
    case 'FINAL_MULTIPLE_CHOICE':
      return 10;
    case 'FINAL_WAGER':
      return 1;
    default:
      return null;
  }
};

interface NewQuestion {
  text: string;
  category: string;
  options: Option[];
  mediaUrl: string;
  mediaType: string;
  timerDuration: string;
  isOrdering?: boolean;
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
  isOrdering: false,
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
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);
  // Question pending deletion — shows the in-app confirm modal instead of the
  // native browser confirm() dialog (which doesn't match the dark admin theme
  // and exposes the host's URL via "localhost:5003 says").
  const [pendingDeleteQuestionId, setPendingDeleteQuestionId] = useState<number | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState(false);
  // Local draft for the Round Configuration card so type/timer edits queue up under the new
  // Save button instead of auto-persisting on every change. Keyed by round id so flipping
  // between rounds doesn't leak edits across them.
  const [roundDraft, setRoundDraft] = useState<{
    roundId: number | null;
    type: string;
    timerDuration: string;
  }>({ roundId: null, type: '', timerDuration: '' });
  const [savingRoundConfig, setSavingRoundConfig] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchQuiz = useCallback(
    async (isInitialLoad = false) => {
      try {
        if (isInitialLoad) setLoading(true);
        const res = await api.get<Quiz>(`/api/quizzes/${quizId}`);
        setQuiz(res.data);
      } catch {
        router.push('/admin/quizzes');
      } finally {
        if (isInitialLoad) setLoading(false);
      }
    },
    [quizId, router],
  );

  useEffect(() => {
    fetchQuiz(true);
  }, [fetchQuiz]);

  /*
  useEffect(() => {
    if (!quiz?.rounds?.length) return;
    for (const round of quiz.rounds) {
      const n = round.questions.length;
      const toastId = `round-validation-${round.id}`;
      let errorMsg = null;

      if (round.type === 'MULTIPLE_CHOICE' && (round.order === 1 || round.name.toLowerCase().includes('1'))) {
        if (n !== 10) errorMsg = `${getRoundDisplayName(round)} should have exactly 10 questions (currently ${n}).`;
      } else if (round.type === 'WAGER') {
        if (n !== 10) errorMsg = `${getRoundDisplayName(round)} should have exactly 10 questions (currently ${n}).`;
      } else if (round.type === 'MUSIC') {
        if (n < 15 || n > 20) errorMsg = `${getRoundDisplayName(round)} should have 15-20 questions (currently ${n}).`;
      } else if (round.type === 'MAJORITY_RULES') {
        if (n !== 5) errorMsg = `${getRoundDisplayName(round)} should have exactly 5 questions (currently ${n}).`;
      } else if (round.type === 'ELIMINATION') {
        if (n !== ELIMINATION_QUESTION_COUNT) errorMsg = `${getRoundDisplayName(round)} must have exactly ${ELIMINATION_QUESTION_COUNT} questions (currently ${n}).`;
      } else if (round.type === 'FINAL_MULTIPLE_CHOICE') {
        if (n !== 10) errorMsg = `${getRoundDisplayName(round)} should have exactly 10 questions (currently ${n}).`;
      } else if (round.type === 'FINAL_WAGER') {
        if (n !== 1) errorMsg = `${getRoundDisplayName(round)} should have exactly 1 final wager question (currently ${n}).`;
      }

      if (errorMsg) {
        toast.error(errorMsg, { id: toastId, duration: 10_000 });
      } else {
        toast.dismiss(toastId);
      }
    }
  }, [quiz]);
  */

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

  const addingRound = useMemo(() => {
    if (!quiz || addingToRound == null) return null;
    return quiz.rounds.find((r) => r.id === addingToRound) ?? null;
  }, [quiz, addingToRound]);

  const isMajorityRulesQuestionModal = addingRound?.type === 'MAJORITY_RULES';

  const selectedRound = sortedRounds.find((r) => r.id === selectedRoundId) ?? null;

  // Reset the draft each time the user switches between rounds OR the underlying round refetches
  // after a successful save. We key off id + type + timerDuration so live-edits persist while
  // the user is interacting with the same row.
  useEffect(() => {
    if (!selectedRound) {
      setRoundDraft({ roundId: null, type: '', timerDuration: '' });
      return;
    }
    setRoundDraft({
      roundId: selectedRound.id,
      type: selectedRound.type,
      timerDuration: String(selectedRound.timerDuration ?? ''),
    });
    // We intentionally re-seed the draft only when the underlying round identity / persisted
    // values change (id / type / timerDuration). Including the full `selectedRound` object would
    // re-fire on every render because it's derived from `sortedRounds.find(...)`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRound?.id, selectedRound?.type, selectedRound?.timerDuration]);

  const roundConfigDirty =
    !!selectedRound &&
    roundDraft.roundId === selectedRound.id &&
    (roundDraft.type !== selectedRound.type ||
      Number(roundDraft.timerDuration) !== selectedRound.timerDuration);

  const saveRoundConfig = async () => {
    if (!selectedRound || !roundConfigDirty) return;
    const timerNum = Number(roundDraft.timerDuration);
    if (!Number.isFinite(timerNum) || timerNum < 5 || timerNum > 300) {
      toast.error('Timer must be between 5 and 300 seconds');
      return;
    }
    const patch: Partial<{ name: string; type: string; timerDuration: number }> = {};
    if (roundDraft.type !== selectedRound.type) patch.type = roundDraft.type;
    if (timerNum !== selectedRound.timerDuration) patch.timerDuration = timerNum;
    if (Object.keys(patch).length === 0) return;
    try {
      setSavingRoundConfig(true);
      await api.patch(`/api/rounds/${selectedRound.id}`, patch);
      await fetchQuiz();
      toast.success('Round saved');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save round');
    } finally {
      setSavingRoundConfig(false);
    }
  };

  const startEditingInfo = () => {
    if (!quiz) return;
    setEditTitle(quiz.title || '');
    setEditDescription(quiz.description || '');
    setIsEditingInfo(true);
  };

  const saveQuizInfo = async () => {
    if (!editTitle.trim()) {
      toast.error('Title is required');
      return;
    }
    try {
      setSavingInfo(true);
      await api.put(`/api/quizzes/${quizId}`, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
      });
      await fetchQuiz();
      setIsEditingInfo(false);
      toast.success('Quiz info updated successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update quiz info');
    } finally {
      setSavingInfo(false);
    }
  };

  const moveRound = async (roundId: number, direction: 'up' | 'down') => {
    if (!quiz) return;

    const currentIndex = sortedRounds.findIndex((round) => round.id === roundId);
    if (currentIndex < 0) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sortedRounds.length) return;

    const reordered = [...sortedRounds];
    const temp = reordered[currentIndex];
    reordered[currentIndex] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    try {
      await api.put(`/api/rounds/reorder/${quiz.id}`, {
        roundIds: reordered.map((round) => round.id),
      });
      await fetchQuiz();
      setSelectedRoundId(roundId);
      toast.success('Round order updated');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to reorder rounds');
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
      isOrdering: question.options.some((o: any) => o.correctOrder !== undefined),
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

    const roundType = addingRound?.type;
    const fileType = file.type.toLowerCase();
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const isMp3Mime =
      fileType === 'audio/mpeg' || fileType === 'audio/mp3' || fileType === 'audio/x-mpeg-3';
    const isMp4Mime = fileType === 'video/mp4' || fileType === 'audio/mp4';
    const looksMp3 = isMp3Mime || ext === 'mp3';
    const looksMp4 = isMp4Mime || ext === 'mp4';
    const isAudioOrVideo = fileType.startsWith('audio/') || fileType.startsWith('video/');

    if (roundType === 'MUSIC') {
      if (!looksMp3 && !looksMp4) {
        toast.error('Music rounds only allow MP3 or MP4 files');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    } else if (looksMp4 || (fileType.startsWith('video/') && !looksMp3)) {
      toast.error('MP4 attachments are only allowed for Music rounds');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    } else if (isAudioOrVideo && !looksMp3) {
      toast.error('This round type allows MP3 audio or image files');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Pre-flight size check — server rejects with HTTP 413 ("request file too large") for
    // anything over the configured cap; short-circuit on the client so the admin gets the
    // exact size + limit instead of waiting for a failed upload round-trip.
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      toast.error(
        `File too large (${formatBytes(file.size)}). Maximum allowed size is ${MAX_UPLOAD_SIZE_LABEL}.`,
      );
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
      toast.success('File uploaded successfully');
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveQuestion = async () => {
    if (!formData.text.trim() || !addingToRound) return;

    const validOptions = formData.options.filter((o) => o.text.trim());
    if (validOptions.length < 2) {
      toast.error('At least 2 options with text are required');
      return;
    }

    const targetRound = quiz?.rounds.find((r) => r.id === addingToRound);
    const isMajorityRulesRound = targetRound?.type === 'MAJORITY_RULES';
    const isOrdering = formData.isOrdering;

    if (!isMajorityRulesRound && !isOrdering) {
      const correctCount = validOptions.filter((o) => o.isCorrect).length;
      if (correctCount < 1) {
        toast.error('At least one option must be marked as correct');
        return;
      }
    }

    if (isOrdering) {
      const orders = validOptions.map((o) => o.correctOrder).filter((o) => o !== undefined);
      const uniqueOrders = new Set(orders);
      if (orders.length !== validOptions.length || uniqueOrders.size !== validOptions.length) {
        toast.error('All options must have a unique correct order (e.g. 1, 2, 3...)');
        return;
      }
    }

    if (targetRound?.type !== 'MUSIC' && formData.mediaType === 'mp4') {
      toast.error('MP4 attachments are only allowed for Music rounds');
      return;
    }
    if (
      targetRound?.type === 'MUSIC' &&
      formData.mediaUrl &&
      formData.mediaType !== 'mp3' &&
      formData.mediaType !== 'mp4'
    ) {
      toast.error('Music rounds only allow MP3 or MP4 attachments');
      return;
    }

    const optionsPayload = isOrdering
      ? validOptions.map((o) => ({
          text: o.text.trim(),
          isCorrect: false,
          correctOrder: o.correctOrder,
        }))
      : isMajorityRulesRound
        ? validOptions.map((o, i) => ({ text: o.text.trim(), isCorrect: i === 0 }))
        : validOptions.map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect }));

    const trimmedCategory = formData.category.trim();
    const payload: any = {
      text: formData.text.trim(),
      // On create: omit the field if blank. On update: send `null` so the server clears any
      // previously-saved category (useful when the host wants to rename or remove a wager-round
      // category like "Science" -> "Geography" -> ""). `undefined` would leave it untouched.
      category: editingQuestion ? (trimmedCategory || null) : (trimmedCategory || undefined),
      options: optionsPayload,
      roundId: addingToRound,
      mediaUrl: editingQuestion ? (formData.mediaUrl || null) : (formData.mediaUrl || undefined),
      mediaType: editingQuestion ? (formData.mediaType || null) : (formData.mediaType || undefined),
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
      toast.success(editingQuestion ? 'Question updated' : 'Question added');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save question');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = (questionId: number) => {
    setPendingDeleteQuestionId(questionId);
  };

  const confirmDeleteQuestion = async () => {
    if (pendingDeleteQuestionId == null) return;
    setDeletingQuestion(true);
    try {
      await api.delete(`/api/questions/${pendingDeleteQuestionId}`);
      fetchQuiz();
      toast.success('Question deleted');
      setPendingDeleteQuestionId(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete question');
    } finally {
      setDeletingQuestion(false);
    }
  };

  const cancelDeleteQuestion = () => {
    if (deletingQuestion) return;
    setPendingDeleteQuestionId(null);
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

  const updateOptionOrder = (index: number, correctOrder?: number) => {
    setFormData((prev) => ({
      ...prev,
      options: prev.options.map((o, i) => (i === index ? { ...o, correctOrder } : o)),
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
  const selectedRoundQuestionLimit = selectedRound ? getRoundQuestionLimit(selectedRound) : null;
  const selectedRoundQuestionCount = selectedRound?.questions.length ?? 0;
  const selectedRoundQuestionsRemaining =
    selectedRoundQuestionLimit !== null
      ? Math.max(selectedRoundQuestionLimit - selectedRoundQuestionCount, 0)
      : null;
  const isAddQuestionDisabled =
    selectedRoundQuestionLimit !== null && selectedRoundQuestionCount >= selectedRoundQuestionLimit;

  return (
    <div className="flex flex-col gap-8 antialiased">
      <div className="flex flex-col gap-3">
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-4">
          <h1 className="text-[30px] font-medium leading-9 text-white">Quiz Builder</h1>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link href={`/admin/quizzes/${quizId}/preview`}>
              <Button variant="secondary">Preview</Button>
            </Link>
            <Link href="/admin/quizzes">
              <Button variant="ghost">&larr; Back</Button>
            </Link>
            <div className="rounded-[14px] border border-[rgba(0,217,255,0.3)] bg-[#252b45] px-4 py-3 text-sm text-white/70">
              7 fixed rounds
            </div>
          </div>
        </div>

        {isEditingInfo ? (
          <div className="flex flex-col gap-3 rounded-xl border border-[rgba(0,217,255,0.3)] bg-[#252b45] p-5 w-full max-w-2xl">
            <div className="flex flex-col gap-1">
              <label className="text-sm text-white/70">Quiz Name</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-white outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-white/70">Description</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-white outline-none focus:border-primary/50 resize-none"
              />
            </div>
            <div className="flex gap-2 mt-2">
              <Button onClick={saveQuizInfo} disabled={savingInfo || !editTitle.trim()}>
                {savingInfo ? 'Saving...' : 'Save'}
              </Button>
              <Button variant="secondary" onClick={() => setIsEditingInfo(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-lg font-semibold text-white">{quiz.title}</p>
              {quiz.description && <p className="text-sm text-white/60">{quiz.description}</p>}
              <p className="text-xs text-white/40 mt-1">
                {quiz.rounds.length} rounds · {totalQuestions} questions
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={startEditingInfo} className="border">
              ✎ Edit Info
            </Button>
          </div>
        )}
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
                title={getRoundDisplayName(round)}
                className={`relative flex h-24 w-40 shrink-0 items-center justify-center rounded-[14px] border-2 text-base font-normal text-white transition-all duration-150 ${
                  active
                    ? 'border-[rgba(60,255,0,0.6)] bg-[#252b45] shadow-[0_0_16px_rgba(0,217,255,0.15)]'
                    : 'border-[rgba(0,217,255,0.3)] bg-[#252b45] hover:border-[rgba(0,217,255,0.45)]'
                }`}
              >
                {/* {sortedRounds.length > 1 && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Delete ${round.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteRound(round.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        void handleDeleteRound(round.id);
                      }
                    }}
                    className="absolute right-2 top-2 z-10 flex size-6 items-center justify-center rounded-full border border-red-500/40 bg-red-500/15 text-sm text-red-300 transition hover:bg-red-500/25"
                  >
                    ×
                  </span>
                )} */}
                <span className="pointer-events-none absolute right-2 top-2 text-[10px] text-white/40">
                  {idx + 1}
                </span>
                <div className="absolute bottom-2 left-2 z-10 flex gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void moveRound(round.id, 'up');
                    }}
                    disabled={idx === 0}
                    className="flex h-6 w-6 items-center justify-center rounded border border-[rgba(0,217,255,0.35)] bg-[#1f253e] text-xs text-white/80 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={`Move ${getRoundDisplayName(round)} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void moveRound(round.id, 'down');
                    }}
                    disabled={idx === sortedRounds.length - 1}
                    className="flex h-6 w-6 items-center justify-center rounded border border-[rgba(0,217,255,0.35)] bg-[#1f253e] text-xs text-white/80 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={`Move ${getRoundDisplayName(round)} down`}
                  >
                    ↓
                  </button>
                </div>
                {/* Pad away from index badge (top-right) and arrow controls (bottom-left)
                    so long round names never bleed under those overlays. */}
                <span className="pointer-events-none mx-2 mb-7 mt-3 line-clamp-3 max-w-[8rem] break-words text-center text-sm leading-tight">
                  {getRoundDisplayName(round)}
                </span>
              </button>
            );
          })}
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-medium leading-7 text-[#00d9ff]">
              Round Configuration — {getRoundDisplayName(selectedRound)}
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium leading-5 text-[#99a1af]">Round Type</span>
              {/* Round type is fixed once a round is created — quiz flow, scoring
                  rules, and player UI all hinge on it, so we show a read-only
                  badge here instead of a dropdown that lets the host silently
                  break a session by switching types after questions exist. */}
              <div className="flex h-[49px] w-full items-center rounded-[10px] border border-[rgba(0,217,255,0.3)] bg-[#252b45] px-4 text-sm text-white">
                {ROUND_TYPE_LABELS[selectedRound.type] || selectedRound.type}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium leading-5 text-[#99a1af]">
                Timer (seconds)
              </label>
              {/* <p className="text-xs leading-snug text-[#99a1af]/80">
                Default for every question in this round. A per-question timer in the question
                editor overrides this; saving here clears those overrides so this value applies to
                all questions.
              </p> */}
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
                  value={
                    roundDraft.roundId === selectedRound.id
                      ? roundDraft.timerDuration
                      : String(selectedRound.timerDuration ?? '')
                  }
                  onChange={(e) =>
                    setRoundDraft((d) => ({
                      ...d,
                      roundId: selectedRound.id,
                      timerDuration: e.target.value,
                    }))
                  }
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
                {ROUND_POINTS_PREVIEW[
                  roundDraft.roundId === selectedRound.id ? roundDraft.type : selectedRound.type
                ] ||
                  ROUND_TYPE_SCORING[
                    roundDraft.roundId === selectedRound.id ? roundDraft.type : selectedRound.type
                  ] ||
                  '—'}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pb-4 pt-2">
            {roundConfigDirty ? (
              <button
                type="button"
                onClick={() =>
                  setRoundDraft({
                    roundId: selectedRound.id,
                    type: selectedRound.type,
                    timerDuration: String(selectedRound.timerDuration ?? ''),
                  })
                }
                disabled={savingRoundConfig}
                className="h-[42px] rounded-[10px] border border-white/15 bg-transparent px-4 text-sm font-medium text-white/70 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              onClick={saveRoundConfig}
              disabled={!roundConfigDirty || savingRoundConfig}
              className="h-[42px] rounded-[10px] bg-[#00d9ff] px-5 text-sm font-semibold text-[#0b1020] shadow-[0_0_18px_rgba(0,217,255,0.35)] transition hover:bg-[#33e0ff] disabled:cursor-not-allowed disabled:bg-[#1f2a3d] disabled:text-white/40 disabled:shadow-none"
            >
              {savingRoundConfig ? 'Saving…' : 'Save'}
            </button>
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
                <h2 className="text-lg font-semibold text-white">
                  {getRoundDisplayName(selectedRound)}
                </h2>
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
                  · Current: {selectedRoundQuestionCount}
                  {selectedRoundQuestionLimit !== null ? ` / ${selectedRoundQuestionLimit}` : ''}
                </span>
                {selectedRoundQuestionsRemaining !== null ? (
                  <span className="text-xs text-foreground/30">
                    · Remaining: {selectedRoundQuestionsRemaining}
                  </span>
                ) : null}
                <span className="text-xs text-foreground/30">
                  · {selectedRound.questions.length} Q
                  {selectedRound.questions.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => openAddModal(selectedRound.id)}
              disabled={isAddQuestionDisabled}
              title={
                isAddQuestionDisabled
                  ? `Maximum of ${selectedRoundQuestionLimit} questions reached for this round`
                  : 'Add a question'
              }
            >
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
                              selectedRound.type === 'MAJORITY_RULES'
                                ? 'border border-border bg-surface-light text-foreground/70'
                                : opt.isCorrect
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
                        {/* Always show an effective timer for the question — fall
                            back to the round-level default when the question
                            has no per-question override, and tag it as
                            "(default)" so the host knows where the value comes
                            from. Avoids a blank cell in the list when the host
                            saved without filling the timer. */}
                        {(() => {
                          const effective = q.timerDuration ?? selectedRound.timerDuration;
                          if (!effective) return null;
                          return (
                            <span
                              title={q.timerDuration ? 'Per-question timer' : 'Round default timer'}
                            >
                              ⏱ {effective}s{!q.timerDuration ? ' (default)' : ''}
                            </span>
                          );
                        })()}
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
          No rounds configured.
        </div>
      )}

      {/* Add / Edit Question Modal */}
      {(() => {
        const questionNumber = addingRound
          ? editingQuestion
            ? addingRound.questions.findIndex((q) => q.id === editingQuestion.id) + 1
            : addingRound.questions.length + 1
          : null;

        const isMultipleChoiceQuestionModal = (() => {
          if (!addingRound || addingRound.type !== 'MULTIPLE_CHOICE') return false;
          const isRound1 = addingRound.order === 1 || addingRound.name.toLowerCase().includes('1');
          if (!isRound1) return formData.isOrdering;
          const is10th = questionNumber === 10;
          return is10th || formData.isOrdering;
        })();

        return (
          <Modal
            isOpen={addingToRound !== null}
            onClose={closeModal}
            title={
              editingQuestion
                ? `Edit Question${questionNumber ? ` ${questionNumber}` : ''}`
                : `Add Question${questionNumber ? ` ${questionNumber}` : ''}`
            }
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

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground/70 mb-1">
                    Category
                    <span className="text-foreground/30 font-normal ml-1">
                      shown to players, venue and host on the wager-lock screen
                    </span>
                  </label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
                    placeholder="e.g. Geography, Science, Sports..."
                    maxLength={100}
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
                          src={toPublicMediaPreviewUrl(formData.mediaUrl)}
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
                      accept={
                        addingRound?.type === 'MUSIC'
                          ? 'audio/mpeg,audio/mp3,.mp3,video/mp4,.mp4'
                          : 'audio/mpeg,audio/mp3,.mp3,image/jpeg,image/png,image/gif,image/webp'
                      }
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      title={
                        addingRound?.type === 'MUSIC'
                          ? 'Music rounds: MP3 or MP4 only'
                          : 'MP3 audio or image files'
                      }
                    >
                      {uploading ? 'Uploading...' : '📎 Upload File'}
                    </Button>
                    <span className="text-xs text-foreground/30 self-center">
                      {addingRound?.type === 'MUSIC'
                        ? 'MP3 or MP4 only'
                        : 'MP3, JPG, PNG, GIF, or WebP'}
                    </span>
                  </div>
                )}
              </div>

              {/* Options */}
              <div>
                {isMultipleChoiceQuestionModal && (
                  <div className="flex items-center gap-2 mb-4">
                    <input
                      type="checkbox"
                      id="isOrderingToggle"
                      checked={formData.isOrdering}
                      onChange={(e) => {
                        const isOrdering = e.target.checked;
                        setFormData((prev) => ({
                          ...prev,
                          isOrdering,
                          options: prev.options.map((o, i) => ({
                            ...o,
                            correctOrder: isOrdering ? i + 1 : undefined,
                          })),
                        }));
                      }}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50"
                    />
                    <label
                      htmlFor="isOrderingToggle"
                      className="text-sm font-medium text-foreground"
                    >
                      Is Ordering Question?
                    </label>
                  </div>
                )}
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-foreground/70">
                    Options
                    {!isMajorityRulesQuestionModal && !formData.isOrdering ? (
                      <span className="text-foreground/30 font-normal ml-1">
                        (click radio to mark correct)
                      </span>
                    ) : null}
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
                      {!isMajorityRulesQuestionModal && !formData.isOrdering ? (
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
                      ) : null}
                      {formData.isOrdering && (
                        <input
                          type="number"
                          min={1}
                          max={6}
                          value={opt.correctOrder ?? ''}
                          onChange={(e) =>
                            updateOptionOrder(i, parseInt(e.target.value) || undefined)
                          }
                          placeholder="#"
                          className="w-16 bg-surface-light border border-border rounded-lg px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-center"
                        />
                      )}
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
        );
      })()}

      {/* Confirm Delete Question Modal — themed replacement for the native
          browser confirm() so the dialog matches the rest of the admin UI and
          gives the host a moment to back out before destroying content. */}
      <Modal
        isOpen={pendingDeleteQuestionId !== null}
        onClose={cancelDeleteQuestion}
        title="Delete this question?"
        className="max-w-md"
      >
        <div className="flex flex-col gap-5">
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3">
            <p className="text-sm text-foreground/80">
              {(() => {
                const all = (quiz?.rounds || []).flatMap((r) => r.questions);
                const target = all.find((q) => q.id === pendingDeleteQuestionId);
                const preview = target?.text?.trim();
                return preview ? (
                  <>
                    You&apos;re about to permanently delete:
                    <span className="mt-2 block text-foreground font-semibold">
                      &ldquo;{preview.length > 140 ? `${preview.slice(0, 140)}…` : preview}&rdquo;
                    </span>
                  </>
                ) : (
                  <>This question and its options will be permanently deleted.</>
                );
              })()}
            </p>
            <p className="mt-2 text-xs text-foreground/50">This action cannot be undone.</p>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={cancelDeleteQuestion} disabled={deletingQuestion}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDeleteQuestion} disabled={deletingQuestion}>
              {deletingQuestion ? 'Deleting...' : 'Delete Question'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
