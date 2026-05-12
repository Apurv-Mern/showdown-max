const { GAME_STATES } = require('shared/constants/gameStates');
const { QUESTION_STATES } = require('shared/constants/questionStates');
const { ROUND_TYPES } = require('shared/constants/roundTypes');
const { SCORING } = require('shared/constants/scoring');
const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const {
  DEFAULT_KANGAROO_NAMES,
  KANGAROO_NAME_MAX_LENGTH,
  KANGAROO_SLOT_COUNT,
} = require('shared/constants/kangarooRace');
const stateMachine = require('./stateMachine');
const { calculateScores } = require('./scoringEngine');
const knockoutEngine = require('./knockoutEngine');
const timerManager = require('./timerManager');
const redisStore = require('../redisSessionStore');
const { buildRevealSnapshot } = require('../revealSnapshot');
const { Team, Session } = require('../../models');
const logger = require('../../utils/logger');
const { getBreakRemainingSeconds } = require('../../utils/breakWallClock');

const eliminationStates = new Map();

const clampAmount = (amount, min, max) => {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(min, Math.min(max, Math.round(parsed)));
};

/** Keep Redis `timerRemaining` aligned with the in-memory ticker (reconnect / venue / host). */
const persistTimerRemainingIfActiveQuestion = (pin, remaining) => {
  redisStore
    .getGameState(pin)
    .then((gs) => {
      if (!gs || gs.state !== GAME_STATES.QUESTION) return null;
      if (gs.questionState !== QUESTION_STATES.ACTIVE) return null;
      return redisStore.updateGameState(pin, {
        timerRemaining: Math.max(0, Number(remaining) || 0),
      });
    })
    .catch(() => {});
};

const clampWagerByRoundType = (roundType, amount) => {
  if (roundType === ROUND_TYPES.FINAL_WAGER) {
    return clampAmount(amount, SCORING.FINAL_WAGER.MIN_PERCENT, SCORING.FINAL_WAGER.MAX_PERCENT);
  }

  return clampAmount(amount, SCORING.WAGER.MIN, SCORING.WAGER.MAX);
};

const getRoundWagerForTeam = (gameState, roundId, teamId) => {
  return Number(gameState?.roundWagers?.[String(roundId)]?.[String(teamId)] ?? 0);
};

const isWagerLockRound = (round) =>
  round?.type === ROUND_TYPES.WAGER || round?.type === ROUND_TYPES.FINAL_WAGER;

const parseSelectedOptionIndex = (rawResponse) => {
  if (!rawResponse) return -1;
  try {
    const parsed = JSON.parse(rawResponse);
    const selected = Number(parsed.selectedOptionIndex);
    return Number.isFinite(selected) ? selected : -1;
  } catch {
    const selected = Number(rawResponse);
    return Number.isFinite(selected) ? selected : -1;
  }
};

/** Answers among a specific team-id list (used after a disconnect shrinks `activeTeamIds`). */
const countValidAnswersAmongTeamIds = (responsesRaw, teamIds) => {
  if (!responsesRaw || !Array.isArray(teamIds)) return 0;
  let n = 0;
  for (const tid of teamIds) {
    const raw = responsesRaw[String(tid)];
    if (raw === undefined || raw === null || raw === '') continue;
    if (parseSelectedOptionIndex(raw) >= 0) n += 1;
  }
  return n;
};

const buildLiveResponseStats = (gameState, question, responsesRaw = {}) => {
  const activeTeamIds = Array.isArray(gameState?.activeTeamIds) ? gameState.activeTeamIds : [];
  const total = activeTeamIds.length;
  const roundType = (
    question?.roundType ||
    gameState?.rounds?.[gameState?.currentRoundIndex]?.type ||
    ''
  ).toUpperCase();
  const correctOptionIndex = (question?.options || []).findIndex((o) => o?.isCorrect);

  let correct = 0;
  let incorrect = 0;
  let noAnswer = 0;
  const answeredSelections = [];
  const voteCounts = {};

  for (const teamId of activeTeamIds) {
    const key = String(teamId);
    const raw = responsesRaw[key];
    if (raw === undefined || raw === null) {
      noAnswer += 1;
      continue;
    }

    const selectedOptionIndex = parseSelectedOptionIndex(raw);
    if (selectedOptionIndex >= 0) {
      answeredSelections.push(selectedOptionIndex);
      voteCounts[selectedOptionIndex] = (voteCounts[selectedOptionIndex] || 0) + 1;

      if (roundType !== ROUND_TYPES.MAJORITY_RULES && selectedOptionIndex === correctOptionIndex) {
        correct += 1;
      }
    } else {
      noAnswer += 1;
    }
  }

  if (roundType === ROUND_TYPES.MAJORITY_RULES) {
    const maxVotes = Math.max(...Object.values(voteCounts), 0);
    const majorityOptions = new Set(
      Object.entries(voteCounts)
        .filter(([, count]) => Number(count) === maxVotes && maxVotes > 0)
        .map(([idx]) => Number(idx)),
    );

    for (const selectedOptionIndex of answeredSelections) {
      if (majorityOptions.has(selectedOptionIndex)) {
        correct += 1;
      } else {
        incorrect += 1;
      }
    }
  } else {
    // In non-majority rounds, any answered non-correct option counts as incorrect.
    incorrect = answeredSelections.length - correct;
    if (incorrect < 0) {
      incorrect = 0;
    }
  }

  return { correct, incorrect, noAnswer, total };
};

const createCardShuffleState = (roundNumber = null) => ({
  game: 'card_shuffle',
  ready: false,
  gameStarted: false,
  activeRound: roundNumber,
  revealed: false,
  correctPosition: null,
  cardPositions: [],
  selections: {},
  pickCounts: { 1: 0, 2: 0, 3: 0 },
});

const normalizeKangarooNames = (input) => {
  const rawNames = Array.isArray(input) ? input : [];
  const names = [];
  for (let i = 0; i < KANGAROO_SLOT_COUNT; i += 1) {
    const fallback = DEFAULT_KANGAROO_NAMES[i] || `Kangaroo #${i + 1}`;
    const raw = rawNames[i];
    const normalized =
      typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ').slice(0, KANGAROO_NAME_MAX_LENGTH) : '';
    names.push(normalized || fallback);
  }
  return names;
};

const hasValidKangarooNames = (input) => {
  if (!Array.isArray(input) || input.length !== KANGAROO_SLOT_COUNT) return false;
  return input.every((value) => {
    if (typeof value !== 'string') return false;
    const normalized = value.trim().replace(/\s+/g, ' ');
    return normalized.length > 0 && normalized.length <= KANGAROO_NAME_MAX_LENGTH;
  });
};

const createHorseRaceState = (kangarooNames = DEFAULT_KANGAROO_NAMES) => ({
  game: 'kangaroo_race',
  ready: false,
  gameStarted: false,
  revealed: false,
  kangarooNames: normalizeKangarooNames(kangarooNames),
  finishOrder: [],
  resultsAwarded: false,
  selections: {},
  pickCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
});

