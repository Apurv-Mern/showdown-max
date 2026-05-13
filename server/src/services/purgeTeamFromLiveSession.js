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
const purgeTeamFromLiveSession = async (pin, teamId) => {
  const numericTeamId = Number(teamId);
  if (!pin || !Number.isFinite(numericTeamId)) {
    return { removedSocketId: null, removedTeamName: null };
  }

  const team = await Team.findByPk(numericTeamId, { attributes: ['id', 'teamName', 'socketId'] });
  const removedSocketId = team?.socketId || null;
  const removedTeamName = team?.teamName || null;

  if (team) {
    await Team.destroy({ where: { id: numericTeamId } });
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
      if (roundWagers && typeof roundWagers === 'object') {
        roundWagers = { ...roundWagers };
        for (const rid of Object.keys(roundWagers)) {
          const slice = { ...(roundWagers[rid] || {}) };
          delete slice[String(numericTeamId)];
          roundWagers[rid] = slice;
        }
      }

      const removedTeamIds = Array.from(
        new Set([...(current.removedTeamIds || []).map(Number), numericTeamId]),
      ).filter((id) => Number.isFinite(id));
      const removedTeamNames = Array.from(
        new Set([
          ...(current.removedTeamNames || []).map((name) => normalizeTeamName(name)),
          ...(removedTeamName ? [normalizeTeamName(removedTeamName)] : []),
        ]),
      ).filter(Boolean);

      return {
        teams,
        activeTeamIds,
        roundWagers,
        removedTeamIds,
        removedTeamNames,
        totalTeams: Object.keys(teams).length,
      };
    });
  }

  return { removedSocketId, removedTeamName };
};

module.exports = { purgeTeamFromLiveSession };
