'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { Socket } from 'socket.io-client';
import { cn } from '@/lib/utils';
import { toPublicMediaPreviewUrl } from '@/lib/mediaUrls';
import { isQuestionImageMedia } from '@/lib/questionMedia';
import { HOST_DASHBOARD } from '@/lib/hostDashboardTheme';
import type { LivePreviewOption, LivePreviewQuestion } from '@/components/host/HostLivePreviewPanel';

export type HostQuestionPreviewRow = {
  id?: number;
  text?: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
};

export type LivePreviewRound = {
  roundIndex: number;
  roundName: string;
  roundType: string;
  questions: LivePreviewQuestion[];
};

type LiveRoundPreviewPayload = {
  roundIndex: number;
  roundName: string;
  roundType: string;
  currentQuestionIndex: number;
  questions: LivePreviewQuestion[];
  rounds?: LivePreviewRound[];
};

type HostQuestionPreviewColumnProps = {
  questions: HostQuestionPreviewRow[];
  /** Fallback when socket preview is empty — all rounds from session state. */
  roundsFallback?: { name?: string; type?: string; questions?: HostQuestionPreviewRow[] }[];
  currentRoundIndex: number;
  currentQuestionIndex: number;
  pin: string;
  socket: Socket | null;
  jumpDisabled?: boolean;
  questionState?: string;
  timerRunning?: boolean;
  className?: string;
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

const previewActionBtn =
  'shrink-0 rounded border border-[rgba(0,217,255,0.45)] bg-[linear-gradient(180deg,#3a4a68_0%,#1e2a42_100%)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40';

/** Question preview rail with in-column scroll, edit, and go-to jump. */
export function HostQuestionPreviewColumn({
  questions: fallbackRows,
  roundsFallback,
  currentRoundIndex,
  currentQuestionIndex,
  pin,
  socket,
  jumpDisabled = false,
  questionState = '',
  timerRunning = false,
  className,
}: HostQuestionPreviewColumnProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);
  const [liveRounds, setLiveRounds] = useState<LivePreviewRound[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [jumpingTarget, setJumpingTarget] = useState<{
    roundIndex: number;
    questionIndex: number;
  } | null>(null);
  const [pendingJump, setPendingJump] = useState<{
    roundIndex: number;
    questionIndex: number;
  } | null>(null);
  const [openRoundIndex, setOpenRoundIndex] = useState<number | null>(currentRoundIndex);

  useEffect(() => {
    setOpenRoundIndex(currentRoundIndex);
  }, [currentRoundIndex]);

  const toggleRoundDropdown = (roundIndex: number) => {
    setOpenRoundIndex((prev) => (prev === roundIndex ? null : roundIndex));
  };

  const requestPreview = useCallback(() => {
    if (!socket || !pin) return;
    socket.emit('get_live_round_preview', { pin });
  }, [socket, pin]);

  useEffect(() => {
    if (!socket || !pin) return;
    const onPreview = (data: LiveRoundPreviewPayload) => {
      if (Array.isArray(data.rounds) && data.rounds.length > 0) {
        setLiveRounds(data.rounds);
        return;
      }
      setLiveRounds([
        {
          roundIndex: data.roundIndex,
          roundName: data.roundName,
          roundType: data.roundType,
          questions: data.questions || [],
        },
      ]);
    };
    requestPreview();
    socket.on('live_round_preview', onPreview);
    return () => {
      socket.off('live_round_preview', onPreview);
    };
  }, [socket, pin, requestPreview]);

  useEffect(() => {
    const list = listRef.current;
    const item = activeRef.current;
    if (!list || !item) return;
    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;
    if (itemTop < viewTop) list.scrollTop = itemTop;
    else if (itemBottom > viewBottom) list.scrollTop = itemBottom - list.clientHeight;
  }, [currentQuestionIndex, currentRoundIndex, liveRounds]);

  const fallbackRoundGroups: LivePreviewRound[] =
    Array.isArray(roundsFallback) && roundsFallback.length > 0
      ? roundsFallback.map((round, roundIndex) => ({
          roundIndex,
          roundName: round.name || '',
          roundType: round.type || '',
          questions: (round.questions || []).map((q, idx) => ({
            id: q.id ?? idx,
            text: q.text || '',
            options: [],
            mediaUrl: q.mediaUrl,
            mediaType: q.mediaType,
          })),
        }))
      : [
          {
            roundIndex: currentRoundIndex,
            roundName: '',
            roundType: '',
            questions: fallbackRows.map((q, idx) => ({
              id: q.id ?? idx,
              text: q.text || '',
              options: [],
              mediaUrl: q.mediaUrl,
              mediaType: q.mediaType,
            })),
          },
        ];

  const displayRounds = liveRounds.length > 0 ? liveRounds : fallbackRoundGroups;
  const totalQuestionCount = displayRounds.reduce(
    (sum, round) => sum + round.questions.length,
    0,
  );

  if (totalQuestionCount === 0) return null;

  const flatLiveQuestions = liveRounds.flatMap((r) => r.questions);

  const needsJumpConfirm = (roundIndex: number, idx: number) => {
    const goingBack =
      roundIndex < currentRoundIndex ||
      (roundIndex === currentRoundIndex && idx < currentQuestionIndex);
    const timerLive =
      roundIndex === currentRoundIndex && questionState === 'ACTIVE' && timerRunning;
    return goingBack || timerLive;
  };

  const executeJump = useCallback(
    (roundIndex: number, idx: number) => {
      if (!socket || !pin) return;
      setJumpingTarget({ roundIndex, questionIndex: idx });
      socket.emit(
        'jump_to_question',
        { pin, questionIndex: idx, roundIndex },
        (ack?: { ok?: boolean; error?: string }) => {
          setJumpingTarget(null);
          if (ack?.ok) {
            toast.success(`Jumped to Round ${roundIndex + 1}, question ${idx + 1}`);
            setOpenRoundIndex(roundIndex);
            requestPreview();
          } else if (ack?.error) {
            toast.error(ack.error);
          }
        },
      );
    },
    [socket, pin, requestPreview],
  );

  const handleGoToQuestion = (roundIndex: number, idx: number) => {
    if (!socket || !pin || jumpDisabled) return;
    const isCurrentSpot =
      roundIndex === currentRoundIndex && idx === currentQuestionIndex;
    if (isCurrentSpot) return;
    if (needsJumpConfirm(roundIndex, idx)) {
      setPendingJump({ roundIndex, questionIndex: idx });
      return;
    }
    executeJump(roundIndex, idx);
  };

  const confirmPendingJump = () => {
    if (!pendingJump) return;
    const { roundIndex, questionIndex } = pendingJump;
    setPendingJump(null);
    executeJump(roundIndex, questionIndex);
  };

  const updateLocalQuestion = (id: number, patch: Partial<LivePreviewQuestion>) => {
    setLiveRounds((prev) =>
      prev.map((round) => ({
        ...round,
        questions: round.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
      })),
    );
  };

  const setCorrectOption = (questionId: number, optionIndex: number) => {
    setLiveRounds((prev) =>
      prev.map((round) => ({
        ...round,
        questions: round.questions.map((q) => {
          if (q.id !== questionId) return q;
          return {
            ...q,
            options: q.options.map((o, i) => ({ ...o, isCorrect: i === optionIndex })),
          };
        }),
      })),
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
          requestPreview();
        } else if (ack?.error) {
          toast.error(ack.error);
        }
      },
    );
  };

  useEffect(() => {
    if (expandedId === null) return;
    const q = flatLiveQuestions.find((row) => row.id === expandedId);
    if (q && q.options.length >= 2) return;
    requestPreview();
  }, [expandedId, flatLiveQuestions, requestPreview]);

  const toggleEdit = (q: LivePreviewQuestion) => {
    if (expandedId === q.id) {
      setExpandedId(null);
      return;
    }
    if (q.options.length === 0) requestPreview();
    setExpandedId(q.id);
  };

  return (
    <>
      <aside
        data-name="Question Preview Column"
        className={cn(
          'hidden h-full min-h-0 shrink-0 flex-col overflow-hidden border-solid lg:flex',
          HOST_DASHBOARD.previewColumnWidth,
          className,
        )}
        style={{
          backgroundColor: HOST_DASHBOARD.panelBg,
          borderColor: HOST_DASHBOARD.panelBorder,
          borderWidth: '0 1px 0 0',
        }}
      >
        <div className="shrink-0 px-4 pt-4">
          <h2 className="text-[25px] font-bold uppercase leading-tight text-[#00d9ff]">
            Question Preview ({totalQuestionCount})
          </h2>
        </div>
        <ul
          ref={listRef}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain px-3 py-3 [scrollbar-color:rgba(255,255,255,0.2)_transparent]"
        >
          {displayRounds.map((round) => {
            if (round.questions.length === 0) return null;
            const roundTitle = `Round ${round.roundIndex + 1}`;
            const roundSubtitle = round.roundName?.trim() || '';
            const isActiveRound = round.roundIndex === currentRoundIndex;
            const isRoundOpen = openRoundIndex === round.roundIndex;
            const roundPanelId = `preview-round-panel-${round.roundIndex}`;

            return (
              <li key={`round-${round.roundIndex}`} className="list-none space-y-2">
                <button
                  type="button"
                  id={`preview-round-trigger-${round.roundIndex}`}
                  aria-expanded={isRoundOpen}
                  aria-controls={roundPanelId}
                  onClick={() => toggleRoundDropdown(round.roundIndex)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-[5px] border border-solid px-3 py-2.5 text-left transition',
                    HOST_DASHBOARD.tileGradient,
                    isActiveRound
                      ? 'border-[#00d9ff] shadow-[0_0_10px_rgba(0,217,255,0.15)]'
                      : 'border-[#888]',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex size-5 shrink-0 items-center justify-center text-[10px] text-[#00d9ff] transition-transform',
                      isRoundOpen ? 'rotate-180' : 'rotate-0',
                    )}
                    aria-hidden
                  >
                    ▼
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-extrabold uppercase tracking-wide text-[#00d9ff]">
                      {roundTitle}
                    </span>
                    {roundSubtitle ? (
                      <span className="block truncate text-[10px] font-semibold text-white/55">
                        {roundSubtitle}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 rounded bg-black/30 px-2 py-0.5 text-[10px] font-bold text-white/70">
                    {round.questions.length}
                  </span>
                </button>
                {isRoundOpen ? (
                <ul id={roundPanelId} className="space-y-3 pb-1 pl-1" role="region" aria-labelledby={`preview-round-trigger-${round.roundIndex}`}>
                  {round.questions.map((q, idx) => {
                    const isCurrent = isActiveRound && idx === currentQuestionIndex;
                    const expanded = expandedId === q.id;
                    const text = String(q.text || '').trim() || 'Untitled question';
                    const showThumb = q.mediaUrl && isQuestionImageMedia(q.mediaType, q.mediaUrl);
                    const editReady = q.options.length >= 2;
                    const canJump = !jumpDisabled;

                    return (
                      <li
                        key={`${round.roundIndex}-${q.id ?? idx}`}
                        ref={isCurrent ? activeRef : undefined}
                        className="space-y-2"
                      >
                        <div
                          className={cn(
                            'flex min-h-[80px] items-center gap-2 rounded-[5px] border border-solid py-2 pl-3 pr-2',
                            HOST_DASHBOARD.tileGradient,
                            isCurrent
                              ? 'border-[#00d9ff] shadow-[0_0_12px_rgba(0,217,255,0.2)]'
                              : 'border-[#888]',
                          )}
                        >
                          <p className="line-clamp-2 min-w-0 flex-1 text-[13px] font-bold leading-4 text-white">
                            {text}
                          </p>
                          <span className="shrink-0 text-[16px] font-bold text-white">{idx + 1}</span>
                          {showThumb ? (
                            <div className="h-[48px] w-[60px] shrink-0 overflow-hidden bg-black/40">
                              <img
                                src={toPublicMediaPreviewUrl(q.mediaUrl)}
                                alt=""
                                className="size-full object-cover"
                                draggable={false}
                              />
                            </div>
                          ) : null}
                          <div className="flex shrink-0 flex-col gap-1">
                            <button
                              type="button"
                              className={previewActionBtn}
                              onClick={() => toggleEdit(q)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className={previewActionBtn}
                              disabled={!canJump || isCurrent || jumpingTarget !== null}
                              onClick={() => handleGoToQuestion(round.roundIndex, idx)}
                            >
                              {jumpingTarget?.roundIndex === round.roundIndex &&
                              jumpingTarget?.questionIndex === idx
                                ? '…'
                                : 'Go to'}
                            </button>
                          </div>
                        </div>
                        {expanded ? (
                          <div className="space-y-2 rounded-[5px] border border-[#888] bg-[#0b0f1a]/95 p-3">
                            {!editReady ? (
                              <p className="text-xs text-white/50">Loading options…</p>
                            ) : (
                              <>
                                <label className="block text-[10px] font-semibold uppercase text-white/50">
                                  Question
                                  <textarea
                                    value={q.text}
                                    onChange={(e) =>
                                      updateLocalQuestion(q.id, { text: e.target.value })
                                    }
                                    rows={2}
                                    className="mt-1 w-full rounded border border-white/15 bg-[#1a1f2e] px-2 py-1.5 text-xs text-white"
                                  />
                                </label>
                                <div className="space-y-1.5">
                                  <p className="text-[10px] font-semibold uppercase text-white/50">
                                    Options
                                  </p>
                                  {q.options.map((opt, oi) => (
                                    <div key={oi} className="flex items-center gap-1.5">
                                      <input
                                        type="radio"
                                        name={`correct-preview-${q.id}`}
                                        checked={opt.isCorrect}
                                        onChange={() => setCorrectOption(q.id, oi)}
                                        className="size-3.5 shrink-0 accent-[#6706AB]"
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
                                        className="min-w-0 flex-1 rounded border border-white/15 bg-[#1a1f2e] px-2 py-1 text-xs text-white"
                                      />
                                    </div>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  disabled={savingId === q.id}
                                  onClick={() => saveQuestion(q)}
                                  className={cn(previewActionBtn, 'w-full py-1.5 text-[10px]')}
                                >
                                  {savingId === q.id ? 'Saving…' : 'Save'}
                                </button>
                              </>
                            )}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </aside>

      {pendingJump ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          role="presentation"
          onClick={() => setPendingJump(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="jump-question-confirm-title"
            className="w-full max-w-md rounded-2xl border border-[#00d9ff]/55 bg-[#151b2b] p-5 shadow-[0_0_24px_rgba(0,217,255,0.12)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="jump-question-confirm-title" className="mb-3 text-lg font-bold text-[#00d9ff]">
              Go to Round {pendingJump.roundIndex + 1}, question {pendingJump.questionIndex + 1}?
            </h3>
            <p className="mb-5 text-sm leading-relaxed text-white/70">
              Team scores stay the same; this question will be ready to run again.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPendingJump(null)}
                className="flex-1 rounded-lg border border-white/20 py-2 text-sm font-medium text-white/80 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPendingJump}
                className="flex-1 rounded-lg border border-[#00d9ff]/55 bg-[linear-gradient(180deg,#00a9df_0%,#075a89_100%)] py-2 text-sm font-bold uppercase tracking-wide text-white hover:brightness-110"
              >
                Go to question
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