/**
 * Start a game session
 * @param {import('socket.io').Server} io
 * @param {string} pin
 * @param {object} quiz - Quiz with rounds + questions
 * @param {number} sessionId
 */
const startGame = async (io, pin, quiz, sessionId) => {
  const gameState = stateMachine.createInitialState(sessionId, quiz);
  const teams = await redisStore.getLobbyTeams(pin);
  const session = await Session.findByPk(sessionId);

  gameState.totalTeams = teams.length;
  gameState.maxTeams = session?.maxTeams || teams.length;
  gameState.activeTeamIds = teams.map((t) => t.teamId);
  gameState.teams = {};
  for (const team of teams) {
    gameState.teams[team.teamId] = { ...team };
  }

  const result = stateMachine.transition(gameState, GAME_STATES.ROUND_INTRO);
  if (!result.valid) {
    logger.error('Failed to start game', { error: result.error });
    return;
  }

  await redisStore.setGameState(pin, result.gameState);
  logger.info('Game state transition', {
    pin,
    sessionId,
    state: result.gameState.state,
    roundIndex: result.gameState.currentRoundIndex,
    totalRounds: result.gameState.rounds.length,
    totalTeams: result.gameState.totalTeams,
  });
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.SESSION_STATE, sanitizeForClients(result.gameState));
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.ROUND_INTRO, {
    round: stateMachine.getCurrentRound(result.gameState),
    roundIndex: result.gameState.currentRoundIndex,
    totalRounds: result.gameState.rounds.length,
  });
};

/**
 * Advance to next question and activate it (host presses Space/Next)
 */
const nextQuestion = async (io, pin) => {
  let gameState = await redisStore.getGameState(pin);
  if (!gameState) return;

  if (gameState.state === GAME_STATES.ROUND_INTRO) {
    const round = stateMachine.getCurrentRound(gameState);
    if (isWagerLockRound(round)) {
      await startWagerCollection(io, pin);
      return;
    }
    const transResult = stateMachine.transition(gameState, GAME_STATES.QUESTION);
    if (!transResult.valid) return;
    gameState = transResult.gameState;
  } else if (
    gameState.state === GAME_STATES.SCOREBOARD ||
    gameState.state === GAME_STATES.WAGER_COLLECTION
  ) {
    const transResult = stateMachine.transition(gameState, GAME_STATES.QUESTION);
    if (!transResult.valid) return;
    gameState = transResult.gameState;
  } else if (
    gameState.state === GAME_STATES.QUESTION &&
    gameState.questionState === QUESTION_STATES.REVEALED
  ) {
    const advance = stateMachine.advanceQuestion(gameState);
    if (!advance.hasNext) {
      await endRound(io, pin, gameState);
      return;
    }
    gameState = advance.gameState;
  }

  gameState = stateMachine.activateQuestion(gameState);
  await redisStore.setGameState(pin, gameState);

  const question = stateMachine.getCurrentQuestion(gameState);
  const round = stateMachine.getCurrentRound(gameState);
  const effectiveTimer = Number(question.timerDuration ?? round.timerDuration ?? 30) || 30;

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.LIVE_RESPONSE_UPDATE, {
    correct: 0,
    incorrect: 0,
    noAnswer: 0,
    total: gameState.activeTeamIds.length,
  });
  logger.info('Question activated', {
    pin,
    roundIndex: gameState.currentRoundIndex,
    questionIndex: gameState.currentQuestionIndex,
    questionId: question.id,
    timerDuration: effectiveTimer,
    roundType: round.type,
  });

  timerManager.startTimer(
    pin,
    effectiveTimer,
    (remaining) => {
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_UPDATE, {
        remaining,
        timerRunning: true,
      });
      persistTimerRemainingIfActiveQuestion(pin, remaining);
    },
    async () => {
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_EXPIRED, {});
      const gs = await redisStore.getGameState(pin);
      if (gs) {
        gs.timerRunning = false;
        gs.timerRemaining = 0;
        await redisStore.setGameState(pin, gs);
        const expiredQuestion = stateMachine.getCurrentQuestion(gs);
        if (expiredQuestion) {
          const responsesRaw = await redisStore.getResponses(pin, expiredQuestion.id);
          io.to(`session:${pin}`).emit(
            SOCKET_EVENTS.LIVE_RESPONSE_UPDATE,
            buildLiveResponseStats(gs, expiredQuestion, responsesRaw),
          );
        }
      }
      logger.info('Timer expired for question, waiting for host to reveal', {
        pin,
        roundIndex: gs?.currentRoundIndex,
        questionIndex: gs?.currentQuestionIndex,
      });
      // await revealAnswer(io, pin);
    },
  );

  const liveAfterStart = timerManager.getTimerState(pin);
  persistTimerRemainingIfActiveQuestion(pin, liveAfterStart.remaining);

  if (round.type === ROUND_TYPES.MUSIC) {
    await pauseTimer(io, pin);
    const gsMusic = await redisStore.getGameState(pin);
    if (gsMusic) {
      gsMusic.timerRemaining = effectiveTimer;
      gsMusic.timerRunning = false;
      await redisStore.setGameState(pin, gsMusic);
      io.to(`session:${pin}`).emit(
        SOCKET_EVENTS.SESSION_STATE,
        clientPayloadFromGameState(gsMusic),
      );
    }
  }

  const gsForQuestionActive = await redisStore.getGameState(pin);
  const trForEmit = timerManager.getReconnectTimerRemaining(pin, gsForQuestionActive);
  const eliminatedTeamIds = Object.values(gsForQuestionActive?.teams || {})
    .filter((t) => t && t.isEliminated)
    .map((t) => Number(t.teamId))
    .filter((id) => Number.isFinite(id));
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.QUESTION_ACTIVE, {
    questionIndex: gameState.currentQuestionIndex,
    totalQuestions: round.questions.length,
    question: {
      id: question.id,
      text: question.text,
      options: question.options.map((o) => ({ text: o.text })),
      mediaUrl: question.mediaUrl,
      mediaType: question.mediaType,
    },
    timerDuration: effectiveTimer,
    timerRemaining: trForEmit,
    timerRunning: Boolean(gsForQuestionActive?.timerRunning),
    roundType: round.type,
    eliminatedTeamIds,
    pointsForQuestion:
      round.type === ROUND_TYPES.ELIMINATION
        ? require('shared/constants/scoring').getEliminationPoints(gameState.currentQuestionIndex)
        : null,
  });
};

/**
 * Handle a team's answer submission
 */
