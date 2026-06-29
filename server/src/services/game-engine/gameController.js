const { GAME_STATES } = require('shared/constants/gameStates');
const { QUESTION_STATES } = require('shared/constants/questionStates');
const { ROUND_TYPES } = require('shared/constants/roundTypes');
const { SCORING, getEliminationPoints } = require('shared/constants/scoring');
const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const {
  DEFAULT_KANGAROO_NAMES,
  KANGAROO_NAME_MAX_LENGTH,
  KANGAROO_SLOT_COUNT,
  resolveKangarooNamesInput,
} = require('shared/constants/kangarooRace');
const stateMachine = require('./stateMachine');
const { calculateScores } = require('./scoringEngine');
const knockoutEngine = require('./knockoutEngine');
const timerManager = require('./timerManager');
const redisStore = require('../redisSessionStore');
const { buildRevealSnapshot } = require('../revealSnapshot');
const { purgeTeamFromLiveSession } = require('../purgeTeamFromLiveSession');
const { Team, Session } = require('../../models');
const logger = require('../../utils/logger');
const { getBreakRemainingSeconds, getBreakUpNextRoundPayload } = require('../../utils/breakWallClock');
const { normalizeTeamName } = require('../../utils/teamName');
const { mapClientQuestionPayload } = require('../../utils/clientQuestionPayload');

const eliminationStates = new Map();

/** Passive socket drops (e.g. refresh) schedule a delayed purge; `join_session` cancels it. */
const disconnectPurgeTimers = new Map();
const DISCONNECT_PURGE_DELAY_MS = Math.max(
  10000,
  Math.min(3600000, Number(process.env.DISCONNECT_PURGE_DELAY_MS) || 1800000),
);

const disconnectPurgeKey = (pin, teamId) => `${String(pin)}:${Number(teamId)}`;

/** Debounce Redis timer writes — the ticker fires every second and was cloning full game state each tick. */
const timerPersistDebouncers = new Map();

const flushTimerPersistRemaining = (pin) => {
  const pinKey = String(pin);
  const entry = timerPersistDebouncers.get(pinKey);
  if (!entry) return;
  if (entry.timeout) {
    clearTimeout(entry.timeout);
    entry.timeout = null;
  }
  const remaining = entry.lastRemaining;
  timerPersistDebouncers.delete(pinKey);
  if (remaining == null) return;
  redisStore
    .getGameState(pinKey)
    .then((gs) => {
      if (!gs || gs.state !== GAME_STATES.QUESTION) return null;
      if (gs.questionState !== QUESTION_STATES.ACTIVE) return null;
      return redisStore.updateGameState(pinKey, {
        timerRemaining: Math.max(0, Number(remaining) || 0),
      });
    })
    .catch(() => {});
};

const cancelScheduledDisconnectPurge = (pin, teamId) => {
  const key = disconnectPurgeKey(pin, teamId);
  const t = disconnectPurgeTimers.get(key);
  if (t) {
    clearTimeout(t);
    disconnectPurgeTimers.delete(key);
  }
};

const clampAmount = (amount, min, max) => {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(min, Math.min(max, Math.round(parsed)));
};

/** Wall-clock end for player clients when a countdown is running. */
const timerEndsAtFromRemaining = (remaining) => {
  const rem = Math.max(0, Math.floor(Number(remaining)) || 0);
  return rem > 0 ? Date.now() + rem * 1000 : null;
};

/** Keep Redis `timerRemaining` aligned with the in-memory ticker (reconnect / venue / host). */
const persistTimerRemainingIfActiveQuestion = (pin, remaining, { immediate = false } = {}) => {
  const pinKey = String(pin);
  const rem = Math.max(0, Number(remaining) || 0);
  let entry = timerPersistDebouncers.get(pinKey);
  if (!entry) {
    entry = { timeout: null, lastRemaining: null };
    timerPersistDebouncers.set(pinKey, entry);
  }
  entry.lastRemaining = rem;
  if (immediate) {
    flushTimerPersistRemaining(pinKey);
    return;
  }
  if (entry.timeout) return;
  entry.timeout = setTimeout(() => {
    entry.timeout = null;
    flushTimerPersistRemaining(pinKey);
  }, 3000);
};

const clampWagerByRoundType = (roundType, amount) => {
  const rt = String(roundType || '').toUpperCase();
  if (rt === ROUND_TYPES.FINAL_WAGER) {
    return clampAmount(amount, SCORING.FINAL_WAGER.MIN_PERCENT, SCORING.FINAL_WAGER.MAX_PERCENT);
  }

  return clampAmount(amount, SCORING.WAGER.MIN, SCORING.WAGER.MAX);
};

const getRoundWagerForTeam = (gameState, roundId, teamId) => {
  return Number(gameState?.roundWagers?.[String(roundId)]?.[String(teamId)] ?? 0);
};

/**
 * Per-question wager lookup. Falls back to legacy roundWagers if this question hasn't been
 * locked yet (mostly for sessions started before the per-question refactor and edge cases
 * during the migration window).
 */
const getQuestionWagerForTeam = (gameState, questionId, teamId, roundId) => {
  const perQ = gameState?.questionWagers?.[String(questionId)]?.[String(teamId)];
  if (perQ !== undefined && perQ !== null) return Number(perQ);
  if (roundId != null) {
    const legacy = gameState?.roundWagers?.[String(roundId)]?.[String(teamId)];
    if (legacy !== undefined && legacy !== null) return Number(legacy);
  }
  return 0;
};

const isQuestionWagerLocked = (gameState, questionId, teamId) => {
  const value = gameState?.questionWagers?.[String(questionId)]?.[String(teamId)];
  return value !== undefined && value !== null;
};

const isWagerLockRound = (round) => {
  const t = String(round?.type || '').toUpperCase();
  return t === ROUND_TYPES.WAGER || t === ROUND_TYPES.FINAL_WAGER;
};

/** Count distinct teams that have locked a wager for the given question. */
const countLockedWagers = (gameState, questionId) => {
  if (questionId == null) return 0;
  const bucket = gameState?.questionWagers?.[String(questionId)];
  if (!bucket || typeof bucket !== 'object') return 0;
  let n = 0;
  for (const key of Object.keys(bucket)) {
    if (bucket[key] !== undefined && bucket[key] !== null) n += 1;
  }
  return n;
};

/**
 * Emit the wager-lock progress for the current question. No-op outside a wager-lock round
 * (cheap guard so we don't broadcast bogus zeroes during regular rounds).
 */
