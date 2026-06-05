const { Team } = require('../models');
const redisStore = require('./redisSessionStore');
const { normalizeTeamName } = require('../utils/teamName');

/**
 * Fully remove a team from the live session (MySQL row, Redis lobby/sidebar hash, gameState.teams).
 * Mirrors host `REMOVE_TEAM` / API `removeTeam` semantics so disconnect and manual removal behave the same.
 *
 * @param {string} pin
 * @param {number} teamId
 * @returns {Promise<{ removedSocketId: string | null; removedTeamName: string | null }>}
 */
const purgeTeamFromLiveSession = async (pin, teamId, isHostRemoval = false) => {
  const numericTeamId = Number(teamId);
  if (!pin || !Number.isFinite(numericTeamId)) {
    return { removedSocketId: null, removedTeamName: null };
  }

  const team = await Team.findByPk(numericTeamId, { attributes: ['id', 'teamName', 'socketId'] });
  const removedSocketId = team?.socketId || null;
  const removedTeamName = team?.teamName || null;

  if (team) {
    if (isHostRemoval) {
      await Team.destroy({ where: { id: numericTeamId } });
    } else {
      // Passive tab close / refresh: keep the DB row and stable team id so Redis answers
      // (`game:${pin}:responses:${questionId}`) and round wagers stay keyed correctly on reconnect.
      await Team.update({ isConnected: false, socketId: null }, { where: { id: numericTeamId } });
    }
  }

  await redisStore.removeTeamFromLobby(pin, numericTeamId);
  await redisStore.removeTeamData(pin, numericTeamId);

  const existing = await redisStore.getGameState(pin);
  if (existing) {
    await redisStore.updateGameState(pin, (current) => {
      const teams = { ...(current.teams || {}) };
      delete teams[numericTeamId];

      const activeTeamIds = (current.activeTeamIds || [])
        .map(Number)
        .filter((id) => id !== numericTeamId);

      let roundWagers = current.roundWagers;
      let questionWagers = current.questionWagers;
      // Host removal: drop this team's wagers. Passive disconnect (tab refresh): keep
      // `roundWagers` / `questionWagers` so a reconnecting socket still reads a locked
      // wager from Redis/join.
      if (isHostRemoval && roundWagers && typeof roundWagers === 'object') {
        roundWagers = { ...roundWagers };
        for (const rid of Object.keys(roundWagers)) {
          const slice = { ...(roundWagers[rid] || {}) };
          delete slice[String(numericTeamId)];
          roundWagers[rid] = slice;
        }
      }
      if (isHostRemoval && questionWagers && typeof questionWagers === 'object') {
        questionWagers = { ...questionWagers };
        for (const qid of Object.keys(questionWagers)) {
          const slice = { ...(questionWagers[qid] || {}) };
          delete slice[String(numericTeamId)];
          questionWagers[qid] = slice;
        }
      }

      const removedTeamIds = Array.from(
        new Set([
          ...(current.removedTeamIds || []).map(Number),
          ...(isHostRemoval ? [numericTeamId] : []),
        ]),
      ).filter((id) => Number.isFinite(id));

      const removedTeamNames = Array.from(
        new Set([
          ...(current.removedTeamNames || []).map((name) => normalizeTeamName(name)),
          ...(isHostRemoval && removedTeamName ? [normalizeTeamName(removedTeamName)] : []),
        ]),
      ).filter(Boolean);

      return {
        teams,
        activeTeamIds,
        roundWagers,
        questionWagers,
        removedTeamIds,
        removedTeamNames,
        totalTeams: Object.keys(teams).length,
      };
    });
  }

  // Block re-join with the same name even when no game state exists yet (pre-start LOBBY).
  if (isHostRemoval && Number.isFinite(numericTeamId)) {
    await redisStore.appendHostRemovalBlocklist(pin, {
      normalizedName: removedTeamName ? normalizeTeamName(removedTeamName) : null,
      teamId: numericTeamId,
    });
  }

  return { removedSocketId, removedTeamName };
};

module.exports = { purgeTeamFromLiveSession };
