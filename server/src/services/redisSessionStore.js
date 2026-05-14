const { getRedisClient, isRedisReady, getRedisMode } = require('../config/redis');
const logger = require('../utils/logger');

const { normalizeTeamName } = require('../utils/teamName');

const KEYS = {
  session: (pin) => `session:${pin}`,
  gameState: (pin) => `game:${pin}:state`,
  teams: (pin) => `game:${pin}:teams`,
  responses: (pin, questionId) => `game:${pin}:responses:${questionId}`,
  lobby: (pin) => `game:${pin}:lobby`,
  /** Normalized team names + ids removed by host; survives LOBBY when game state is not yet written */
  hostRemovalBlocklist: (pin) => `game:${pin}:hostRemovalBlocklist`,
};

const TTL = 86400;

const memoryStore = new Map();
const loggedPinModes = new Map();

const rememberPinMode = (pin) => {
  const mode = getRedisMode();
  const key = String(pin);
  if (loggedPinModes.get(key) === mode) return;
  loggedPinModes.set(key, mode);
  logger.info('Session store mode in use', { pin, mode });
};

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
  logger.debug('Using in-memory session store fallback', { mode: getRedisMode() });
  return memoryOp();
};

const setSession = async (pin, sessionId) => {
  rememberPinMode(pin);
  return withFallback(
    async () => {
      const redis = getRedisClient();
      await redis.set(KEYS.session(pin), JSON.stringify({ sessionId }), 'EX', TTL);
    },
    () => {
      memoryStore.set(KEYS.session(pin), { sessionId });
    },
  );
};

const getSession = async (pin) => {
  rememberPinMode(pin);
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
  rememberPinMode(pin);
  return withFallback(
    async () => {
      const redis = getRedisClient();
      await redis.set(KEYS.gameState(pin), JSON.stringify(state), 'EX', TTL);
    },
    () => {
      memoryStore.set(KEYS.gameState(pin), JSON.parse(JSON.stringify(state)));
    },
  );
};