const submitAnswer = async (io, pin, teamId, data) => {
  const gameState = await redisStore.getGameState(pin);
  if (!gameState || gameState.questionState !== QUESTION_STATES.ACTIVE) return;

  const timerState = timerManager.getTimerState(pin);
  const effectiveRemaining =
    timerState.remaining > 0
      ? timerState.remaining
      : Number.isFinite(Number(gameState.timerRemaining))
        ? Number(gameState.timerRemaining)
        : 0;
  if (effectiveRemaining <= 0) {
    logger.info('Rejected late answer after timer expiry', {
      pin,
      teamId,
      roundIndex: gameState.currentRoundIndex,
      questionIndex: gameState.currentQuestionIndex,
    });
    return;
  }

  const question = stateMachine.getCurrentQuestion(gameState);
  if (!question) return;

  const currentRound = stateMachine.getCurrentRound(gameState);
  if (
    currentRound?.type === ROUND_TYPES.ELIMINATION &&
    (!gameState.activeTeamIds.map(Number).includes(Number(teamId)) ||
      Boolean(gameState.teams?.[teamId]?.isEliminated))
  ) {
    logger.info('Rejected answer from eliminated team', {
      pin,
      teamId,
      roundIndex: gameState.currentRoundIndex,
      questionIndex: gameState.currentQuestionIndex,
    });
    return;
  }

  const existing = await redisStore.getResponses(pin, question.id);
  if (existing[teamId.toString()]) return;

  const responseData = {
    selectedOptionIndex: data.selectedOptionIndex,
    wagerAmount: data.wagerAmount,
    responseTime:
      Number.isFinite(Number(gameState.timerRemaining)) &&
        Number.isFinite(Number(question.timerDuration))
        ? Math.max(0, Number(question.timerDuration) - Number(gameState.timerRemaining))
        : null,
  };

  if (isWagerLockRound(currentRound)) {
    responseData.wagerAmount = getRoundWagerForTeam(gameState, currentRound.id, teamId);
  }
  await redisStore.recordResponse(pin, question.id, teamId, JSON.stringify(responseData));

  const count = await redisStore.getResponseCount(pin, question.id);
  gameState.responseCount = count;
  await redisStore.updateGameState(pin, { responseCount: count });

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.RESPONSE_COUNT, {
    count,
    total: gameState.totalTeams,
  });
  const responsesRaw = await redisStore.getResponses(pin, question.id);
  io.to(`session:${pin}`).emit(
    SOCKET_EVENTS.LIVE_RESPONSE_UPDATE,
    buildLiveResponseStats(gameState, question, responsesRaw),
  );
  logger.info('Answer submitted', {
    pin,
    teamId,
    questionId: question.id,
    roundIndex: gameState.currentRoundIndex,
    questionIndex: gameState.currentQuestionIndex,
    responseCount: count,
    totalTeams: gameState.totalTeams,
  });

  if (count >= gameState.activeTeamIds.length) {
    timerManager.forceExpire(pin);

    io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_UPDATE, { remaining: 0, timerRunning: false });
    io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_EXPIRED, {});

    gameState.timerRunning = false;
    gameState.timerRemaining = 0;
    await redisStore.updateGameState(pin, { timerRunning: false, timerRemaining: 0 });

    io.to(`session:${pin}`).emit(SOCKET_EVENTS.AUTO_REVEAL, {});
    // await revealAnswer(io, pin);
  }
};

/**
 * Handle a team's wager submission (locked once per wager-lock round).
 */
const submitWager = async (pin, teamId, amount) => {
  const gameState = await redisStore.getGameState(pin);
  if (!gameState) return;

  const round = stateMachine.getCurrentRound(gameState);
  if (!round || !isWagerLockRound(round)) return;

  const roundId = String(round.id);
  const teamIdKey = String(teamId);
  const locked = gameState.roundWagers?.[roundId]?.[teamIdKey];
  if (locked !== undefined && locked !== null) {
    return;
  }

  const wager = clampWagerByRoundType(round.type, amount);
  if (!gameState.roundWagers) gameState.roundWagers = {};
  if (!gameState.roundWagers[roundId]) gameState.roundWagers[roundId] = {};
  gameState.roundWagers[roundId][teamIdKey] = wager;

  await redisStore.setGameState(pin, gameState);
};

/**
 * Host reveals the answer
 */
