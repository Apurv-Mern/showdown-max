const { QUESTION_STATES } = require('shared/constants/questionStates');
const { ROUND_TYPES } = require('shared/constants/roundTypes');
const { mapClientQuestionPayload } = require('./clientQuestionPayload');
const timerManager = require('../services/game-engine/timerManager');

const isStandardWagerRound = (round) =>
  String(round?.type || '').toUpperCase() === ROUND_TYPES.WAGER;

/** Venue/players have been shown a question (Present) in the *current* round. */
const audienceHasSeenPresentedQuestion = (gameState) => {
  if (!gameState) return false;
  const roundIdx = Number(gameState.currentRoundIndex);
  if (!Number.isFinite(roundIdx)) return false;
  const audRound = gameState.lastAudienceRoundIndex;
  if (audRound === undefined || audRound === null) return false;
  if (Number(audRound) !== roundIdx) return false;
  const n = gameState.lastAudienceQuestionIndex;
  return n !== undefined && n !== null && Number.isFinite(Number(n)) && Number(n) >= 0;
};

/**
 * Last question index/state the venue and players were shown (unchanged while host PREVIEWs the next).
 */
const resolveAudienceQuestionIndex = (gameState) => {
  if (gameState?.questionState !== QUESTION_STATES.PREVIEW) return null;
  if (!audienceHasSeenPresentedQuestion(gameState)) return null;
  const n = Number(gameState.lastAudienceQuestionIndex);
  return Number.isFinite(n) && n >= 0 ? n : null;
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

  const round = gameState.rounds?.[gameState.currentRoundIndex];

  if (gameState.audienceHoldRoundIntro) {
    return {
      state: 'ROUND_INTRO',
      questionState: QUESTION_STATES.WAITING,
      currentQuestionIndex: gameState.currentQuestionIndex ?? 0,
      currentQuestion: null,
      timerRemaining: 0,
      timerRunning: false,
    };
  }

  if (!audienceHasSeenPresentedQuestion(gameState)) {
    return {
      state: 'ROUND_INTRO',
      questionState: QUESTION_STATES.WAITING,
      currentQuestionIndex: 0,
      currentQuestion: null,
      timerRemaining: 0,
      timerRunning: false,
    };
  }

  if (isStandardWagerRound(round) && gameState.audienceWagerCollectionOpen) {
    const currentQuestion = buildAudienceQuestionPayload(
      gameState,
      gameState.currentQuestionIndex,
    );
    return {
      state: 'WAGER_COLLECTION',
      questionState: QUESTION_STATES.WAITING,
      currentQuestionIndex: gameState.currentQuestionIndex,
      currentQuestion,
      timerRemaining: 0,
      timerRunning: false,
    };
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
  audienceHasSeenPresentedQuestion,
  resolveAudienceQuestionIndex,
  resolveAudienceQuestionState,
  gameStateForAudienceQuestion,
  buildAudienceQuestionPayload,
};