const getGameState = async (pin) => {
  rememberPinMode(pin);
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

/**
 * Merge patches into the latest game state (read-modify-write).
 * Pass an object for shallow merge, or a function `(current) => partial` so callers can
 * derive nested fields (e.g. `teams`) from a fresh snapshot without clobbering `timerRemaining`.
 * @param {string} pin
 * @param {Record<string, unknown> | ((current: Record<string, unknown>) => Record<string, unknown> | null | undefined)} updates
 */
const updateGameState = async (pin, updates) => {
  const current = await getGameState(pin);
  if (!current) {
    logger.warn('No game state found for PIN', { pin });
    return null;
  }
  const patch = typeof updates === 'function' ? updates(current) : updates;
  if (patch == null) return null;
  const updated = { ...current, ...patch };
  await setGameState(pin, updated);
  return updated;
};

const addTeamToLobby = async (pin, team) => {
  rememberPinMode(pin);
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
  rememberPinMode(pin);
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

const removeTeamData = async (pin, teamId) => {
  rememberPinMode(pin);
  return withFallback(
    async () => {
      const redis = getRedisClient();
      await redis.hdel(KEYS.teams(pin), teamId.toString());
    },
    () => {
      const key = KEYS.teams(pin);
      const teams = memoryStore.get(key) || {};
      delete teams[teamId.toString()];
      memoryStore.set(key, teams);
    },
  );
};

const getLobbyTeams = async (pin) => {
  rememberPinMode(pin);
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
  rememberPinMode(pin);
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
  rememberPinMode(pin);
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
  rememberPinMode(pin);
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
  rememberPinMode(pin);
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
  rememberPinMode(pin);
  return withFallback(
    async () => {
      const redis = getRedisClient();
      return redis.hgetall(KEYS.responses(pin, questionId));
    },
    () => memoryStore.get(KEYS.responses(pin, questionId)) || {},
  );
};

const parseHostRemovalBlocklist = (raw) => {
  if (!raw) return { teamNames: [], teamIds: [] };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const teamNames = Array.isArray(parsed.teamNames)
      ? parsed.teamNames.map((n) => normalizeTeamName(n)).filter(Boolean)
      : [];
    const teamIds = Array.isArray(parsed.teamIds)
      ? parsed.teamIds.map(Number).filter(Number.isFinite)
      : [];
    return { teamNames, teamIds };
  } catch {
    return { teamNames: [], teamIds: [] };
  }
};

const getHostRemovalBlocklist = async (pin) => {
  rememberPinMode(pin);
  const key = KEYS.hostRemovalBlocklist(pin);
  return withFallback(
    async () => {
      const redis = getRedisClient();
      const raw = await redis.get(key);
      return parseHostRemovalBlocklist(raw);
    },
    () => parseHostRemovalBlocklist(memoryStore.get(key)),
  );
};

/**
 * @param {string} pin
 * @param {{ normalizedName?: string | null; teamId: number }} entry
 */
const appendHostRemovalBlocklist = async (pin, { normalizedName, teamId }) => {
  rememberPinMode(pin);
  const key = KEYS.hostRemovalBlocklist(pin);
  return withFallback(
    async () => {
      const redis = getRedisClient();
      const prev = parseHostRemovalBlocklist(await redis.get(key));
      const teamNames = Array.from(
        new Set(
          [...prev.teamNames, normalizedName ? normalizeTeamName(normalizedName) : null].filter(
            Boolean,
          ),
        ),
      );
      const teamIds = Array.from(
        new Set([...prev.teamIds, Number(teamId)].filter(Number.isFinite)),
      );
      await redis.set(key, JSON.stringify({ teamNames, teamIds }), 'EX', TTL);
    },
    () => {
      const prev = parseHostRemovalBlocklist(memoryStore.get(key));
      const teamNames = Array.from(
        new Set(
          [...prev.teamNames, normalizedName ? normalizeTeamName(normalizedName) : null].filter(
            Boolean,
          ),
        ),
      );
      const teamIds = Array.from(
        new Set([...prev.teamIds, Number(teamId)].filter(Number.isFinite)),
      );
      memoryStore.set(key, { teamNames, teamIds });
    },
  );
};

/** Call when the host intentionally re-adds a team so that name can join again */
const removeHostRemovalBlocklistNormalizedNames = async (pin, normalizedNames) => {
  const drop = new Set(
    (Array.isArray(normalizedNames) ? normalizedNames : [])
      .map((n) => normalizeTeamName(n))
      .filter(Boolean),
  );
  if (drop.size === 0) return;
  rememberPinMode(pin);
  const key = KEYS.hostRemovalBlocklist(pin);
  return withFallback(
    async () => {
      const redis = getRedisClient();
      const prev = parseHostRemovalBlocklist(await redis.get(key));
      const teamNames = prev.teamNames.filter((n) => !drop.has(normalizeTeamName(n)));
      const teamIds = prev.teamIds;
      if (teamNames.length === 0) {
        await redis.del(key);
      } else {
        await redis.set(key, JSON.stringify({ teamNames, teamIds }), 'EX', TTL);
      }
    },
    () => {
      const prev = parseHostRemovalBlocklist(memoryStore.get(key));
      const teamNames = prev.teamNames.filter((n) => !drop.has(normalizeTeamName(n)));
      const teamIds = prev.teamIds;
      if (teamNames.length === 0) {
        memoryStore.delete(key);
      } else {
        memoryStore.set(key, { teamNames, teamIds });
      }
    },
  );
};

const cleanupSession = async (pin) => {
  loggedPinModes.delete(String(pin));
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

const inspectSessionCache = async (pin) => {
  const keys = [KEYS.session(pin), KEYS.gameState(pin), KEYS.teams(pin), KEYS.lobby(pin)];

  return withFallback(
    async () => {
      const redis = getRedisClient();
      const responseKeys = await redis.keys(KEYS.responses(pin, '*'));
      const existingKeys = [];
      for (const key of [...keys, ...responseKeys]) {
        const exists = await redis.exists(key);
        if (exists) existingKeys.push(key);
      }
      return {
        mode: 'redis',
        pin,
        keys: existingKeys,
        responseKeys,
      };
    },
    () => {
      const existingKeys = [];
      for (const [key] of memoryStore) {
        if (key === KEYS.session(pin) || key.startsWith(`game:${pin}:`)) {
          existingKeys.push(key);
        }
      }
      return {
        mode: 'memory',
        pin,
        keys: existingKeys,
        responseKeys: existingKeys.filter((key) => key.includes(':responses:')),
      };
    },
  );
};

const clearAllGameCaches = async () => {
  return withFallback(
    async () => {
      const redis = getRedisClient();
      const gameKeys = await redis.keys('game:*');
      const sessionKeys = await redis.keys('session:*');
      const keys = [...gameKeys, ...sessionKeys];
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      return { mode: 'redis', clearedKeys: keys.length };
    },
    () => {
      let clearedKeys = 0;
      for (const [key] of memoryStore) {
        if (key.startsWith('game:') || key.startsWith('session:')) {
          memoryStore.delete(key);
          clearedKeys += 1;
        }
      }
      return { mode: 'memory', clearedKeys };
    },
  );
};

const inspectCache = async () => {
  return withFallback(
    async () => {
      const redis = getRedisClient();
      const gameKeys = await redis.keys('game:*');
      const sessionKeys = await redis.keys('session:*');
      const keys = [...gameKeys, ...sessionKeys].sort();
      return { mode: 'redis', keys };
    },
    () => {
      const keys = [...memoryStore.keys()]
        .filter((key) => key.startsWith('game:') || key.startsWith('session:'))
        .sort();
      return { mode: 'memory', keys };
    },
  );
};

const getCacheSummary = async () => {
  return withFallback(
    async () => {
      const redis = getRedisClient();
      const gameKeys = await redis.keys('game:*');
      const sessionKeys = await redis.keys('session:*');
      return {
        mode: 'redis',
        counts: {
          game: gameKeys.length,
          session: sessionKeys.length,
        },
      };
    },
    () => {
      let game = 0;
      let session = 0;
      for (const [key] of memoryStore) {
        if (key.startsWith('game:')) game += 1;
        if (key.startsWith('session:')) session += 1;
      }
      return {
        mode: 'memory',
        counts: { game, session },
      };
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
  removeTeamData,
  getLobbyTeams,
  updateTeamData,
  getAllTeamsData,
  getHostRemovalBlocklist,
  appendHostRemovalBlocklist,
  removeHostRemovalBlocklistNormalizedNames,
  recordResponse,
  getResponseCount,
  getResponses,
  cleanupSession,
  inspectSessionCache,
  inspectCache,
  clearAllGameCaches,
  getCacheSummary,
};