const emitWagerLockUpdate = (io, pin, gameState) => {
  if (!io || !gameState) return;
  const round = stateMachine.getCurrentRound(gameState);
  if (!isWagerLockRound(round)) return;
  const question = stateMachine.getCurrentQuestion(gameState);
  if (!question?.id) return;
  const locked = countLockedWagers(gameState, question.id);
  const total = resolveActiveTeamIdsForStats(gameState).length;
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.WAGER_LOCK_UPDATE, {
    questionId: question.id,
    locked,
    total,
    roundType: round.type,
  });
};

const parseSelectedOptionIndex = (rawResponse) => {
  if (!rawResponse) return -1;
  try {
    const parsed = JSON.parse(rawResponse);
    if (Array.isArray(parsed.selectedOptionIndex)) {
      return parsed.selectedOptionIndex;
    }
    const selected = Number(parsed.selectedOptionIndex);
    return Number.isFinite(selected) ? selected : -1;
  } catch {
    const selected = Number(rawResponse);
    return Number.isFinite(selected) ? selected : -1;
  }
};

/** Teams eligible to answer — prefer `activeTeamIds`, fall back to `teams` map (break resume, legacy state). */
const resolveActiveTeamIdsForStats = (gameState) => {
  const fromActive = (Array.isArray(gameState?.activeTeamIds) ? gameState.activeTeamIds : [])
    .map(Number)
    .filter((id) => Number.isFinite(id));
  if (fromActive.length > 0) return fromActive;
  return Object.keys(gameState?.teams || {})
    .map(Number)
    .filter((id) => Number.isFinite(id));
};

const isTeamEliminatedInState = (gameState, teamId) =>
  Boolean(
    gameState?.teams?.[teamId]?.isEliminated ?? gameState?.teams?.[String(teamId)]?.isEliminated,
  );

/** Late joiners / roster sync: enroll a non-eliminated team into the elimination active roster. */
const ensureEliminationActiveTeam = (gameState, teamId) => {
  const id = Number(teamId);
  if (!Number.isFinite(id) || isTeamEliminatedInState(gameState, id)) return gameState;
  const active = resolveActiveTeamIdsForStats(gameState);
  if (active.includes(id)) return gameState;
  return { ...gameState, activeTeamIds: [...active, id] };
};

/** Keep in-memory knockout state aligned when teams join mid elimination round. */
const syncEliminationStateActiveRoster = (pin, gameState) => {
  const elimState = eliminationStates.get(pin);
  if (!elimState) return;
  const active = resolveActiveTeamIdsForStats(gameState);
  const merged = [...(elimState.activeTeamIds || []).map(Number).filter((id) => Number.isFinite(id))];
  for (const id of active) {
    if (!merged.includes(id) && !isTeamEliminatedInState(gameState, id)) {
      merged.push(id);
    }
  }
  elimState.activeTeamIds = merged;
  eliminationStates.set(pin, elimState);
};

/** Any team that submitted for this question must be scored (and eligible for knockout). */
const mergeEliminationRespondersIntoActive = (gameState, responses) => {
  const round = stateMachine.getCurrentRound(gameState);
  if (round?.type !== ROUND_TYPES.ELIMINATION) return gameState;
  let next = gameState;
  for (const teamIdStr of Object.keys(responses || {})) {
    const id = Number(teamIdStr);
    if (!Number.isFinite(id)) continue;
    next = ensureEliminationActiveTeam(next, id);
  }
  return next;
};

/** Answers among a specific team-id list (used after a disconnect shrinks `activeTeamIds`). */
const countValidAnswersAmongTeamIds = (responsesRaw, teamIds) => {
  if (!responsesRaw || !Array.isArray(teamIds)) return 0;
  let n = 0;
  for (const tid of teamIds) {
    const raw = responsesRaw[String(tid)];
    if (raw === undefined || raw === null || raw === '') continue;
    const parsed = parseSelectedOptionIndex(raw);
    if (Array.isArray(parsed) ? parsed.length > 0 : parsed >= 0) n += 1;
  }
  return n;
};

