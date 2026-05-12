const { GAME_STATES } = require('shared/constants/gameStates');

/**
 * Remaining break seconds — prefers wall-clock `breakEndsAt` so refresh/reconnect
 * does not restart from the full configured duration.
 * @param {object | null | undefined} gameState
 * @returns {number}
 */
const getBreakRemainingSeconds = (gameState) => {
  if (!gameState || gameState.state !== GAME_STATES.BREAK) {
    const r = Number(gameState?.breakRemaining);
    return Number.isFinite(r) ? Math.max(0, r) : 0;
  }
  const end = Number(gameState.breakEndsAt);
  if (Number.isFinite(end) && end > 0) {
    return Math.max(0, Math.ceil((end - Date.now()) / 1000));
  }
  const br = Number(gameState.breakRemaining);
  const bd = Number(gameState.breakDuration);
  if (Number.isFinite(br) && br >= 0) return Math.max(0, br);
  if (Number.isFinite(bd) && bd >= 0) return Math.max(0, bd);
  return 0;
};

module.exports = { getBreakRemainingSeconds };
