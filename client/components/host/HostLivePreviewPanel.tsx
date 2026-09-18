'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import type { Socket } from 'socket.io-client';

export type LivePreviewOption = {
  text: string;
  isCorrect: boolean;
  correctOrder?: number;
};

export type LivePreviewQuestion = {
  id: number;
  text: string;
  options: LivePreviewOption[];
  mediaUrl?: string | null;
  mediaType?: string | null;
  timerDuration?: number | null;
  category?: string | null;
};

type LiveRoundPreviewPayload = {
  roundIndex: number;
  roundName: string;
  roundType: string;
  currentQuestionIndex: number;
  questions: LivePreviewQuestion[];
};

type HostLivePreviewPanelProps = {
  open: boolean;
  onClose: () => void;
  pin: string;
  socket: Socket | null;
  currentQuestionIndex: number;
};

function validateOptions(options: LivePreviewOption[]): string | null {
  if (options.length < 2 || options.length > 6) {
    return 'Each question needs 2–6 options.';
  }
  const hasOrdering = options.some((o) => typeof o.correctOrder === 'number');
  if (!hasOrdering && !options.some((o) => o.isCorrect)) {
    return 'Mark at least one option as correct.';
  }
  for (const o of options) {
    if (!o.text.trim()) return 'Option text cannot be empty.';
  }
  return null;
}

export function HostLivePreviewPanel({
  open,
  onClose,
  pin,
  socket,
  currentQuestionIndex,
}: HostLivePreviewPanelProps) {
  const [questions, setQuestions] = useState<LivePreviewQuestion[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);

  const requestPreview = useCallback(() => {
    if (!socket || !pin) return;
    setLoading(true);
    socket.emit('get_live_round_preview', { pin });
  }, [socket, pin]);

  useEffect(() => {
    if (!open || !socket) return;

    const onPreview = (data: LiveRoundPreviewPayload) => {
      setLoading(false);
      setQuestions(data.questions || []);
    };

    requestPreview();
    socket.on('live_round_preview', onPreview);
    return () => {
      socket.off('live_round_preview', onPreview);
    };
  }, [open, socket, requestPreview]);

  useEffect(() => {
    if (!open) {
      setExpandedId(null);
    }
  }, [open]);

  const updateLocalQuestion = (id: number, patch: Partial<LivePreviewQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const setCorrectOption = (questionId: number, optionIndex: number) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId) return q;
        return {
          ...q,
          options: q.options.map((o, i) => ({ ...o, isCorrect: i === optionIndex })),
        };
      }),
    );
  };

  const saveQuestion = (q: LivePreviewQuestion) => {
    if (!socket || !pin) return;
    const err = validateOptions(q.options);
    if (err) {
      toast.error(err);
      return;
    }
    setSavingId(q.id);
    socket.emit(
      'update_live_question',
      {
        pin,
        questionId: q.id,
        text: q.text.trim(),
        options: q.options.map((o) => ({
          text: o.text.trim(),
          isCorrect: Boolean(o.isCorrect),
          ...(typeof o.correctOrder === 'number' ? { correctOrder: o.correctOrder } : {}),
        })),
      },
      (ack?: { ok?: boolean; error?: string }) => {
        setSavingId(null);
        if (ack?.ok) {
          toast.success('Question saved');
        } else if (ack?.error) {
          toast.error(ack.error);
        }
      },
    );
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex"
      role="presentation"
      onClick={onClose}
    >
      <aside
        className="relative flex h-full w-full max-w-[min(100%,420px)] flex-col border-r border-[rgba(0,217,255,0.35)] bg-[linear-gradient(180deg,#1a2238_0%,#0b0f1a_100%)] shadow-[4px_0_32px_rgba(0,0,0,0.45)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-preview-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-4">
          <div>
            <h2 id="live-preview-title" className="text-lg font-black uppercase tracking-wide text-white">
              Question Preview ({questions.length})
            </h2>
            <p className="text-xs text-white/50">Edits save to the live show and question bank</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold uppercase text-white/80 hover:bg-white/5"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading && questions.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/50">Loading questions…</p>
          ) : null}
          {!loading && questions.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/50">No questions in this round.</p>
          ) : null}
          <ul className="space-y-2">
            {questions.map((q, idx) => {
              const isCurrent = idx === currentQuestionIndex;
              const expanded = expandedId === q.id;
              return (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : q.id)}
                    className={cn(
                      'w-full rounded-xl border px-3 py-3 text-left transition',
                      isCurrent
                        ? 'border-[#00d9ff] bg-[rgba(0,217,255,0.08)] shadow-[0_0_12px_rgba(0,217,255,0.12)]'
                        : 'border-white/15 bg-[#1a1f2e]/80 hover:border-white/25',
                    )}
                  >
                    <div className="flex gap-2">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded bg-[#0b0f1a] text-sm font-bold text-[#00d9ff]">
                        {idx + 1}
                      </span>
                      <p className="line-clamp-2 flex-1 text-sm font-medium text-white">{q.text}</p>
                    </div>
                  </button>
                  {expanded ? (
                    <div className="mt-2 space-y-3 rounded-xl border border-white/10 bg-[#0b0f1a]/90 p-3">
                      <label className="block text-xs font-semibold uppercase text-white/50">
                        Question
                        <textarea
                          value={q.text}
                          onChange={(e) => updateLocalQuestion(q.id, { text: e.target.value })}
                          rows={3}
                          className="mt-1 w-full rounded-lg border border-white/15 bg-[#1a1f2e] px-3 py-2 text-sm text-white"
                        />
                      </label>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase text-white/50">Options</p>
                        {q.options.map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`correct-${q.id}`}
                              checked={opt.isCorrect}
                              onChange={() => setCorrectOption(q.id, oi)}
                              className="size-4 shrink-0 accent-[#6706AB]"
                              aria-label={`Mark option ${oi + 1} correct`}
                            />
                            <input
                              value={opt.text}
                              onChange={(e) => {
                                const next = q.options.map((o, i) =>
                                  i === oi ? { ...o, text: e.target.value } : o,
                                );
                                updateLocalQuestion(q.id, { options: next });
                              }}
                              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#1a1f2e] px-2 py-1.5 text-sm text-white"
                            />
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={savingId === q.id}
                        onClick={() => saveQuestion(q)}
                        className="w-full rounded-lg border border-[rgba(0,217,255,0.45)] bg-[linear-gradient(180deg,#3a4a68_0%,#1e2a42_100%)] py-2.5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
                      >
                        {savingId === q.id ? 'Saving…' : 'Save question'}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
      <div className="hidden flex-1 bg-black/40 sm:block" aria-hidden />
    </div>
  );
}