const buildLiveResponseStats = (gameState, question, responsesRaw = {}) => {
  const activeTeamIds = resolveActiveTeamIdsForStats(gameState);
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
    if (
      Array.isArray(selectedOptionIndex) ? selectedOptionIndex.length > 0 : selectedOptionIndex >= 0
    ) {
      if (Array.isArray(selectedOptionIndex)) {
        // Track ordering answers for stats (just to know they answered, the histogram may not mean much)
        const isOrdering = question?.options?.some((o) => o.correctOrder !== undefined);
        if (isOrdering) {
          const expectedOrder = [...question.options]
            .map((o, idx) => ({ idx, order: o.correctOrder }))
            .sort((a, b) => a.order - b.order)
            .map((x) => x.idx);
          if (JSON.stringify(selectedOptionIndex) === JSON.stringify(expectedOrder)) {
            correct += 1;
          }
          // We push dummy 0 to answeredSelections so `incorrect` math at the end still counts this
          answeredSelections.push(0);
        }
      } else {
        answeredSelections.push(selectedOptionIndex);
        voteCounts[selectedOptionIndex] = (voteCounts[selectedOptionIndex] || 0) + 1;

        if (
          roundType !== ROUND_TYPES.MAJORITY_RULES &&
          selectedOptionIndex === correctOptionIndex
        ) {
          correct += 1;
        }
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
  const rawNames = resolveKangarooNamesInput(Array.isArray(input) ? input : []);
  const names = [];
  for (let i = 0; i < KANGAROO_SLOT_COUNT; i += 1) {
    const fallback = DEFAULT_KANGAROO_NAMES[i] || `Kangaroo #${i + 1}`;
    const raw = rawNames[i];
    const normalized =
      typeof raw === 'string'
        ? raw.trim().replace(/\s+/g, ' ').slice(0, KANGAROO_NAME_MAX_LENGTH)
        : '';
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
  const teams = await redisStore.getAllTeamsData(pin);
  const session = await Session.findByPk(sessionId);

  gameState.totalTeams = teams.length;
  gameState.maxTeams = session?.maxTeams || teams.length;
  // Persist admin-configured break duration into the live game state so subsequent
  // `startBreak` / `BREAK_START` payloads use it without re-querying the DB.
  gameState.breakDuration = Number.isFinite(Number(session?.breakDuration))
    ? Number(session.breakDuration)
    : 360;
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

  const blocklist = await redisStore.getHostRemovalBlocklist(pin);
  if (blocklist.teamNames.length || blocklist.teamIds.length) {
    result.gameState.removedTeamNames = Array.from(
      new Set([
        ...(result.gameState.removedTeamNames || []).map((n) => normalizeTeamName(n)),
        ...blocklist.teamNames,
      ]),
    ).filter(Boolean);
    result.gameState.removedTeamIds = Array.from(
      new Set([...(result.gameState.removedTeamIds || []).map(Number), ...blocklist.teamIds]),
    ).filter(Number.isFinite);
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

  if (
    gameState.state === GAME_STATES.QUESTION &&
    gameState.questionState === QUESTION_STATES.ACTIVE
  ) {
    logger.debug('nextQuestion ignored while question is active', { pin });
    return;
  }

  const liveTimer = timerManager.getTimerState(pin);
  if (
    gameState.state === GAME_STATES.QUESTION &&
    gameState.questionState !== QUESTION_STATES.REVEALED &&
    timerManager.hasLiveTimer(pin) &&
    liveTimer.remaining > 0
  ) {
    logger.debug('nextQuestion ignored while question timer is live', {
      pin,
      remaining: liveTimer.remaining,
      questionState: gameState.questionState,
    });
    return;
  }

  if (gameState.state === GAME_STATES.BREAK) {
    await endBreak(io, pin);
    gameState = await redisStore.getGameState(pin);
    if (!gameState) return;
  }

  // Host pressed "Next" while sitting on the new "Round Over" transition screen.
  // Advance to the scoreboard (which will then advance to the next round intro).
  if (gameState.state === GAME_STATES.ROUND_END) {
    await proceedFromRoundEnd(io, pin);
    return;
  }

  if (gameState.state === GAME_STATES.GAME_SHOW_END) {
    await proceedFromGameShowEnd(io, pin);
    return;
  }

  if (gameState.state === GAME_STATES.ROUND_INTRO) {
    const round = stateMachine.getCurrentRound(gameState);
    if (isWagerLockRound(round)) {
      await startQuestionWagerCollection(io, pin);
      return;
    }
    const transResult = stateMachine.transition(gameState, GAME_STATES.QUESTION);
    if (!transResult.valid) return;
    gameState = transResult.gameState;
  } else if (gameState.state === GAME_STATES.WAGER_COLLECTION) {
    // Host pressed "Start Question" after wager collection: open the upcoming question.
    const transResult = stateMachine.transition(gameState, GAME_STATES.QUESTION);
    if (!transResult.valid) return;
    gameState = transResult.gameState;
  } else if (gameState.state === GAME_STATES.SCOREBOARD) {
    // Post-round scoreboard — advance to the next round intro, never reopen the
    // last question at the same index.
    await advanceToNextRound(io, pin);
    return;
  } else if (
    gameState.state === GAME_STATES.QUESTION &&
    gameState.questionState === QUESTION_STATES.REVEALED
  ) {
    const round = stateMachine.getCurrentRound(gameState);

    // Elimination: once only one (or zero) teams remain, close the round here instead of
    // walking the host through the rest of the questions.
    if (round?.type === ROUND_TYPES.ELIMINATION && gameState.eliminationEndEarly) {
      logger.info('Elimination round ending early on host Next press', {
        pin,
        roundIndex: gameState.currentRoundIndex,
      });
      await endRound(io, pin, gameState);
      return;
    }

    // Per-question wager lock: re-enter WAGER_COLLECTION for the upcoming question instead
    // of activating it directly.
    if (isWagerLockRound(round)) {
      await startQuestionWagerCollection(io, pin);
      return;
    }

    const advance = stateMachine.advanceQuestion(gameState);
    if (!advance.hasNext) {
      await endRound(io, pin, gameState);
      return;
    }
    gameState = advance.gameState;
  }

  gameState = stateMachine.activateQuestion(gameState);
  const rosterIds = resolveActiveTeamIdsForStats(gameState);
  if (
    rosterIds.length > 0 &&
    (!Array.isArray(gameState.activeTeamIds) || gameState.activeTeamIds.length === 0)
  ) {
    gameState.activeTeamIds = rosterIds;
  }
  await redisStore.setGameState(pin, gameState);

  const question = stateMachine.getCurrentQuestion(gameState);
  const round = stateMachine.getCurrentRound(gameState);
  const effectiveTimer = Number(question.timerDuration ?? round.timerDuration ?? 30) || 30;

  const responsesRaw = await redisStore.getResponses(pin, question.id);
  const liveStatsOnActivate = buildLiveResponseStats(gameState, question, responsesRaw);
  logger.info('Question activated', {
    pin,
    roundIndex: gameState.currentRoundIndex,
    questionIndex: gameState.currentQuestionIndex,
    questionId: question.id,
    timerDuration: effectiveTimer,
    roundType: round.type,
  });

  const isMusicRound = String(round?.type || '').toUpperCase() === ROUND_TYPES.MUSIC;

  if (isMusicRound) {
    timerManager.armPausedTimer(pin, effectiveTimer);
    const liveMusic = timerManager.getTimerState(pin);
    persistTimerRemainingIfActiveQuestion(pin, liveMusic.remaining);
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
    io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_UPDATE, {
      remaining: liveMusic.remaining,
      paused: true,
      timerRunning: false,
    });
    try {
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.MUSIC_CONTROL, { action: 'pause' });
    } catch (err) {
      logger.warn('nextQuestion music_control pause failed', { error: err.message });
    }
  } else {
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
        logger.info('Timer expired for question — auto-revealing', {
          pin,
          roundIndex: gs?.currentRoundIndex,
          questionIndex: gs?.currentQuestionIndex,
        });
        await revealAnswer(io, pin);
      },
    );

    const liveAfterStart = timerManager.getTimerState(pin);
    persistTimerRemainingIfActiveQuestion(pin, liveAfterStart.remaining);
    const autoStartEndsAt = timerEndsAtFromRemaining(liveAfterStart.remaining);
    await redisStore.updateGameState(pin, {
      timerRunning: true,
      timerRemaining: liveAfterStart.remaining,
      timerEndsAt: autoStartEndsAt,
    });
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
    question: mapClientQuestionPayload(question),
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

  // Non-music path only emitted QUESTION_ACTIVE before; venue/mobile on mini-game
  // "game over" need session_state to clear holdScreen when host presses Next.
  if (gsForQuestionActive) {
    io.to(`session:${pin}`).emit(
      SOCKET_EVENTS.SESSION_STATE,
      clientPayloadFromGameState(gsForQuestionActive),
    );
  }
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.LIVE_RESPONSE_UPDATE, liveStatsOnActivate);
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
  const teamExistsInLiveState = Boolean(
    gameState.teams?.[teamId] || gameState.teams?.[String(teamId)],
  );
  const wasRemovedByHost =
    Array.isArray(gameState.removedTeamIds) &&
    gameState.removedTeamIds.map(Number).includes(Number(teamId));
  if (!teamExistsInLiveState || wasRemovedByHost) {
    logger.info('Rejected answer from removed team', {
      pin,
      teamId,
      roundIndex: gameState.currentRoundIndex,
      questionIndex: gameState.currentQuestionIndex,
    });
    return;
  }

  if (currentRound?.type === ROUND_TYPES.ELIMINATION) {
    if (isTeamEliminatedInState(gameState, teamId)) {
      logger.info('Rejected answer from eliminated team', {
        pin,
        teamId,
        roundIndex: gameState.currentRoundIndex,
        questionIndex: gameState.currentQuestionIndex,
      });
      return;
    }
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
    const questionIdStr = String(question.id);
    const teamIdStr = String(teamId);
    const rawLocked = gameState.questionWagers?.[questionIdStr]?.[teamIdStr];
    const missingLock = rawLocked === undefined || rawLocked === null;
    let resolvedWager = missingLock
      ? clampWagerByRoundType(
          currentRound.type,
          data?.wagerAmount !== undefined && data?.wagerAmount !== null
            ? Number(data.wagerAmount)
            : 0,
        )
      : Number(rawLocked);

    if (missingLock) {
      if (!gameState.questionWagers) gameState.questionWagers = {};
      if (!gameState.questionWagers[questionIdStr]) gameState.questionWagers[questionIdStr] = {};
      gameState.questionWagers[questionIdStr][teamIdStr] = resolvedWager;
      await redisStore.setGameState(pin, gameState);
      // Surface this implicit lock to host/venue counters — covers the edge case where
      // a team skips the wager-input screen and submits the answer first.
      emitWagerLockUpdate(io, pin, gameState);
    }
    responseData.wagerAmount = resolvedWager;
  }
  await redisStore.recordResponse(pin, question.id, teamId, JSON.stringify(responseData));

  const count = await redisStore.getResponseCount(pin, question.id);
  gameState.responseCount = count;

  let updates = { responseCount: count };
  if (currentRound?.type === ROUND_TYPES.ELIMINATION) {
    const nextState = ensureEliminationActiveTeam(gameState, teamId);
    if (nextState !== gameState) {
      updates.activeTeamIds = nextState.activeTeamIds;
      gameState.activeTeamIds = nextState.activeTeamIds;
    }
    syncEliminationStateActiveRoster(pin, gameState);
  }

  await redisStore.updateGameState(pin, updates);

  const rosterTotal = resolveActiveTeamIdsForStats(gameState).length;
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.RESPONSE_COUNT, {
    count,
    total: rosterTotal > 0 ? rosterTotal : gameState.totalTeams,
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

  // Timer policy (all round types, including Music): the timer runs to completion
  // even if every team has already answered. Auto-reveal is driven solely by timer
  // expiry; "everyone answered" no longer fast-forwards the clock. This keeps audio /
  // video in Music rounds playing through, and gives every round a consistent feel
  // (host can still manually reveal early). `currentRound`/`rosterTotal`/`count` are
  // intentionally left unused by this block — kept above for diagnostics & logs.
  void currentRound;
  void rosterTotal;
  void count;
};

/**
 * Handle a team's wager submission (locked once per wager-lock round).
 * @param {import('socket.io').Server | null} io When set, broadcasts `session_state` so all
 *   clients (and the locking device after refresh) immediately see Redis `roundWagers`.
 */
const submitWager = async (io, pin, teamId, amount) => {
  const gameState = await redisStore.getGameState(pin);
  if (!gameState) return { saved: false };

  const round = stateMachine.getCurrentRound(gameState);
  if (!round || !isWagerLockRound(round)) return { saved: false };

  // The wager is locked against the upcoming question — which is the current question
  // when called from WAGER_COLLECTION (clientPayloadFromGameState already exposes it).
  const question = stateMachine.getCurrentQuestion(gameState);
  if (!question?.id) return { saved: false };

  const questionIdKey = String(question.id);
  const teamIdKey = String(teamId);
  const locked = gameState.questionWagers?.[questionIdKey]?.[teamIdKey];
  if (locked !== undefined && locked !== null) {
    return { saved: false, alreadyLocked: true };
  }

  const wager = clampWagerByRoundType(round.type, amount);
  if (!gameState.questionWagers) gameState.questionWagers = {};
  if (!gameState.questionWagers[questionIdKey]) gameState.questionWagers[questionIdKey] = {};
  gameState.questionWagers[questionIdKey][teamIdKey] = wager;

  await redisStore.setGameState(pin, gameState);

  if (io) {
    const fresh = await redisStore.getGameState(pin);
    if (fresh) {
      // Must include `currentQuestion` during QUESTION/WAGER_COLLECTION — bare
      // sanitizeForClients drops it and forces every client (players + host) onto the
      // waiting UI.
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.SESSION_STATE, clientPayloadFromGameState(fresh));
      emitWagerLockUpdate(io, pin, fresh);
    }
  }

  return { saved: true, amount: wager };
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
  flushTimerPersistRemaining(pin);
  gameState = stateMachine.revealAnswer(gameState);

  const round = stateMachine.getCurrentRound(gameState);
  const question = stateMachine.getCurrentQuestion(gameState);
  const rawResponses = await redisStore.getResponses(pin, question.id);

  const responses = {};
  for (const [teamId, raw] of Object.entries(rawResponses)) {
    try {
      const parsed = JSON.parse(raw);
      responses[teamId] = {
        selectedOptionIndex: Array.isArray(parsed.selectedOptionIndex)
          ? parsed.selectedOptionIndex
          : Number(parsed.selectedOptionIndex),
        wagerAmount: parsed.wagerAmount !== undefined ? Number(parsed.wagerAmount) : 0,
      };
    } catch {
      responses[teamId] = { selectedOptionIndex: Number(raw), wagerAmount: 0 };
    }
  }

  if (round.type === ROUND_TYPES.ELIMINATION) {
    gameState = mergeEliminationRespondersIntoActive(gameState, responses);
    syncEliminationStateActiveRoster(pin, gameState);
    const filteredActiveTeamIds = resolveActiveTeamIdsForStats(gameState).filter(
      (id) => !isTeamEliminatedInState(gameState, id),
    );
    gameState.activeTeamIds = filteredActiveTeamIds;
  }

  const isWagerRound = round.type === ROUND_TYPES.WAGER || round.type === ROUND_TYPES.FINAL_WAGER;
  const activeForReveal = resolveActiveTeamIdsForStats(gameState);
  for (const teamId of activeForReveal) {
    const tid = String(teamId);
    if (!responses[tid]) {
      responses[tid] = {
        selectedOptionIndex: -1,
        wagerAmount: 0,
      };
    }
    if (isWagerRound) {
      responses[tid].wagerAmount = getQuestionWagerForTeam(gameState, question.id, tid, round.id);
    }
  }

  const result = calculateScores({
    roundType: round.type,
    question,
    responses,
    questionIndex: gameState.currentQuestionIndex,
    teams: gameState.teams,
    activeTeamIds: activeForReveal,
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
      elimState = knockoutEngine.initEliminationRound(activeForReveal);
    } else {
      syncEliminationStateActiveRoster(pin, gameState);
      elimState = eliminationStates.get(pin);
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
        const row = gameState.teams[teamId] ?? gameState.teams[String(teamId)];
        if (row) {
          row.isEliminated = true;
        }
        io.to(`session:${pin}`).emit(SOCKET_EVENTS.PLAYER_ELIMINATED, { teamId });
      }
    }

    if (knockoutEngine.shouldEndEarly(elimState)) {
      logger.info('Elimination round ending early — 0 or 1 team remaining', { pin });
      gameState.eliminationEndEarly = true;
    } else {
      gameState.eliminationEndEarly = false;
    }
  }

  const correctIndex = question.options.findIndex((o) => o.isCorrect);
  const responseDetails = Object.entries(responses).map(([teamId, response]) => ({
    teamId: Number(teamId),
    selectedOptionIndex:
      response && Array.isArray(response.selectedOptionIndex)
        ? response.selectedOptionIndex
        : response && Number.isFinite(Number(response.selectedOptionIndex))
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

  if (!gameState.revealSnapshotsByQuestionId) gameState.revealSnapshotsByQuestionId = {};
  gameState.revealSnapshotsByQuestionId[String(question.id)] = {
    correctOptionIndex: correctIndex,
    correctText: question.options[correctIndex]?.text || '',
    scores: { ...result.scores },
    responseDetails,
    majorityOptionIndexes,
    voteCounts,
    eliminations: result.eliminations,
    allWrong: result.allWrong,
  };

  await redisStore.setGameState(pin, gameState);

  persistScoresToDB(gameState.teams).catch((err) =>
    logger.error('Failed to persist scores to DB', { pin, error: err.message }),
  );

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.ANSWER_REVEAL, {
    correctOptionIndex: correctIndex,
    correctText: question.options[correctIndex]?.text,
    correctOrderArray: question.options.some((o) => o.correctOrder !== undefined)
      ? [...question.options]
          .map((o, idx) => ({ idx, order: o.correctOrder }))
          .sort((a, b) => a.order - b.order)
          .map((x) => x.idx)
      : undefined,
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
/**
 * End the current round.
 *
 * Transitions to ROUND_END (the new "round is over" transition screen). The host then
 * advances either via "Next" -> SCOREBOARD (handled by proceedFromRoundEnd) or via
 * "Advance Round" -> ROUND_INTRO/BREAK (handled by advanceToNextRound).
 *
 * Score persistence happens here so it is durable regardless of how the host advances.
 */
const endRound = async (io, pin, gameState) => {
  if (eliminationStates.has(pin)) {
    eliminationStates.delete(pin);
  }
  if (gameState.revealSnapshotsByQuestionId) {
    gameState.revealSnapshotsByQuestionId = {};
  }
  // Clear any elimination-end-early flag — fresh start for the next round.
  gameState.eliminationEndEarly = false;

  for (const teamId of Object.keys(gameState.teams)) {
    if (gameState.teams[teamId]) {
      gameState.teams[teamId].isEliminated = false;
    }
  }
  gameState.activeTeamIds = Object.keys(gameState.teams).map(Number);

  const result = stateMachine.transition(gameState, GAME_STATES.ROUND_END);
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

  const currentRound = stateMachine.getCurrentRound(result.gameState);
  const nextIdx = Number(result.gameState.currentRoundIndex) + 1;
  const nextRound =
    nextIdx >= 0 && nextIdx < result.gameState.rounds.length
      ? result.gameState.rounds[nextIdx]
      : null;
  const isFinalRound = !nextRound;

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.ROUND_END, {
    roundIndex: result.gameState.currentRoundIndex,
    roundName: currentRound?.name || `Round ${Number(result.gameState.currentRoundIndex) + 1}`,
    roundType: currentRound?.type || '',
    nextRound: nextRound
      ? {
          index: nextIdx,
          name: nextRound.name || `Round ${nextIdx + 1}`,
          type: nextRound.type || '',
        }
      : null,
    isFinalRound,
  });
  io.to(`session:${pin}`).emit(
    SOCKET_EVENTS.SESSION_STATE,
    clientPayloadFromGameState(result.gameState),
  );
};

/**
 * Emit the post-round scoreboard payload (shared by ROUND_END and GAME_SHOW_END exits).
 */
const emitRoundScoreboard = async (io, pin, gameState, source) => {
  const sortedTeams = Object.values(gameState.teams).sort((a, b) => b.score - a.score);

  let revealSnapshot = null;
  try {
    revealSnapshot = await buildRevealSnapshot(pin, gameState);
  } catch (err) {
    logger.warn('buildRevealSnapshot failed (round scoreboard)', {
      pin,
      source,
      error: err.message,
    });
  }

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.SCOREBOARD, {
    teams: sortedTeams,
    source,
    ...(revealSnapshot ? { revealSnapshot } : {}),
  });
};

/**
 * Advance from the ROUND_END "round is over" screen.
 *
 * Normal rounds -> SCOREBOARD. Final round -> GAME_SHOW_END (gameshow closing screen)
 * before the final leaderboard.
 */
const proceedFromRoundEnd = async (io, pin) => {
  const gameState = await redisStore.getGameState(pin);
  if (!gameState || gameState.state !== GAME_STATES.ROUND_END) return;

  const nextIdx = Number(gameState.currentRoundIndex) + 1;
  const isFinalRound = nextIdx >= gameState.rounds.length;

  if (isFinalRound) {
    const result = stateMachine.transition(gameState, GAME_STATES.GAME_SHOW_END);
    if (!result.valid) return;

    await redisStore.setGameState(pin, result.gameState);
    logger.info('Gameshow end screen shown', { pin });

    io.to(`session:${pin}`).emit(SOCKET_EVENTS.GAME_SHOW_END, {});
    io.to(`session:${pin}`).emit(
      SOCKET_EVENTS.SESSION_STATE,
      clientPayloadFromGameState(result.gameState),
    );
    return;
  }

  const result = stateMachine.transition(gameState, GAME_STATES.SCOREBOARD);
  if (!result.valid) return;

  await redisStore.setGameState(pin, result.gameState);
  await emitRoundScoreboard(io, pin, result.gameState, 'round_end');
  io.to(`session:${pin}`).emit(
    SOCKET_EVENTS.SESSION_STATE,
    clientPayloadFromGameState(result.gameState),
  );
};

/**
 * Advance from the gameshow closing screen to the final SCOREBOARD.
 */
const proceedFromGameShowEnd = async (io, pin) => {
  const gameState = await redisStore.getGameState(pin);
  if (!gameState || gameState.state !== GAME_STATES.GAME_SHOW_END) return;

  const result = stateMachine.transition(gameState, GAME_STATES.SCOREBOARD);
  if (!result.valid) return;

  await redisStore.setGameState(pin, result.gameState);
  await emitRoundScoreboard(io, pin, result.gameState, 'game_show_end');
  io.to(`session:${pin}`).emit(
    SOCKET_EVENTS.SESSION_STATE,
    clientPayloadFromGameState(result.gameState),
  );
};

/**
 * Advance to the next round
 */
const advanceToNextRound = async (io, pin) => {
  let gameState = await redisStore.getGameState(pin);
  if (!gameState) return;

  if (gameState.state === GAME_STATES.GAME_SHOW_END) {
    await proceedFromGameShowEnd(io, pin);
    return;
  }

  if (gameState.state === GAME_STATES.ROUND_END) {
    const nextIdx = Number(gameState.currentRoundIndex) + 1;
    const isFinalRound = nextIdx >= gameState.rounds.length;
    if (isFinalRound) {
      await proceedFromRoundEnd(io, pin);
      return;
    }
  }

  if (
    gameState.state === GAME_STATES.QUESTION &&
    gameState.questionState === QUESTION_STATES.REVEALED
  ) {
    const round = stateMachine.getCurrentRound(gameState);
    const qLen = round?.questions?.length ?? 0;
    const lastIdx = qLen > 0 ? qLen - 1 : -1;
    const onLastQuestion = lastIdx >= 0 && Number(gameState.currentQuestionIndex) === lastIdx;
    if (onLastQuestion) {
      // End the round and STOP on the ROUND_END "round is over" transition screen.
      // The host (and venue / players) must see the round-over screen before we
      // advance further; another `next_question` or `advance_round` press from
      // ROUND_END moves the game forward.
      await endRound(io, pin, gameState);
      return;
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
  io.to(`session:${pin}`).emit(
    SOCKET_EVENTS.SESSION_STATE,
    clientPayloadFromGameState(roundIntroState),
  );
};

/**
 * Removes the team after a disconnect (purge + broadcasts).
 */
const executePlayerDisconnectPurge = async (io, pin, teamId, options = {}) => {
  const disconnectingSocketId = options.disconnectingSocketId || null;
  const teamRow = await Team.findByPk(teamId, { attributes: ['id', 'socketId'] });
  if (teamRow?.socketId) {
    const live = io.sockets.sockets.get(teamRow.socketId);
    if (live && live.connected && teamRow.socketId !== disconnectingSocketId) {
      logger.info('Skipping disconnect purge — team has an active socket', { pin, teamId });
      return;
    }
  }

  const gameState = await redisStore.getGameState(pin);

  const { removedSocketId } = await purgeTeamFromLiveSession(pin, teamId);

  if (eliminationStates.has(pin)) {
    const es = eliminationStates.get(pin);
    es.activeTeamIds = (es.activeTeamIds || []).map(Number).filter((id) => id !== teamId);
  }

  // Wager locks survive a tab refresh: `purgeTeamFromLiveSession` already keeps
  // `questionWagers` for passive disconnects so reconnecting players still read their
  // locked amount from Redis. Do not delete entries here — that used to wipe locks on
  // every refresh and also risked overwriting Redis with a stale pre-purge snapshot.
  if (gameState && gameState.state === GAME_STATES.WAGER_COLLECTION) {
    const fresh = await redisStore.getGameState(pin);
    if (fresh) {
      emitWagerLockUpdate(io, pin, fresh);
    }
  }

  if (
    gameState &&
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

      // Timer policy (matches submitAnswer): all rounds let the clock run to completion
      // even when every remaining team has answered. Auto-reveal is driven by timer
      // expiry alone, so a disconnect that completes the roster never short-circuits it.
    }
  }

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.TEAM_REMOVED, {
    teamId,
    reason: 'disconnected',
  });
  if (removedSocketId) {
    io.to(removedSocketId).emit(SOCKET_EVENTS.TEAM_REMOVED, {
      teamId,
      direct: true,
      reason: 'disconnected',
    });
  }
  logger.info('Player disconnected — team purged from session', { pin, teamId });
};

/**
 * Tab close / network loss: purge immediately so the team is removed from the live
 * session and leaderboard as soon as the socket disconnects.
 * Explicit leave also uses the same immediate path.
 */
const handlePlayerSocketDisconnect = async (io, pin, teamIdRaw, options = {}) => {
  const teamId = Number(teamIdRaw);
  if (!pin || !Number.isFinite(teamId)) return;

  cancelScheduledDisconnectPurge(pin, teamId);
  await executePlayerDisconnectPurge(io, pin, teamId, options);
};

/**
 * Show scoreboard on demand
 */
const showScoreboard = async (io, pin) => {
  const gameState = await redisStore.getGameState(pin);
  if (!gameState) return;

  // Overlay only between rounds — not during live questions.
  if (
    gameState.state !== GAME_STATES.SCOREBOARD &&
    gameState.state !== GAME_STATES.ROUND_END
  ) {
    logger.warn('showScoreboard rejected — round still active', {
      pin,
      state: gameState.state,
      questionState: gameState.questionState,
    });
    return;
  }

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

  // Break may only start between rounds (after round-end / on scoreboard), not mid-question.
  if (
    gameState.state !== GAME_STATES.SCOREBOARD &&
    gameState.state !== GAME_STATES.ROUND_END
  ) {
    logger.warn('startBreak rejected — round not over', {
      pin,
      state: gameState.state,
    });
    return;
  }

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
  const bd = Math.max(0, Math.round(Number(result.gameState.breakDuration ?? br)));
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
  const upNextRound = getBreakUpNextRoundPayload(result.gameState);
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.BREAK_START, {
    duration: breakRem,
    breakDuration: bd,
    breakRemaining: breakRem,
    breakEndsAt: result.gameState.breakEndsAt,
    serverNow,
    currentRoundIndex: Number(result.gameState.currentRoundIndex ?? 0),
    upNextRound,
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

    const rosterIds = resolveActiveTeamIdsForStats(gameState);
    if (
      rosterIds.length > 0 &&
      (!Array.isArray(gameState.activeTeamIds) || gameState.activeTeamIds.length === 0)
    ) {
      gameState.activeTeamIds = rosterIds;
    }

    await redisStore.setGameState(pin, gameState);
    io.to(`session:${pin}`).emit(SOCKET_EVENTS.BREAK_END, {
      restoredState: gameState.state,
      questionState: gameState.questionState,
    });
    io.to(`session:${pin}`).emit(
      SOCKET_EVENTS.SESSION_STATE,
      clientPayloadFromGameState(gameState),
    );
    if (
      gameState.state === GAME_STATES.QUESTION &&
      gameState.questionState === QUESTION_STATES.REVEALED
    ) {
      const revealPayload = await buildRevealSnapshot(pin, gameState);
      if (revealPayload) {
        io.to(`session:${pin}`).emit(SOCKET_EVENTS.ANSWER_REVEAL, revealPayload);
        io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_UPDATE, { remaining: 0 });
      }
    }
    if (gameState.state === GAME_STATES.SCOREBOARD) {
      const sortedTeams = Object.values(gameState.teams || {}).sort((a, b) => b.score - a.score);
      const revealPayload = await buildRevealSnapshot(pin, gameState);
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.SCOREBOARD, {
        teams: sortedTeams,
        source: 'manual',
        ...(revealPayload ? { revealSnapshot: revealPayload } : {}),
      });
    }
    if (gameState.state === GAME_STATES.ROUND_INTRO) {
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.ROUND_INTRO, {
        round: stateMachine.getCurrentRound(gameState),
        roundIndex: gameState.currentRoundIndex,
        totalRounds: gameState.rounds.length,
      });
    }
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
            question: mapClientQuestionPayload(question),
            timerDuration: effectiveTimer,
            timerRemaining: timerRemainingForEmit,
            timerRunning: Boolean(gameState.timerRunning),
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
      if (String(resumeRound?.type || '').toUpperCase() === ROUND_TYPES.MUSIC) {
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
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.BREAK_END, {
    restoredState: result.gameState.state,
    questionState: result.gameState.questionState,
  });
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
    const lobbyTeams = await redisStore.getAllTeamsData(pin);
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
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.MINI_GAME_START, {
    game: gameType,
    ...normalizedConfig,
  });
  logger.info('Mini game launched', { pin, gameType });
};