const revealAnswer = async (io, pin) => {
  let gameState = await redisStore.getGameState(pin);
  if (!gameState) return;
  if (
    gameState.state !== GAME_STATES.QUESTION ||
    gameState.questionState !== QUESTION_STATES.ACTIVE
  ) {
    logger.debug('Skipping reveal: question is not active', {
      pin,
      state: gameState.state,
      questionState: gameState.questionState,
    });
    return;
  }

  timerManager.stopTimer(pin);
  gameState = stateMachine.revealAnswer(gameState);

  const round = stateMachine.getCurrentRound(gameState);
  const question = stateMachine.getCurrentQuestion(gameState);
  const rawResponses = await redisStore.getResponses(pin, question.id);

  // Safety: in elimination rounds, scores for knocked-out teams must stay frozen.
  // Keep active list strictly aligned to non-eliminated teams before scoring.
  if (round.type === ROUND_TYPES.ELIMINATION) {
    const filteredActiveTeamIds = (
      Array.isArray(gameState.activeTeamIds) ? gameState.activeTeamIds : []
    )
      .map(Number)
      .filter((id) => gameState.teams?.[id] && !gameState.teams[id].isEliminated);

    if (filteredActiveTeamIds.length !== gameState.activeTeamIds.length) {
      gameState.activeTeamIds = filteredActiveTeamIds;
    }
  }

  const responses = {};
  for (const [teamId, raw] of Object.entries(rawResponses)) {
    try {
      const parsed = JSON.parse(raw);
      responses[teamId] = {
        selectedOptionIndex: Number(parsed.selectedOptionIndex),
        wagerAmount: parsed.wagerAmount !== undefined ? Number(parsed.wagerAmount) : 0,
      };
    } catch {
      responses[teamId] = { selectedOptionIndex: Number(raw), wagerAmount: 0 };
    }
  }

  const isWagerRound = round.type === ROUND_TYPES.WAGER || round.type === ROUND_TYPES.FINAL_WAGER;
  for (const teamId of gameState.activeTeamIds) {
    const tid = String(teamId);
    if (!responses[tid]) {
      responses[tid] = {
        selectedOptionIndex: -1,
        wagerAmount: 0,
      };
    }
    if (isWagerRound) {
      responses[tid].wagerAmount = getRoundWagerForTeam(gameState, round.id, tid);
    }
  }

  const result = calculateScores({
    roundType: round.type,
    question,
    responses,
    questionIndex: gameState.currentQuestionIndex,
    teams: gameState.teams,
    activeTeamIds: gameState.activeTeamIds,
  });

  for (const [teamId, points] of Object.entries(result.scores)) {
    if (gameState.teams[teamId]) {
      gameState.teams[teamId].score += points;
      await redisStore.updateTeamData(pin, Number(teamId), gameState.teams[teamId]);
    }
  }

  if (round.type === ROUND_TYPES.ELIMINATION) {
    let elimState = eliminationStates.get(pin);
    if (!elimState) {
      elimState = knockoutEngine.initEliminationRound(gameState.activeTeamIds);
    }
    elimState = knockoutEngine.processElimination(
      elimState,
      result,
      gameState.currentQuestionIndex,
    );
    eliminationStates.set(pin, elimState);

    gameState.activeTeamIds = elimState.activeTeamIds;

    // Per the all-teams-wrong rule (knockoutEngine.processElimination already returns the
    // unchanged activeTeamIds in this case), nobody should be marked eliminated or notified
    // PLAYER_ELIMINATED. Without this guard the last surviving player would still get a
    // PLAYER_ELIMINATED event whenever they answered alone and got it wrong, even though the
    // engine correctly kept them in `activeTeamIds`.
    if (!result.allWrong) {
      for (const teamId of result.eliminations) {
        if (gameState.teams[teamId]) {
          gameState.teams[teamId].isEliminated = true;
        }
        io.to(`session:${pin}`).emit(SOCKET_EVENTS.PLAYER_ELIMINATED, { teamId });
      }
    }

    if (knockoutEngine.shouldEndEarly(elimState)) {
      logger.info('Elimination round ending early — 0 or 1 team remaining', { pin });
    }
  }

  await redisStore.setGameState(pin, gameState);

  persistScoresToDB(gameState.teams).catch((err) =>
    logger.error('Failed to persist scores to DB', { pin, error: err.message }),
  );

  const correctIndex = question.options.findIndex((o) => o.isCorrect);
  const responseDetails = Object.entries(responses).map(([teamId, response]) => ({
    teamId: Number(teamId),
    selectedOptionIndex:
      response && Number.isFinite(Number(response.selectedOptionIndex))
        ? Number(response.selectedOptionIndex)
        : -1,
    responseTime:
      response && Number.isFinite(Number(response.responseTime))
        ? Number(response.responseTime)
        : null,
  }));

  let majorityOptionIndexes = [];
  let voteCounts = {};
  if (round.type === ROUND_TYPES.MAJORITY_RULES) {
    voteCounts = responseDetails.reduce((acc, item) => {
      const idx = Number(item.selectedOptionIndex);
      if (Number.isFinite(idx) && idx >= 0) {
        acc[idx] = (acc[idx] || 0) + 1;
      }
      return acc;
    }, {});

    const maxVotes = Math.max(...Object.values(voteCounts), 0);
    if (maxVotes > 0) {
      majorityOptionIndexes = Object.entries(voteCounts)
        .filter(([, count]) => Number(count) === maxVotes)
        .map(([idx]) => Number(idx));
    }
  }

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.ANSWER_REVEAL, {
    correctOptionIndex: correctIndex,
    correctText: question.options[correctIndex]?.text,
    scores: result.scores,
    responseDetails,
    majorityOptionIndexes,
    voteCounts,
    eliminations: result.eliminations,
    allWrong: result.allWrong,
    teams: Object.values(gameState.teams).map((t) => ({
      teamId: t.teamId,
      teamName: t.teamName,
      score: t.score,
      isEliminated: t.isEliminated || false,
    })),
  });
  logger.info('Answer revealed', {
    pin,
    roundIndex: gameState.currentRoundIndex,
    questionIndex: gameState.currentQuestionIndex,
    correctOptionIndex: correctIndex,
    activeTeams: gameState.activeTeamIds.length,
    eliminations: result.eliminations.length,
    allWrong: result.allWrong,
  });
};

/**
 * End the current round and show scoreboard
 */
const endRound = async (io, pin, gameState) => {
  if (eliminationStates.has(pin)) {
    eliminationStates.delete(pin);
  }

  for (const teamId of Object.keys(gameState.teams)) {
    if (gameState.teams[teamId]) {
      gameState.teams[teamId].isEliminated = false;
    }
  }
  gameState.activeTeamIds = Object.keys(gameState.teams).map(Number);

  const result = stateMachine.transition(gameState, GAME_STATES.SCOREBOARD);
  if (!result.valid) return;

  await redisStore.setGameState(pin, result.gameState);
  persistScoresToDB(result.gameState.teams).catch((err) =>
    logger.error('Failed to persist team flags after round end', { pin, error: err.message }),
  );
  logger.info('Round ended', {
    pin,
    roundIndex: gameState.currentRoundIndex,
    totalTeams: Object.keys(result.gameState.teams).length,
  });

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.ROUND_END, {
    roundIndex: gameState.currentRoundIndex,
  });

  const sortedTeams = Object.values(result.gameState.teams).sort((a, b) => b.score - a.score);

  let revealSnapshot = null;
  try {
    revealSnapshot = await buildRevealSnapshot(pin, result.gameState);
  } catch (err) {
    logger.warn('buildRevealSnapshot failed (round_end scoreboard)', { pin, error: err.message });
  }

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.SCOREBOARD, {
    teams: sortedTeams,
    source: 'round_end',
    ...(revealSnapshot ? { revealSnapshot } : {}),
  });
};

/**
 * Advance to the next round
 */
const advanceToNextRound = async (io, pin) => {
  let gameState = await redisStore.getGameState(pin);
  if (!gameState) return;

  if (
    gameState.state === GAME_STATES.QUESTION &&
    gameState.questionState === QUESTION_STATES.REVEALED
  ) {
    const round = stateMachine.getCurrentRound(gameState);
    const qLen = round?.questions?.length ?? 0;
    const lastIdx = qLen > 0 ? qLen - 1 : -1;
    const onLastQuestion =
      lastIdx >= 0 && Number(gameState.currentQuestionIndex) === lastIdx;
    if (onLastQuestion) {
      await endRound(io, pin, gameState);
      gameState = await redisStore.getGameState(pin);
      if (!gameState) return;
    }
  }

  const advance = stateMachine.advanceRound(gameState);

  if (!advance.hasNext) {
    const finalResult = stateMachine.transition(gameState, GAME_STATES.FINAL_RESULTS);
    if (finalResult.valid) {
      await redisStore.setGameState(pin, finalResult.gameState);
      const sortedTeams = Object.values(finalResult.gameState.teams).sort(
        (a, b) => b.score - a.score,
      );
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.GAME_END, { teams: sortedTeams });
      logger.info('Final results emitted', {
        pin,
        totalTeams: sortedTeams.length,
      });

      persistScoresToDB(finalResult.gameState.teams).catch((err) =>
        logger.error('Failed to persist scores on natural game end', { pin, error: err.message }),
      );

      try {
        await Session.update(
          { status: 'completed' },
          { where: { pin, status: { [require('sequelize').Op.ne]: 'completed' } } },
        );
      } catch (err) {
        logger.error('Failed to mark session as completed', { pin, error: err.message });
      }

      setTimeout(async () => {
        try {
          await redisStore.cleanupSession(pin);
          const room = `session:${pin}`;
          const sockets = await io.in(room).fetchSockets();
          for (const s of sockets) {
            s.leave(room);
          }
          logger.info('Session destroyed', { pin });
        } catch (err) {
          logger.error('Failed to cleanup session', { pin, error: err.message });
        }
      }, 2000);
    }
    return;
  }

  gameState = advance.gameState;
  let roundIntroState = gameState;
  if (gameState.state !== GAME_STATES.ROUND_INTRO) {
    const transResult = stateMachine.transition(gameState, GAME_STATES.ROUND_INTRO);
    if (!transResult.valid) return;
    roundIntroState = transResult.gameState;
  } else {
    // When skipping from an empty ROUND_INTRO, keep ROUND_INTRO and hard-reset per-round pointers.
    roundIntroState = {
      ...gameState,
      state: GAME_STATES.ROUND_INTRO,
      questionState: QUESTION_STATES.WAITING,
      currentQuestionIndex: 0,
      responseCount: 0,
      timerRunning: false,
      timerRemaining: 0,
      eliminatedTeams: {},
    };
  }

  await redisStore.setGameState(pin, roundIntroState);
  logger.info('Advanced to round intro', {
    pin,
    roundIndex: roundIntroState.currentRoundIndex,
    totalRounds: roundIntroState.rounds.length,
  });

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.ROUND_INTRO, {
    round: stateMachine.getCurrentRound(roundIntroState),
    roundIndex: roundIntroState.currentRoundIndex,
    totalRounds: roundIntroState.rounds.length,
  });
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.SESSION_STATE, clientPayloadFromGameState(roundIntroState));
};

