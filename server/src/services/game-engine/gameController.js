const { GAME_STATES } = require('shared/constants/gameStates');
const { QUESTION_STATES } = require('shared/constants/questionStates');
const { ROUND_TYPES } = require('shared/constants/roundTypes');
const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const stateMachine = require('./stateMachine');
const { calculateScores } = require('./scoringEngine');
const knockoutEngine = require('./knockoutEngine');
const timerManager = require('./timerManager');
const redisStore = require('../redisSessionStore');
const { Team, Session } = require('../../models');
const logger = require('../../utils/logger');

const eliminationStates = new Map();

const clampWager = (amount) => {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(50, Math.round(parsed)));
};

const getRoundWagerForTeam = (gameState, roundId, teamId) => {
  return Number(gameState?.roundWagers?.[String(roundId)]?.[String(teamId)] ?? 0);
};

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

const buildLiveResponseStats = (gameState, question, responsesRaw = {}) => {
  const activeTeamIds = Array.isArray(gameState?.activeTeamIds) ? gameState.activeTeamIds : [];
  const total = activeTeamIds.length;
  const correctOptionIndex = (question?.options || []).findIndex((o) => o?.isCorrect);

  let correct = 0;
  let incorrect = 0;
  let noAnswer = 0;

  for (const teamId of activeTeamIds) {
    const key = String(teamId);
    const raw = responsesRaw[key];
    if (raw === undefined || raw === null) {
      noAnswer += 1;
      continue;
    }

    const selectedOptionIndex = parseSelectedOptionIndex(raw);
    if (selectedOptionIndex >= 0 && selectedOptionIndex === correctOptionIndex) {
      correct += 1;
    } else {
      incorrect += 1;
    }
  }

  return { correct, incorrect, noAnswer, total };
};

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

  gameState.totalTeams = teams.length;
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

  if (gameState.state === GAME_STATES.ROUND_INTRO || gameState.state === GAME_STATES.SCOREBOARD) {
    const transResult = stateMachine.transition(gameState, GAME_STATES.QUESTION);
    if (!transResult.valid) return;
    gameState = transResult.gameState;
  } else if (gameState.state === GAME_STATES.QUESTION && gameState.questionState === QUESTION_STATES.REVEALED) {
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
  const effectiveTimer = question.timerDuration || round.timerDuration;

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
    timerRemaining: effectiveTimer,
    roundType: round.type,
    pointsForQuestion: round.type === ROUND_TYPES.ELIMINATION
      ? require('shared/constants/scoring').getEliminationPoints(gameState.currentQuestionIndex)
      : null,
  });
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.LIVE_RESPONSE_UPDATE, {
    correct: 0,
    incorrect: 0,
    noAnswer: gameState.activeTeamIds.length,
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
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_UPDATE, { remaining });
    },
    async () => {
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_EXPIRED, {});
      const gs = await redisStore.getGameState(pin);
      if (gs) {
        gs.timerRunning = false;
        gs.timerRemaining = 0;
        await redisStore.setGameState(pin, gs);
      }
      logger.info('Timer expired for question, waiting for host to reveal', {
        pin,
        roundIndex: gs?.currentRoundIndex,
        questionIndex: gs?.currentQuestionIndex,
      });
      // await revealAnswer(io, pin);
    },
  );
};

/**
 * Handle a team's answer submission
 */
const submitAnswer = async (io, pin, teamId, data) => {
  const gameState = await redisStore.getGameState(pin);
  if (!gameState || gameState.questionState !== QUESTION_STATES.ACTIVE) return;

  const question = stateMachine.getCurrentQuestion(gameState);
  if (!question) return;

  const existing = await redisStore.getResponses(pin, question.id);
  if (existing[teamId.toString()]) return;

  const responseData = {
    selectedOptionIndex: data.selectedOptionIndex,
    wagerAmount: data.wagerAmount,
    responseTime:
      Number.isFinite(Number(gameState.timerRemaining)) && Number.isFinite(Number(question.timerDuration))
        ? Math.max(0, Number(question.timerDuration) - Number(gameState.timerRemaining))
        : null,
  };

  const currentRound = stateMachine.getCurrentRound(gameState);
  if (currentRound?.type === ROUND_TYPES.WAGER) {
    responseData.wagerAmount = getRoundWagerForTeam(gameState, currentRound.id, teamId);
  }
  await redisStore.recordResponse(pin, question.id, teamId, JSON.stringify(responseData));

  const count = await redisStore.getResponseCount(pin, question.id);
  gameState.responseCount = count;
  await redisStore.setGameState(pin, gameState);

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
    
    io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_UPDATE, { remaining: 0 });
    io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_EXPIRED, {});
    
    gameState.timerRunning = false;
    gameState.timerRemaining = 0;
    await redisStore.setGameState(pin, gameState);

    io.to(`session:${pin}`).emit(SOCKET_EVENTS.AUTO_REVEAL, {});
    // await revealAnswer(io, pin);
  }
};

