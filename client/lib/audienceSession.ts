/** While host is in PREVIEW, venue/players use `audienceView` from session_state / join. */
export type AudienceViewPayload = {
  state?: string;
  questionState?: string;
  currentQuestionIndex?: number;
  currentQuestion?: unknown;
  timerRemaining?: number;
  timerRunning?: boolean;
};

export function applyAudienceSessionPayload<T extends Record<string, unknown>>(
  data: T,
): T {
  if (data?.state !== 'QUESTION' || data?.questionState !== 'PREVIEW') return data;
  const av = data.audienceView as AudienceViewPayload | null | undefined;
  if (!av) return data;
  return {
    ...data,
    state: (av.state ?? data.state) as T['state'],
    questionState: (av.questionState ?? data.questionState) as T extends { questionState?: infer Q }
      ? Q
      : string,
    currentQuestionIndex:
      av.currentQuestionIndex ?? (data.currentQuestionIndex as number | undefined),
    currentQuestion: av.currentQuestion ?? null,
    timerRemaining: av.timerRemaining ?? (data.timerRemaining as number | undefined),
    timerRunning: av.timerRunning ?? (data.timerRunning as boolean | undefined),
  };
}