/**
 * Reset the current mini-game to a fresh intro state without clearing `activeMiniGame`
 * or emitting the trivia `session_state` that `end_mini_game` sends. Used when the host
 * chooses "Restart" so the venue stays on the mini-game surface instead of flashing the quiz.
 */
const restartMiniGame = async (io, pin) => {
  const gameState = await redisStore.getGameState(pin);
  if (!gameState?.activeMiniGame) {
    logger.warn('restartMiniGame: no active mini-game', { pin });
    return;
  }

  const gameType = gameState.activeMiniGame;
  const normalizedConfig = { ...(gameState.miniGameConfig || {}) };

  if (gameType === 'kangaroo_race') {
    const namesSource = normalizedConfig.kangarooNames || gameState.miniGameState?.kangarooNames;
    if (!hasValidKangarooNames(namesSource)) {
      throw new Error('Kangaroo race requires exactly 6 non-empty kangaroo names');
    }
    normalizedConfig.kangarooNames = normalizeKangarooNames(namesSource);
  }

  gameState.miniGameConfig = normalizedConfig;
  gameState.miniGameState =
    gameType === 'card_shuffle'
      ? createCardShuffleState()
      : gameType === 'kangaroo_race'
        ? createHorseRaceState(normalizedConfig.kangarooNames)
        : { game: gameType };

  await redisStore.setGameState(pin, gameState);

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.SESSION_STATE, sanitizeForClients(gameState));
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.MINI_GAME_START, {
    game: gameType,
    ...normalizedConfig,
  });
  logger.info('Mini game restarted in place', { pin, gameType });
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
    // Emit session_state immediately so venue/players can reconcile
    // to the correct trivia phase. Socket.io preserves event ordering,
    // so clients process mini_game_end first, then this session_state.
    // Use clientPayloadFromGameState (not sanitizeForClients) so the
    // payload includes currentQuestion — without it the venue can't
    // render the question screen.
    io.to(`session:${pin}`).emit(
      SOCKET_EVENTS.SESSION_STATE,
      clientPayloadFromGameState(gameState),
    );
  }
};