/**
 * Player socket gone (tab close, network loss, or leave_session). Team row and score stay in MySQL for rejoin;
 * removed from Redis lobby, live gameState, and host/venue UIs via team_removed.
 */
const handlePlayerSocketDisconnect = async (io, pin, teamIdRaw, options = {}) => {
  const teamId = Number(teamIdRaw);
  if (!pin || !Number.isFinite(teamId)) return;

  // Intentional leaves (player taps "Leave Game") should still purge — the team's score and
  // tracking row aren't useful once they've explicitly opted out. Transient socket drops
  // (default path) must NOT.
  const intentional = Boolean(options.intentional);

  await Team.update({ isConnected: false, socketId: null }, { where: { id: teamId } });

  const gameState = await redisStore.getGameState(pin);

  // Once the game is in flight, a transient socket drop (mobile sleep, Wi-Fi handoff, browser
  // throttling) MUST NOT erase the team — otherwise their score vanishes from the leaderboard
  // and they can't be auto-restored by socket reconnection. Only purge teams during LOBBY (where
  // the count gates the start-game flow), after the game ends, or on intentional leave.
  const isPreGameOrEnded =
    !gameState ||
    gameState.state === GAME_STATES.LOBBY ||
    gameState.state === GAME_STATES.FINAL_RESULTS;

  if (isPreGameOrEnded || intentional) {
    await redisStore.removeTeamFromLobby(pin, teamId);

    if (gameState) {
      if (gameState.teams && gameState.teams[teamId]) {
        delete gameState.teams[teamId];
      }
      gameState.activeTeamIds = (
        Array.isArray(gameState.activeTeamIds) ? gameState.activeTeamIds : []
      )
        .map(Number)
        .filter((id) => id !== teamId);
      gameState.totalTeams = Object.keys(gameState.teams || {}).length;
      await redisStore.setGameState(pin, gameState);
    }

    io.to(`session:${pin}`).emit(SOCKET_EVENTS.TEAM_REMOVED, { teamId });
    logger.info('Player socket disconnected during lobby/final — team removed', { pin, teamId });
    return;
  }

  // Mid-game disconnect: keep the team's score and slot. Socket.io reconnection (and our
  // join_session reconnect handler) will mark them connected again. Host can still manually
  // remove the team via the dashboard if they don't come back.
  if (gameState.teams && gameState.teams[teamId]) {
    gameState.teams[teamId] = {
      ...gameState.teams[teamId],
      isConnected: false,
    };
  }

  // Drop the team from the *active* answer cohort for the current question only — without this
  // a still-pending response from a disconnected team blocks auto-reveal — but keep them in the
  // leaderboard. They re-join the active set on the next round / reconnect.
  gameState.activeTeamIds = (
    Array.isArray(gameState.activeTeamIds) ? gameState.activeTeamIds : []
  )
    .map(Number)
    .filter((id) => id !== teamId);

  if (eliminationStates.has(pin)) {
    const es = eliminationStates.get(pin);
    es.activeTeamIds = (es.activeTeamIds || []).map(Number).filter((id) => id !== teamId);
  }

  await redisStore.setGameState(pin, gameState);

  if (
    gameState.state === GAME_STATES.QUESTION &&
    gameState.questionState === QUESTION_STATES.ACTIVE
  ) {
    const question = stateMachine.getCurrentQuestion(gameState);
    if (question) {
      const responsesRaw = await redisStore.getResponses(pin, question.id);
      const answeredAmongActive = countValidAnswersAmongTeamIds(
        responsesRaw,
        gameState.activeTeamIds,
      );
      gameState.responseCount = answeredAmongActive;
      await redisStore.setGameState(pin, gameState);
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.RESPONSE_COUNT, {
        count: answeredAmongActive,
        total: gameState.activeTeamIds.length,
      });
      io.to(`session:${pin}`).emit(
        SOCKET_EVENTS.LIVE_RESPONSE_UPDATE,
        buildLiveResponseStats(gameState, question, responsesRaw),
      );

      if (
        gameState.activeTeamIds.length > 0 &&
        answeredAmongActive >= gameState.activeTeamIds.length
      ) {
        timerManager.forceExpire(pin);
        io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_UPDATE, {
          remaining: 0,
          timerRunning: false,
        });
        io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_EXPIRED, {});
        gameState.timerRunning = false;
        gameState.timerRemaining = 0;
        await redisStore.setGameState(pin, gameState);
        io.to(`session:${pin}`).emit(SOCKET_EVENTS.AUTO_REVEAL, {});
      }
    }
  }

  // Do NOT emit TEAM_REMOVED mid-game — that erases the team from the host's responses and
  // leaderboard UIs. Emit team_updated instead so dashboards can dim/flag disconnected teams
  // without dropping them.
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.TEAM_UPDATED, {
    teamId,
    isConnected: false,
    score: gameState.teams?.[teamId]?.score ?? 0,
  });
  logger.info('Player socket disconnected mid-game — kept in scoreboard', { pin, teamId });
};

/**
 * Show scoreboard on demand
 */
