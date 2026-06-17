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

/** Next round shown on break screens (player / venue / host). */
const getBreakUpNextRoundPayload = (gameState) => {
  if (!gameState || !Array.isArray(gameState.rounds) || gameState.rounds.length === 0) {
    return null;
  }
  const idx = Math.max(0, Number(gameState.currentRoundIndex ?? 0));
  const resumeState = gameState.breakResumeState?.state;
  const pickIndex =
    resumeState === GAME_STATES.ROUND_INTRO || resumeState === 'ROUND_INTRO' ? idx : idx + 1;
  const round = gameState.rounds[pickIndex];
  if (!round) return null;
  return {
    name: round.name || '',
    type: round.type || '',
    index: pickIndex,
  };
};

module.exports = { getBreakRemainingSeconds, getBreakUpNextRoundPayload };
