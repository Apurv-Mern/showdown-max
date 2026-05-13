const { GAME_STATES } = require('shared/constants/gameStates');
const { QUESTION_STATES } = require('shared/constants/questionStates');
const { ROUND_TYPES } = require('shared/constants/roundTypes');
const logger = require('../../utils/logger');

const VALID_TRANSITIONS = {
  [GAME_STATES.LOBBY]: [GAME_STATES.ROUND_INTRO],
  [GAME_STATES.ROUND_INTRO]: [GAME_STATES.QUESTION, GAME_STATES.BREAK, GAME_STATES.WAGER_COLLECTION],
  [GAME_STATES.WAGER_COLLECTION]: [GAME_STATES.QUESTION, GAME_STATES.BREAK],
  [GAME_STATES.QUESTION]: [GAME_STATES.SCOREBOARD, GAME_STATES.BREAK, GAME_STATES.ROUND_INTRO],
  [GAME_STATES.SCOREBOARD]: [
    GAME_STATES.QUESTION,
    GAME_STATES.ROUND_INTRO,
    GAME_STATES.BREAK,
    GAME_STATES.FINAL_WAGER,
    GAME_STATES.FINAL_RESULTS,
  ],
  [GAME_STATES.BREAK]: [
    GAME_STATES.ROUND_INTRO,
    GAME_STATES.QUESTION,
    GAME_STATES.SCOREBOARD,
    GAME_STATES.MINI_GAME,
    GAME_STATES.FINAL_WAGER,
    GAME_STATES.WAGER_COLLECTION,
  ],
  [GAME_STATES.MINI_GAME]: [GAME_STATES.BREAK, GAME_STATES.ROUND_INTRO, GAME_STATES.SCOREBOARD],
  [GAME_STATES.FINAL_WAGER]: [GAME_STATES.QUESTION],
  [GAME_STATES.FINAL_RESULTS]: [],
};

/**
 * Creates a fresh game state for a new session
 * @param {number} sessionId
 * @param {object} quiz - Quiz with rounds and questions loaded
 * @returns {object} Initial game state
 */
const createInitialState = (sessionId, quiz) => {
  const rounds = quiz.rounds
    .sort((a, b) => a.order - b.order)
    .map((round) => ({
      id: round.id,
      name: round.name,
      type: round.type,
      timerDuration: round.timerDuration,
      questions: round.questions
        .sort((a, b) => a.order - b.order)
        .map((q) => ({
          id: q.id,
          text: q.text,
          options: q.options,
          mediaUrl: q.mediaUrl,
          mediaType: q.mediaType,
          timerDuration: q.timerDuration ?? null,
        })),
    }));

  return {
    sessionId,
    quizId: quiz.id,
    quizTitle: quiz.title,
    state: GAME_STATES.LOBBY,
    questionState: QUESTION_STATES.WAITING,
    currentRoundIndex: 0,
    currentQuestionIndex: 0,
    rounds,
    timerDuration: rounds[0]?.timerDuration || 30,
    timerRemaining: 0,
    timerRunning: false,
    teams: {},
    roundWagers: {},
    eliminatedTeams: {},
    activeTeamIds: [],
    responseCount: 0,
    totalTeams: 0,
    breakDuration: 360,
    breakRemaining: 0,
    activeMiniGame: null,
  };
};

/**
 * Validates and performs a state transition
 * @param {object} gameState
 * @param {string} newState
 * @returns {{ valid: boolean, gameState: object, error?: string }}
 */
const transition = (gameState, newState) => {
  const currentState = gameState.state;
  const allowed = VALID_TRANSITIONS[currentState] || [];

  if (!allowed.includes(newState)) {
    logger.warn('Invalid state transition', { from: currentState, to: newState });
    return {
      valid: false,
      gameState,
      error: `Cannot transition from ${currentState} to ${newState}`,
    };
  }

  const updated = { ...gameState, state: newState };

  if (newState === GAME_STATES.QUESTION) {
    updated.questionState = QUESTION_STATES.WAITING;
    updated.responseCount = 0;
  }

  if (newState === GAME_STATES.BREAK) {
    updated.breakRemaining = gameState.breakDuration;
    updated.activeMiniGame = null;
  }

  if (newState === GAME_STATES.ROUND_INTRO) {
    updated.questionState = QUESTION_STATES.WAITING;
    updated.currentQuestionIndex = 0;
    updated.eliminatedTeams = {};
  }

  if (newState === GAME_STATES.WAGER_COLLECTION) {
    updated.questionState = QUESTION_STATES.WAITING;
    updated.responseCount = 0;
  }

  logger.info('State transition', { from: currentState, to: newState, sessionId: gameState.sessionId });
  return { valid: true, gameState: updated };
};

