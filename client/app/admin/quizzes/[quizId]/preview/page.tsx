'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Button } from '@/components/shared/Button';

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

export default function QuizPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const quizId = params.quizId as string;

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [openRoundId, setOpenRoundId] = useState<number | null>(null);

  useEffect(() => {
    const fetchQuiz = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);
        const res = await api.get<Quiz>(`/api/quizzes/${quizId}`);
        setQuiz(res.data);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load quiz preview');
      } finally {
        setLoading(false);
      }
    };

    if (quizId) fetchQuiz();
  }, [quizId]);

  const sortedRounds = useMemo(
    () => (quiz ? [...quiz.rounds].sort((a, b) => a.order - b.order) : []),
    [quiz],
  );

  const totalQuestions = useMemo(
    () => sortedRounds.reduce((sum, round) => sum + round.questions.length, 0),
    [sortedRounds],
  );

  useEffect(() => {
    if (sortedRounds.length === 0) {
      setOpenRoundId(null);
      return;
    }
    setOpenRoundId((prev) => {
      if (prev && sortedRounds.some((r) => r.id === prev)) return prev;
      return sortedRounds[0].id;
    });
  }, [sortedRounds]);

  if (loading) return <LoadingSpinner />;

  if (errorMessage) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold">Quiz Preview</h1>
        <p className="text-red-400">{errorMessage}</p>
        <div>
          <Button variant="ghost" onClick={() => router.push('/admin/quizzes')}>
            Back to Quizzes
          </Button>
        </div>
      </div>
    );
  }

  if (!quiz) return null;

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Quiz Preview</h1>
          <p className="mt-1 text-sm text-foreground/60">{quiz.title}</p>
          {quiz.description ? <p className="text-sm text-foreground/45">{quiz.description}</p> : null}
          <p className="mt-2 text-xs text-foreground/40">
            {sortedRounds.length} rounds · {totalQuestions} questions
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/admin/quizzes/${quiz.id}`}>
            <Button variant="secondary">Edit Quiz</Button>
          </Link>
          <Link href="/admin/quizzes">
            <Button variant="ghost">Back</Button>
          </Link>
        </div>
      </div>

      {sortedRounds.map((round, roundIndex) => {
        const questions = [...round.questions].sort((a, b) => a.order - b.order);
        const isOpen = openRoundId === round.id;
        return (
          <section
            key={round.id}
            className="rounded-xl border border-border bg-surface/60 p-5"
          >
            <button
              type="button"
              onClick={() => setOpenRoundId((prev) => (prev === round.id ? null : round.id))}
              className="w-full rounded-lg border border-border/70 bg-background/35 px-4 py-3 text-left transition-colors hover:bg-background/55"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                    Round {roundIndex + 1}
                  </span>
                  <h2 className="text-lg font-semibold">{round.name}</h2>
                  <span className="rounded-full bg-foreground/10 px-3 py-1 text-xs text-foreground/70">
                    {ROUND_TYPE_LABELS[round.type] || round.type}
                  </span>
                  <span className="text-xs text-foreground/45">
                    {questions.length} questions · {round.timerDuration}s
                  </span>
                </div>
                <span className="text-xl text-foreground/70">{isOpen ? '−' : '+'}</span>
              </div>
            </button>

            {isOpen ? (
              <div className="mt-4">
                {questions.length === 0 ? (
                  <p className="text-sm text-foreground/50">No questions in this round.</p>
                ) : (
                  <div className="space-y-3">
                    {questions.map((question, qIndex) => (
                      <article
                        key={question.id}
                        className="rounded-lg border border-border/70 bg-background/50 p-4"
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-primary">
                            Q{qIndex + 1}
                          </span>
                          {question.category ? (
                            <span className="rounded-md bg-foreground/10 px-2 py-0.5 text-[11px] text-foreground/70">
                              {question.category}
                            </span>
                          ) : null}
                          {question.timerDuration ? (
                            <span className="rounded-md bg-foreground/10 px-2 py-0.5 text-[11px] text-foreground/70">
                              Timer: {question.timerDuration}s
                            </span>
                          ) : null}
                          {question.mediaType ? (
                            <span className="rounded-md bg-foreground/10 px-2 py-0.5 text-[11px] text-foreground/70">
                              Media: {question.mediaType}
                            </span>
                          ) : null}
                        </div>

                        <p className="mb-3 text-sm leading-relaxed text-foreground/90">{question.text}</p>

                        <div className="grid gap-2 sm:grid-cols-2">
                          {question.options.map((option, optionIndex) => (
                            <div
                              key={`${question.id}-${optionIndex}`}
                              className={`rounded-md border px-3 py-2 text-sm ${
                                option.isCorrect
                                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                                  : 'border-border/70 bg-surface/60 text-foreground/80'
                              }`}
                            >
                              <span className="mr-2 font-semibold">{String.fromCharCode(65 + optionIndex)}.</span>
                              {option.text}
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
