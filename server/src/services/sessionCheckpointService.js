const { Session } = require('../models');
const redisStore = require('./redisSessionStore');
const logger = require('../utils/logger');
const { QUESTION_STATES } = require('shared/constants/questionStates');
const { GAME_STATES } = require('shared/constants/gameStates');
const stateMachine = require('./game-engine/stateMachine');

const persistTimers = new Map();
const DEBOUNCE_MS = 1000;

const parseCheckpoint = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const buildCheckpointPayload = async (pin) => {
  const gameState = await redisStore.getGameState(pin);
  if (!gameState) return null;

  const question = stateMachine.getCurrentQuestion(gameState);
  let responses = {};
  if (question?.id) {
    responses = await redisStore.getResponses(pin, question.id);
  }

  let eliminationState = null;
  try {
    eliminationState = require('./game-engine/gameController').getEliminationStateSnapshot(pin);
  } catch {
    eliminationState = gameState.eliminationCheckpoint || null;
  }

  const lobbyPhase = await redisStore.getLobbyPhase(pin);
  const lobbyTeams = await redisStore.getLobbyTeams(pin);
  const sessionTeams = await redisStore.getAllTeamsData(pin);

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    gameState,
    responses: question?.id ? { [String(question.id)]: responses } : {},
    eliminationState,
    lobbyPhase,
    lobbyTeams,
    sessionTeams,
  };
};

const persistNow = async (pin) => {
  const pinKey = String(pin);
  const pending = persistTimers.get(pinKey);
  if (pending) {
    clearTimeout(pending);
    persistTimers.delete(pinKey);
  }
  try {
    const payload = await buildCheckpointPayload(pinKey);
    if (!payload) return;
    await Session.update({ liveCheckpoint: payload }, { where: { pin: pinKey } });
  } catch (err) {
    logger.warn('Failed to persist live checkpoint', { pin: pinKey, error: err.message });
  }
};

const schedulePersist = (pin, { immediate = false } = {}) => {
  const pinKey = String(pin);
  if (immediate) {
    persistNow(pinKey).catch(() => {});
    return;
  }
  const existing = persistTimers.get(pinKey);
  if (existing) clearTimeout(existing);
  persistTimers.set(
    pinKey,
    setTimeout(() => {
      persistTimers.delete(pinKey);
      persistNow(pinKey).catch(() => {});
    }, DEBOUNCE_MS),
  );
};

const clearCheckpoint = async (pin) => {
  const pinKey = String(pin);
  const pending = persistTimers.get(pinKey);
  if (pending) {
    clearTimeout(pending);
    persistTimers.delete(pinKey);
  }
  try {
    await Session.update({ liveCheckpoint: null }, { where: { pin: pinKey } });
  } catch (err) {
    logger.warn('Failed to clear live checkpoint', { pin: pinKey, error: err.message });
  }
};

const hydrateFromSession = async (session) => {
  const checkpoint = parseCheckpoint(session?.liveCheckpoint);
  if (!checkpoint?.gameState || !session?.pin) return false;

  const pin = session.pin;
  const existing = await redisStore.getGameState(pin);
  if (existing) return true;

  await redisStore.setSession(pin, session.id);
  if (checkpoint.lobbyPhase) {
    await redisStore.setLobbyPhase(pin, checkpoint.lobbyPhase);
  }

  const gameState = { ...checkpoint.gameState };
  if (
    gameState.state === GAME_STATES.QUESTION &&
    gameState.questionState === QUESTION_STATES.ACTIVE
  ) {
    gameState.timerRunning = false;
  }

  await redisStore.setGameState(pin, gameState, { skipCheckpoint: true });

  const teams = checkpoint.sessionTeams?.length
    ? checkpoint.sessionTeams
    : checkpoint.lobbyTeams || [];
  for (const team of teams) {
    if (!team?.teamId) continue;
    await redisStore.updateTeamData(pin, team.teamId, team);
    // Parked teams stay in the score hash only. Putting them back in the lobby
    // made leftover joins look connected after a server restart.
    if (team.isConnected !== false) {
      await redisStore.addTeamToLobby(pin, team);
    }
  }

  const responsesByQuestion = checkpoint.responses || {};
  for (const [questionId, map] of Object.entries(responsesByQuestion)) {
    await redisStore.restoreResponses(pin, questionId, map);
  }

  if (checkpoint.eliminationState) {
    try {
      require('./game-engine/gameController').restoreEliminationState(
        pin,
        checkpoint.eliminationState,
      );
    } catch {
      /* ignore */
    }
  }

  logger.info('Hydrated live session from MySQL checkpoint', {
    pin,
    state: gameState.state,
    questionState: gameState.questionState,
    roundIndex: gameState.currentRoundIndex,
    questionIndex: gameState.currentQuestionIndex,
  });
  return true;
};

const hydrateActiveSessions = async () => {
  const rows = await Session.findAll({
    where: { status: 'active' },
    attributes: ['id', 'pin', 'liveCheckpoint', 'status'],
  });
  let restored = 0;
  for (const row of rows) {
    try {
      const ok = await hydrateFromSession(row);
      if (ok) restored += 1;
    } catch (err) {
      logger.warn('Failed to hydrate session checkpoint', { pin: row.pin, error: err.message });
    }
  }
  logger.info('Live session checkpoint hydrate complete', { scanned: rows.length, restored });
  return restored;
};

const ensureHydratedGameState = async (pin) => {
  const live = await redisStore.getGameState(pin);
  if (live) return live;
  const session = await Session.findOne({ where: { pin, status: 'active' } });
  if (!session) return null;
  await hydrateFromSession(session);
  return redisStore.getGameState(pin);
};

module.exports = {
  schedulePersist,
  persistNow,
  clearCheckpoint,
  hydrateFromSession,
  hydrateActiveSessions,
  ensureHydratedGameState,
};
