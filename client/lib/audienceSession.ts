/** While host is in PREVIEW, venue/players use `audienceView` from session_state / join. */
export type AudienceViewPayload = {
  state?: string;
  questionState?: string;
  currentQuestionIndex?: number;
  currentQuestion?: unknown;
  timerRemaining?: number;
  timerRunning?: boolean;
};

const ROUND_INTRO_AUDIENCE_VIEW: AudienceViewPayload = {
  state: 'ROUND_INTRO',
  questionState: 'WAITING',
  currentQuestionIndex: 0,
  currentQuestion: null,
  timerRemaining: 0,
  timerRunning: false,
};

/** Merge top-level join fields onto the nested `gameState` object when present. */
export function flattenSessionStatePayload(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const inner = (data?.gameState ?? data) as Record<string, unknown>;
  if (!inner || typeof inner !== 'object') return inner ?? {};
  const merged: Record<string, unknown> = { ...inner };
  for (const key of [
    'audienceView',
    'audienceHoldRoundIntro',
    'audienceWagerCollectionOpen',
    'hostPreviewAwaitingWagerCollection',
    'rounds',
    'currentRound',
    'currentRoundIndex',
    'totalRounds',
  ]) {
    if (merged[key] == null && data[key] != null) {
      merged[key] = data[key];
    }
  }
  return merged;
}

export function isStandardWagerRoundFromState(data: Record<string, unknown>): boolean {
  const idx = Number(data.currentRoundIndex ?? 0);
  const round =
    data.currentRound ??
    (Array.isArray(data.rounds) && idx >= 0 && idx < data.rounds.length
      ? (data.rounds as Record<string, unknown>[])[idx]
      : null);
  return String((round as { type?: string } | null)?.type || '').toUpperCase() === 'WAGER';
}

/** Host PREVIEW while audience should stay on the last REVEALED question (all round types). */
export function isAudienceRevealHoldDuringHostPreview(
  data: Record<string, unknown>,
): boolean {
  const base = flattenSessionStatePayload(data);
  if (base?.state !== 'QUESTION' || String(base?.questionState || '').toUpperCase() !== 'PREVIEW') {
    return false;
  }
  const av = base.audienceView as AudienceViewPayload | null | undefined;
  return (
    av?.state === 'QUESTION' && String(av.questionState || '').toUpperCase() === 'REVEALED'
  );
}

/** @deprecated Use isAudienceRevealHoldDuringHostPreview */
export function isWagerAudienceHoldRevealedQuestion(
  data: Record<string, unknown>,
): boolean {
  return isAudienceRevealHoldDuringHostPreview(data);
}

export function applyAudienceSessionPayload<T extends Record<string, unknown>>(
  data: T,
): T {
  const base = flattenSessionStatePayload(data) as T;
  const hostStagingPreview =
    base?.state === 'QUESTION' &&
    String(base?.questionState || '').toUpperCase() === 'PREVIEW';

  let av = base.audienceView as AudienceViewPayload | null | undefined;

  // Start Round: host PREVIEW — audience stays on round intro until Present.
  if (hostStagingPreview && !av && base.audienceHoldRoundIntro) {
    av = ROUND_INTRO_AUDIENCE_VIEW;
  }

  if (
    hostStagingPreview &&
    !av &&
    base.audienceWagerCollectionOpen &&
    isStandardWagerRoundFromState(base)
  ) {
    av = {
      state: 'WAGER_COLLECTION',
      questionState: 'WAITING',
      currentQuestionIndex: base.currentQuestionIndex as number | undefined,
      currentQuestion: null,
      timerRemaining: 0,
      timerRunning: false,
    };
  }

  if (!av || !hostStagingPreview) return base;

  return {
    ...base,
    state: (av.state ?? base.state) as T['state'],
    questionState: (av.questionState ?? base.questionState) as T extends { questionState?: infer Q }
      ? Q
      : string,
    currentQuestionIndex:
      av.currentQuestionIndex ?? (base.currentQuestionIndex as number | undefined),
    currentQuestion: av.currentQuestion ?? null,
    timerRemaining: av.timerRemaining ?? (base.timerRemaining as number | undefined),
    timerRunning: av.timerRunning ?? (base.timerRunning as boolean | undefined),
  };
}