/**
 * Pause the timer
 */
const pauseTimer = async (io, pin) => {
  const before = timerManager.getTimerState(pin);
  if (!timerManager.hasLiveTimer(pin) || !before.running) {
    if (before.remaining > 0) {
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_UPDATE, {
        remaining: before.remaining,
        paused: true,
        timerRunning: false,
        timerEndsAt: null,
      });
    }
    return;
  }

  const remaining = timerManager.pauseTimer(pin);
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_UPDATE, {
    remaining,
    paused: true,
    timerRunning: false,
    timerEndsAt: null,
  });
  persistTimerRemainingIfActiveQuestion(pin, remaining, { immediate: true });

  try {
    const gameState = await redisStore.getGameState(pin);
    if (
      gameState &&
      gameState.state === GAME_STATES.QUESTION &&
      gameState.questionState === QUESTION_STATES.ACTIVE
    ) {
      gameState.timerRemaining = Math.max(0, Number(remaining) || 0);
      gameState.timerRunning = false;
      gameState.timerEndsAt = null;
      await redisStore.setGameState(pin, gameState);
    }
    const round = gameState ? stateMachine.getCurrentRound(gameState) : null;
    if (String(round?.type || '').toUpperCase() === ROUND_TYPES.MUSIC) {
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
  let timerState = timerManager.getTimerState(pin);

  // Already counting — never re-arm from Redis (stale value would reset to full duration).
  if (timerState.running && timerState.remaining > 0) {
    logger.debug('startTimer ignored — already running', {
      pin,
      remaining: timerState.remaining,
    });
    return;
  }

  if (!(timerState.remaining > 0 && !timerState.running)) {
    if (!timerManager.hasLiveTimer(pin)) {
      try {
        const gameState = await redisStore.getGameState(pin);
        if (
          gameState &&
          gameState.state === GAME_STATES.QUESTION &&
          gameState.questionState === QUESTION_STATES.ACTIVE
        ) {
          const storedRemaining = Number(gameState.timerRemaining);
          if (Number.isFinite(storedRemaining) && storedRemaining > 0) {
            timerManager.armPausedTimer(pin, storedRemaining);
            timerState = timerManager.getTimerState(pin);
          }
        }
      } catch (err) {
        logger.warn('startTimer re-arm from game state failed', { error: err.message });
      }
    } else {
      timerState = timerManager.getTimerState(pin);
    }
  }

  if (!(timerState.remaining > 0 && !timerState.running)) return;

  const resumeEndsAt = timerEndsAtFromRemaining(timerState.remaining);
  logger.info('Timer resumed', { pin, remaining: timerState.remaining });
  timerManager.resumeTimer(
    pin,
    (remaining) => {
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_UPDATE, {
        remaining,
        timerRunning: true,
        timerEndsAt: resumeEndsAt,
      });
      persistTimerRemainingIfActiveQuestion(pin, remaining);
    },
    async () => {
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_EXPIRED, {});
      const gs = await redisStore.getGameState(pin);
      if (gs) {
        gs.timerRunning = false;
        gs.timerRemaining = 0;
        gs.timerEndsAt = null;
        await redisStore.setGameState(pin, gs);
      }
      logger.info('Timer expired for question on resumed timer — auto-revealing', {
        pin,
      });
      await revealAnswer(io, pin);
    },
  );

  let gameState = await redisStore.getGameState(pin);
  if (gameState) {
    gameState.timerRunning = true;
    gameState.timerRemaining = timerState.remaining;
    gameState.timerEndsAt = resumeEndsAt;
    await redisStore.setGameState(pin, gameState);
  }
  io.to(`session:${pin}`).emit(SOCKET_EVENTS.TIMER_UPDATE, {
    remaining: timerState.remaining,
    paused: false,
    timerRunning: true,
    timerEndsAt: resumeEndsAt,
  });

  if (gameState) {
    const round = stateMachine.getCurrentRound(gameState);
    if (String(round?.type || '').toUpperCase() === ROUND_TYPES.MUSIC) {
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
    question: mapClientQuestionPayload(cq),
    timerDuration: Number(cq.timerDuration ?? round.timerDuration ?? 30) || 30,
    roundType: round.type || '',
    pointsForQuestion:
      round.type === ROUND_TYPES.ELIMINATION
        ? getEliminationPoints(gameState.currentQuestionIndex)
        : undefined,
  };
  return base;
};