const showScoreboard = async (io, pin) => {
  const gameState = await redisStore.getGameState(pin);
  if (!gameState) return;

  gameState.scoreboardVisible = true;
  await redisStore.setGameState(pin, gameState);

  const sortedTeams = Object.values(gameState.teams).sort((a, b) => b.score - a.score);
  let revealSnapshot = null;
  try {
    revealSnapshot = await buildRevealSnapshot(pin, gameState);
  } catch (err) {
    logger.warn('buildRevealSnapshot failed (manual scoreboard)', { pin, error: err.message });
  }
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.SCOREBOARD, {
    teams: sortedTeams,
    source: 'manual',
    ...(revealSnapshot ? { revealSnapshot } : {}),
  });
  logger.info('Leaderboard shown', { pin, teamCount: sortedTeams.length });
};

const hideScoreboard = async (io, pin) => {
  const gameState = await redisStore.getGameState(pin);
  if (gameState) {
    gameState.scoreboardVisible = false;
    await redisStore.setGameState(pin, gameState);
  }
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.SCOREBOARD_HIDDEN, {});
  logger.info('Leaderboard hidden', { pin });
};

/**
 * Start a break
 */
const startBreak = async (io, pin) => {
  let gameState = await redisStore.getGameState(pin);
  if (!gameState) return;
  if (gameState.state === GAME_STATES.BREAK) return;

  const timerState = timerManager.getTimerState(pin);
  const shouldPauseTimer =
    gameState.state === GAME_STATES.QUESTION &&
    gameState.questionState === QUESTION_STATES.ACTIVE &&
    timerState.running &&
    timerState.remaining > 0;

  if (shouldPauseTimer) {
    const remaining = timerManager.pauseTimer(pin);
    gameState.timerRemaining = remaining;
    gameState.timerRunning = false;
  }

  gameState.breakResumeState = {
    state: gameState.state,
    questionState: gameState.questionState,
    currentRoundIndex: gameState.currentRoundIndex,
    currentQuestionIndex: gameState.currentQuestionIndex,
    responseCount: gameState.responseCount,
    timerRemaining: shouldPauseTimer
      ? gameState.timerRemaining
      : Number.isFinite(Number(gameState.timerRemaining))
        ? Number(gameState.timerRemaining)
        : 0,
    timerRunning: shouldPauseTimer ? false : Boolean(gameState.timerRunning),
  };

  const result = stateMachine.transition(gameState, GAME_STATES.BREAK);
  if (!result.valid) return;

  const br = Math.max(
    0,
    Math.round(Number(result.gameState.breakRemaining ?? result.gameState.breakDuration ?? 360)),
  );
  const bd = Math.max(
    0,
    Math.round(Number(result.gameState.breakDuration ?? br)),
  );
  result.gameState.breakDuration = bd;
  result.gameState.breakRemaining = br;
  result.gameState.breakEndsAt = Date.now() + br * 1000;

  await redisStore.setGameState(pin, result.gameState);
  const serverNow = Date.now();
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.SESSION_STATE, {
    ...sanitizeForClients(result.gameState),
    serverNow,
  });
  const breakRem = getBreakRemainingSeconds(result.gameState);
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.BREAK_START, {
    duration: breakRem,
    breakDuration: bd,
    breakRemaining: breakRem,
    breakEndsAt: result.gameState.breakEndsAt,
    serverNow,
  });
  logger.info('Break started', {
    pin,
    breakDuration: result.gameState.breakDuration,
    resumeState: gameState.breakResumeState?.state,
  });
};

/**
 * End a break
 */
const endBreak = async (io, pin) => {
  let gameState = await redisStore.getGameState(pin);
  if (!gameState) return;
  if (gameState.state !== GAME_STATES.BREAK) return;

  const resume = gameState.breakResumeState;
  if (resume) {
    gameState.state = resume.state || GAME_STATES.ROUND_INTRO;
    gameState.questionState = resume.questionState ?? QUESTION_STATES.WAITING;
    if (Number.isFinite(Number(resume.currentRoundIndex))) {
      gameState.currentRoundIndex = Number(resume.currentRoundIndex);
    }
    if (Number.isFinite(Number(resume.currentQuestionIndex))) {
      gameState.currentQuestionIndex = Number(resume.currentQuestionIndex);
    }
    if (Number.isFinite(Number(resume.responseCount))) {
      gameState.responseCount = Number(resume.responseCount);
    }
    if (Number.isFinite(Number(resume.timerRemaining))) {
      gameState.timerRemaining = Number(resume.timerRemaining);
    }
    gameState.timerRunning = false;
    if (
      gameState.state === GAME_STATES.QUESTION &&
      gameState.questionState === QUESTION_STATES.REVEALED
    ) {
      gameState.timerRemaining = 0;
    }
    delete gameState.breakResumeState;
    delete gameState.breakEndsAt;
    gameState.breakRemaining = 0;

    await redisStore.setGameState(pin, gameState);
    io.to(`session:${pin}`).emit(SOCKET_EVENTS.BREAK_END, {});
    io.to(`session:${pin}`).emit(
      SOCKET_EVENTS.SESSION_STATE,
      clientPayloadFromGameState(gameState),
    );
    logger.info('Break ended and state restored', {
      pin,
      restoredState: gameState.state,
      questionState: gameState.questionState,
      roundIndex: gameState.currentRoundIndex,
      questionIndex: gameState.currentQuestionIndex,
    });

    if (gameState.state === GAME_STATES.QUESTION) {
      const round = stateMachine.getCurrentRound(gameState);
      const question = stateMachine.getCurrentQuestion(gameState);
      if (round && question) {
        const effectiveTimer = Number(question.timerDuration ?? round.timerDuration ?? 30) || 30;
        const trStored = Number(gameState.timerRemaining);
        const timerRemainingForEmit =
          gameState.questionState === QUESTION_STATES.REVEALED
            ? 0
            : Number.isFinite(trStored) && trStored >= 0
              ? trStored
              : effectiveTimer;
        if (gameState.questionState === QUESTION_STATES.ACTIVE) {
          const eliminatedTeamIdsBreak = Object.values(gameState.teams || {})
            .filter((t) => t && t.isEliminated)
            .map((t) => Number(t.teamId))
            .filter((id) => Number.isFinite(id));
          io.to(`session:${pin}`).emit(SOCKET_EVENTS.QUESTION_ACTIVE, {
            questionIndex: gameState.currentQuestionIndex,
            totalQuestions: round.questions.length,
            question: {
              id: question.id,
              text: question.text,
              options: question.options.map((o) => ({ text: o.text })),
              mediaUrl: question.mediaUrl,
              mediaType: question.mediaType,
            },
            timerDuration: effectiveTimer,
            timerRemaining: timerRemainingForEmit,
            roundType: round.type,
            eliminatedTeamIds: eliminatedTeamIdsBreak,
            pointsForQuestion:
              round.type === ROUND_TYPES.ELIMINATION
                ? require('shared/constants/scoring').getEliminationPoints(
                  gameState.currentQuestionIndex,
                )
                : null,
          });
          const responsesRaw = await redisStore.getResponses(pin, question.id);
          io.to(`session:${pin}`).emit(
            SOCKET_EVENTS.LIVE_RESPONSE_UPDATE,
            buildLiveResponseStats(gameState, question, responsesRaw),
          );
        }
      }
    }

    if (
      gameState.state === GAME_STATES.QUESTION &&
      gameState.questionState === QUESTION_STATES.ACTIVE &&
      Number(gameState.timerRemaining) > 0
    ) {
      const resumeRound = stateMachine.getCurrentRound(gameState);
      if (resumeRound?.type === ROUND_TYPES.MUSIC) {
        // Music rounds intentionally pair the countdown with audio/video playback — both must
        // begin together when the host hits "Start Timer". Auto-resuming on break end would
        // start the timer (and broadcast MUSIC_CONTROL play) without the host's input, so we
        // keep the timer paused here and emit a TIMER_UPDATE so all clients render the
        // "awaiting host timer" UI consistently with how the question first activated.
        io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_UPDATE, {
          remaining: Number(gameState.timerRemaining || 0),
          paused: true,
          timerRunning: false,
        });
        logger.info('Break ended during music question — leaving timer paused for host', {
          pin,
          roundIndex: gameState.currentRoundIndex,
          questionIndex: gameState.currentQuestionIndex,
          timerRemaining: gameState.timerRemaining,
        });
      } else {
        await startTimer(io, pin);
      }
    }
    return;
  }

  const result = stateMachine.transition(gameState, GAME_STATES.ROUND_INTRO);
  if (!result.valid) return;

  delete result.gameState.breakEndsAt;
  result.gameState.breakRemaining = 0;

  await redisStore.setGameState(pin, result.gameState);
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.BREAK_END, {});
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.SESSION_STATE, sanitizeForClients(result.gameState));
  logger.info('Break ended and returned to round intro', {
    pin,
    roundIndex: result.gameState.currentRoundIndex,
  });

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.ROUND_INTRO, {
    round: stateMachine.getCurrentRound(result.gameState),
    roundIndex: result.gameState.currentRoundIndex,
    totalRounds: result.gameState.rounds.length,
  });
};

