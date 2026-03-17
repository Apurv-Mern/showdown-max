const { getRedisClient, isRedisReady } = require('../config/redis');
const logger = require('../utils/logger');

const KEYS = {
  session: (pin) => `session:${pin}`,
  gameState: (pin) => `game:${pin}:state`,
  teams: (pin) => `game:${pin}:teams`,
  responses: (pin, questionId) => `game:${pin}:responses:${questionId}`,
  lobby: (pin) => `game:${pin}:lobby`,
};

const TTL = 86400;

const memoryStore = new Map();

/**
 * Execute a Redis command with in-memory fallback
 */
const withFallback = async (redisOp, memoryOp) => {
  if (isRedisReady()) {
    try {
      return await redisOp();
    } catch (err) {
      logger.warn('Redis operation failed, using memory fallback', { error: err.message });
    }
  }
  return memoryOp();
};

const setSession = async (pin, sessionId) => {
  return withFallback(
    async () => {
      const redis = getRedisClient();
      await redis.set(KEYS.session(pin), JSON.stringify({ sessionId }), 'EX', TTL);
    },
    () => { memoryStore.set(KEYS.session(pin), { sessionId }); },
  );
};

const getSession = async (pin) => {
  return withFallback(
    async () => {
      const redis = getRedisClient();
      const data = await redis.get(KEYS.session(pin));
      return data ? JSON.parse(data) : null;
    },
    () => memoryStore.get(KEYS.session(pin)) || null,
  );
};

const setGameState = async (pin, state) => {
  return withFallback(
    async () => {
      const redis = getRedisClient();
      await redis.set(KEYS.gameState(pin), JSON.stringify(state), 'EX', TTL);
    },
    () => { memoryStore.set(KEYS.gameState(pin), JSON.parse(JSON.stringify(state))); },
  );
};

const getGameState = async (pin) => {
  return withFallback(
    async () => {
      const redis = getRedisClient();
      const data = await redis.get(KEYS.gameState(pin));
      return data ? JSON.parse(data) : null;
    },
    () => {
      const data = memoryStore.get(KEYS.gameState(pin));
      return data ? JSON.parse(JSON.stringify(data)) : null;
    },
  );
};

const updateGameState = async (pin, updates) => {
  const current = await getGameState(pin);
  if (!current) {
    logger.warn('No game state found for PIN', { pin });
    return null;
  }
  const updated = { ...current, ...updates };
  await setGameState(pin, updated);
  return updated;
};

const addTeamToLobby = async (pin, team) => {
  return withFallback(
    async () => {
      const redis = getRedisClient();
      await redis.hset(KEYS.lobby(pin), team.teamId.toString(), JSON.stringify(team));
      await redis.expire(KEYS.lobby(pin), TTL);
    },
    () => {
      const key = KEYS.lobby(pin);
      const lobby = memoryStore.get(key) || {};
      lobby[team.teamId.toString()] = team;
      memoryStore.set(key, lobby);
    },
  );
};

const removeTeamFromLobby = async (pin, teamId) => {
  return withFallback(
    async () => {
      const redis = getRedisClient();
      await redis.hdel(KEYS.lobby(pin), teamId.toString());
    },
    () => {
      const key = KEYS.lobby(pin);
      const lobby = memoryStore.get(key) || {};
      delete lobby[teamId.toString()];
      memoryStore.set(key, lobby);
    },
  );
};

const getLobbyTeams = async (pin) => {
  return withFallback(
    async () => {
      const redis = getRedisClient();
      const data = await redis.hgetall(KEYS.lobby(pin));
      return Object.values(data).map((v) => JSON.parse(v));
    },
    () => {
      const lobby = memoryStore.get(KEYS.lobby(pin)) || {};
      return Object.values(lobby);
    },
  );
};

const updateTeamData = async (pin, teamId, teamData) => {
  return withFallback(
    async () => {
      const redis = getRedisClient();
      await redis.hset(KEYS.teams(pin), teamId.toString(), JSON.stringify(teamData));
      await redis.expire(KEYS.teams(pin), TTL);
    },
    () => {
      const key = KEYS.teams(pin);
      const teams = memoryStore.get(key) || {};
      teams[teamId.toString()] = teamData;
      memoryStore.set(key, teams);
    },
  );
};

const getAllTeamsData = async (pin) => {
  return withFallback(
    async () => {
      const redis = getRedisClient();
      const data = await redis.hgetall(KEYS.teams(pin));
      return Object.values(data).map((v) => JSON.parse(v));
    },
    () => {
      const teams = memoryStore.get(KEYS.teams(pin)) || {};
      return Object.values(teams);
    },
  );
};

const recordResponse = async (pin, questionId, teamId, selectedOptionIndex) => {
  return withFallback(
    async () => {
      const redis = getRedisClient();
      await redis.hset(
        KEYS.responses(pin, questionId),
        teamId.toString(),
        selectedOptionIndex.toString(),
      );
      await redis.expire(KEYS.responses(pin, questionId), TTL);
    },
    () => {
      const key = KEYS.responses(pin, questionId);
      const responses = memoryStore.get(key) || {};
      responses[teamId.toString()] = selectedOptionIndex.toString();
      memoryStore.set(key, responses);
    },
  );
};

const getResponseCount = async (pin, questionId) => {
  return withFallback(
    async () => {
      const redis = getRedisClient();
      return redis.hlen(KEYS.responses(pin, questionId));
    },
    () => {
      const responses = memoryStore.get(KEYS.responses(pin, questionId)) || {};
      return Object.keys(responses).length;
    },
  );
};

const getResponses = async (pin, questionId) => {
  return withFallback(
    async () => {
      const redis = getRedisClient();
      return redis.hgetall(KEYS.responses(pin, questionId));
    },
    () => memoryStore.get(KEYS.responses(pin, questionId)) || {},
  );
};

const cleanupSession = async (pin) => {
  return withFallback(
    async () => {
      const redis = getRedisClient();
      const keys = await redis.keys(`game:${pin}:*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      await redis.del(KEYS.session(pin));
    },
    () => {
      for (const [key] of memoryStore) {
        if (key.startsWith(`game:${pin}:`) || key === KEYS.session(pin)) {
          memoryStore.delete(key);
        }
      }
    },
  );
};

module.exports = {
  KEYS,
  setSession,
  getSession,
  setGameState,
  getGameState,
  updateGameState,
  addTeamToLobby,
  removeTeamFromLobby,
  getLobbyTeams,
  updateTeamData,
  getAllTeamsData,
  recordResponse,
  getResponseCount,
  getResponses,
  cleanupSession,
};
