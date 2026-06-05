const redisStore = require('./redisSessionStore');
const { calculateScores } = require('./game-engine/scoringEngine');
const { ROUND_TYPES } = require('shared/constants/roundTypes');

const parseStoredResponse = (raw) => {
  if (!raw) return { selectedOptionIndex: -1, responseTime: null };
  try {
    const parsed = JSON.parse(raw);
    const selectedOptionIndex = parsed.selectedOptionIndex;
    return {
      selectedOptionIndex: Array.isArray(selectedOptionIndex)
        ? selectedOptionIndex
        : Number.isFinite(Number(selectedOptionIndex))
          ? Number(selectedOptionIndex)
          : -1,
      responseTime: Number.isFinite(Number(parsed.responseTime)) ? Number(parsed.responseTime) : null,
    };
  } catch {
    const selectedOptionIndex = Number(raw);
    return {
      selectedOptionIndex: Number.isFinite(selectedOptionIndex) ? selectedOptionIndex : -1,
      responseTime: null,
    };
  }
};

const getRoundWagerForTeam = (gameState, roundId, teamId) =>
  Number(gameState?.roundWagers?.[String(roundId)]?.[String(teamId)] ?? 0);

/**
 * Per-question wager (fallback to legacy roundWagers when missing so reveals of older
 * sessions still resolve).
 */
const getQuestionWagerForTeam = (gameState, questionId, teamId, roundId) => {
  const perQ = gameState?.questionWagers?.[String(questionId)]?.[String(teamId)];
  if (perQ !== undefined && perQ !== null) return Number(perQ);
  if (roundId != null) {
    return getRoundWagerForTeam(gameState, roundId, teamId);
  }
  return 0;
};

/**
 * Build the same payload shape as ANSWER_REVEAL for the current question index,
 * using persisted snapshot from reveal (preferred) or Redis responses + scoring (fallback).
 * @param {string} pin
 * @param {object} gameState
 * @returns {Promise<object | null>}
 */
const buildRevealSnapshot = async (pin, gameState) => {
  const currentRound = gameState.rounds?.[gameState.currentRoundIndex];
  const currentQuestion = currentRound?.questions?.[gameState.currentQuestionIndex] || null;
  if (!currentQuestion?.id) return null;

  const qid = String(currentQuestion.id);
  const cached = gameState.revealSnapshotsByQuestionId?.[qid];

  const teams = Object.values(gameState.teams || {}).map((team) => ({
    teamId: Number(team.teamId),
    teamName: String(team.teamName || ''),
    score: Number(team.score || 0),
    isEliminated: Boolean(team.isEliminated),
  }));

  if (cached && typeof cached === 'object' && cached.scores && Object.keys(cached.scores).length) {
    const correctIdx = Number.isFinite(Number(cached.correctOptionIndex))
      ? Number(cached.correctOptionIndex)
      : (currentQuestion.options || []).findIndex((o) => o?.isCorrect);
    return {
      correctOptionIndex: correctIdx,
      correctText: String(cached.correctText ?? currentQuestion.options?.[correctIdx]?.text ?? ''),
      scores: { ...cached.scores },
      responseDetails: Array.isArray(cached.responseDetails) ? cached.responseDetails : [],
      majorityOptionIndexes: Array.isArray(cached.majorityOptionIndexes)
        ? cached.majorityOptionIndexes
        : [],
      voteCounts:
        cached.voteCounts && typeof cached.voteCounts === 'object' ? { ...cached.voteCounts } : {},
      eliminations: Array.isArray(cached.eliminations) ? [...cached.eliminations] : [],
      allWrong: Boolean(cached.allWrong),
      teams,
    };
  }

  // Legacy: sessions revealed before `revealSnapshotsByQuestionId` existed — recompute deltas.
  const responsesRaw = await redisStore.getResponses(pin, currentQuestion.id);
  const responses = {};
  for (const [teamId, raw] of Object.entries(responsesRaw || {})) {
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

  const round = currentRound;
  const isWagerRound = round.type === ROUND_TYPES.WAGER || round.type === ROUND_TYPES.FINAL_WAGER;
  let activeTeamIds = Array.isArray(gameState.activeTeamIds) ? [...gameState.activeTeamIds] : [];

  if (round.type === ROUND_TYPES.ELIMINATION) {
    const activeSet = new Set(
      activeTeamIds
        .map(Number)
        .filter((id) => {
          if (!Number.isFinite(id)) return false;
          const row = gameState.teams?.[id] ?? gameState.teams?.[String(id)];
          return row && !row.isEliminated;
        }),
    );
    for (const teamIdStr of Object.keys(responses || {})) {
      const id = Number(teamIdStr);
      const row = gameState.teams?.[id] ?? gameState.teams?.[teamIdStr];
      if (Number.isFinite(id) && row && !row.isEliminated) activeSet.add(id);
    }
    activeTeamIds = [...activeSet];
  }

  for (const teamId of activeTeamIds) {
    const tid = String(teamId);
    if (!responses[tid]) {
      responses[tid] = {
        selectedOptionIndex: -1,
        wagerAmount: 0,
      };
    }
    if (isWagerRound) {
      responses[tid].wagerAmount = getQuestionWagerForTeam(
        gameState,
        currentQuestion.id,
        tid,
        round.id,
      );
    }
  }

  const result = calculateScores({
    roundType: round.type,
    question: currentQuestion,
    responses,
    questionIndex: gameState.currentQuestionIndex,
    teams: gameState.teams,
    activeTeamIds,
  });

  const responseDetails = Object.entries(responses).map(([teamId, response]) => ({
    teamId: Number(teamId),
    selectedOptionIndex:
      response && Array.isArray(response.selectedOptionIndex)
        ? response.selectedOptionIndex
        : response && Number.isFinite(Number(response.selectedOptionIndex))
          ? Number(response.selectedOptionIndex)
          : -1,
    responseTime:
      response &&
      Number.isFinite(Number(response.responseTime))
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

  const correctOptionIndex = (currentQuestion.options || []).findIndex((o) => o?.isCorrect);
  const allWrong =
    correctOptionIndex < 0
      ? true
      : responseDetails.every((r) => r.selectedOptionIndex !== correctOptionIndex);

  return {
    correctOptionIndex,
    correctText: currentQuestion.options?.[correctOptionIndex]?.text || '',
    scores: { ...result.scores },
    responseDetails,
    majorityOptionIndexes,
    voteCounts,
    eliminations: result.eliminations,
    allWrong,
    teams,
  };
};

module.exports = { buildRevealSnapshot, parseStoredResponse };