/**
 * Start wager collection for the *upcoming* question in a Wager / Final Wager round.
 *
 * Supports three entry points:
 *  - ROUND_INTRO -> WAGER_COLLECTION (first question of the round; host pressed "Lock Wager Points")
 *  - QUESTION (REVEALED) -> WAGER_COLLECTION (per-question lock between consecutive questions)
 *  - SCOREBOARD -> WAGER_COLLECTION (rare path; host re-entered wager collection after showing scoreboard)
 *
 * When advancing from REVEALED, the question index is incremented first so the wager UI
 * targets the *next* question.
 */
const startQuestionWagerCollection = async (io, pin) => {
  let gameState = await redisStore.getGameState(pin);
  if (!gameState) return;

  const entryState = gameState.state;
  const entryQuestionState = gameState.questionState;

  // From REVEALED, advance the question index so the wager screen is for the upcoming question.
  if (entryState === GAME_STATES.QUESTION && entryQuestionState === QUESTION_STATES.REVEALED) {
    const advance = stateMachine.advanceQuestion(gameState);
    if (!advance.hasNext) {
      // No more questions in this round -> end the round instead of opening a wager screen.
      await endRound(io, pin, gameState);
      return;
    }
    gameState = advance.gameState;
  }

  const round = stateMachine.getCurrentRound(gameState);
  if (!round || !isWagerLockRound(round)) {
    logger.warn('startQuestionWagerCollection called on non-wager round', {
      pin,
      roundType: round?.type,
    });
    return;
  }

  const result = stateMachine.transition(gameState, GAME_STATES.WAGER_COLLECTION);
  if (!result.valid) {
    logger.error('Failed to transition to WAGER_COLLECTION', {
      pin,
      from: gameState.state,
      error: result.error,
    });
    return;
  }

  await redisStore.setGameState(pin, result.gameState);

  const upcomingQuestion = stateMachine.getCurrentQuestion(result.gameState);

  io.to(`session:${pin}`).emit(SOCKET_EVENTS.WAGER_COLLECTION_START, {
    round: {
      id: round.id,
      name: round.name,
      type: round.type,
      timerDuration: round.timerDuration,
    },
    roundIndex: result.gameState.currentRoundIndex,
    totalRounds: result.gameState.rounds.length,
    questionIndex: result.gameState.currentQuestionIndex,
    totalQuestions: round.questions.length,
    questionId: upcomingQuestion?.id ?? null,
    category: upcomingQuestion?.category ?? null,
  });

  io.to(`session:${pin}`).emit(
    SOCKET_EVENTS.SESSION_STATE,
    clientPayloadFromGameState(result.gameState),
  );

  // Reset the locked-wager counter (no team has locked for the new question yet).
  emitWagerLockUpdate(io, pin, result.gameState);

  logger.info('Wager collection started', {
    pin,
    roundIndex: result.gameState.currentRoundIndex,
    questionIndex: result.gameState.currentQuestionIndex,
    roundType: round.type,
    from: entryState,
  });
};