/**
 * Launch a mini-game (anytime — not restricted to break).
 * Sets activeMiniGame without changing the main game state.
 */
const launchMiniGame = async (io, pin, gameType, config = {}) => {
  let gameState = await redisStore.getGameState(pin);

  // If launching from LOBBY, gameState might not exist yet
  if (!gameState) {
    const lobbyTeams = await redisStore.getLobbyTeams(pin);
    const teamsObj = {};
    for (const t of lobbyTeams) {
      teamsObj[t.teamId] = t;
    }

    // Attempt to fetch qrCodeData from session
    let qrCodeData = null;
    let maxTeams = lobbyTeams.length;
    try {
      const sessionUrl = await Session.findOne({ where: { pin } });
      if (sessionUrl) {
        qrCodeData = sessionUrl.qrCodeData;
        maxTeams = sessionUrl.maxTeams || lobbyTeams.length;
      }
    } catch (err) {
      logger.error('Failed to query session for qrCodeData', { error: err.message });
    }

    gameState = {
      state: GAME_STATES.LOBBY,
      questionState: null,
      currentRoundIndex: -1,
      currentQuestionIndex: -1,
      timerRemaining: 0,
      timerRunning: false,
      responseCount: 0,
      totalTeams: lobbyTeams.length,
      rounds: [],
      teams: teamsObj,
      activeTeamIds: lobbyTeams.map((t) => t.teamId),
      qrCodeData,
      maxTeams,
    };
  }

  const normalizedConfig = { ...(config || {}) };
  if (gameType === 'kangaroo_race') {
    if (!hasValidKangarooNames(config?.kangarooNames)) {
      throw new Error('Kangaroo race requires exactly 6 non-empty kangaroo names');
    }
    normalizedConfig.kangarooNames = normalizeKangarooNames(config?.kangarooNames);
  }

  gameState.activeMiniGame = gameType;
  gameState.miniGameConfig = normalizedConfig;
  gameState.miniGameState =
    gameType === 'card_shuffle'
      ? createCardShuffleState()
      : gameType === 'kangaroo_race'
        ? createHorseRaceState(normalizedConfig.kangarooNames)
        : { game: gameType };
  await redisStore.setGameState(pin, gameState);

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.SESSION_STATE, sanitizeForClients(gameState));
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.MINI_GAME_START, { game: gameType, ...normalizedConfig });
  logger.info('Mini game launched', { pin, gameType });
};

/**
 * Clear mini-game after Unity reports completion or host manually ends it.
 * Sends the winning config so venue/players can show the result screen.
 */
const endMiniGame = async (io, pin, overrideConfig = {}) => {
  const gameState = await redisStore.getGameState(pin);
  if (!gameState) return;

  const game = gameState.activeMiniGame;
  const config = { ...(gameState.miniGameConfig || {}), ...(overrideConfig || {}) };
  const holdScreen = config?.holdScreen === true;

  gameState.activeMiniGame = null;
  gameState.miniGameConfig = null;
  gameState.miniGameState = null;
  await redisStore.setGameState(pin, gameState);

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.MINI_GAME_END, { game, ...config });
  logger.info('Mini game ended', { pin, game, holdScreen });

  if (!holdScreen) {
    setTimeout(() => {
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.SESSION_STATE, sanitizeForClients(gameState));
    }, 5000);
  }
};

/**
 * Pause the timer
 */
const pauseTimer = async (io, pin) => {
  const remaining = timerManager.pauseTimer(pin);
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_UPDATE, {
    remaining,
    paused: true,
    timerRunning: false,
  });
  persistTimerRemainingIfActiveQuestion(pin, remaining);

  // Stop Timer in a music round must also stop the audio/video on host + venue. The
  // start-timer path (above) emits MUSIC_CONTROL `play`; we mirror that here so the projector's
  // MP3/MP4 element pauses in lock-step with the countdown. Players never receive audio, so this
  // is purely a venue/host concern, but emitting to the room is harmless on player clients.
  try {
    const gameState = await redisStore.getGameState(pin);
    const round = gameState ? stateMachine.getCurrentRound(gameState) : null;
    if (round?.type === ROUND_TYPES.MUSIC) {
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.MUSIC_CONTROL, { action: 'pause' });
    }
  } catch (err) {
    logger.warn('pauseTimer music_control echo failed', { error: err.message });
  }

  logger.info('Timer paused', { pin, remaining });
};

/**
 * Start/resume the timer
 */
