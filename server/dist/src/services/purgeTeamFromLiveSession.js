const { Team } = require('../models');
const redisStore = require('./redisSessionStore');
const { normalizeTeamName } = require('../utils/teamName');

/**
 * Remove or park a team from the live session.
 *
 * Passive disconnect (tab close / network loss): keep the team in `gameState.teams` and
 * MySQL so leaderboard scores persist; drop from `activeTeamIds` and lobby only.
 *
 * Host removal: fully delete from DB, Redis, and `gameState.teams`.
 *
 * @param {string} pin
 * @param {number} teamId
 * @param {boolean} [isHostRemoval]
 * @returns {Promise<{ removedSocketId: string | null; removedTeamName: string | null }>}
 */
const purgeTeamFromLiveSession = async (pin, teamId, isHostRemoval = false) => {
  const numericTeamId = Number(teamId);
  if (!pin || !Number.isFinite(numericTeamId)) {
    return { removedSocketId: null, removedTeamName: null };
  }

  const team = await Team.findByPk(numericTeamId, {
    attributes: ['id', 'teamName', 'socketId', 'score', 'isEliminated'],
  });
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

  const existing = await redisStore.getGameState(pin);
  const stateTeam =
    existing?.teams?.[numericTeamId] ?? existing?.teams?.[String(numericTeamId)] ?? null;

  if (!isHostRemoval) {
    const disconnectedTeamData = {
      teamId: numericTeamId,
      teamName: stateTeam?.teamName ?? removedTeamName ?? '',
      score: Number(stateTeam?.score ?? team?.score ?? 0),
      isEliminated: Boolean(stateTeam?.isEliminated ?? team?.isEliminated),
      isConnected: false,
    };
    await redisStore.updateTeamData(pin, numericTeamId, disconnectedTeamData);
  } else {
    await redisStore.removeTeamData(pin, numericTeamId);
  }

  if (existing) {
    await redisStore.updateGameState(pin, (current) => {
      const teams = { ...(current.teams || {}) };
      const activeTeamIds = (current.activeTeamIds || [])
        .map(Number)
        .filter((id) => id !== numericTeamId);

      let roundWagers = current.roundWagers;
      let questionWagers = current.questionWagers;

      if (isHostRemoval) {
        delete teams[numericTeamId];
        delete teams[String(numericTeamId)];

        if (roundWagers && typeof roundWagers === 'object') {
          roundWagers = { ...roundWagers };
          for (const rid of Object.keys(roundWagers)) {
            const slice = { ...(roundWagers[rid] || {}) };
            delete slice[String(numericTeamId)];
            roundWagers[rid] = slice;
          }
        }
        if (questionWagers && typeof questionWagers === 'object') {
          questionWagers = { ...questionWagers };
          for (const qid of Object.keys(questionWagers)) {
            const slice = { ...(questionWagers[qid] || {}) };
            delete slice[String(numericTeamId)];
            questionWagers[qid] = slice;
          }
        }
      } else {
        const existingTeam =
          teams[numericTeamId] ?? teams[String(numericTeamId)] ?? stateTeam ?? null;
        const parkedTeam = {
          ...(existingTeam || {}),
          teamId: numericTeamId,
          teamName: existingTeam?.teamName ?? removedTeamName ?? '',
          score: Number(existingTeam?.score ?? team?.score ?? 0),
          isEliminated: Boolean(existingTeam?.isEliminated ?? team?.isEliminated),
          isConnected: false,
        };
        delete teams[String(numericTeamId)];
        teams[numericTeamId] = parkedTeam;
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