/**
 * Get current round from game state
 * @param {object} gameState
 * @returns {object | null}
 */
const getCurrentRound = (gameState) => {
  return gameState.rounds[gameState.currentRoundIndex] || null;
};

/**
 * Get current question from game state
 * @param {object} gameState
 * @returns {object | null}
 */
const getCurrentQuestion = (gameState) => {
  const round = getCurrentRound(gameState);
  if (!round) return null;
  return round.questions[gameState.currentQuestionIndex] || null;
};

/**
 * Advance to the next question in the current round
 * @param {object} gameState
 * @returns {{ hasNext: boolean, gameState: object }}
 */
const advanceQuestion = (gameState) => {
  const round = getCurrentRound(gameState);
  if (!round) return { hasNext: false, gameState };

  const nextIndex = gameState.currentQuestionIndex + 1;

  if (nextIndex >= round.questions.length) {
    return { hasNext: false, gameState };
  }

  const nextQuestion = round.questions[nextIndex];
  const nextDuration = Number(nextQuestion?.timerDuration ?? round.timerDuration ?? 30) || 30;
  return {
    hasNext: true,
    gameState: {
      ...gameState,
      currentQuestionIndex: nextIndex,
      questionState: QUESTION_STATES.WAITING,
      responseCount: 0,
      timerRemaining: nextDuration,
      timerRunning: false,
    },
  };
};

/**
 * Advance to the next round
 * @param {object} gameState
 * @returns {{ hasNext: boolean, gameState: object }}
 */
const advanceRound = (gameState) => {
  const nextIndex = gameState.currentRoundIndex + 1;

  if (nextIndex >= gameState.rounds.length) {
    return { hasNext: false, gameState };
  }

  const nextRound = gameState.rounds[nextIndex];

  return {
    hasNext: true,
    gameState: {
      ...gameState,
      currentRoundIndex: nextIndex,
      currentQuestionIndex: 0,
      questionState: QUESTION_STATES.WAITING,
      responseCount: 0,
      timerDuration: nextRound.timerDuration,
      timerRemaining: nextRound.timerDuration,
      timerRunning: false,
      eliminatedTeams: {},
    },
  };
};

/**
 * Activate the current question (start accepting answers)
 * @param {object} gameState
 * @returns {object}
 */
const activateQuestion = (gameState) => {
  const round = getCurrentRound(gameState);
  const question = getCurrentQuestion(gameState);
  const duration = Number(question?.timerDuration ?? round?.timerDuration ?? 30) || 30;
  const isMusic = String(round?.type || '').toUpperCase() === ROUND_TYPES.MUSIC;
  return {
    ...gameState,
    questionState: QUESTION_STATES.ACTIVE,
    timerRemaining: duration,
    // Music rounds: countdown + audio start together when the host presses Start Timer only.
    timerRunning: !isMusic,
    responseCount: 0,
  };
};

/**
 * Reveal the answer for the current question
 * @param {object} gameState
 * @returns {object}
 */
const revealAnswer = (gameState) => {
  return {
    ...gameState,
    questionState: QUESTION_STATES.REVEALED,
    timerRunning: false,
  };
};

/**
 * Check if the current round is the final round
 * @param {object} gameState
 * @returns {boolean}
 */
const isFinalRound = (gameState) => {
  const round = getCurrentRound(gameState);
  if (!round) return false;
  return round.type === ROUND_TYPES.FINAL_WAGER || round.type === ROUND_TYPES.FINAL_MULTIPLE_CHOICE;
};

module.exports = {
  VALID_TRANSITIONS,
  createInitialState,
  transition,
  getCurrentRound,
  getCurrentQuestion,
  advanceQuestion,
  advanceRound,
  activateQuestion,
  revealAnswer,
  isFinalRound,
};
