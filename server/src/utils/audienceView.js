const { QUESTION_STATES } = require('shared/constants/questionStates');
const { mapClientQuestionPayload } = require('./clientQuestionPayload');
const timerManager = require('../services/game-engine/timerManager');

/**
 * Last question index/state the venue and players were shown (unchanged while host PREVIEWs the next).
 */
const resolveAudienceQuestionIndex = (gameState) => {
  if (gameState?.questionState !== QUESTION_STATES.PREVIEW) return null;
  if (gameState.lastAudienceQuestionIndex !== undefined && gameState.lastAudienceQuestionIndex !== null) {
    const n = Number(gameState.lastAudienceQuestionIndex);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const staged = Number(gameState.currentQuestionIndex);
  if (Number.isFinite(staged) && staged > 0) return staged - 1;
  return null;
};

const resolveAudienceQuestionState = (gameState, audienceIndex) => {
  if (gameState?.lastAudienceQuestionState) return gameState.lastAudienceQuestionState;
  if (audienceIndex != null) return QUESTION_STATES.REVEALED;
  return QUESTION_STATES.WAITING;
};

const buildAudienceQuestionPayload = (gameState, questionIndex) => {
  const round = gameState.rounds?.[gameState.currentRoundIndex];
  const row = round?.questions?.[questionIndex];
  if (!round || !row) return null;
  return {
    questionIndex,
    totalQuestions: round.questions?.length || 0,
    question: mapClientQuestionPayload(row),
    timerDuration: Number(row.timerDuration ?? round.timerDuration ?? 30) || 30,
    roundType: round.type || '',
  };
};

/**
 * Reconnect payload for venue/players while host is in PREVIEW (host keeps true PREVIEW on session_state).
 */
const buildAudienceViewPayload = async (gameState, pin) => {
  if (gameState?.state !== 'QUESTION' || gameState.questionState !== QUESTION_STATES.PREVIEW) {
    return null;
  }

  const audIdx = resolveAudienceQuestionIndex(gameState);
  const audState = resolveAudienceQuestionState(gameState, audIdx);

  if (audIdx == null) {
    return {
      state: 'ROUND_INTRO',
      questionState: QUESTION_STATES.WAITING,
      currentQuestionIndex: 0,
      currentQuestion: null,
      timerRemaining: 0,
      timerRunning: false,
    };
  }

  const currentQuestion = buildAudienceQuestionPayload(gameState, audIdx);
  if (!currentQuestion) {
    return {
      state: 'ROUND_INTRO',
      questionState: QUESTION_STATES.WAITING,
      currentQuestionIndex: 0,
      currentQuestion: null,
      timerRemaining: 0,
      timerRunning: false,
    };
  }

  const isRevealed = audState === QUESTION_STATES.REVEALED;
  return {
    state: 'QUESTION',
    questionState: audState,
    currentQuestionIndex: audIdx,
    currentQuestion,
    timerRemaining: isRevealed ? 0 : timerManager.getReconnectTimerRemaining(pin, gameState),
    timerRunning: !isRevealed && Boolean(gameState.timerRunning),
  };
};

/** Game state copy with currentQuestionIndex aimed at the audience question (for reveal snapshots). */
const gameStateForAudienceQuestion = (gameState) => {
  const audIdx = resolveAudienceQuestionIndex(gameState);
  if (audIdx == null) return null;
  return { ...gameState, currentQuestionIndex: audIdx };
};

module.exports = {
  buildAudienceViewPayload,
  resolveAudienceQuestionIndex,
  resolveAudienceQuestionState,
  gameStateForAudienceQuestion,
  buildAudienceQuestionPayload,
};