/**
 * Handle a team's wager submission (locked once per WAGER round).
 */
const submitWager = async (pin, teamId, amount) => {
  const gameState = await redisStore.getGameState(pin);
  if (!gameState) return;

  const round = stateMachine.getCurrentRound(gameState);
  if (!round || round.type !== ROUND_TYPES.WAGER) return;

  const roundId = String(round.id);
  const teamIdKey = String(teamId);
  const locked = gameState.roundWagers?.[roundId]?.[teamIdKey];
  if (locked !== undefined && locked !== null) {
    return;
  }

  const wager = clampWager(amount);
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
  if (gameState.state !== GAME_STATES.QUESTION || gameState.questionState !== QUESTION_STATES.ACTIVE) {
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
    if (round.type === ROUND_TYPES.WAGER) {
      responses[tid].wagerAmount = getRoundWagerForTeam(gameState, round.id, tid);
    } else if (isWagerRound && responses[tid].wagerAmount === undefined) {
      responses[tid].wagerAmount = 0;
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
    elimState = knockoutEngine.processElimination(elimState, result, gameState.currentQuestionIndex);
    eliminationStates.set(pin, elimState);

    gameState.activeTeamIds = elimState.activeTeamIds;

    for (const teamId of result.eliminations) {
      if (gameState.teams[teamId]) {
        gameState.teams[teamId].isEliminated = true;
      }
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.PLAYER_ELIMINATED, { teamId });
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

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.ANSWER_REVEAL, {
    correctOptionIndex: correctIndex,
    correctText: question.options[correctIndex]?.text,
    scores: result.scores,
    responseDetails,
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
  logger.info('Round ended', {
    pin,
    roundIndex: gameState.currentRoundIndex,
    totalTeams: Object.keys(result.gameState.teams).length,
  });

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.ROUND_END, {
    roundIndex: gameState.currentRoundIndex,
  });

  const sortedTeams = Object.values(result.gameState.teams)
    .sort((a, b) => b.score - a.score);

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.SCOREBOARD, {
    teams: sortedTeams,
    source: 'round_end',
  });
};

/**
 * Advance to the next round
 */
const advanceToNextRound = async (io, pin) => {
  let gameState = await redisStore.getGameState(pin);
  if (!gameState) return;

  const advance = stateMachine.advanceRound(gameState);

  if (!advance.hasNext) {
    const finalResult = stateMachine.transition(gameState, GAME_STATES.FINAL_RESULTS);
    if (finalResult.valid) {
      await redisStore.setGameState(pin, finalResult.gameState);
      const sortedTeams = Object.values(finalResult.gameState.teams).sort((a, b) => b.score - a.score);
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
  const transResult = stateMachine.transition(gameState, GAME_STATES.ROUND_INTRO);
  if (!transResult.valid) return;

  await redisStore.setGameState(pin, transResult.gameState);
  logger.info('Advanced to round intro', {
    pin,
    roundIndex: transResult.gameState.currentRoundIndex,
    totalRounds: transResult.gameState.rounds.length,
  });

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.ROUND_INTRO, {
    round: stateMachine.getCurrentRound(transResult.gameState),
    roundIndex: transResult.gameState.currentRoundIndex,
    totalRounds: transResult.gameState.rounds.length,
  });
};

/**
 * Show scoreboard on demand
 */
const showScoreboard = async (io, pin) => {
  const gameState = await redisStore.getGameState(pin);
  if (!gameState) return;

  const sortedTeams = Object.values(gameState.teams).sort((a, b) => b.score - a.score);
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.SCOREBOARD, { teams: sortedTeams, source: 'manual' });
  logger.info('Scoreboard shown', { pin, teamCount: sortedTeams.length });
};

const hideScoreboard = async (io, pin) => {
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.SCOREBOARD_HIDDEN, {});
  logger.info('Scoreboard hidden', { pin });
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
    timerRemaining:
      shouldPauseTimer
        ? gameState.timerRemaining
        : Number.isFinite(Number(gameState.timerRemaining))
          ? Number(gameState.timerRemaining)
          : 0,
    timerRunning: shouldPauseTimer ? false : Boolean(gameState.timerRunning),
  };

  const result = stateMachine.transition(gameState, GAME_STATES.BREAK);
  if (!result.valid) return;

  await redisStore.setGameState(pin, result.gameState);
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.SESSION_STATE, sanitizeForClients(result.gameState));
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.BREAK_START, {
    duration: result.gameState.breakDuration,
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
    delete gameState.breakResumeState;

    await redisStore.setGameState(pin, gameState);
    io.to(`session:${pin}`).emit(SOCKET_EVENTS.BREAK_END, {});
    io.to(`session:${pin}`).emit(SOCKET_EVENTS.SESSION_STATE, sanitizeForClients(gameState));
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
        const effectiveTimer = Number(question.timerDuration || round.timerDuration || 30);
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
          timerRemaining:
            Number.isFinite(Number(gameState.timerRemaining)) && Number(gameState.timerRemaining) > 0
              ? Number(gameState.timerRemaining)
              : effectiveTimer,
          roundType: round.type,
          pointsForQuestion:
            round.type === ROUND_TYPES.ELIMINATION
              ? require('shared/constants/scoring').getEliminationPoints(gameState.currentQuestionIndex)
              : null,
        });
        const responsesRaw = await redisStore.getResponses(pin, question.id);
        io.to(`session:${pin}`).emit(
          SOCKET_EVENTS.LIVE_RESPONSE_UPDATE,
          buildLiveResponseStats(gameState, question, responsesRaw),
        );
      }
    }

    if (
      gameState.state === GAME_STATES.QUESTION &&
      gameState.questionState === QUESTION_STATES.ACTIVE &&
      Number(gameState.timerRemaining) > 0
    ) {
      await startTimer(io, pin);
    }
    return;
  }

  const result = stateMachine.transition(gameState, GAME_STATES.ROUND_INTRO);
  if (!result.valid) return;

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
    try {
      const sessionUrl = await Session.findOne({ where: { pin } });
      if (sessionUrl) qrCodeData = sessionUrl.qrCodeData;
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
    };
  }

  gameState.activeMiniGame = gameType;
  gameState.miniGameConfig = config;
  await redisStore.setGameState(pin, gameState);

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.SESSION_STATE, sanitizeForClients(gameState));
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.MINI_GAME_START, { game: gameType, ...config });
  logger.info('Mini game launched', { pin, gameType });
};