const startTimer = async (io, pin) => {
  const timerState = timerManager.getTimerState(pin);
  if (!(timerState.remaining > 0 && !timerState.running)) return;

  logger.info('Timer resumed', { pin, remaining: timerState.remaining });
  timerManager.resumeTimer(
    pin,
    (remaining) => {
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_UPDATE, {
        remaining,
        timerRunning: true,
      });
      persistTimerRemainingIfActiveQuestion(pin, remaining);
    },
    async () => {
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_EXPIRED, {});
      const gs = await redisStore.getGameState(pin);
      if (gs) {
        gs.timerRunning = false;
        gs.timerRemaining = 0;
        await redisStore.setGameState(pin, gs);
      }
      logger.info('Timer expired for question on resumed timer, waiting for host to reveal', {
        pin,
      });
      // await revealAnswer(io, pin);
    },
  );

  let gameState = await redisStore.getGameState(pin);
  if (gameState) {
    gameState.timerRunning = true;
    gameState.timerRemaining = timerState.remaining;
    await redisStore.setGameState(pin, gameState);
  }
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_UPDATE, {
    remaining: timerState.remaining,
    paused: false,
    timerRunning: true,
  });

  if (gameState) {
    const round = stateMachine.getCurrentRound(gameState);
    if (round?.type === ROUND_TYPES.MUSIC) {
      const q = stateMachine.getCurrentQuestion(gameState);
      const mediaUrl = q?.mediaUrl || null;
      if (mediaUrl) {
        io.to(`session:${pin}`).emit(SOCKET_EVENTS.MUSIC_CONTROL, {
          action: 'play',
          mediaUrl,
        });
      }
    }
  }
};

/**
 * Force-end the game (host action). Persists scores and broadcasts final results.
 */
const endGame = async (io, pin) => {
  let gameState = await redisStore.getGameState(pin);
  if (!gameState) return;

  timerManager.stopTimer(pin);

  const finalResult = stateMachine.transition(gameState, GAME_STATES.FINAL_RESULTS);
  if (finalResult.valid) {
    gameState = finalResult.gameState;
  } else {
    gameState.state = GAME_STATES.FINAL_RESULTS;
  }

  await redisStore.setGameState(pin, gameState);

  const sortedTeams = Object.values(gameState.teams).sort((a, b) => b.score - a.score);
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.GAME_END, { teams: sortedTeams });

  persistScoresToDB(gameState.teams).catch((err) =>
    logger.error('Failed to persist scores on end_game', { pin, error: err.message }),
  );

  try {
    await Session.update(
      { status: 'completed' },
      { where: { pin, status: { [require('sequelize').Op.ne]: 'completed' } } },
    );
  } catch (err) {
    logger.error('Failed to mark session as completed', { pin, error: err.message });
  }

  setTimeout(async () => {
    try {
      await redisStore.cleanupSession(pin);
      const room = `session:${pin}`;
      const sockets = await io.in(room).fetchSockets();
      for (const s of sockets) {
        s.leave(room);
      }
      logger.info('Session destroyed', { pin });
    } catch (err) {
      logger.error('Failed to cleanup session', { pin, error: err.message });
    }
  }, 2000);

  logger.info('Game ended', { pin });
};

/**
 * Persist current scores from in-memory/Redis state back to DB.
 * Runs asynchronously — errors are logged but don't block the game.
 * @param {Record<string, {teamId: number, score: number}>} teams
 */
const persistScoresToDB = async (teams) => {
  const updates = Object.values(teams).map((t) =>
    Team.update(
      { score: t.score, isEliminated: Boolean(t.isEliminated) },
      { where: { id: t.teamId } },
    ),
  );
  await Promise.all(updates);
};

/**
 * Strip sensitive data before sending to clients
 */
const sanitizeForClients = (gameState) => {
  const sanitized = { ...gameState };
  if (sanitized.rounds) {
    sanitized.rounds = sanitized.rounds.map((r) => ({
      ...r,
      questions: r.questions.map((q) => ({
        id: q.id,
        text: q.text,
        optionCount: q.options.length,
        mediaUrl: q.mediaUrl,
        mediaType: q.mediaType,
      })),
    }));
  }
  return sanitized;
};

/** Full client payload for QUESTION (includes currentQuestion) — matches venue host_connect shape. */
const clientPayloadFromGameState = (gameState) => {
  const base = sanitizeForClients(gameState);
  if (
    gameState.state !== GAME_STATES.QUESTION &&
    gameState.state !== GAME_STATES.WAGER_COLLECTION
  ) {
    return base;
  }
  const round = stateMachine.getCurrentRound(gameState);
  const cq = stateMachine.getCurrentQuestion(gameState);
  if (!round || !cq) return base;
  base.currentQuestion = {
    questionIndex: gameState.currentQuestionIndex,
    totalQuestions: round.questions.length,
    question: {
      id: cq.id,
      text: cq.text,
      options: (cq.options || []).map((o) => ({ text: o.text })),
      mediaUrl: cq.mediaUrl,
      mediaType: cq.mediaType,
    },
    timerDuration: Number(cq.timerDuration ?? round.timerDuration ?? 30) || 30,
    roundType: round.type || '',
  };
  return base;
};

/**
 * Start wager collection phase for WAGER rounds.
 * Transitions ROUND_INTRO → WAGER_COLLECTION and tells mobile to show wager input.
 */
const startWagerCollection = async (io, pin) => {
  const gameState = await redisStore.getGameState(pin);
  if (!gameState) return;

  if (gameState.state !== GAME_STATES.ROUND_INTRO) {
    logger.warn('startWagerCollection called but state is not ROUND_INTRO', {
      pin,
      state: gameState.state,
    });
    return;
  }

  const round = stateMachine.getCurrentRound(gameState);
  if (!round || !isWagerLockRound(round)) {
    logger.warn('startWagerCollection called on non-wager round', {
      pin,
      roundType: round?.type,
    });
    return;
  }

  const result = stateMachine.transition(gameState, GAME_STATES.WAGER_COLLECTION);
  if (!result.valid) {
    logger.error('Failed to transition to WAGER_COLLECTION', { pin, error: result.error });
    return;
  }

  await redisStore.setGameState(pin, result.gameState);

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.WAGER_COLLECTION_START, {
    round: {
      id: round.id,
      name: round.name,
      type: round.type,
      timerDuration: round.timerDuration,
    },
    roundIndex: result.gameState.currentRoundIndex,
    totalRounds: result.gameState.rounds.length,
  });

  io.to(`session:${pin}`).emit(
    SOCKET_EVENTS.SESSION_STATE,
    clientPayloadFromGameState(result.gameState),
  );

  logger.info('Wager collection started', {
    pin,
    roundIndex: result.gameState.currentRoundIndex,
    roundType: round.type,
  });
};

module.exports = {
  startGame,
  nextQuestion,
  submitAnswer,
  submitWager,
  revealAnswer,
  endRound,
  advanceToNextRound,
  handlePlayerSocketDisconnect,
  showScoreboard,
  hideScoreboard,
  startBreak,
  endBreak,
  launchMiniGame,
  endMiniGame,
  pauseTimer,
  startTimer,
  endGame,
  startWagerCollection,
};
