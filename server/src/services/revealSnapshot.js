const redisStore = require('./redisSessionStore');

const parseStoredResponse = (raw) => {
  if (!raw) return { selectedOptionIndex: -1, responseTime: null };
  try {
    const parsed = JSON.parse(raw);
    const selectedOptionIndex = Number(parsed.selectedOptionIndex);
    const responseTime = Number(parsed.responseTime);
    return {
      selectedOptionIndex: Number.isFinite(selectedOptionIndex) ? selectedOptionIndex : -1,
      responseTime: Number.isFinite(responseTime) ? responseTime : null,
    };
  } catch {
    const selectedOptionIndex = Number(raw);
    return {
      selectedOptionIndex: Number.isFinite(selectedOptionIndex) ? selectedOptionIndex : -1,
      responseTime: null,
    };
  }
};

/**
 * Build the same payload shape as ANSWER_REVEAL for the current question index,
 * using Redis-stored responses (used for scoreboard + venue/player reconnect).
 * @param {string} pin
 * @param {object} gameState
 * @returns {Promise<object | null>}
 */
const buildRevealSnapshot = async (pin, gameState) => {
  const currentRound = gameState.rounds?.[gameState.currentRoundIndex];
  const currentQuestion = currentRound?.questions?.[gameState.currentQuestionIndex] || null;
  if (!currentQuestion?.id) return null;

  const responsesRaw = await redisStore.getResponses(pin, currentQuestion.id);
  const teams = Object.values(gameState.teams || {}).map((team) => ({
    teamId: Number(team.teamId),
    teamName: String(team.teamName || ''),
    score: Number(team.score || 0),
    isEliminated: Boolean(team.isEliminated),
  }));
  const responseDetails = teams.map((team) => {
    const parsed = parseStoredResponse(responsesRaw[String(team.teamId)]);
    return {
      teamId: team.teamId,
      selectedOptionIndex: parsed.selectedOptionIndex,
      responseTime: parsed.responseTime,
    };
  });
  const correctOptionIndex = (currentQuestion.options || []).findIndex((o) => o?.isCorrect);
  const allWrong =
    correctOptionIndex < 0
      ? true
      : responseDetails.every((r) => r.selectedOptionIndex !== correctOptionIndex);

  return {
    correctOptionIndex,
    correctText: currentQuestion.options?.[correctOptionIndex]?.text || '',
    scores: {},
    responseDetails,
    eliminations: teams.filter((t) => t.isEliminated).map((t) => t.teamId),
    allWrong,
    teams,
  };
};

module.exports = { buildRevealSnapshot, parseStoredResponse };