/**
 * Clear mini-game after Unity reports completion or host manually ends it.
 * Sends the winning config so venue/players can show the result screen.
 */
const endMiniGame = async (io, pin) => {
  const gameState = await redisStore.getGameState(pin);
  if (!gameState) return;

  const game = gameState.activeMiniGame;
  const config = gameState.miniGameConfig || {};

  gameState.activeMiniGame = null;
  gameState.miniGameConfig = null;
  await redisStore.setGameState(pin, gameState);

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.MINI_GAME_END, { game, ...config });
  logger.info('Mini game ended', { pin, game });

  setTimeout(() => {
    io.to(`session:${pin}`).emit(SOCKET_EVENTS.SESSION_STATE, sanitizeForClients(gameState));
  }, 5000);
};

/**
 * Pause the timer
 */
const pauseTimer = async (io, pin) => {
  const remaining = timerManager.pauseTimer(pin);
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_UPDATE, { remaining, paused: true });
  logger.info('Timer paused', { pin, remaining });
};

/**
 * Start/resume the timer
 */
const startTimer = async (io, pin) => {
  const timerState = timerManager.getTimerState(pin);
  if (timerState.remaining > 0 && !timerState.running) {
    logger.info('Timer resumed', { pin, remaining: timerState.remaining });
    timerManager.resumeTimer(
      pin,
      (remaining) => {
        io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_UPDATE, { remaining });
      },
      async () => {
        io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_EXPIRED, {});
        const gs = await redisStore.getGameState(pin);
        if (gs) {
          gs.timerRunning = false;
          gs.timerRemaining = 0;
          await redisStore.setGameState(pin, gs);
        }
        logger.info('Timer expired for question on resumed timer, waiting for host to reveal', { pin });
        // await revealAnswer(io, pin);
      },
    );
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
    Team.update({ score: t.score }, { where: { id: t.teamId } }),
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

module.exports = {
  startGame,
  nextQuestion,
  submitAnswer,
  submitWager,
  revealAnswer,
  endRound,
  advanceToNextRound,
  showScoreboard,
  hideScoreboard,
  startBreak,
  endBreak,
  launchMiniGame,
  endMiniGame,
  pauseTimer,
  startTimer,
  endGame,
};
