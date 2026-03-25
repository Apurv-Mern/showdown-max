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
    roundType: round.type,
    pointsForQuestion: round.type === ROUND_TYPES.ELIMINATION
      ? require('shared/constants/scoring').getEliminationPoints(gameState.currentQuestionIndex)
      : null,
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
      await revealAnswer(io, pin);
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
  };
  await redisStore.recordResponse(pin, question.id, teamId, JSON.stringify(responseData));

  const count = await redisStore.getResponseCount(pin, question.id);
  gameState.responseCount = count;
  await redisStore.setGameState(pin, gameState);

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.RESPONSE_COUNT, {
    count,
    total: gameState.totalTeams,
  });

  if (count >= gameState.activeTeamIds.length) {
    timerManager.forceExpire(pin);
    io.to(`session:${pin}`).emit(SOCKET_EVENTS.AUTO_REVEAL, {});
    await revealAnswer(io, pin);
  }
};

/**
 * Host reveals the answer
 */
const revealAnswer = async (io, pin) => {
  let gameState = await redisStore.getGameState(pin);
  if (!gameState) return;

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
    if (isWagerRound && responses[tid].wagerAmount === undefined) {
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

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.ANSWER_REVEAL, {
    correctOptionIndex: correctIndex,
    correctText: question.options[correctIndex]?.text,
    scores: result.scores,
    eliminations: result.eliminations,
    allWrong: result.allWrong,
    teams: Object.values(gameState.teams).map((t) => ({
      teamId: t.teamId,
      teamName: t.teamName,
      score: t.score,
      isEliminated: t.isEliminated || false,
    })),
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

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.ROUND_END, {
    roundIndex: gameState.currentRoundIndex,
  });

  const sortedTeams = Object.values(result.gameState.teams)
    .sort((a, b) => b.score - a.score);

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.SCOREBOARD, {
    teams: sortedTeams,
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
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.SCOREBOARD, { teams: sortedTeams });
};

/**
 * Start a break
 */
const startBreak = async (io, pin) => {
  let gameState = await redisStore.getGameState(pin);
  if (!gameState) return;

  const result = stateMachine.transition(gameState, GAME_STATES.BREAK);
  if (!result.valid) return;

  await redisStore.setGameState(pin, result.gameState);
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.BREAK_START, {
    duration: result.gameState.breakDuration,
  });
};

/**
 * End a break
 */
const endBreak = async (io, pin) => {
  let gameState = await redisStore.getGameState(pin);
  if (!gameState) return;

  const result = stateMachine.transition(gameState, GAME_STATES.ROUND_INTRO);
  if (!result.valid) return;

  await redisStore.setGameState(pin, result.gameState);
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.BREAK_END, {});

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.ROUND_INTRO, {
    round: stateMachine.getCurrentRound(result.gameState),
    roundIndex: result.gameState.currentRoundIndex,
    totalRounds: result.gameState.rounds.length,
  });
};

/**
 * Launch a mini-game during break
 */
const launchMiniGame = async (io, pin, gameType, config = {}) => {
  let gameState = await redisStore.getGameState(pin);
  if (!gameState) return;

  if (gameState.state === GAME_STATES.BREAK) {
    const result = stateMachine.transition(gameState, GAME_STATES.MINI_GAME);
    if (!result.valid) return;
    result.gameState.activeMiniGame = gameType;
    await redisStore.setGameState(pin, result.gameState);
  } else {
    gameState.activeMiniGame = gameType;
    await redisStore.setGameState(pin, gameState);
  }

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.MINI_GAME_START, { game: gameType, ...config });
};

/**
 * Pause the timer
 */
const pauseTimer = async (io, pin) => {
  const remaining = timerManager.pauseTimer(pin);
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_UPDATE, { remaining, paused: true });
};

/**
 * Start/resume the timer
 */
const startTimer = async (io, pin) => {
  const timerState = timerManager.getTimerState(pin);
  if (timerState.remaining > 0 && !timerState.running) {
    timerManager.resumeTimer(
      pin,
      (remaining) => {
        io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_UPDATE, { remaining });
      },
      async () => {
        io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_EXPIRED, {});
        await revealAnswer(io, pin);
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
  revealAnswer,
  endRound,
  advanceToNextRound,
  showScoreboard,
  startBreak,
  endBreak,
  launchMiniGame,
  pauseTimer,
  startTimer,
  endGame,
};