/** Back-compat alias — older callers used `startWagerCollection`. */
const startWagerCollection = startQuestionWagerCollection;

/** Drop per-session in-memory maps when a session ends or is purged from cache. */
const cleanupInMemorySession = (pin) => {
  const pinKey = String(pin);
  eliminationStates.delete(pinKey);
  flushTimerPersistRemaining(pinKey);
  for (const [key, timeoutId] of disconnectPurgeTimers) {
    if (key.startsWith(`${pinKey}:`)) {
      clearTimeout(timeoutId);
      disconnectPurgeTimers.delete(key);
    }
  }
  timerManager.stopTimer(pinKey);
};

const getInMemoryDiagnostics = () => ({
  eliminationSessions: eliminationStates.size,
  pendingDisconnectPurges: disconnectPurgeTimers.size,
  timerPersistDebouncers: timerPersistDebouncers.size,
});

module.exports = {
  startGame,
  nextQuestion,
  submitAnswer,
  submitWager,
  revealAnswer,
  endRound,
  advanceToNextRound,
  handlePlayerSocketDisconnect,
  cancelScheduledDisconnectPurge,
  cleanupInMemorySession,
  getInMemoryDiagnostics,
  showScoreboard,
  hideScoreboard,
  startBreak,
  endBreak,
  launchMiniGame,
  restartMiniGame,
  endMiniGame,
  pauseTimer,
  startTimer,
  endGame,
  startWagerCollection,
};
